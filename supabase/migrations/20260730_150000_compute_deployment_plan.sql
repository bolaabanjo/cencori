-- The detected build plan + normalized manifest for a deployment. The pipeline
-- runs the adapter registry (detectAgent) against the repo and stores the result
-- so the dashboard can render the agent's framework, adapter, compatibility, and
-- topology without re-detecting. See COMPUTE_UNIVERSAL_DEPLOY.md §3. Additive.
ALTER TABLE public.compute_agent_deployments
  ADD COLUMN IF NOT EXISTS adapter TEXT,
  ADD COLUMN IF NOT EXISTS compatibility TEXT,
  ADD COLUMN IF NOT EXISTS build_plan JSONB,
  ADD COLUMN IF NOT EXISTS manifest JSONB;
