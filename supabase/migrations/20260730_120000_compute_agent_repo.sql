-- Repo-per-agent: each compute agent deploys from its OWN repo, chosen at
-- deploy time from the org's connected GitHub accounts. The project remains the
-- telemetry/gateway home (usage + logs bind to it via its API key); the repo
-- lives on the agent, so one project can host multiple agents from different
-- repos. Additive + safe on the (currently empty) compute_agents table.
ALTER TABLE public.compute_agents
  ADD COLUMN IF NOT EXISTS repo_full_name TEXT,
  ADD COLUMN IF NOT EXISTS repo_id BIGINT;
