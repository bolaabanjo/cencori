-- Store each completed memory-upload batch and charge its exact embedding cost
-- in one transaction. Provider calls happen before this RPC, but database state
-- can no longer contain a charge without its memories (or memories without the
-- corresponding charge).

CREATE OR REPLACE FUNCTION public.store_memory_batch_and_charge(
    p_organization_id uuid,
    p_project_id uuid,
    p_namespace_id uuid,
    p_amount numeric,
    p_description text,
    p_reference_id text,
    p_memories jsonb
)
RETURNS TABLE (
    success boolean,
    new_balance numeric,
    error_message text,
    inserted_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_balance numeric;
    v_inserted_count integer;
BEGIN
    IF p_amount < 0 THEN
        RAISE EXCEPTION 'Charge amount cannot be negative';
    END IF;

    IF p_memories IS NULL OR jsonb_typeof(p_memories) <> 'array' THEN
        RAISE EXCEPTION 'Memory batch must be a JSON array';
    END IF;

    IF jsonb_array_length(p_memories) < 1
       OR jsonb_array_length(p_memories) > 10 THEN
        RAISE EXCEPTION 'Memory batch must contain between 1 and 10 entries';
    END IF;

    PERFORM 1
    FROM public.projects p
    JOIN public.memory_namespaces n ON n.project_id = p.id
    WHERE p.id = p_project_id
      AND p.organization_id = p_organization_id
      AND n.id = p_namespace_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 0::numeric, 'Project or namespace not found'::text, 0;
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_memories) AS memory
        WHERE jsonb_typeof(memory) <> 'object'
           OR length(COALESCE(memory->>'content', '')) < 1
           OR CASE
               WHEN jsonb_typeof(memory->'embedding') = 'array'
                   THEN jsonb_array_length(memory->'embedding') <> 1536
               ELSE true
           END
           OR (memory ? 'metadata' AND jsonb_typeof(memory->'metadata') <> 'object')
    ) THEN
        RAISE EXCEPTION 'Invalid memory batch entry';
    END IF;

    SELECT o.credits_balance
    INTO v_current_balance
    FROM public.organizations o
    WHERE o.id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 0::numeric, 'Organization not found'::text, 0;
        RETURN;
    END IF;

    IF p_amount > 0 AND v_current_balance < p_amount THEN
        RETURN QUERY SELECT false, v_current_balance, 'Insufficient balance'::text, 0;
        RETURN;
    END IF;

    INSERT INTO public.memories (namespace_id, content, metadata, embedding)
    SELECT
        p_namespace_id,
        memory->>'content',
        COALESCE(memory->'metadata', '{}'::jsonb),
        (memory->'embedding')::text::vector
    FROM jsonb_array_elements(p_memories) AS memory;

    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

    IF p_amount > 0 THEN
        UPDATE public.organizations
        SET credits_balance = credits_balance - p_amount,
            credits_updated_at = now()
        WHERE id = p_organization_id
        RETURNING credits_balance INTO v_current_balance;

        INSERT INTO public.credit_transactions (
            organization_id,
            amount,
            transaction_type,
            description,
            reference_id,
            balance_before,
            balance_after,
            metadata,
            created_at
        ) VALUES (
            p_organization_id,
            -p_amount,
            'usage',
            p_description,
            p_reference_id,
            v_current_balance + p_amount,
            v_current_balance,
            jsonb_build_object(
                'project_id', p_project_id,
                'namespace_id', p_namespace_id,
                'memories_inserted', v_inserted_count
            ),
            now()
        );
    END IF;

    RETURN QUERY SELECT true, v_current_balance, NULL::text, v_inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.store_memory_batch_and_charge(uuid, uuid, uuid, numeric, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.store_memory_batch_and_charge(uuid, uuid, uuid, numeric, text, text, jsonb) TO service_role;
