-- Cencori Memory — Phase 3, Layer 3 (temporal validity: as-of queries)
--
-- The lifecycle spine (status/valid_from/valid_to/superseded_by) shipped with
-- Layer 1. Default recall filters to status='active' (current truth). This adds
-- the historical query: "what was true AS OF time T" — including facts that
-- have since been superseded. Bi-temporal: valid_from/valid_to describe when a
-- fact was true in the world, independent of when we learned/changed it.

create or replace function match_gateway_memories_asof(
    p_org_id uuid,
    p_project_id uuid,
    p_scope text,
    p_scope_key text,
    p_query_embedding vector(1536),
    p_as_of timestamptz,
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
      -- Validity window: true at p_as_of. NB: status is intentionally ignored —
      -- a superseded fact WAS valid before it was superseded.
      and gm.valid_from <= p_as_of
      and (gm.valid_to is null or gm.valid_to > p_as_of)
      and (p_namespace is null or gm.namespace = p_namespace or gm.namespace is null)
      and gm.embedding is not null
      and 1 - (gm.embedding <=> p_query_embedding) > p_threshold
    order by gm.embedding <=> p_query_embedding
    limit p_pool;
end;
$$;
