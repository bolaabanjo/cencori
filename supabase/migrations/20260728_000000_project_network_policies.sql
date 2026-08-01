-- Project ingress controls. Public is the safe default; restricted mode is
-- fail-closed at the gateway and requires at least one IPv4 or IPv6 CIDR.
CREATE TABLE IF NOT EXISTS public.project_network_policies (
    project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
    access_mode text NOT NULL DEFAULT 'public'
        CHECK (access_mode IN ('public', 'restricted')),
    allowed_cidrs text[] NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_network_policy_restricted_ranges
        CHECK (access_mode = 'public' OR cardinality(allowed_cidrs) > 0)
);

ALTER TABLE public.project_network_policies ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.project_network_policies IS
    'Gateway ingress policy for a project. Read and written by service-role APIs.';
COMMENT ON COLUMN public.project_network_policies.allowed_cidrs IS
    'Normalized IPv4 and IPv6 CIDR ranges permitted when access_mode is restricted.';
