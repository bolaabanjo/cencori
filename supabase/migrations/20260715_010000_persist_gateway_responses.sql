-- Durable, project-scoped storage for Responses API chaining.

CREATE TABLE IF NOT EXISTS public.gateway_responses (
    id text PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    response jsonb NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gateway_responses_project_expiry
    ON public.gateway_responses(project_id, expires_at);

ALTER TABLE public.gateway_responses ENABLE ROW LEVEL SECURITY;
