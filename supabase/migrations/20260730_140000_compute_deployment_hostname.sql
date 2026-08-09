-- Per-deployment public URL. Production aliases the agent's stable hostname to
-- its current deployment, but PREVIEW deployments (from pull requests) each get
-- their own throwaway URL — so the URL lives on the deployment, not just the
-- agent. Also useful as production deploy history. Additive + safe.
ALTER TABLE public.compute_agent_deployments
  ADD COLUMN IF NOT EXISTS hostname TEXT;
