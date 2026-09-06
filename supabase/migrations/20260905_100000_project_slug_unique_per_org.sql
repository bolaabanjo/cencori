-- Make a project name unique within its organization rather than across the whole platform.
--
-- projects.slug carried a bare UNIQUE constraint, so the first customer to create a project called
-- "production" took that name from everyone else. The second person to try it saw "Failed to create
-- project" and nothing that mentioned a name. With 267 projects, the ordinary words -- production,
-- test, api, app, web -- were already gone.
--
-- Every lookup in the application already scopes by organization: the console pages, the query
-- hooks, both creation forms and the log ingest all filter on organization_id together with slug.
-- Nothing reads a project by slug alone. The global constraint enforced a rule no code relied on
-- and broke one all of it assumed.
--
-- This is permissive, not destructive. Existing slugs are globally distinct, so they are trivially
-- distinct within an organization too: every row keeps its slug, every URL keeps working, and no
-- one has to sign in again. The change only admits names that used to be refused. Verified before
-- writing: 268 projects, 268 distinct (organization_id, slug) pairs, and no row with a null
-- organization_id -- which matters because UNIQUE counts nulls as distinct from each other.
--
-- Organization slugs stay globally unique on purpose. They are the first path segment, so two
-- organizations sharing one would make /{org} ambiguous and every shared link unreliable.

-- The old rule may be a constraint or a bare unique index, and may not carry the name the error
-- message used. Drop it whichever way it exists, then prove it is gone: a silent no-op here would
-- report success while leaving the platform-wide rule in force, which is the one outcome that
-- looks like a fix and is not.
alter table public.projects drop constraint if exists projects_slug_key;
drop index if exists public.projects_slug_key;

do $$
declare
    v_leftover text;
begin
    select string_agg(c.relname, ', ')
    into v_leftover
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
    where i.indrelid = 'public.projects'::regclass
      and i.indisunique
      and i.indnatts = 1
      and (
          select attname
          from pg_attribute
          where attrelid = 'public.projects'::regclass
            and attnum = i.indkey[0]
      ) = 'slug';

    if v_leftover is not null then
        raise exception
            'A platform-wide unique on projects.slug still exists (%). Drop it by name and re-run.',
            v_leftover;
    end if;
end
$$;

alter table public.projects
    drop constraint if exists projects_organization_id_slug_key;

alter table public.projects
    add constraint projects_organization_id_slug_key unique (organization_id, slug);
