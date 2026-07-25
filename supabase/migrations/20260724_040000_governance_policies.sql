-- ============================================================================
-- Policy-as-code storage + lifecycle  (PRD M1 / Appendix A)
-- ============================================================================
-- Versioned governance policies. A policy is drafted, then ACTIVATED only via
-- the maker-checker change-request flow (PRD M0.4) — activation is a separate,
-- audited step. Exactly one version per (org, name) may be active at a time.
-- The engine (lib/governance/policy-engine.ts) evaluates the active set inline.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.governance_policies (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       uuid NOT NULL,
    name         text NOT NULL,
    version      int  NOT NULL DEFAULT 1,
    status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','active','retired')),
    spec         jsonb NOT NULL,          -- match + rules + defaults + controls
    created_by   uuid,
    approved_by  uuid,
    created_at   timestamptz NOT NULL DEFAULT now(),
    activated_at timestamptz,
    retired_at   timestamptz,
    CONSTRAINT governance_policies_org_name_version_key UNIQUE (org_id, name, version)
);
CREATE INDEX IF NOT EXISTS governance_policies_org_status_idx
    ON public.governance_policies (org_id, status);
-- At most one active version per (org, name).
CREATE UNIQUE INDEX IF NOT EXISTS governance_policies_active_uniq
    ON public.governance_policies (org_id, name) WHERE status = 'active';
ALTER TABLE public.governance_policies ENABLE ROW LEVEL SECURITY;   -- service_role only

-- Create a draft; version auto-increments per (org, name).
CREATE OR REPLACE FUNCTION public.create_governance_policy_draft(
    p_org_id uuid, p_name text, p_spec jsonb, p_created_by uuid
) RETURNS TABLE (id uuid, version int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_version int; v_id uuid;
BEGIN
    IF p_org_id IS NULL OR p_name IS NULL OR length(p_name) = 0 THEN
        RAISE EXCEPTION 'org_id and name are required';
    END IF;
    SELECT coalesce(max(gp.version), 0) + 1 INTO v_version
      FROM public.governance_policies gp WHERE gp.org_id = p_org_id AND gp.name = p_name;
    INSERT INTO public.governance_policies (org_id, name, version, status, spec, created_by)
    VALUES (p_org_id, p_name, v_version, 'draft', coalesce(p_spec, '{}'::jsonb), p_created_by)
    RETURNING governance_policies.id INTO v_id;
    RETURN QUERY SELECT v_id, v_version;
END;
$$;

-- Atomically activate a policy: retire the current active version of the same
-- name, then activate this one. Called AFTER the change request is approved.
CREATE OR REPLACE FUNCTION public.activate_governance_policy(
    p_org_id uuid, p_policy_id uuid, p_approved_by uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text;
BEGIN
    SELECT name INTO v_name FROM public.governance_policies
      WHERE id = p_policy_id AND org_id = p_org_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'policy not found'; END IF;

    UPDATE public.governance_policies SET status = 'retired', retired_at = now()
      WHERE org_id = p_org_id AND name = v_name AND status = 'active';
    UPDATE public.governance_policies
      SET status = 'active', approved_by = p_approved_by, activated_at = now()
      WHERE id = p_policy_id AND org_id = p_org_id;
    RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_governance_policy_draft(uuid,text,jsonb,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.activate_governance_policy(uuid,uuid,uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_governance_policy_draft(uuid,text,jsonb,uuid) TO service_role;
GRANT  EXECUTE ON FUNCTION public.activate_governance_policy(uuid,uuid,uuid) TO service_role;
