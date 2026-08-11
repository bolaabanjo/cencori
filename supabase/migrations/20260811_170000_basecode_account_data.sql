-- Basecode account-owned workspaces and conversation history.
-- Local filesystem paths intentionally never enter these tables.

create extension if not exists pgcrypto;

create table if not exists public.basecode_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id uuid not null,
  name text not null check (char_length(name) between 1 and 120),
  platform text not null check (char_length(platform) between 1 and 40),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, installation_id),
  unique (id, user_id)
);

create table if not exists public.basecode_workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_key uuid not null,
  name text not null check (char_length(name) between 1 and 160),
  repository_fingerprint text check (
    repository_fingerprint is null or char_length(repository_fingerprint) <= 256
  ),
  pinned boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_key),
  unique (id, user_id)
);

create table if not exists public.basecode_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null,
  device_id uuid,
  sidecar_thread_id text not null check (char_length(sidecar_thread_id) between 1 and 160),
  title text not null check (char_length(title) between 1 and 240),
  model text check (model is null or char_length(model) <= 120),
  status text not null default 'idle' check (
    status in ('idle', 'running', 'completed', 'interrupted', 'failed')
  ),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, user_id)
    references public.basecode_workspaces(id, user_id) on delete cascade,
  foreign key (device_id, user_id)
    references public.basecode_devices(id, user_id) on delete restrict,
  unique (user_id, device_id, sidecar_thread_id),
  unique (id, user_id)
);

create table if not exists public.basecode_turns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null,
  sidecar_turn_id text not null check (char_length(sidecar_turn_id) between 1 and 160),
  sequence integer not null check (sequence >= 0),
  user_message text not null,
  assistant_message text,
  model text check (model is null or char_length(model) <= 120),
  status text not null check (status in ('running', 'completed', 'interrupted', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (thread_id, user_id)
    references public.basecode_threads(id, user_id) on delete cascade,
  unique (thread_id, sidecar_turn_id)
);

create table if not exists public.basecode_activity (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid,
  thread_id uuid,
  kind text not null check (char_length(kind) between 1 and 80),
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, user_id)
    references public.basecode_workspaces(id, user_id) on delete cascade,
  foreign key (thread_id, user_id)
    references public.basecode_threads(id, user_id) on delete cascade
);

create index if not exists basecode_workspaces_user_updated_idx
  on public.basecode_workspaces(user_id, updated_at desc)
  where archived_at is null;
create index if not exists basecode_threads_workspace_updated_idx
  on public.basecode_threads(user_id, workspace_id, updated_at desc)
  where archived_at is null;
create index if not exists basecode_turns_thread_sequence_idx
  on public.basecode_turns(user_id, thread_id, sequence);
create index if not exists basecode_activity_user_created_idx
  on public.basecode_activity(user_id, created_at desc);

create or replace function public.basecode_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists basecode_workspaces_set_updated_at on public.basecode_workspaces;
create trigger basecode_workspaces_set_updated_at
before update on public.basecode_workspaces
for each row execute function public.basecode_set_updated_at();

drop trigger if exists basecode_threads_set_updated_at on public.basecode_threads;
create trigger basecode_threads_set_updated_at
before update on public.basecode_threads
for each row execute function public.basecode_set_updated_at();

drop trigger if exists basecode_turns_set_updated_at on public.basecode_turns;
create trigger basecode_turns_set_updated_at
before update on public.basecode_turns
for each row execute function public.basecode_set_updated_at();

alter table public.basecode_devices enable row level security;
alter table public.basecode_workspaces enable row level security;
alter table public.basecode_threads enable row level security;
alter table public.basecode_turns enable row level security;
alter table public.basecode_activity enable row level security;

drop policy if exists "basecode_devices_owner_all" on public.basecode_devices;
create policy "basecode_devices_owner_all" on public.basecode_devices
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "basecode_workspaces_owner_all" on public.basecode_workspaces;
create policy "basecode_workspaces_owner_all" on public.basecode_workspaces
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "basecode_threads_owner_all" on public.basecode_threads;
create policy "basecode_threads_owner_all" on public.basecode_threads
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "basecode_turns_owner_all" on public.basecode_turns;
create policy "basecode_turns_owner_all" on public.basecode_turns
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "basecode_activity_owner_all" on public.basecode_activity;
create policy "basecode_activity_owner_all" on public.basecode_activity
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.basecode_devices to authenticated;
grant select, insert, update, delete on public.basecode_workspaces to authenticated;
grant select, insert, update, delete on public.basecode_threads to authenticated;
grant select, insert, update, delete on public.basecode_turns to authenticated;
grant select, insert, update, delete on public.basecode_activity to authenticated;
grant usage, select on sequence public.basecode_activity_id_seq to authenticated;

revoke all on function public.basecode_set_updated_at() from public;
grant execute on function public.basecode_set_updated_at() to authenticated, service_role;
