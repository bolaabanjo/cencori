-- Cencori Memory — searchable end-user lookup for the graph explorer
--
-- The dashboard's "choose an end-user" picker cannot be a list. A project on
-- Pro can hold 100,000 memories across as many end-users as it likes, and
-- deriving the list by pulling entity rows and grouping them in JavaScript is
-- wrong twice: the payload is unbounded, and a dropdown of 100k names is not a
-- control anyone can use.
--
-- This aggregates and searches in the database and returns a bounded page:
-- the users with the biggest graphs by default, or the ones matching what the
-- operator typed. total_matches lets the UI say "20 of 4,312" honestly instead
-- of pretending the page is the whole set.

create or replace function memory_graph_users(
    p_org_id uuid,
    p_project_id uuid,
    p_search text default null,
    p_limit int default 20
)
returns table (
    scope_key text,
    entity_count bigint,
    mention_total bigint,
    total_matches bigint
)
language sql
stable
security definer
set search_path = public
as $$
    with grouped as (
        select
            e.scope_key,
            count(*)::bigint as entity_count,
            coalesce(sum(e.mention_count), 0)::bigint as mention_total
        from public.memory_entities e
        where e.organization_id = p_org_id
          and e.project_id = p_project_id
          and (
              p_search is null
              or p_search = ''
              or e.scope_key ilike '%' || p_search || '%'
          )
        group by e.scope_key
    )
    select
        g.scope_key,
        g.entity_count,
        g.mention_total,
        -- Number of users matching the filter, before the page limit.
        count(*) over ()::bigint as total_matches
    from grouped g
    order by g.entity_count desc, g.scope_key
    limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

comment on function memory_graph_users is
    'Bounded, searchable list of end-users with an entity graph in one project. Org-filtered in SQL.';

-- ===== The same lookup over memories, for the browse tab's user filter =====
-- Everyone with a graph is a subset of everyone with memories, so the browser
-- needs its own population. Same shape, same bounded contract.
create or replace function memory_project_users(
    p_org_id uuid,
    p_project_id uuid,
    p_search text default null,
    p_limit int default 20
)
returns table (
    scope_key text,
    memory_count bigint,
    total_matches bigint
)
language sql
stable
security definer
set search_path = public
as $$
    with grouped as (
        select m.scope_key, count(*)::bigint as memory_count
        from public.gateway_memories m
        where m.organization_id = p_org_id
          and m.project_id = p_project_id
          and m.status = 'active'
          and (
              p_search is null
              or p_search = ''
              or m.scope_key ilike '%' || p_search || '%'
          )
        group by m.scope_key
    )
    select
        g.scope_key,
        g.memory_count,
        count(*) over ()::bigint as total_matches
    from grouped g
    order by g.memory_count desc, g.scope_key
    limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

comment on function memory_project_users is
    'Bounded, searchable list of end-users holding memories in one project. Org-filtered in SQL.';

-- ===== Supporting index for forget-suggestions =====
-- The forgetting tab asks for the weakest memories in a project: filter to
-- active, order by access_count then importance. Without an index that is a
-- sort over every active memory the project has. Partial (active only) and
-- narrow, so the write cost on the memory hot path stays small.
create index if not exists idx_gateway_memories_weakest
    on public.gateway_memories (organization_id, project_id, access_count, importance)
    where status = 'active';
