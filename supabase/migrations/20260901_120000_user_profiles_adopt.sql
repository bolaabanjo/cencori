-- Adopt user_profiles into the repo, and make the username an identity rather than a field.
--
-- The table has been read and written by /api/user/profile and /api/user/avatar for some time, but
-- nothing here ever defined it: it was made directly against the database, so its shape was
-- whatever production happened to have. This states it.
--
-- Written to be safe against a live table. Everything is create-if-not-exists or add-if-not-exists,
-- nothing is dropped, no row is rewritten, and the format rule is added NOT VALID so it governs new
-- writes without judging rows that already exist. The one operation that can fail is the unique
-- index, and it fails loudly, in a transaction, changing nothing.

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  username text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles add column if not exists first_name text;
alter table public.user_profiles add column if not exists last_name text;
alter table public.user_profiles add column if not exists username text;
alter table public.user_profiles add column if not exists avatar_url text;
alter table public.user_profiles add column if not exists created_at timestamptz not null default now();
alter table public.user_profiles add column if not exists updated_at timestamptz not null default now();

-- Says which handles collide, rather than leaving the index to fail with only its own name. Two
-- accounts holding the same handle is a decision for a person, not something a migration should
-- settle by picking one.
do $$
declare
  v_duplicates text;
begin
  select string_agg(held, ', ')
  into v_duplicates
  from (
    select format('%s (%s accounts)', lower(username), count(*)) as held
    from public.user_profiles
    where username is not null and length(trim(username)) > 0
    group by lower(username)
    having count(*) > 1
  ) collisions;

  if v_duplicates is not null then
    raise exception
      'Cannot make usernames unique while these are held more than once: %. Resolve them, then re-run.',
      v_duplicates;
  end if;
end;
$$;

-- Case-insensitive, because a handle people type at each other cannot depend on capitalisation.
-- Partial, so the accounts that have never set one are not all colliding on null.
create unique index if not exists user_profiles_username_lower_uidx
  on public.user_profiles (lower(username))
  where username is not null;

/*
 * What a handle may look like. NOT VALID on purpose: it governs every write from here on without
 * scanning what is already stored, so adopting the table cannot fail over a handle someone was
 * allowed to take before the rule existed. Those are corrected when their owner next saves.
 *
 * Reserved words are deliberately not here. The list will grow with the product, and a check
 * constraint is a poor place to keep something that changes -- the API owns it.
 */
alter table public.user_profiles drop constraint if exists user_profiles_username_format;
alter table public.user_profiles
  add constraint user_profiles_username_format
  check (
    username is null
    or (
      length(username) between 3 and 30
      and username ~ '^[a-zA-Z0-9](?:[a-zA-Z0-9_-]*[a-zA-Z0-9])?$'
    )
  )
  not valid;

create or replace function public.user_profiles_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;
create trigger user_profiles_set_updated_at
  before update on public.user_profiles
  for each row execute function public.user_profiles_set_updated_at();

-- Every reader today goes through the service role, which is not subject to these policies, so
-- turning row security on changes nothing that currently runs. It closes the table to anon and to
-- a stray authenticated client, which is what it was missing.
alter table public.user_profiles enable row level security;

drop policy if exists user_profiles_self_read on public.user_profiles;
create policy user_profiles_self_read
  on public.user_profiles for select
  to authenticated
  using (id = auth.uid());
