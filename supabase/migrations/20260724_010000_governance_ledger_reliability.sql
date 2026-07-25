-- ============================================================================
-- Governance Audit Ledger — reliable, provably-complete delivery  (PRD M0.2)
-- ============================================================================
-- Makes governance logging impossible to silently lose:
--   * dedupe_key + unique index → retries/redrives are idempotent (no double-
--     counting the chain).
--   * append_governance_audit_entry gains p_dedupe_key and returns the existing
--     entry on a duplicate (no-op), so an at-least-once delivery is safe.
--   * governance_ledger_deadletter → an append that fails after retries is
--     captured here (never dropped) and redriven by a cron worker.
-- Completeness is then PROVABLE: every intended event is either in the ledger
-- or pending in the dead-letter — nothing vanishes. (dedupe_key is operational
-- metadata and is intentionally NOT part of the hashed canonical / chain.)
-- ============================================================================

ALTER TABLE public.governance_audit_ledger ADD COLUMN IF NOT EXISTS dedupe_key text;
CREATE UNIQUE INDEX IF NOT EXISTS governance_audit_ledger_dedupe_key_idx
    ON public.governance_audit_ledger (org_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- Dead-letter: appends that failed after retries. NOT the immutable ledger —
-- rows here are operational and get a status update when redriven (no WORM).
CREATE TABLE IF NOT EXISTS public.governance_ledger_deadletter (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       uuid NOT NULL,
    dedupe_key   text,
    event        jsonb NOT NULL,        -- the full append input, for replay
    attempts     int NOT NULL DEFAULT 0,
    last_error   text,
    status       text NOT NULL DEFAULT 'pending',   -- pending | delivered
    created_at   timestamptz NOT NULL DEFAULT now(),
    delivered_at timestamptz
);
CREATE INDEX IF NOT EXISTS governance_deadletter_pending_idx
    ON public.governance_ledger_deadletter (created_at) WHERE status = 'pending';

ALTER TABLE public.governance_ledger_deadletter ENABLE ROW LEVEL SECURITY;  -- service_role only

-- ── Rebuild append with idempotency (signature gains a trailing param) ───────
DROP FUNCTION IF EXISTS public.append_governance_audit_entry(
    uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,jsonb,text,numeric,jsonb,jsonb);

CREATE FUNCTION public.append_governance_audit_entry(
    p_org_id uuid, p_event_type text, p_project_id uuid DEFAULT NULL,
    p_actor_id uuid DEFAULT NULL, p_actor_type text DEFAULT 'system',
    p_actor_email text DEFAULT NULL, p_actor_ip text DEFAULT NULL,
    p_model text DEFAULT NULL, p_model_version text DEFAULT NULL,
    p_decision text DEFAULT NULL, p_request_hash text DEFAULT NULL,
    p_response_hash text DEFAULT NULL, p_policies_fired jsonb DEFAULT '[]'::jsonb,
    p_rationale text DEFAULT NULL, p_confidence numeric DEFAULT NULL,
    p_redactions jsonb DEFAULT '[]'::jsonb, p_payload jsonb DEFAULT '{}'::jsonb,
    p_dedupe_key text DEFAULT NULL
) RETURNS TABLE (id uuid, seq bigint, entry_hash text, prev_hash text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_seq bigint; v_prev_hash text; v_ts timestamptz := clock_timestamp();
    v_canonical text; v_entry_hash text; v_id uuid; c_genesis text := repeat('0', 64);
    v_e_id uuid; v_e_seq bigint; v_e_entry text; v_e_prev text;
BEGIN
    IF p_org_id IS NULL THEN RAISE EXCEPTION 'org_id required'; END IF;
    IF p_event_type IS NULL OR length(p_event_type) = 0 THEN RAISE EXCEPTION 'event_type required'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_org_id::text, 0));

    -- Idempotency: a retried/redriven append with the same dedupe_key is a no-op.
    IF p_dedupe_key IS NOT NULL THEN
        SELECT l.id, l.seq, l.entry_hash, l.prev_hash
          INTO v_e_id, v_e_seq, v_e_entry, v_e_prev
          FROM public.governance_audit_ledger l
          WHERE l.org_id = p_org_id AND l.dedupe_key = p_dedupe_key;
        IF FOUND THEN
            RETURN QUERY SELECT v_e_id, v_e_seq, v_e_entry, v_e_prev; RETURN;
        END IF;
    END IF;

    SELECT l.seq, l.entry_hash INTO v_seq, v_prev_hash
      FROM public.governance_audit_ledger l
      WHERE l.org_id = p_org_id ORDER BY l.seq DESC LIMIT 1;
    IF NOT FOUND THEN v_seq := 1; v_prev_hash := c_genesis; ELSE v_seq := v_seq + 1; END IF;

    v_canonical := public.governance_ledger_canonical(
        v_seq, p_org_id, p_project_id, v_ts, p_event_type, p_actor_id, p_actor_type,
        p_model, p_model_version, p_decision, p_request_hash, p_response_hash, p_payload);
    v_entry_hash := encode(sha256(convert_to(v_prev_hash || chr(30) || v_canonical, 'UTF8')), 'hex');

    INSERT INTO public.governance_audit_ledger (
        org_id, project_id, seq, ts, event_type, actor_id, actor_type, actor_email, actor_ip,
        model, model_version, decision, request_hash, response_hash,
        policies_fired, rationale, confidence, redactions, payload, prev_hash, entry_hash, dedupe_key
    ) VALUES (
        p_org_id, p_project_id, v_seq, v_ts, p_event_type, p_actor_id, p_actor_type, p_actor_email, p_actor_ip,
        p_model, p_model_version, p_decision, p_request_hash, p_response_hash,
        coalesce(p_policies_fired,'[]'::jsonb), p_rationale, p_confidence,
        coalesce(p_redactions,'[]'::jsonb), coalesce(p_payload,'{}'::jsonb), v_prev_hash, v_entry_hash, p_dedupe_key)
    RETURNING governance_audit_ledger.id INTO v_id;

    RETURN QUERY SELECT v_id, v_seq, v_entry_hash, v_prev_hash;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.append_governance_audit_entry(
    uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,jsonb,text,numeric,jsonb,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_governance_audit_entry(
    uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,jsonb,text,numeric,jsonb,jsonb,text) TO service_role;

-- ── Completeness probe: is the org's governance log provably complete? ───────
-- complete = chain valid AND zero pending dead-letters.
CREATE OR REPLACE FUNCTION public.governance_ledger_health(p_org_id uuid)
RETURNS TABLE (chain_ok boolean, entries bigint, pending_deadletter bigint, complete boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok boolean; v_entries bigint; v_pending bigint;
BEGIN
    SELECT vc.ok, vc.entries INTO v_ok, v_entries
      FROM public.verify_governance_audit_chain(p_org_id) vc;
    SELECT count(*) INTO v_pending
      FROM public.governance_ledger_deadletter
      WHERE org_id = p_org_id AND status = 'pending';
    RETURN QUERY SELECT v_ok, coalesce(v_entries,0), v_pending, (v_ok AND v_pending = 0);
END;
$$;
GRANT EXECUTE ON FUNCTION public.governance_ledger_health(uuid) TO service_role, authenticated;
