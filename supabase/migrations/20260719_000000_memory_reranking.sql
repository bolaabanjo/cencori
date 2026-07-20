-- Cencori Memory — Phase 3, Layer 2 (reranking on read)
--
-- Pure cosine top-K over-returns semantically-near-but-irrelevant facts and
-- ignores recency, importance, and reinforcement. Layer 2 fetches a WIDER
-- candidate pool, then reranks in app code by a composite score. Two changes:
--   1. A ranked-fetch RPC that returns the extra ranking signals and does NOT
--      bump access tracking (we only reinforce what actually survives rerank).
--   2. A touch helper to bump access_count/last_accessed_at for the final set.
--
-- Additive: match_gateway_memories (Layer 1) is left intact for compatibility.

-- ===== Wider ranked candidate pool (no access bump) =====
create or replace function match_gateway_memories_ranked(
    p_org_id uuid,
    p_project_id uuid,
    p_scope text,
    p_scope_key text,
    p_query_embedding vector(1536),
    p_threshold float default 0.5,
    p_pool int default 30,
    p_namespace text default null
)
returns table (
    id uuid,
    content text,
    namespace text,
    importance numeric,
    similarity float,
    access_count integer,
    created_at timestamptz,
    last_accessed_at timestamptz
)
language plpgsql
as $$
begin
    return query
    select gm.id, gm.content, gm.namespace, gm.importance,
           (1 - (gm.embedding <=> p_query_embedding))::float as similarity,
           gm.access_count, gm.created_at, gm.last_accessed_at
    from public.gateway_memories gm
    where gm.organization_id = p_org_id            -- hard boundary
      and gm.project_id = p_project_id
      and gm.scope = p_scope
      and gm.scope_key = p_scope_key
      and gm.status = 'active'                     -- never rank superseded facts
      and (p_namespace is null or gm.namespace = p_namespace or gm.namespace is null)
      and (gm.expires_at is null or gm.expires_at > now())
      and gm.embedding is not null
      and 1 - (gm.embedding <=> p_query_embedding) > p_threshold
    order by gm.embedding <=> p_query_embedding
    limit p_pool;
end;
$$;

-- ===== Reinforce only the memories that survived rerank =====
create or replace function touch_gateway_memories(
    p_org_id uuid,
    p_ids uuid[]
)
returns void
language plpgsql
as $$
begin
    update public.gateway_memories
    set access_count = access_count + 1,
        last_accessed_at = now()
    where organization_id = p_org_id
      and id = any(p_ids);
end;
$$;
