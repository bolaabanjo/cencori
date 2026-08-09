-- Cencori Compute — agent hosting & deploy.
-- NOTE: tables are prefixed `compute_agent_*` to avoid the existing `agents`
-- table (the AI-Agents config feature). These are HOSTED/DEPLOYED agents.
-- Agents are project-scoped; repo identity is inherited from the parent
-- project (projects.github_repo_*). See COMPUTE_ARCHITECTURE.md.

-- ── compute_agents ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.compute_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    framework TEXT NOT NULL DEFAULT 'arcie',
    branch TEXT NOT NULL DEFAULT 'main',
    root_dir TEXT NOT NULL DEFAULT '/',
    -- Points at the live compute_agent_deployments row. Plain uuid (no FK) to
    -- avoid a circular dependency; the app keeps it consistent.
    current_deployment_id UUID,
    status TEXT NOT NULL DEFAULT 'created', -- created|building|active|failed|stopped
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_compute_agents_project ON public.compute_agents(project_id);
CREATE INDEX IF NOT EXISTS idx_compute_agents_org ON public.compute_agents(org_id);

-- ── compute_agent_deployments ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.compute_agent_deployments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES public.compute_agents(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    commit_sha TEXT,
    manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
    image_ref TEXT,
    machine_id TEXT,
    status TEXT NOT NULL DEFAULT 'building', -- building|active|failed|stopped
    build_logs_url TEXT,
    error_message TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(agent_id, version)
);
CREATE INDEX IF NOT EXISTS idx_compute_deployments_agent ON public.compute_agent_deployments(agent_id, created_at DESC);

-- ── compute_agent_secrets (encrypted; injected as env) ──────────
CREATE TABLE IF NOT EXISTS public.compute_agent_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES public.compute_agents(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    encrypted_value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(agent_id, key)
);
CREATE INDEX IF NOT EXISTS idx_compute_secrets_agent ON public.compute_agent_secrets(agent_id);

-- ── compute_agent_channels ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.compute_agent_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES public.compute_agents(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- slack|discord|http
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    webhook_secret TEXT,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(agent_id, type)
);
CREATE INDEX IF NOT EXISTS idx_compute_channels_agent ON public.compute_agent_channels(agent_id);

-- ── compute_agent_schedules (bound to cron) ─────────────────────
CREATE TABLE IF NOT EXISTS public.compute_agent_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES public.compute_agents(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    cron TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(agent_id, name)
);
CREATE INDEX IF NOT EXISTS idx_compute_schedules_agent ON public.compute_agent_schedules(agent_id);

-- ── compute_agent_invocations (metering) ────────────────────────
CREATE TABLE IF NOT EXISTS public.compute_agent_invocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES public.compute_agents(id) ON DELETE CASCADE,
    deployment_id UUID REFERENCES public.compute_agent_deployments(id) ON DELETE SET NULL,
    surface TEXT NOT NULL, -- invoke|channel|schedule
    duration_ms INTEGER,
    billed_seconds NUMERIC(12, 4),
    cold_start BOOLEAN NOT NULL DEFAULT FALSE,
    session_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_compute_invocations_agent ON public.compute_agent_invocations(agent_id, created_at DESC);

-- ── updated_at trigger (shared) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_compute_agents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_compute_agents_updated_at ON public.compute_agents;
CREATE TRIGGER trigger_compute_agents_updated_at
    BEFORE UPDATE ON public.compute_agents
    FOR EACH ROW EXECUTE FUNCTION public.set_compute_agents_updated_at();

DROP TRIGGER IF EXISTS trigger_compute_deployments_updated_at ON public.compute_agent_deployments;
CREATE TRIGGER trigger_compute_deployments_updated_at
    BEFORE UPDATE ON public.compute_agent_deployments
    FOR EACH ROW EXECUTE FUNCTION public.set_compute_agents_updated_at();

-- ── RLS: org members read; writes go through the service role ────
ALTER TABLE public.compute_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compute_agent_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compute_agent_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compute_agent_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compute_agent_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compute_agent_invocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read compute_agents" ON public.compute_agents FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = compute_agents.org_id AND om.user_id = auth.uid()
    ));

CREATE POLICY "Org members read compute_agent_deployments" ON public.compute_agent_deployments FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.compute_agents a JOIN public.organization_members om ON om.organization_id = a.org_id
        WHERE a.id = compute_agent_deployments.agent_id AND om.user_id = auth.uid()
    ));
CREATE POLICY "Org members read compute_agent_channels" ON public.compute_agent_channels FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.compute_agents a JOIN public.organization_members om ON om.organization_id = a.org_id
        WHERE a.id = compute_agent_channels.agent_id AND om.user_id = auth.uid()
    ));
CREATE POLICY "Org members read compute_agent_schedules" ON public.compute_agent_schedules FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.compute_agents a JOIN public.organization_members om ON om.organization_id = a.org_id
        WHERE a.id = compute_agent_schedules.agent_id AND om.user_id = auth.uid()
    ));
CREATE POLICY "Org members read compute_agent_invocations" ON public.compute_agent_invocations FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.compute_agents a JOIN public.organization_members om ON om.organization_id = a.org_id
        WHERE a.id = compute_agent_invocations.agent_id AND om.user_id = auth.uid()
    ));

-- compute_agent_secrets: no member SELECT policy — secret values are only
-- injected server-side by the service role, never read back to clients.

COMMENT ON TABLE public.compute_agents IS 'Cencori Compute: a hosted/deployed agent, scoped to a project. Distinct from the AI-Agents config table (public.agents).';
