-- ============================================================================
-- Governance Audit Ledger — signed checkpoints  (PRD M0.3 / Layer 3.2)
-- ============================================================================
-- Anchors the hash chain with cryptographically SIGNED checkpoints. Signing is
-- done in the app (Node/Ed25519 now; a managed KMS later — same verification
-- model), so the private key never lives in Postgres. A checkpoint pins
-- (up_to_seq, chain_hash, entry_count) and carries a signature over that
-- preimage. Effect: even an insider who bypassed the WORM trigger and recomputed
-- the whole chain cannot forge a valid signature without the private key — and
-- a bank's auditor verifies signatures independently with the public key.
--
-- Flow: governance_checkpoint_tail() reads the tail → app signs →
--       insert_signed_governance_checkpoint() persists it (idempotent, and
--       re-checks the pinned hash against the WORM-protected ledger).
-- ============================================================================

ALTER TABLE public.governance_checkpoints ADD COLUMN IF NOT EXISTS signing_key_id text;
ALTER TABLE public.governance_checkpoints ADD COLUMN IF NOT EXISTS algorithm text;

-- Read-only tail probe (does NOT insert) so the app can sign before persisting.
CREATE OR REPLACE FUNCTION public.governance_checkpoint_tail(p_org_id uuid)
RETURNS TABLE (up_to_seq bigint, chain_hash text, entry_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_seq bigint; v_hash text; v_count bigint;
BEGIN
    SELECT l.seq, l.entry_hash INTO v_seq, v_hash
      FROM public.governance_audit_ledger l
      WHERE l.org_id = p_org_id ORDER BY l.seq DESC LIMIT 1;
    IF NOT FOUND THEN RETURN; END IF;   -- no entries → empty result
    SELECT count(*) INTO v_count FROM public.governance_audit_ledger WHERE org_id = p_org_id;
    RETURN QUERY SELECT v_seq, v_hash, v_count;
END;
$$;

-- Persist a signed checkpoint. Idempotent on (org, up_to_seq). Re-verifies the
-- pinned hash against the ledger (WORM guarantees it can't have changed).
CREATE OR REPLACE FUNCTION public.insert_signed_governance_checkpoint(
    p_org_id uuid, p_up_to_seq bigint, p_chain_hash text, p_entry_count bigint,
    p_signature text DEFAULT NULL, p_signing_key_id text DEFAULT NULL, p_algorithm text DEFAULT NULL
) RETURNS TABLE (id uuid, up_to_seq bigint, chain_hash text, signed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actual_hash text; v_id uuid;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_org_id::text, 0));
    SELECT l.entry_hash INTO v_actual_hash FROM public.governance_audit_ledger l
      WHERE l.org_id = p_org_id AND l.seq = p_up_to_seq;
    IF NOT FOUND OR v_actual_hash <> p_chain_hash THEN
        RAISE EXCEPTION 'checkpoint chain_hash does not match ledger at seq %', p_up_to_seq;
    END IF;

    INSERT INTO public.governance_checkpoints
        (org_id, up_to_seq, chain_hash, entry_count, signature, signing_key_id, algorithm)
    VALUES (p_org_id, p_up_to_seq, p_chain_hash, p_entry_count, p_signature, p_signing_key_id, p_algorithm)
    ON CONFLICT (org_id, up_to_seq) DO NOTHING
    RETURNING governance_checkpoints.id INTO v_id;

    IF v_id IS NULL THEN
        SELECT c.id INTO v_id FROM public.governance_checkpoints c
        WHERE c.org_id = p_org_id AND c.up_to_seq = p_up_to_seq;
    END IF;

    RETURN QUERY SELECT v_id, p_up_to_seq, p_chain_hash, (p_signature IS NOT NULL);
END;
$$;

-- Orgs whose chain has grown past their latest checkpoint (drives the cron).
CREATE OR REPLACE FUNCTION public.orgs_needing_governance_checkpoint(p_limit int DEFAULT 500)
RETURNS TABLE (org_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT l.org_id
    FROM (SELECT org_id, max(seq) AS max_seq FROM public.governance_audit_ledger GROUP BY org_id) l
    LEFT JOIN (SELECT org_id, max(up_to_seq) AS max_cp FROM public.governance_checkpoints GROUP BY org_id) c
      ON c.org_id = l.org_id
    WHERE l.max_seq > coalesce(c.max_cp, 0)
    LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.governance_checkpoint_tail(uuid) TO service_role, authenticated;
REVOKE EXECUTE ON FUNCTION public.insert_signed_governance_checkpoint(uuid,bigint,text,bigint,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_signed_governance_checkpoint(uuid,bigint,text,bigint,text,text,text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.orgs_needing_governance_checkpoint(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.orgs_needing_governance_checkpoint(int) TO service_role;
