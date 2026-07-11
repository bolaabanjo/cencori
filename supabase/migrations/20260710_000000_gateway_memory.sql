-- Cencori Memory — Phase 1 (conversation memory)
--
-- Gateway-level user memory, separate from the namespace-scoped RAG store
-- (`memories` table, 20260207_ai_memory.sql — untouched). A memory is always
-- addressable by (organization_id, scope, scope_key). Session scope lives in
-- Redis; this table backs `user` scope (and `workspace`/`org` in Phase 2).

create extension if not exists vector;

-- ===== Memory rows =====
create table if not exists public.gateway_memories (
    id               uuid primary key default gen_random_uuid(),
    organization_id  uuid not null references public.organizations(id) on delete cascade,
    project_id       uuid not null references public.projects(id) on delete cascade,
    scope            text not null check (scope in ('session', 'user', 'workspace', 'org')),
    scope_key        text not null,                 -- userId for scope=user, sessionId for scope=session
    namespace        text,                          -- optional sub-scope; null = general facts
    content          text not null check (char_length(content) <= 10240),  -- 10KB soft cap (metering unit)
    embedding        vector(1536),                  -- text-embedding-3-small
    metadata         jsonb not null default '{}',   -- extractedFrom, sourceRequestId, piiRedactions, ...
    importance       numeric not null default 0.5 check (importance >= 0 and importance <= 1),
    region           text not null default 'us-east-1',
    access_count     integer not null default 0,
    last_accessed_at timestamptz,
    expires_at       timestamptz,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

create index if not exists idx_gateway_memories_scope_lookup
    on public.gateway_memories (organization_id, project_id, scope, scope_key, namespace);

-- List + quota counts
create index if not exists idx_gateway_memories_project_created
    on public.gateway_memories (project_id, created_at desc);

-- HNSW over ivfflat: the table grows unbounded and ivfflat lists go stale.
create index if not exists idx_gateway_memories_embedding
    on public.gateway_memories
    using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);

-- ===== Per-project settings (kill switch + extraction config) =====
-- Memory works out of the box (API opt-in via the `memory` request field);
-- a settings row exists only to customize extraction or to disable memory.
create table if not exists public.project_memory_settings (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    enabled boolean not null default true,
    extraction_model text not null default 'gpt-4o-mini',
    extraction_prompt text,                          -- null => code-level default
    min_importance numeric not null default 0.5 check (min_importance >= 0 and min_importance <= 1),
    max_memories_per_exchange integer not null default 5,
    session_ttl_seconds integer not null default 86400,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint unique_project_memory_settings unique (project_id)
);

-- ===== Scoped semantic search =====
-- The organization filter lives HERE, in SQL — zero cross-org leakage is a
-- contract-level requirement, not an app-code courtesy. The data-modifying
-- CTE bumps access tracking in the same round trip.
create or replace function match_gateway_memories(
    p_org_id uuid,
    p_project_id uuid,
    p_scope text,
    p_scope_key text,
    p_query_embedding vector(1536),
    p_threshold float default 0.7,
    p_limit int default 5,
    p_namespace text default null
)
returns table (
    id uuid,
    content text,
    namespace text,
    metadata jsonb,
    importance numeric,
    similarity float,
    created_at timestamptz
)
language plpgsql
as $$
begin
    return query
    with matches as (
        select gm.id, gm.content, gm.namespace, gm.metadata, gm.importance,
               (1 - (gm.embedding <=> p_query_embedding))::float as similarity,
               gm.created_at
        from public.gateway_memories gm
        where gm.organization_id = p_org_id            -- hard boundary
          and gm.project_id = p_project_id
          and gm.scope = p_scope
          and gm.scope_key = p_scope_key
          -- namespace merge: project-specific + general (null-namespace) facts
          and (p_namespace is null or gm.namespace = p_namespace or gm.namespace is null)
          and (gm.expires_at is null or gm.expires_at > now())
          and gm.embedding is not null
          and 1 - (gm.embedding <=> p_query_embedding) > p_threshold
        order by gm.embedding <=> p_query_embedding
        limit p_limit
    ),
    touched as (
        update public.gateway_memories g
        set access_count = g.access_count + 1,
            last_accessed_at = now()
        where g.id in (select m.id from matches m)
    )
    select * from matches;
end;
$$;

-- ===== RLS (mirrors prompt_cache pattern) =====
alter table public.gateway_memories enable row level security;
alter table public.project_memory_settings enable row level security;

create policy "Service role full access on gateway_memories"
    on public.gateway_memories for all using (true) with check (true);

create policy "Service role full access on project_memory_settings"
    on public.project_memory_settings for all using (true) with check (true);

create policy "Users can view gateway memories for their projects"
    on public.gateway_memories for select
    using (project_id in (
        select p.id from public.projects p
        join public.organization_members om on om.organization_id = p.organization_id
        where om.user_id = auth.uid()
    ));

create policy "Users can manage memory settings for their projects"
    on public.project_memory_settings for all
    using (project_id in (
        select p.id from public.projects p
        join public.organization_members om on om.organization_id = p.organization_id
        where om.user_id = auth.uid()
    ));
