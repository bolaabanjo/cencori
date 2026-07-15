-- Dedicated project-scoped storage for Responses API inline file search.
-- scan_chat_memory belongs to the Scan product (different project FK,
-- required user_id, constrained source values) and must not be reused here.

CREATE TABLE IF NOT EXISTS public.gateway_file_chunks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id uuid NOT NULL,
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    filename text NOT NULL,
    content text NOT NULL,
    chunk_index integer NOT NULL,
    total_chunks integer NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('english', COALESCE(content, ''))
    ) STORED,
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gateway_file_chunks_project_idx
    ON public.gateway_file_chunks(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gateway_file_chunks_upload_idx
    ON public.gateway_file_chunks(upload_id, chunk_index);
CREATE INDEX IF NOT EXISTS gateway_file_chunks_search_idx
    ON public.gateway_file_chunks USING gin(search_vector);
CREATE INDEX IF NOT EXISTS gateway_file_chunks_expiry_idx
    ON public.gateway_file_chunks(expires_at);

ALTER TABLE public.gateway_file_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organization members can read gateway file chunks"
    ON public.gateway_file_chunks FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.projects p
            JOIN public.organization_members om
              ON om.organization_id = p.organization_id
            WHERE p.id = gateway_file_chunks.project_id
              AND om.user_id = auth.uid()
        )
    );

CREATE OR REPLACE FUNCTION public.search_gateway_file_chunks(
    p_project_id uuid,
    p_query text,
    p_limit integer DEFAULT 5,
    p_filters jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
    id uuid,
    filename text,
    content text,
    metadata jsonb,
    score real,
    created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        c.id,
        c.filename,
        c.content,
        c.metadata,
        ts_rank_cd(c.search_vector, websearch_to_tsquery('english', p_query))::real AS score,
        c.created_at
    FROM public.gateway_file_chunks c
    WHERE c.project_id = p_project_id
      AND c.expires_at > now()
      AND c.search_vector @@ websearch_to_tsquery('english', p_query)
      AND c.metadata @> COALESCE(p_filters, '{}'::jsonb)
    ORDER BY score DESC, c.created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 50);
$$;

REVOKE ALL ON FUNCTION public.search_gateway_file_chunks(uuid, text, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_gateway_file_chunks(uuid, text, integer, jsonb) TO service_role;
