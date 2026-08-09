-- Cencori Memory — fix graph uniqueness for the default (null) namespace
--
-- memory_entities and memory_entity_edges are unique per identity/triple
-- *including* `namespace`, which is NULL for every memory written without one
-- — which is almost all of them. Postgres treats NULLs as distinct in a unique
-- constraint, so `ON CONFLICT` never matched those rows: re-observing
-- "Sarah works at Zap Corp" appended a duplicate edge every single time, and
-- concurrent writebacks could duplicate an entity.
--
-- Verified against prod 2026-08-03: persisting the same extraction twice left
-- two identical edge rows.
--
-- Fix: NULLS NOT DISTINCT (Postgres 15+), so a NULL namespace conflicts with
-- another NULL namespace like any other value. Existing duplicates are merged
-- first — entity duplicates are collapsed onto the earliest row and everything
-- pointing at the losers is repointed, so no edge or mention is lost.

-- ===== 1. Drop the constraints so the merge can't trip over them =====
alter table public.memory_entities
    drop constraint if exists uq_memory_entities_identity;
alter table public.memory_entity_edges
    drop constraint if exists uq_memory_entity_edges_triple;

-- ===== 2. Collapse duplicate entities onto the earliest row =====
-- Mentions that would collide after repointing (the survivor already has the
-- same memory linked) are dropped rather than repointed.
with canon as (
    select id,
           first_value(id) over (
               partition by organization_id, project_id, scope, scope_key,
                            coalesce(namespace, ''), canonical_key
               order by created_at, id
           ) as keep_id
    from public.memory_entities
)
delete from public.memory_entity_mentions m
using canon c
where m.entity_id = c.id
  and c.keep_id <> c.id
  and exists (
      select 1 from public.memory_entity_mentions survivor
      where survivor.entity_id = c.keep_id
        and survivor.memory_id = m.memory_id
  );

with canon as (
    select id,
           first_value(id) over (
               partition by organization_id, project_id, scope, scope_key,
                            coalesce(namespace, ''), canonical_key
               order by created_at, id
           ) as keep_id
    from public.memory_entities
)
update public.memory_entity_mentions m
set entity_id = c.keep_id
from canon c
where m.entity_id = c.id and c.keep_id <> c.id;

with canon as (
    select id,
           first_value(id) over (
               partition by organization_id, project_id, scope, scope_key,
                            coalesce(namespace, ''), canonical_key
               order by created_at, id
           ) as keep_id
    from public.memory_entities
)
update public.memory_entity_edges e
set src_entity_id = c.keep_id
from canon c
where e.src_entity_id = c.id and c.keep_id <> c.id;

with canon as (
    select id,
           first_value(id) over (
               partition by organization_id, project_id, scope, scope_key,
                            coalesce(namespace, ''), canonical_key
               order by created_at, id
           ) as keep_id
    from public.memory_entities
)
update public.memory_entity_edges e
set dst_entity_id = c.keep_id
from canon c
where e.dst_entity_id = c.id and c.keep_id <> c.id;

-- Repointing can turn an edge into a self-loop (both endpoints collapsed onto
-- the same entity); the table's check constraint forbids those, so drop them.
delete from public.memory_entity_edges where src_entity_id = dst_entity_id;

-- Carry the losers' mention counts over, then retire them.
with canon as (
    select id, mention_count,
           first_value(id) over (
               partition by organization_id, project_id, scope, scope_key,
                            coalesce(namespace, ''), canonical_key
               order by created_at, id
           ) as keep_id
    from public.memory_entities
),
merged as (
    select keep_id, sum(mention_count) as total
    from canon where keep_id <> id group by keep_id
)
update public.memory_entities e
set mention_count = e.mention_count + merged.total
from merged
where e.id = merged.keep_id;

with canon as (
    select id,
           first_value(id) over (
               partition by organization_id, project_id, scope, scope_key,
                            coalesce(namespace, ''), canonical_key
               order by created_at, id
           ) as keep_id
    from public.memory_entities
)
delete from public.memory_entities
where id in (select id from canon where id <> keep_id);

-- ===== 3. Collapse duplicate edges onto the earliest row =====
with ranked as (
    select id,
           row_number() over (
               partition by organization_id, project_id, scope, scope_key,
                            coalesce(namespace, ''), src_entity_id, relation, dst_entity_id
               order by created_at, id
           ) as rn
    from public.memory_entity_edges
)
delete from public.memory_entity_edges
where id in (select id from ranked where rn > 1);

-- ===== 4. Recreate with NULL-aware uniqueness =====
alter table public.memory_entities
    add constraint uq_memory_entities_identity
    unique nulls not distinct (organization_id, project_id, scope, scope_key, namespace, canonical_key);

alter table public.memory_entity_edges
    add constraint uq_memory_entity_edges_triple
    unique nulls not distinct (organization_id, project_id, scope, scope_key, namespace, src_entity_id, relation, dst_entity_id);
