-- Cencori Compute — per-agent deployment hostname.
-- Additive. Deployed agents get their own subdomain on the deploy domain
-- (<slug>-<short-id>.cencori.app). Slugs are unique per project, but the
-- subdomain namespace is GLOBAL, so hostname carries its own unique index.
-- See COMPUTE_ARCHITECTURE.md §8.1.

ALTER TABLE public.compute_agents ADD COLUMN IF NOT EXISTS hostname TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_compute_agents_hostname
    ON public.compute_agents(hostname)
    WHERE hostname IS NOT NULL;

COMMENT ON COLUMN public.compute_agents.hostname IS
    'Globally-unique deploy subdomain, e.g. <slug>-<short-id>.cencori.app. Served off a separate registrable domain from cencori.com for origin isolation.';
