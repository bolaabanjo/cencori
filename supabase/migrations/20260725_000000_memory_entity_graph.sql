-- Cencori Memory — Phase 3, Layer 5 (entity graph)
--
-- Flat semantic facts (gateway_memories) can't answer multi-hop questions
-- ("who does Sarah report to?") — pure similarity has no notion of relationship.
-- This adds an entity/relationship layer addressed by the SAME tenant boundary
-- as gateway_memories: entities are nodes, edges are typed relations between
-- them. Extraction populates it alongside fact extraction (LLM); resolution +
-- traversal are app-side and unit-tested.
--
-- Hard boundary: every node and edge carries organization_id — the zero
-- cross-org contract that governs gateway_memories governs the graph too.

-- ===== Entities (nodes) =====
create table if not exists public.memory_entities (
    id               uuid primary key default gen_random_uuid(),
    organization_id  uuid not null references public.organizations(id) on delete cascade,
    project_id       uuid not null references public.projects(id) on delete cascade,
    scope            text not null check (scope in ('session', 'user', 'workspace', 'org')),
    scope_key        text not null,
    namespace        text,
    -- Canonical identity: normalized (name|type). Resolution merges aliases into
    -- one row keyed by this, so "John from Zap" and "John Smith @ Zap" collapse.
    canonical_key    text not null,
    name             text not null,             -- display name (most complete seen)
    entity_type      text not null default 'entity',  -- person | org | project | place | ...
    aliases          text[] not null default '{}',    -- other surface forms observed
    mention_count    integer not null default 1,
    metadata         jsonb not null default '{}',
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    -- One canonical entity per identity within a scope key.
    constraint uq_memory_entities_identity
        unique (organization_id, project_id, scope, scope_key, namespace, canonical_key)
);

create index if not exists idx_memory_entities_scope_lookup
    on public.memory_entities (organization_id, project_id, scope, scope_key, namespace);

-- ===== Edges (typed relations) =====
create table if not exists public.memory_entity_edges (
    id               uuid primary key default gen_random_uuid(),
    organization_id  uuid not null references public.organizations(id) on delete cascade,
    project_id       uuid not null references public.projects(id) on delete cascade,
    scope            text not null check (scope in ('session', 'user', 'workspace', 'org')),
    scope_key        text not null,
    namespace        text,
    src_entity_id    uuid not null references public.memory_entities(id) on delete cascade,
    dst_entity_id    uuid not null references public.memory_entities(id) on delete cascade,
    relation         text not null,             -- works_at | reports_to | building | located_in | ...
    weight           numeric not null default 1 check (weight >= 0),
    -- Optional provenance: the gateway_memories fact this relation came from.
    source_memory_id uuid references public.gateway_memories(id) on delete set null,
    metadata         jsonb not null default '{}',
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    -- One edge per (src, relation, dst) within a scope — re-observation bumps weight.
    constraint uq_memory_entity_edges_triple
        unique (organization_id, project_id, scope, scope_key, namespace, src_entity_id, relation, dst_entity_id),
    constraint chk_memory_entity_edges_no_self check (src_entity_id <> dst_entity_id)
);

-- Traversal starts from a node and walks outward; index both directions.
create index if not exists idx_memory_entity_edges_src
    on public.memory_entity_edges (organization_id, project_id, scope, scope_key, src_entity_id);
create index if not exists idx_memory_entity_edges_dst
    on public.memory_entity_edges (organization_id, project_id, scope, scope_key, dst_entity_id);

-- ===== RLS (mirrors gateway_memories) =====
alter table public.memory_entities enable row level security;
alter table public.memory_entity_edges enable row level security;

create policy "Service role full access on memory_entities"
    on public.memory_entities for all using (true) with check (true);
create policy "Service role full access on memory_entity_edges"
    on public.memory_entity_edges for all using (true) with check (true);

create policy "Users can view entities for their projects"
    on public.memory_entities for select
    using (project_id in (
        select p.id from public.projects p
        join public.organization_members om on om.organization_id = p.organization_id
        where om.user_id = auth.uid()
    ));
create policy "Users can view entity edges for their projects"
    on public.memory_entity_edges for select
    using (project_id in (
        select p.id from public.projects p
        join public.organization_members om on om.organization_id = p.organization_id
        where om.user_id = auth.uid()
    ));
