-- Cencori Web V2: hybrid ranking, enforceable policy/takedown controls, and
-- durable browser exploration jobs executed by Cencori-owned workers.

ALTER TABLE public.web_documents
    ADD COLUMN IF NOT EXISTS semantic_embedding real[],
    ADD COLUMN IF NOT EXISTS embedding_model text,
    ADD COLUMN IF NOT EXISTS semantic_bucket_1 smallint,
    ADD COLUMN IF NOT EXISTS semantic_bucket_2 smallint,
    ADD COLUMN IF NOT EXISTS semantic_bucket_3 smallint,
    ADD COLUMN IF NOT EXISTS semantic_bucket_4 smallint,
    ADD COLUMN IF NOT EXISTS authority_score real NOT NULL DEFAULT 0.5 CHECK (authority_score BETWEEN 0 AND 1),
    ADD COLUMN IF NOT EXISTS quality_score real NOT NULL DEFAULT 0.5 CHECK (quality_score BETWEEN 0 AND 1),
    ADD COLUMN IF NOT EXISTS spam_score real NOT NULL DEFAULT 0 CHECK (spam_score BETWEEN 0 AND 1),
    ADD COLUMN IF NOT EXISTS noarchive boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS nosnippet boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS web_documents_quality_idx
    ON public.web_documents(authority_score DESC, quality_score DESC, spam_score ASC);
CREATE INDEX IF NOT EXISTS web_documents_language_idx
    ON public.web_documents(language, indexed_at DESC);
CREATE INDEX IF NOT EXISTS web_documents_semantic_bucket_1_idx ON public.web_documents(semantic_bucket_1) WHERE semantic_embedding IS NOT NULL;
CREATE INDEX IF NOT EXISTS web_documents_semantic_bucket_2_idx ON public.web_documents(semantic_bucket_2) WHERE semantic_embedding IS NOT NULL;
CREATE INDEX IF NOT EXISTS web_documents_semantic_bucket_3_idx ON public.web_documents(semantic_bucket_3) WHERE semantic_embedding IS NOT NULL;
CREATE INDEX IF NOT EXISTS web_documents_semantic_bucket_4_idx ON public.web_documents(semantic_bucket_4) WHERE semantic_embedding IS NOT NULL;

CREATE OR REPLACE FUNCTION public.web_cosine_similarity(a real[], b real[])
RETURNS real
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT CASE
        WHEN a IS NULL OR b IS NULL OR cardinality(a) = 0 OR cardinality(a) <> cardinality(b) THEN 0::real
        ELSE COALESCE((
            SELECT (
                sum(a[i]::double precision * b[i]::double precision)
                / NULLIF(
                    sqrt(sum(a[i]::double precision * a[i]::double precision))
                    * sqrt(sum(b[i]::double precision * b[i]::double precision)),
                    0
                )
            )::real
            FROM generate_subscripts(a, 1) AS i
        ), 0::real)
    END;
$$;

CREATE OR REPLACE FUNCTION public.web_embedding_bucket(embedding real[], p_offset integer)
RETURNS smallint
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT CASE WHEN embedding IS NULL OR cardinality(embedding) < p_offset + 8 THEN NULL
        ELSE sum(CASE WHEN embedding[p_offset + bit + 1] >= 0 THEN (1 << bit) ELSE 0 END)::smallint
    END
    FROM generate_series(0, 7) AS bit;
$$;

DROP FUNCTION IF EXISTS public.search_cencori_web_v2(uuid, text, real[], integer, text, timestamptz, text);
CREATE FUNCTION public.search_cencori_web_v2(
    p_project_id uuid,
    p_query text,
    p_query_embedding real[] DEFAULT NULL,
    p_limit integer DEFAULT 50,
    p_domain text DEFAULT NULL,
    p_fresh_after timestamptz DEFAULT NULL,
    p_language text DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    title text,
    url text,
    canonical_url text,
    host text,
    language text,
    snippet text,
    score real,
    lexical_score real,
    semantic_score real,
    authority_score real,
    quality_score real,
    spam_score real,
    content_hash text,
    retrieved_at timestamptz,
    published_at timestamptz,
    modified_at timestamptz,
    metadata jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH query AS (
        SELECT websearch_to_tsquery('english', p_query) AS value,
            public.web_embedding_bucket(p_query_embedding, 0) AS bucket_1,
            public.web_embedding_bucket(p_query_embedding, 8) AS bucket_2,
            public.web_embedding_bucket(p_query_embedding, 16) AS bucket_3,
            public.web_embedding_bucket(p_query_embedding, 24) AS bucket_4
    ), scored AS (
        SELECT
            d.*,
            CASE WHEN d.search_vector @@ query.value
                THEN ts_rank_cd(d.search_vector, query.value, 32)
                ELSE 0::real
            END AS lexical,
            CASE WHEN p_query_embedding IS NOT NULL AND d.semantic_embedding IS NOT NULL
                THEN GREATEST(public.web_cosine_similarity(d.semantic_embedding, p_query_embedding), 0)
                ELSE 0::real
            END AS semantic,
            (
                0.65 + 0.35 * exp(GREATEST(
                    -GREATEST(EXTRACT(EPOCH FROM (now() - COALESCE(d.modified_at, d.published_at, d.retrieved_at))) / 86400.0, 0) / 180.0,
                    -50.0
                ))
            )::real AS freshness
        FROM public.web_documents d
        CROSS JOIN query
        WHERE d.collection_id IN ('public', 'project:' || p_project_id::text)
          AND NOT d.noarchive
          AND (p_domain IS NULL OR d.host = p_domain OR d.host LIKE '%.' || p_domain)
          AND (p_fresh_after IS NULL OR COALESCE(d.modified_at, d.published_at, d.retrieved_at) >= p_fresh_after)
          AND (p_language IS NULL OR lower(COALESCE(d.language, '')) = lower(p_language) OR lower(COALESCE(d.language, '')) LIKE lower(p_language) || '-%')
          AND (
              d.search_vector @@ query.value
              OR (p_query_embedding IS NOT NULL AND d.semantic_embedding IS NOT NULL AND (
                  d.semantic_bucket_1 = query.bucket_1
                  OR d.semantic_bucket_2 = query.bucket_2
                  OR d.semantic_bucket_3 = query.bucket_3
                  OR d.semantic_bucket_4 = query.bucket_4
              ))
          )
    )
    SELECT
        s.id,
        s.title,
        s.url,
        s.canonical_url,
        s.host,
        s.language,
        CASE WHEN s.nosnippet THEN '' ELSE ts_headline(
            'english', s.content, query.value,
            'MaxWords=45, MinWords=15, ShortWord=3, MaxFragments=2, FragmentDelimiter= … '
        ) END AS snippet,
        (
            (0.50 * s.lexical + 0.32 * s.semantic + 0.10 * s.authority_score + 0.08 * s.freshness)
            * (0.45 + 0.55 * s.quality_score)
            * (1 - 0.85 * s.spam_score)
        )::real AS score,
        s.lexical::real,
        s.semantic::real,
        s.authority_score,
        s.quality_score,
        s.spam_score,
        s.content_hash,
        s.retrieved_at,
        s.published_at,
        s.modified_at,
        s.metadata
    FROM scored s
    CROSS JOIN query
    ORDER BY score DESC, COALESCE(s.modified_at, s.published_at, s.retrieved_at) DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 250);
$$;

REVOKE ALL ON FUNCTION public.search_cencori_web_v2(uuid, text, real[], integer, text, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_cencori_web_v2(uuid, text, real[], integer, text, timestamptz, text) TO service_role;

CREATE TABLE IF NOT EXISTS public.web_domain_policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    host text NOT NULL,
    path_prefix text NOT NULL DEFAULT '/',
    action text NOT NULL CHECK (action IN ('allow', 'deny', 'noindex', 'noarchive', 'nosnippet')),
    reason text NOT NULL,
    source text NOT NULL DEFAULT 'operator',
    jurisdiction text,
    expires_at timestamptz,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT web_domain_policies_scope_key UNIQUE (host, path_prefix, action)
);

CREATE INDEX IF NOT EXISTS web_domain_policies_lookup_idx
    ON public.web_domain_policies(host, length(path_prefix) DESC, expires_at);

CREATE TABLE IF NOT EXISTS public.web_takedown_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_name text NOT NULL,
    requester_email text NOT NULL,
    requester_organization text,
    urls jsonb NOT NULL,
    basis text NOT NULL CHECK (basis IN ('copyright', 'privacy', 'legal', 'robots', 'other')),
    statement text NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
    decision_reason text,
    decided_by uuid,
    decided_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.web_document_tombstones (
    canonical_url text PRIMARY KEY,
    host text NOT NULL,
    reason text NOT NULL,
    source_request_id uuid REFERENCES public.web_takedown_requests(id) ON DELETE SET NULL,
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS web_document_tombstones_host_idx ON public.web_document_tombstones(host);

CREATE TABLE IF NOT EXISTS public.web_browser_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    url text NOT NULL,
    actions jsonb NOT NULL DEFAULT '[]'::jsonb,
    options jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
    result jsonb,
    error text,
    worker_id text,
    attempts integer NOT NULL DEFAULT 0,
    available_at timestamptz NOT NULL DEFAULT now(),
    lease_expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    finished_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.web_embedding_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    query text CHECK (query IS NULL OR length(query) BETWEEN 1 AND 2000),
    model text NOT NULL,
    status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
    embedding real[],
    error text,
    worker_id text,
    attempts integer NOT NULL DEFAULT 0,
    available_at timestamptz NOT NULL DEFAULT now(),
    lease_expires_at timestamptz,
    expires_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
    created_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS web_embedding_jobs_claim_idx
    ON public.web_embedding_jobs(status, available_at, created_at)
    WHERE status IN ('queued', 'running');

CREATE OR REPLACE FUNCTION public.claim_web_embedding_job(p_worker_id text, p_lease_seconds integer DEFAULT 30)
RETURNS SETOF public.web_embedding_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
    DELETE FROM public.web_embedding_jobs WHERE expires_at <= now();
    SELECT id INTO v_id FROM public.web_embedding_jobs
    WHERE ((status = 'queued' AND available_at <= now()) OR (status = 'running' AND lease_expires_at <= now()))
      AND attempts < 3 AND expires_at > now()
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
    IF v_id IS NULL THEN RETURN; END IF;
    RETURN QUERY UPDATE public.web_embedding_jobs
    SET status='running', worker_id=p_worker_id, attempts=attempts+1,
        lease_expires_at=now()+make_interval(secs => LEAST(GREATEST(p_lease_seconds, 10), 60))
    WHERE id=v_id RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_web_embedding_job(
    p_job_id uuid, p_worker_id text, p_embedding real[] DEFAULT NULL, p_error text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.web_embedding_jobs
    SET status=CASE WHEN p_embedding IS NOT NULL THEN 'completed' ELSE 'failed' END,
        embedding=p_embedding, error=left(p_error, 1000), query=NULL, worker_id=NULL,
        lease_expires_at=NULL, finished_at=now(), expires_at=now()+interval '1 minute'
    WHERE id=p_job_id AND status='running' AND worker_id=p_worker_id;
    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_web_takedown(
    p_request_id uuid,
    p_status text,
    p_reason text,
    p_decided_by uuid DEFAULT NULL
)
RETURNS SETOF public.web_takedown_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request public.web_takedown_requests%ROWTYPE;
    v_url text;
BEGIN
    IF p_status NOT IN ('approved', 'rejected', 'withdrawn') THEN
        RAISE EXCEPTION 'invalid takedown decision';
    END IF;
    IF length(trim(p_reason)) = 0 THEN RAISE EXCEPTION 'decision reason is required'; END IF;

    SELECT * INTO v_request FROM public.web_takedown_requests
    WHERE id = p_request_id AND status = 'pending'
    FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;

    IF p_status = 'approved' THEN
        FOR v_url IN SELECT jsonb_array_elements_text(v_request.urls)
        LOOP
            INSERT INTO public.web_document_tombstones (canonical_url, host, reason, source_request_id)
            VALUES (v_url, lower(split_part(split_part(v_url, '://', 2), '/', 1)), p_reason, p_request_id)
            ON CONFLICT (canonical_url) DO UPDATE
            SET reason = EXCLUDED.reason,
                source_request_id = EXCLUDED.source_request_id,
                created_at = now();
        END LOOP;
        DELETE FROM public.web_documents
        WHERE canonical_url IN (SELECT jsonb_array_elements_text(v_request.urls));
    END IF;

    RETURN QUERY
    UPDATE public.web_takedown_requests
    SET status = p_status,
        decision_reason = p_reason,
        decided_by = p_decided_by,
        decided_at = now(),
        updated_at = now()
    WHERE id = p_request_id
    RETURNING *;
END;
$$;

CREATE INDEX IF NOT EXISTS web_browser_jobs_claim_idx
    ON public.web_browser_jobs(status, available_at, created_at)
    WHERE status IN ('queued', 'running');

ALTER TABLE public.web_domain_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_takedown_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_document_tombstones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_browser_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_embedding_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organization members can read browser jobs" ON public.web_browser_jobs;
CREATE POLICY "Organization members can read browser jobs"
    ON public.web_browser_jobs FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = web_browser_jobs.organization_id
          AND om.user_id = auth.uid()
    ));

CREATE OR REPLACE FUNCTION public.claim_web_browser_job(
    p_worker_id text,
    p_lease_seconds integer DEFAULT 120
)
RETURNS SETOF public.web_browser_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
BEGIN
    SELECT id INTO v_id
    FROM public.web_browser_jobs
    WHERE (
        (status = 'queued' AND available_at <= now())
        OR (status = 'running' AND lease_expires_at <= now())
    )
      AND attempts < 3
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    IF v_id IS NULL THEN RETURN; END IF;
    RETURN QUERY
    UPDATE public.web_browser_jobs
    SET status = 'running',
        worker_id = p_worker_id,
        attempts = attempts + 1,
        lease_expires_at = now() + make_interval(secs => LEAST(GREATEST(p_lease_seconds, 30), 300)),
        started_at = COALESCE(started_at, now()),
        updated_at = now()
    WHERE id = v_id
    RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_web_browser_job(
    p_job_id uuid,
    p_worker_id text,
    p_status text,
    p_result jsonb DEFAULT NULL,
    p_error text DEFAULT NULL,
    p_retry boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_attempts integer;
BEGIN
    IF p_status NOT IN ('completed', 'failed') THEN RAISE EXCEPTION 'invalid browser job status'; END IF;
    SELECT attempts INTO v_attempts FROM public.web_browser_jobs
    WHERE id = p_job_id AND status = 'running' AND worker_id = p_worker_id
    FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;

    UPDATE public.web_browser_jobs
    SET status = CASE WHEN p_retry AND v_attempts < 3 THEN 'queued' ELSE p_status END,
        result = CASE WHEN p_status = 'completed' THEN p_result ELSE result END,
        error = left(p_error, 4000),
        worker_id = NULL,
        lease_expires_at = NULL,
        available_at = CASE WHEN p_retry AND v_attempts < 3 THEN now() + make_interval(secs => 30 * v_attempts) ELSE available_at END,
        finished_at = CASE WHEN p_retry AND v_attempts < 3 THEN NULL ELSE now() END,
        updated_at = now()
    WHERE id = p_job_id;
    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_web_browser_job(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_web_browser_job(uuid, text, text, jsonb, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decide_web_takedown(uuid, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_web_embedding_job(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_web_embedding_job(uuid, text, real[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_web_browser_job(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_web_browser_job(uuid, text, text, jsonb, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.decide_web_takedown(uuid, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_web_embedding_job(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_web_embedding_job(uuid, text, real[], text) TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.web_domain_policies TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.web_takedown_requests TO service_role;
GRANT SELECT, INSERT, DELETE ON public.web_document_tombstones TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.web_browser_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.web_embedding_jobs TO service_role;
