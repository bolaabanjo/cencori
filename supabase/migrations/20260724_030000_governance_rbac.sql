-- ============================================================================
-- Governance RBAC + segregation of duties (maker-checker)  (PRD M0.4)
-- ============================================================================
-- Least-privilege governance roles, and a change-request flow for sensitive
-- actions (policy activation, key reveal, kill switch) where the APPROVER must
-- differ from the REQUESTER — enforced atomically in the DB so a code bug can't
-- bypass it. Every request/approval/rejection is written to the immutable
-- ledger (in the app), so who-approved-what is tamper-evident. Banks require
-- this three-lines-of-defense separation; it is not optional.
-- ============================================================================

-- ── Role assignments (org owner is implicitly full; see lib/governance/rbac.ts) ─
CREATE TABLE IF NOT EXISTS public.governance_role_assignments (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id     uuid NOT NULL,
    user_id    uuid NOT NULL,
    role       text NOT NULL CHECK (role IN ('governance_admin','risk_officer','developer','auditor')),
    granted_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT governance_role_assignments_org_user_key UNIQUE (org_id, user_id)
);
CREATE INDEX IF NOT EXISTS governance_role_assignments_org_idx
    ON public.governance_role_assignments (org_id);
ALTER TABLE public.governance_role_assignments ENABLE ROW LEVEL SECURITY;  -- service_role only

-- ── Change requests (maker-checker) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.governance_change_requests (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       uuid NOT NULL,
    action_type  text NOT NULL,                    -- policy.activate | key.reveal | killswitch.engage | role.assign | ...
    payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
    status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','applied')),
    requested_by uuid NOT NULL,
    requested_at timestamptz NOT NULL DEFAULT now(),
    approved_by  uuid,
    resolved_at  timestamptz,
    reason       text
);
CREATE INDEX IF NOT EXISTS governance_change_requests_org_status_idx
    ON public.governance_change_requests (org_id, status, requested_at DESC);
ALTER TABLE public.governance_change_requests ENABLE ROW LEVEL SECURITY;   -- service_role only

-- Create a change request (the "maker" step).
CREATE OR REPLACE FUNCTION public.create_governance_change_request(
    p_org_id uuid, p_action_type text, p_payload jsonb, p_requested_by uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
    IF p_org_id IS NULL OR p_requested_by IS NULL THEN
        RAISE EXCEPTION 'org_id and requested_by are required';
    END IF;
    IF p_action_type IS NULL OR length(p_action_type) = 0 THEN
        RAISE EXCEPTION 'action_type is required';
    END IF;
    INSERT INTO public.governance_change_requests (org_id, action_type, payload, requested_by)
    VALUES (p_org_id, p_action_type, coalesce(p_payload, '{}'::jsonb), p_requested_by)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- Resolve a change request (the "checker" step). ENFORCES segregation of duties:
-- an approval by the same user who requested it is rejected atomically.
CREATE OR REPLACE FUNCTION public.resolve_governance_change_request(
    p_id uuid, p_actor uuid, p_decision text, p_reason text DEFAULT NULL
) RETURNS TABLE (ok boolean, status text, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req public.governance_change_requests%ROWTYPE;
BEGIN
    IF p_decision NOT IN ('approved','rejected') THEN
        RAISE EXCEPTION 'decision must be approved or rejected';
    END IF;
    IF p_actor IS NULL THEN RAISE EXCEPTION 'actor is required'; END IF;

    SELECT * INTO v_req FROM public.governance_change_requests WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, NULL::text, 'not_found'; RETURN;
    END IF;
    IF v_req.status <> 'pending' THEN
        RETURN QUERY SELECT false, v_req.status, 'already_resolved'; RETURN;
    END IF;

    -- Segregation of duties: approver must differ from requester.
    IF p_decision = 'approved' AND v_req.requested_by = p_actor THEN
        RETURN QUERY SELECT false, v_req.status, 'segregation_of_duties'; RETURN;
    END IF;

    UPDATE public.governance_change_requests
       SET status = p_decision, approved_by = p_actor, resolved_at = now(), reason = p_reason
     WHERE id = p_id;

    RETURN QUERY SELECT true, p_decision, NULL::text;
END;
$$;

-- ── Access ───────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.create_governance_change_request(uuid,text,jsonb,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_governance_change_request(uuid,uuid,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_governance_change_request(uuid,text,jsonb,uuid) TO service_role;
GRANT  EXECUTE ON FUNCTION public.resolve_governance_change_request(uuid,uuid,text,text) TO service_role;
