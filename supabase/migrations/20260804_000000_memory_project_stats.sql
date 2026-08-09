-- Cencori Memory — project stats for the dashboard
--
-- The memory page needs counts the REST layer can't express: distinct end-users
-- with memories, distinct namespaces, and a daily write series. Doing that
-- client-side means pulling every row (100k on Pro) to count them in JS. One
-- function, one round trip, counted in the database instead.
--
-- Org-filtered in SQL like every other memory function — the zero cross-org
-- contract is enforced here, not in the caller.

create or replace function memory_project_stats(
    p_org_id uuid,
    p_project_id uuid,
    p_days int default 14
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    result jsonb;
begin
    select jsonb_build_object(
        'activeCount', (
            select count(*) from public.gateway_memories
            where organization_id = p_org_id and project_id = p_project_id and status = 'active'
        ),
        'supersededCount', (
            select count(*) from public.gateway_memories
            where organization_id = p_org_id and project_id = p_project_id and status = 'superseded'
        ),
        'distinctUsers', (
            select count(distinct scope_key) from public.gateway_memories
            where organization_id = p_org_id and project_id = p_project_id and status = 'active'
        ),
        'distinctNamespaces', (
            select count(distinct namespace) from public.gateway_memories
            where organization_id = p_org_id and project_id = p_project_id
              and status = 'active' and namespace is not null
        ),
        'avgImportance', coalesce((
            select round(avg(importance), 3) from public.gateway_memories
            where organization_id = p_org_id and project_id = p_project_id and status = 'active'
        ), 0),
        'recalledTotal', coalesce((
            select sum(access_count) from public.gateway_memories
            where organization_id = p_org_id and project_id = p_project_id and status = 'active'
        ), 0),
        'neverRecalled', (
            select count(*) from public.gateway_memories
            where organization_id = p_org_id and project_id = p_project_id
              and status = 'active' and access_count = 0
        ),
        'entityCount', (
            select count(*) from public.memory_entities
            where organization_id = p_org_id and project_id = p_project_id
        ),
        'edgeCount', (
            select count(*) from public.memory_entity_edges
            where organization_id = p_org_id and project_id = p_project_id
        ),
        'mentionCount', (
            select count(*) from public.memory_entity_mentions
            where organization_id = p_org_id and project_id = p_project_id
        ),
        -- Daily writes, zero-filled so the chart has no gaps.
        'daily', (
            select coalesce(jsonb_agg(jsonb_build_object('date', d.day, 'count', coalesce(w.n, 0)) order by d.day), '[]'::jsonb)
            from generate_series(
                (current_date - (p_days - 1))::date,
                current_date,
                interval '1 day'
            ) as d(day)
            left join (
                select created_at::date as day, count(*) as n
                from public.gateway_memories
                where organization_id = p_org_id and project_id = p_project_id
                  and created_at >= current_date - (p_days - 1)
                group by 1
            ) w on w.day = d.day
        ),
        -- Who has the most stored, for the "which end-users are heavy" question.
        'topUsers', (
            select coalesce(jsonb_agg(t order by (t->>'count')::int desc), '[]'::jsonb)
            from (
                select jsonb_build_object('scopeKey', scope_key, 'count', count(*)) as t
                from public.gateway_memories
                where organization_id = p_org_id and project_id = p_project_id and status = 'active'
                group by scope_key
                order by count(*) desc
                limit 8
            ) s
        )
    ) into result;

    return result;
end;
$$;

comment on function memory_project_stats is
    'Dashboard counts for one project''s gateway memory + entity graph. Org-filtered in SQL.';
