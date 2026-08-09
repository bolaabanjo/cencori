-- Commit metadata on deployments — populated by the push webhook (and, later,
-- the manual deploy path). This is what makes the Deployments list's columns
-- real: commit message, branch, environment, and the author (+ whether they're
-- a member of the org's connected GitHub). Additive + safe.
ALTER TABLE public.compute_agent_deployments
  ADD COLUMN IF NOT EXISTS commit_message TEXT,
  ADD COLUMN IF NOT EXISTS commit_author_name TEXT,
  ADD COLUMN IF NOT EXISTS commit_author_login TEXT,
  ADD COLUMN IF NOT EXISTS commit_author_email TEXT,
  ADD COLUMN IF NOT EXISTS commit_author_is_team_member BOOLEAN,
  ADD COLUMN IF NOT EXISTS branch TEXT,
  ADD COLUMN IF NOT EXISTS environment TEXT DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
