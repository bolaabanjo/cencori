-- Cencori Memory — Phase 3, Layer 1 (conflict resolution on write)
--
-- Turns the blind-insert write path into ADD / UPDATE / DELETE(supersede) / NOOP.
-- Adds a temporal/lifecycle spine to gateway_memories so a contradicting fact
-- supersedes the stale one (instead of both being stored and both recalled),
-- and history stays queryable.
--
-- Additive + idempotent. Existing rows default to status='active' with
-- valid_from = created_at, so behaviour is unchanged until reconciliation runs.

-- ===== Lifecycle / temporal columns =====
alter table public.gateway_memories
    add column if not exists status text not null default 'active'
        check (status in ('active', 'superseded', 'expired'));

alter table public.gateway_memories
    add column if not exists superseded_by uuid
        references public.gateway_memories(id) on delete set null;

-- Bi-temporal: valid_from/valid_to = when the fact was true in the world,
-- distinct from created_at/updated_at = when we learned/changed it. Layer 3
-- (temporal validity) builds on these; Layer 1 only sets valid_to on supersede.
alter table public.gateway_memories
    add column if not exists valid_from timestamptz not null default now();

alter table public.gateway_memories
    add column if not exists valid_to timestamptz;

-- Normalized content hash for a cheap exact-duplicate short-circuit before the
-- reconciliation LLM call. Populated by the app on insert/update.
alter table public.gateway_memories
    add column if not exists content_hash text;

-- Backfill valid_from for pre-existing rows so history is coherent.
update public.gateway_memories
    set valid_from = created_at
    where valid_from is null;

-- Active-row lookups (recall + reconcile candidate fetch) are the hot path.
create index if not exists idx_gateway_memories_active_lookup
    on public.gateway_memories (organization_id, project_id, scope, scope_key, namespace)
    where status = 'active';

-- Exact-dup probe.
create index if not exists idx_gateway_memories_content_hash
    on public.gateway_memories (organization_id, project_id, scope, scope_key, content_hash)
    where status = 'active';

-- ===== Read path: only recall ACTIVE memories =====
-- Superseded/expired facts must never be injected into a turn. Signature and
-- return shape are unchanged from 20260710_000000_gateway_memory.sql — the only
-- delta is the `status = 'active'` predicate. Access tracking bump preserved.
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
          and gm.status = 'active'                     -- never recall superseded facts
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

-- ===== Write path: nearest ACTIVE candidates for reconciliation =====
-- Used only when persisting new facts, to find what might conflict/duplicate.
-- Differences from match_gateway_memories:
--   * no access_count bump (this is a write-side lookup, not a user recall)
--   * no similarity threshold — returns the top-N nearest so the LLM, not a
--     fixed cutoff, decides relatedness
--   * returns importance + content_hash for the exact-dup short-circuit
create or replace function match_gateway_memories_for_write(
    p_org_id uuid,
    p_project_id uuid,
    p_scope text,
    p_scope_key text,
    p_query_embedding vector(1536),
    p_limit int default 6,
    p_namespace text default null
)
returns table (
    id uuid,
    content text,
    importance numeric,
    content_hash text,
    similarity float
)
language plpgsql
as $$
begin
    return query
    select gm.id, gm.content, gm.importance, gm.content_hash,
           (1 - (gm.embedding <=> p_query_embedding))::float as similarity
    from public.gateway_memories gm
    where gm.organization_id = p_org_id                -- hard boundary
      and gm.project_id = p_project_id
      and gm.scope = p_scope
      and gm.scope_key = p_scope_key
      and gm.status = 'active'
      and (p_namespace is null or gm.namespace = p_namespace or gm.namespace is null)
      and (gm.expires_at is null or gm.expires_at > now())
      and gm.embedding is not null
    order by gm.embedding <=> p_query_embedding
    limit p_limit;
end;
$$;

-- ===== Supersede helper =====
-- Marks a memory superseded by a newer one in one statement, stamping valid_to.
-- The org guard is belt-and-suspenders; callers always pass an org-scoped id.
create or replace function supersede_gateway_memory(
    p_org_id uuid,
    p_old_id uuid,
    p_new_id uuid
)
returns void
language plpgsql
as $$
begin
    update public.gateway_memories
    set status = 'superseded',
        superseded_by = p_new_id,
        valid_to = now(),
        updated_at = now()
    where id = p_old_id
      and organization_id = p_org_id;
end;
$$;
