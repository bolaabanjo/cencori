-- Cencori Memory — Phase 3, Layer 5 wiring (entity ↔ memory mentions)
--
-- The entity graph shipped with nodes (memory_entities) and typed relations
-- (memory_entity_edges), but the only link back to the facts was an edge's
-- optional source_memory_id. That covers facts that produced a RELATION
-- ("Sarah works_at Zap") and misses every fact that merely mentions an entity
-- ("Sarah prefers async standups") — which is most of them. Without that link,
-- traversing to a connected entity tells you the entity exists but cannot pull
-- what you know about it.
--
-- This adds the mention link so graph-aware recall works:
--   query → seed entities → traverse N hops → reachable entities
--         → mentions → the memories that talk about them.
--
-- Same tenant boundary as gateway_memories: organization_id on every row.

create table if not exists public.memory_entity_mentions (
    id               uuid primary key default gen_random_uuid(),
    organization_id  uuid not null references public.organizations(id) on delete cascade,
    project_id       uuid not null references public.projects(id) on delete cascade,
    entity_id        uuid not null references public.memory_entities(id) on delete cascade,
    memory_id        uuid not null references public.gateway_memories(id) on delete cascade,
    scope            text not null check (scope in ('session', 'user', 'workspace', 'org')),
    scope_key        text not null,
    namespace        text,
    created_at       timestamptz not null default now(),
    -- One link per (entity, memory); re-observing the pair is a no-op.
    constraint uq_memory_entity_mentions unique (entity_id, memory_id)
);

-- Recall path: reachable entity ids → memory ids.
create index if not exists idx_memory_entity_mentions_entity
    on public.memory_entity_mentions (organization_id, project_id, scope, scope_key, entity_id);
-- Reverse path: a memory's entities (inspector / explain-why-recalled).
create index if not exists idx_memory_entity_mentions_memory
    on public.memory_entity_mentions (organization_id, memory_id);

alter table public.memory_entity_mentions enable row level security;

create policy "Service role full access on memory_entity_mentions"
    on public.memory_entity_mentions for all using (true) with check (true);

create policy "Users can view entity mentions for their projects"
    on public.memory_entity_mentions for select
    using (project_id in (
        select p.id from public.projects p
        join public.organization_members om on om.organization_id = p.organization_id
        where om.user_id = auth.uid()
    ));

-- ===== Project kill switch for the graph layer =====
-- Graph extraction is a second LLM call per writeback. It defaults ON (the
-- graph is what makes multi-hop recall work) but a project can turn it off
-- without disabling memory itself.
alter table public.project_memory_settings
    add column if not exists graph_enabled boolean not null default true;
