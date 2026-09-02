-- Let session_events record a turn that has no session.
--
-- The table was built for /v1/sessions, where a session row always exists, so `session_id` was
-- NOT NULL and every policy and index reached the project by joining through it. /v1/responses is
-- deliberately stateless and creates no session, which left the endpoint that serves the agent
-- with no way to record a single event: its whole history was one ai_requests row per call, and
-- nothing about ordering or duration within a turn.
--
-- Rather than mint a session per request -- which would change what a request means, and grow a
-- table that has a lifecycle and an expiry sweep -- the event log now carries its own project and
-- organization, and `session_id` becomes optional. Session turns are unaffected: they keep filling
-- it, and every existing row is backfilled below so nothing has to know which kind it is.

ALTER TABLE public.session_events
    ALTER COLUMN session_id DROP NOT NULL;

ALTER TABLE public.session_events
    ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- The run this event belongs to. `previous_response_id` chains the calls of one agent task
    -- together, which is the whole point: twelve requests are one run, not twelve unrelated rows.
    ADD COLUMN IF NOT EXISTS response_id text,
    ADD COLUMN IF NOT EXISTS previous_response_id text;

-- Existing rows reach their project through the session they already have.
UPDATE public.session_events e
SET project_id = s.project_id,
    organization_id = s.organization_id
FROM public.sessions s
WHERE e.session_id = s.id
  AND e.project_id IS NULL;

-- An event must be attributable to something, or it can be neither secured nor found.
ALTER TABLE public.session_events
    DROP CONSTRAINT IF EXISTS session_events_attribution_check;

ALTER TABLE public.session_events
    ADD CONSTRAINT session_events_attribution_check
    CHECK (session_id IS NOT NULL OR project_id IS NOT NULL)
    NOT VALID;

-- Reading one run back, in order.
CREATE INDEX IF NOT EXISTS idx_session_events_response
    ON public.session_events(project_id, response_id, sequence)
    WHERE response_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_session_events_project_recent
    ON public.session_events(project_id, created_at DESC)
    WHERE project_id IS NOT NULL;

-- ── RLS ──
--
-- The existing policies test `session_id IN (...)`, which is NULL for a session-less row and so
-- never true: without these the new rows would be written by the service role and readable by
-- nobody. Replaced rather than added to, so there is one rule per action to reason about.

DROP POLICY IF EXISTS "Users can view session_events for their projects" ON public.session_events;
DROP POLICY IF EXISTS "Users can insert session_events for their projects" ON public.session_events;

CREATE POLICY "Users can view session_events for their projects"
    ON public.session_events FOR SELECT USING (
        COALESCE(project_id, (SELECT s.project_id FROM sessions s WHERE s.id = session_id)) IN (
            SELECT p.id FROM projects p
            JOIN organizations o ON p.organization_id = o.id
            JOIN organization_members om ON o.id = om.organization_id
            WHERE om.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert session_events for their projects"
    ON public.session_events FOR INSERT WITH CHECK (
        COALESCE(project_id, (SELECT s.project_id FROM sessions s WHERE s.id = session_id)) IN (
            SELECT p.id FROM projects p
            JOIN organizations o ON p.organization_id = o.id
            JOIN organization_members om ON o.id = om.organization_id
            WHERE om.user_id = auth.uid()
        )
    );
