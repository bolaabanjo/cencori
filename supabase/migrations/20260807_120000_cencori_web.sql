-- Cencori Web V1: project-private and Cencori-owned public corpus storage.
-- Public documents are written only by internal service-role jobs. Customer
-- crawl requests always write to their project collection.

CREATE TABLE IF NOT EXISTS public.web_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id text NOT NULL,
    visibility text NOT NULL DEFAULT 'project' CHECK (visibility IN ('public', 'project')),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
    url text NOT NULL,
    canonical_url text NOT NULL,
    host text NOT NULL,
    path text NOT NULL DEFAULT '/',
    title text NOT NULL DEFAULT '',
    description text,
    language text,
    content text NOT NULL,
    content_hash text NOT NULL,
    mime_type text NOT NULL,
    status_code integer NOT NULL DEFAULT 200,
    published_at timestamptz,
    modified_at timestamptz,
    retrieved_at timestamptz NOT NULL,
    indexed_at timestamptz NOT NULL DEFAULT now(),
    next_crawl_at timestamptz,
    links jsonb NOT NULL DEFAULT '[]'::jsonb,
    evidence_spans jsonb NOT NULL DEFAULT '[]'::jsonb,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(content, '')), 'C')
    ) STORED,
    CONSTRAINT web_documents_collection_url_key UNIQUE (collection_id, canonical_url),
    CONSTRAINT web_documents_scope_check CHECK (
        (visibility = 'public' AND collection_id = 'public' AND project_id IS NULL)
        OR
        (visibility = 'project' AND project_id IS NOT NULL AND collection_id = 'project:' || project_id::text)
    )
);

CREATE INDEX IF NOT EXISTS web_documents_search_idx
    ON public.web_documents USING gin(search_vector);
CREATE INDEX IF NOT EXISTS web_documents_collection_idx
    ON public.web_documents(collection_id, indexed_at DESC);
CREATE INDEX IF NOT EXISTS web_documents_host_idx
    ON public.web_documents(host, indexed_at DESC);
CREATE INDEX IF NOT EXISTS web_documents_freshness_idx
    ON public.web_documents(COALESCE(published_at, retrieved_at) DESC);
CREATE INDEX IF NOT EXISTS web_documents_recrawl_idx
    ON public.web_documents(next_crawl_at)
    WHERE next_crawl_at IS NOT NULL;

ALTER TABLE public.web_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organization members can read project web documents"
    ON public.web_documents FOR SELECT
    USING (
        visibility = 'public'
        OR EXISTS (
            SELECT 1
            FROM public.organization_members om
            WHERE om.organization_id = web_documents.organization_id
              AND om.user_id = auth.uid()
        )
    );

CREATE OR REPLACE FUNCTION public.search_cencori_web(
    p_project_id uuid,
    p_query text,
    p_limit integer DEFAULT 10,
    p_domain text DEFAULT NULL,
    p_fresh_after timestamptz DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    title text,
    url text,
    canonical_url text,
    snippet text,
    score real,
    content_hash text,
    retrieved_at timestamptz,
    published_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH query AS (
        SELECT websearch_to_tsquery('english', p_query) AS value
    )
    SELECT
        d.id,
        d.title,
        d.url,
        d.canonical_url,
        ts_headline(
            'english',
            d.content,
            query.value,
            'MaxWords=45, MinWords=15, ShortWord=3, MaxFragments=2, FragmentDelimiter= … '
        ) AS snippet,
        (
            ts_rank_cd(d.search_vector, query.value, 32)
            * (
                0.85 + 0.15 * exp(
                    -GREATEST(EXTRACT(EPOCH FROM (now() - COALESCE(d.published_at, d.retrieved_at))) / 86400.0, 0) / 90.0
                )
            )
        )::real AS score,
        d.content_hash,
        d.retrieved_at,
        d.published_at
    FROM public.web_documents d
    CROSS JOIN query
    WHERE d.collection_id IN ('public', 'project:' || p_project_id::text)
      AND d.search_vector @@ query.value
      AND (p_domain IS NULL OR d.host = p_domain OR d.host LIKE '%.' || p_domain)
      AND (p_fresh_after IS NULL OR COALESCE(d.published_at, d.retrieved_at) >= p_fresh_after)
    ORDER BY score DESC, COALESCE(d.published_at, d.retrieved_at) DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 50);
$$;

REVOKE ALL ON FUNCTION public.search_cencori_web(uuid, text, integer, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_cencori_web(uuid, text, integer, text, timestamptz) TO service_role;
