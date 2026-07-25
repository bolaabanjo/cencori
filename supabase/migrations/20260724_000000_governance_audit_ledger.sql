-- ============================================================================
-- Governance Audit Ledger  (PRD M0.1 — immutable, hash-chained, append-only)
-- ============================================================================
-- Every governance-relevant event (AI request decision, policy change, key
-- reveal, kill-switch) is appended as a link in a per-org hash chain, so any
-- tampering — edit, delete, reorder, insert, truncate — is cryptographically
-- detectable. The chain is anchored by periodic checkpoints. This is the
-- foundation a Tier-1 bank checks first ("prove the log is complete and
-- untampered"); nothing else in the governance product demos without it.
--
-- Canonical preimage (v1), fields joined by chr(30) (ASCII record separator):
--   seq | org_id | project_id | ts(ISO-8601 UTC, µs) | event_type | actor_id |
--   actor_type | model | model_version | decision | request_hash |
--   response_hash | payload::text
-- entry_hash = sha256_hex( prev_hash || chr(30) || canonical )
-- Genesis prev_hash = 64 zeros. Raw prompt/response content is NEVER stored
-- here — only request_hash / response_hash. Chain detects casual tampering
-- today; KMS-signed checkpoints (PRD M0.3) make it non-repudiable next.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Tables ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.governance_audit_ledger (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        uuid NOT NULL,
    project_id    uuid,
    seq           bigint NOT NULL,                 -- monotonic per org (chain position)
    ts            timestamptz NOT NULL DEFAULT now(),
    event_type    text NOT NULL,                   -- request.decision | policy.activated | key.revealed | killswitch.engaged | ...
    actor_id      uuid,
    actor_type    text NOT NULL DEFAULT 'system',
    actor_email   text,
    actor_ip      text,
    model         text,
    model_version text,
    decision      text,                            -- allow | block | redact | tokenize | route | require_approval | rate_limit
    request_hash  text,                            -- sha256 of prompt (NOT raw content)
    response_hash text,                            -- sha256 of completion (NOT raw content)
    policies_fired jsonb NOT NULL DEFAULT '[]'::jsonb,
    rationale     text,
    confidence    numeric,
    redactions    jsonb NOT NULL DEFAULT '[]'::jsonb,
    payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
    prev_hash     text NOT NULL,
    entry_hash    text NOT NULL,
    CONSTRAINT governance_audit_ledger_org_seq_key   UNIQUE (org_id, seq),
    CONSTRAINT governance_audit_ledger_entry_hash_key UNIQUE (entry_hash)
);

CREATE INDEX IF NOT EXISTS governance_audit_ledger_org_ts_idx   ON public.governance_audit_ledger (org_id, ts DESC);
CREATE INDEX IF NOT EXISTS governance_audit_ledger_project_idx  ON public.governance_audit_ledger (project_id, ts DESC);
CREATE INDEX IF NOT EXISTS governance_audit_ledger_event_idx    ON public.governance_audit_ledger (org_id, event_type, ts DESC);

CREATE TABLE IF NOT EXISTS public.governance_checkpoints (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id         uuid NOT NULL,
    up_to_seq      bigint NOT NULL,
    chain_hash     text NOT NULL,     -- entry_hash at up_to_seq (pins chain state)
    entry_count    bigint NOT NULL,
    signature      text,              -- KMS signature (PRD M0.3, added when KMS lands)
    external_anchor text,             -- optional external notarization reference
    ts             timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT governance_checkpoints_org_seq_key UNIQUE (org_id, up_to_seq)
);

-- ── WORM: block UPDATE/DELETE everywhere (incl. service role). INSERT-only. ──
CREATE OR REPLACE FUNCTION public.governance_ledger_block_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'governance ledger is append-only: % is not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS governance_audit_ledger_worm ON public.governance_audit_ledger;
CREATE TRIGGER governance_audit_ledger_worm
    BEFORE UPDATE OR DELETE ON public.governance_audit_ledger
    FOR EACH ROW EXECUTE FUNCTION public.governance_ledger_block_mutation();

DROP TRIGGER IF EXISTS governance_checkpoints_worm ON public.governance_checkpoints;
CREATE TRIGGER governance_checkpoints_worm
    BEFORE UPDATE OR DELETE ON public.governance_checkpoints
    FOR EACH ROW EXECUTE FUNCTION public.governance_ledger_block_mutation();

-- ── Deterministic canonical preimage (shared by append + verify) ────────────
CREATE OR REPLACE FUNCTION public.governance_ledger_canonical(
    p_seq bigint, p_org_id uuid, p_project_id uuid, p_ts timestamptz,
    p_event_type text, p_actor_id uuid, p_actor_type text,
    p_model text, p_model_version text, p_decision text,
    p_request_hash text, p_response_hash text, p_payload jsonb
) RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT concat_ws(
        chr(30),
        p_seq::text,
        p_org_id::text,
        coalesce(p_project_id::text, ''),
        to_char(p_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        p_event_type,
        coalesce(p_actor_id::text, ''),
        coalesce(p_actor_type, ''),
        coalesce(p_model, ''),
        coalesce(p_model_version, ''),
        coalesce(p_decision, ''),
        coalesce(p_request_hash, ''),
        coalesce(p_response_hash, ''),
        p_payload::text
    );
$$;

-- ── Atomic, race-safe append (serialized per org) ───────────────────────────
CREATE OR REPLACE FUNCTION public.append_governance_audit_entry(
    p_org_id uuid,
    p_event_type text,
    p_project_id uuid DEFAULT NULL,
    p_actor_id uuid DEFAULT NULL,
    p_actor_type text DEFAULT 'system',
    p_actor_email text DEFAULT NULL,
    p_actor_ip text DEFAULT NULL,
    p_model text DEFAULT NULL,
    p_model_version text DEFAULT NULL,
    p_decision text DEFAULT NULL,
    p_request_hash text DEFAULT NULL,
    p_response_hash text DEFAULT NULL,
    p_policies_fired jsonb DEFAULT '[]'::jsonb,
    p_rationale text DEFAULT NULL,
    p_confidence numeric DEFAULT NULL,
    p_redactions jsonb DEFAULT '[]'::jsonb,
    p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE (id uuid, seq bigint, entry_hash text, prev_hash text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_seq        bigint;
    v_prev_hash  text;
    v_ts         timestamptz := clock_timestamp();
    v_canonical  text;
    v_entry_hash text;
    v_id         uuid;
    c_genesis    text := repeat('0', 64);
BEGIN
    IF p_org_id IS NULL THEN RAISE EXCEPTION 'org_id required'; END IF;
    IF p_event_type IS NULL OR length(p_event_type) = 0 THEN RAISE EXCEPTION 'event_type required'; END IF;

    -- Serialize appends per-org so the chain stays linear and race-free.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_org_id::text, 0));

    SELECT l.seq, l.entry_hash INTO v_seq, v_prev_hash
    FROM public.governance_audit_ledger l
    WHERE l.org_id = p_org_id
    ORDER BY l.seq DESC
    LIMIT 1;

    IF NOT FOUND THEN
        v_seq := 1;
        v_prev_hash := c_genesis;
    ELSE
        v_seq := v_seq + 1;
    END IF;

    v_canonical := public.governance_ledger_canonical(
        v_seq, p_org_id, p_project_id, v_ts, p_event_type, p_actor_id, p_actor_type,
        p_model, p_model_version, p_decision, p_request_hash, p_response_hash, p_payload
    );
    -- sha256() is a Postgres 14+ built-in (pg_catalog) — no pgcrypto/search_path dependency.
    v_entry_hash := encode(sha256(convert_to(v_prev_hash || chr(30) || v_canonical, 'UTF8')), 'hex');

    INSERT INTO public.governance_audit_ledger (
        org_id, project_id, seq, ts, event_type, actor_id, actor_type, actor_email, actor_ip,
        model, model_version, decision, request_hash, response_hash,
        policies_fired, rationale, confidence, redactions, payload, prev_hash, entry_hash
    ) VALUES (
        p_org_id, p_project_id, v_seq, v_ts, p_event_type, p_actor_id, p_actor_type, p_actor_email, p_actor_ip,
        p_model, p_model_version, p_decision, p_request_hash, p_response_hash,
        coalesce(p_policies_fired, '[]'::jsonb), p_rationale, p_confidence,
        coalesce(p_redactions, '[]'::jsonb), coalesce(p_payload, '{}'::jsonb), v_prev_hash, v_entry_hash
    )
    RETURNING governance_audit_ledger.id INTO v_id;

    RETURN QUERY SELECT v_id, v_seq, v_entry_hash, v_prev_hash;
END;
$$;

-- ── Authoritative chain verification (recomputes every entry_hash) ──────────
CREATE OR REPLACE FUNCTION public.verify_governance_audit_chain(p_org_id uuid)
RETURNS TABLE (ok boolean, entries bigint, first_bad_seq bigint, reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    r             record;
    v_expected_prev text := repeat('0', 64);
    v_expected_seq  bigint := 1;
    v_canonical   text;
    v_calc_hash   text;
    v_count       bigint := 0;
BEGIN
    FOR r IN
        SELECT * FROM public.governance_audit_ledger
        WHERE org_id = p_org_id ORDER BY seq ASC
    LOOP
        v_count := v_count + 1;
        IF r.seq <> v_expected_seq THEN
            RETURN QUERY SELECT false, v_count, r.seq,
                format('seq gap: expected %s got %s (insertion/deletion)', v_expected_seq, r.seq);
            RETURN;
        END IF;
        IF r.prev_hash <> v_expected_prev THEN
            RETURN QUERY SELECT false, v_count, r.seq, 'prev_hash mismatch (broken link)';
            RETURN;
        END IF;
        v_canonical := public.governance_ledger_canonical(
            r.seq, r.org_id, r.project_id, r.ts, r.event_type, r.actor_id, r.actor_type,
            r.model, r.model_version, r.decision, r.request_hash, r.response_hash, r.payload
        );
        v_calc_hash := encode(sha256(convert_to(r.prev_hash || chr(30) || v_canonical, 'UTF8')), 'hex');
        IF v_calc_hash <> r.entry_hash THEN
            RETURN QUERY SELECT false, v_count, r.seq, 'entry_hash mismatch (row content tampered)';
            RETURN;
        END IF;
        v_expected_prev := r.entry_hash;
        v_expected_seq  := v_expected_seq + 1;
    END LOOP;

    -- Checkpoints must pin real chain state.
    IF EXISTS (
        SELECT 1 FROM public.governance_checkpoints c
        LEFT JOIN public.governance_audit_ledger l
          ON l.org_id = c.org_id AND l.seq = c.up_to_seq
        WHERE c.org_id = p_org_id AND (l.entry_hash IS NULL OR l.entry_hash <> c.chain_hash)
    ) THEN
        RETURN QUERY SELECT false, v_count, NULL::bigint, 'checkpoint chain_hash mismatch (truncation/tamper)';
        RETURN;
    END IF;

    RETURN QUERY SELECT true, v_count, NULL::bigint, 'chain valid';
END;
$$;

-- ── Create a checkpoint pinning the current chain tail ───────────────────────
CREATE OR REPLACE FUNCTION public.create_governance_checkpoint(p_org_id uuid)
RETURNS TABLE (id uuid, up_to_seq bigint, chain_hash text, entry_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_seq bigint; v_hash text; v_count bigint; v_id uuid;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_org_id::text, 0));
    SELECT l.seq, l.entry_hash INTO v_seq, v_hash
    FROM public.governance_audit_ledger l
    WHERE l.org_id = p_org_id ORDER BY l.seq DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'no ledger entries to checkpoint for org %', p_org_id; END IF;

    SELECT count(*) INTO v_count FROM public.governance_audit_ledger WHERE org_id = p_org_id;

    INSERT INTO public.governance_checkpoints (org_id, up_to_seq, chain_hash, entry_count)
    VALUES (p_org_id, v_seq, v_hash, v_count)
    ON CONFLICT (org_id, up_to_seq) DO NOTHING
    RETURNING governance_checkpoints.id INTO v_id;

    IF v_id IS NULL THEN
        SELECT c.id INTO v_id FROM public.governance_checkpoints c
        WHERE c.org_id = p_org_id AND c.up_to_seq = v_seq;
    END IF;

    RETURN QUERY SELECT v_id, v_seq, v_hash, v_count;
END;
$$;

-- ── Lock down access ─────────────────────────────────────────────────────────
ALTER TABLE public.governance_audit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.governance_checkpoints  ENABLE ROW LEVEL SECURITY;
-- No RLS policies: direct table access only via service_role (bypasses RLS).
-- Dashboard/console read policies arrive with the Governance console (PRD M2).

-- append MUST come only from the trusted server (service_role), never a client.
REVOKE EXECUTE ON FUNCTION public.append_governance_audit_entry(uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,jsonb,text,numeric,jsonb,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_governance_checkpoint(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.append_governance_audit_entry(uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,jsonb,text,numeric,jsonb,jsonb) TO service_role;
GRANT  EXECUTE ON FUNCTION public.create_governance_checkpoint(uuid) TO service_role;
-- verification is safe to expose to authenticated auditors + the dashboard.
GRANT  EXECUTE ON FUNCTION public.verify_governance_audit_chain(uuid) TO service_role, authenticated;
