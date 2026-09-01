-- Basecode account billing, entitlements, payments, and weekly usage.
--
-- Basecode uses the same auth.users identities as Cencori, but its consumer
-- plans are intentionally separate from organizations.subscription_tier.
-- All mutations happen through the service role. Desktop clients receive a
-- sanitized percentage/readout from the Basecode API and never write these
-- tables directly.

create extension if not exists pgcrypto;

alter table public.api_keys
  add column if not exists client_app text;

alter table public.api_keys
  drop constraint if exists api_keys_client_app_check;
alter table public.api_keys
  add constraint api_keys_client_app_check
  check (client_app is null or client_app in ('basecode'));

create index if not exists api_keys_client_app_created_by_idx
  on public.api_keys(client_app, created_by)
  where client_app is not null and revoked_at is null;

comment on column public.api_keys.client_app is
  'Server-issued first-party client identity. Null for ordinary customer keys.';

create table if not exists public.basecode_plans (
  code text primary key check (code in ('free', 'builder', 'pro', 'enterprise')),
  name text not null,
  price_ngn_minor bigint check (price_ngn_minor is null or price_ngn_minor >= 0),
  price_usd_minor bigint check (price_usd_minor is null or price_usd_minor >= 0),
  billing_period_days integer not null default 30 check (billing_period_days between 1 and 366),
  weekly_request_limit integer check (weekly_request_limit is null or weekly_request_limit > 0),
  weekly_budget_microusd bigint check (weekly_budget_microusd is null or weekly_budget_microusd > 0),
  model_policy text not null check (model_policy in ('auto', 'open_weight', 'frontier', 'custom')),
  max_concurrent_turns integer not null default 1 check (max_concurrent_turns between 1 and 100),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (code = 'free' and weekly_request_limit is not null)
    or (code in ('builder', 'pro') and weekly_budget_microusd is not null)
    or code = 'enterprise'
  )
);

insert into public.basecode_plans (
  code,
  name,
  price_ngn_minor,
  price_usd_minor,
  weekly_request_limit,
  weekly_budget_microusd,
  model_policy,
  max_concurrent_turns
) values
  ('free', 'Free', 0, 0, 10, null, 'auto', 1),
  -- Paid limits are provider-cost budgets. They are deliberately server-side
  -- and may be tuned without shipping a desktop release.
  ('builder', 'Builder', 500000, 500, null, 250000, 'open_weight', 1),
  ('pro', 'Pro', 1500000, 1500, null, 1000000, 'frontier', 1),
  ('enterprise', 'Enterprise', null, null, null, null, 'custom', 100)
on conflict (code) do update set
  name = excluded.name,
  price_ngn_minor = excluded.price_ngn_minor,
  price_usd_minor = excluded.price_usd_minor,
  billing_period_days = excluded.billing_period_days,
  weekly_request_limit = excluded.weekly_request_limit,
  weekly_budget_microusd = excluded.weekly_budget_microusd,
  model_policy = excluded.model_policy,
  max_concurrent_turns = excluded.max_concurrent_turns,
  enabled = excluded.enabled,
  updated_at = now();

create table if not exists public.basecode_billing_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  plan_code text not null default 'free' references public.basecode_plans(code),
  status text not null default 'active' check (
    status in ('active', 'past_due', 'cancelled', 'suspended')
  ),
  entitlement_starts_at timestamptz,
  entitlement_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.basecode_billing_customers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.basecode_billing_accounts(id) on delete cascade,
  provider text not null check (provider in ('flutterwave', 'bachs')),
  provider_customer_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, provider),
  unique (provider, provider_customer_id)
);

create table if not exists public.basecode_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.basecode_billing_accounts(id) on delete cascade,
  plan_code text not null references public.basecode_plans(code),
  provider text not null check (provider in ('flutterwave', 'bachs')),
  reference text not null unique,
  provider_checkout_id text,
  checkout_url text,
  expected_amount_minor bigint not null check (expected_amount_minor > 0),
  currency text not null check (currency in ('NGN', 'USD')),
  status text not null default 'pending' check (
    status in ('pending', 'paid', 'failed', 'expired', 'cancelled')
  ),
  expires_at timestamptz not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_checkout_id)
);

create table if not exists public.basecode_payments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.basecode_billing_accounts(id) on delete restrict,
  checkout_session_id uuid not null references public.basecode_checkout_sessions(id) on delete restrict,
  provider text not null check (provider in ('flutterwave', 'bachs')),
  provider_transaction_id text not null,
  reference text not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency in ('NGN', 'USD')),
  status text not null check (status in ('successful', 'failed', 'refunded')),
  payment_method text,
  provider_payload jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_transaction_id),
  unique (provider, reference)
);

create table if not exists public.basecode_subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.basecode_billing_accounts(id) on delete cascade,
  plan_code text not null references public.basecode_plans(code),
  provider text not null check (provider in ('flutterwave', 'bachs', 'manual')),
  provider_subscription_id text,
  status text not null check (
    status in ('active', 'past_due', 'cancelled', 'expired', 'paused')
  ),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  auto_renews boolean not null default false,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (current_period_end > current_period_start)
);

create unique index if not exists basecode_subscriptions_provider_id_uidx
  on public.basecode_subscriptions(provider, provider_subscription_id)
  where provider_subscription_id is not null;
create index if not exists basecode_subscriptions_account_period_idx
  on public.basecode_subscriptions(account_id, current_period_end desc);

create table if not exists public.basecode_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('flutterwave', 'bachs')),
  provider_event_id text not null,
  event_type text not null,
  payload_sha256 text not null check (char_length(payload_sha256) = 64),
  status text not null default 'processing' check (
    status in ('processing', 'processed', 'ignored', 'failed')
  ),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_event_id)
);

create table if not exists public.basecode_usage_periods (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.basecode_billing_accounts(id) on delete cascade,
  plan_code text not null references public.basecode_plans(code),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  request_limit integer,
  requests_used integer not null default 0 check (requests_used >= 0),
  budget_microusd bigint,
  cost_used_microusd bigint not null default 0 check (cost_used_microusd >= 0),
  cost_reserved_microusd bigint not null default 0 check (cost_reserved_microusd >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (request_limit is null or request_limit > 0),
  check (budget_microusd is null or budget_microusd > 0),
  unique (account_id, plan_code, starts_at)
);

create table if not exists public.basecode_turn_reservations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.basecode_billing_accounts(id) on delete cascade,
  usage_period_id uuid not null references public.basecode_usage_periods(id) on delete cascade,
  client_turn_key uuid not null,
  runtime_turn_id text,
  model text,
  status text not null default 'reserved' check (
    status in ('reserved', 'running', 'completed', 'released', 'expired')
  ),
  reserved_microusd bigint not null default 0 check (reserved_microusd >= 0),
  actual_cost_microusd bigint not null default 0 check (actual_cost_microusd >= 0),
  gateway_calls integer not null default 0 check (gateway_calls >= 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (account_id, client_turn_key)
);

create index if not exists basecode_turn_reservations_active_idx
  on public.basecode_turn_reservations(account_id, expires_at desc)
  where status in ('reserved', 'running');

create table if not exists public.basecode_usage_events (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.basecode_billing_accounts(id) on delete cascade,
  usage_period_id uuid not null references public.basecode_usage_periods(id) on delete cascade,
  reservation_id uuid references public.basecode_turn_reservations(id) on delete set null,
  kind text not null check (kind in ('reserve', 'gateway_usage', 'release', 'refund', 'adjustment')),
  request_delta integer not null default 0,
  cost_delta_microusd bigint not null default 0,
  gateway_request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists basecode_usage_events_gateway_request_uidx
  on public.basecode_usage_events(gateway_request_id)
  where gateway_request_id is not null;
create index if not exists basecode_usage_events_account_created_idx
  on public.basecode_usage_events(account_id, created_at desc);

create or replace function public.basecode_billing_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'basecode_plans',
    'basecode_billing_accounts',
    'basecode_billing_customers',
    'basecode_checkout_sessions',
    'basecode_subscriptions',
    'basecode_usage_periods',
    'basecode_turn_reservations'
  ] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.basecode_billing_set_updated_at()',
      table_name || '_updated_at',
      table_name
    );
  end loop;
end;
$$;

create or replace function public.basecode_week_bounds(p_at timestamptz default now())
returns table(starts_at timestamptz, ends_at timestamptz)
language sql
stable
set search_path = public
as $$
  select
    date_trunc('week', p_at at time zone 'Africa/Lagos') at time zone 'Africa/Lagos',
    (date_trunc('week', p_at at time zone 'Africa/Lagos') + interval '7 days') at time zone 'Africa/Lagos';
$$;

create or replace function public.basecode_effective_plan(p_account public.basecode_billing_accounts)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_account.plan_code = 'free' then 'free'
    when p_account.status = 'active'
      and p_account.entitlement_ends_at is not null
      and p_account.entitlement_ends_at > now()
      then p_account.plan_code
    else 'free'
  end;
$$;

create or replace function public.basecode_reserve_turn(
  p_user_id uuid,
  p_client_turn_key uuid,
  p_model text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.basecode_billing_accounts%rowtype;
  v_plan public.basecode_plans%rowtype;
  v_period public.basecode_usage_periods%rowtype;
  v_existing public.basecode_turn_reservations%rowtype;
  v_reservation public.basecode_turn_reservations%rowtype;
  v_plan_code text;
  v_week_start timestamptz;
  v_week_end timestamptz;
  v_active_count integer;
  v_reserve_microusd bigint := 1000;
begin
  if p_user_id is null or p_client_turn_key is null then
    raise exception 'invalid_basecode_reservation';
  end if;

  insert into public.basecode_billing_accounts(user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select * into v_account
  from public.basecode_billing_accounts
  where user_id = p_user_id
  for update;

  select * into v_existing
  from public.basecode_turn_reservations
  where account_id = v_account.id and client_turn_key = p_client_turn_key;

  if found then
    return jsonb_build_object(
      'allowed', v_existing.status in ('reserved', 'running'),
      'reservation_id', v_existing.id,
      'status', v_existing.status,
      'reset_at', (select ends_at from public.basecode_usage_periods where id = v_existing.usage_period_id)
    );
  end if;

  v_plan_code := public.basecode_effective_plan(v_account);
  select * into v_plan from public.basecode_plans where code = v_plan_code and enabled;
  if not found then
    raise exception 'basecode_plan_unavailable';
  end if;

  select starts_at, ends_at into v_week_start, v_week_end
  from public.basecode_week_bounds(now());

  insert into public.basecode_usage_periods(
    account_id,
    plan_code,
    starts_at,
    ends_at,
    request_limit,
    budget_microusd
  ) values (
    v_account.id,
    v_plan.code,
    v_week_start,
    v_week_end,
    v_plan.weekly_request_limit,
    v_plan.weekly_budget_microusd
  )
  on conflict (account_id, plan_code, starts_at) do update set
    request_limit = excluded.request_limit,
    budget_microusd = excluded.budget_microusd,
    ends_at = excluded.ends_at,
    updated_at = now()
  returning * into v_period;

  select count(*) into v_active_count
  from public.basecode_turn_reservations
  where account_id = v_account.id
    and status in ('reserved', 'running')
    and expires_at > now();

  if v_active_count >= v_plan.max_concurrent_turns then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'concurrency_limit',
      'plan', v_plan.code,
      'reset_at', v_period.ends_at
    );
  end if;

  if v_plan.weekly_request_limit is not null
    and v_period.requests_used >= v_plan.weekly_request_limit then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'weekly_request_limit',
      'plan', v_plan.code,
      'percentage_used', 100,
      'reset_at', v_period.ends_at
    );
  end if;

  if v_plan.weekly_budget_microusd is not null
    and v_period.cost_used_microusd + v_period.cost_reserved_microusd >= v_plan.weekly_budget_microusd then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'weekly_budget_limit',
      'plan', v_plan.code,
      'percentage_used', 100,
      'reset_at', v_period.ends_at
    );
  end if;

  if v_plan.weekly_request_limit is not null then
    update public.basecode_usage_periods
    set requests_used = requests_used + 1
    where id = v_period.id
    returning * into v_period;
    v_reserve_microusd := 0;
  else
    v_reserve_microusd := least(
      v_reserve_microusd,
      greatest(v_plan.weekly_budget_microusd - v_period.cost_used_microusd - v_period.cost_reserved_microusd, 0)
    );
    update public.basecode_usage_periods
    set cost_reserved_microusd = cost_reserved_microusd + v_reserve_microusd
    where id = v_period.id
    returning * into v_period;
  end if;

  insert into public.basecode_turn_reservations(
    account_id,
    usage_period_id,
    client_turn_key,
    model,
    reserved_microusd,
    expires_at
  ) values (
    v_account.id,
    v_period.id,
    p_client_turn_key,
    nullif(left(coalesce(p_model, ''), 160), ''),
    v_reserve_microusd,
    now() + interval '2 hours'
  ) returning * into v_reservation;

  insert into public.basecode_usage_events(
    account_id,
    usage_period_id,
    reservation_id,
    kind,
    request_delta,
    cost_delta_microusd
  ) values (
    v_account.id,
    v_period.id,
    v_reservation.id,
    'reserve',
    case when v_plan.weekly_request_limit is null then 0 else 1 end,
    v_reserve_microusd
  );

  return jsonb_build_object(
    'allowed', true,
    'reservation_id', v_reservation.id,
    'plan', v_plan.code,
    'model_policy', v_plan.model_policy,
    'percentage_used', case
      when v_period.request_limit is not null then
        least(100, round(100.0 * v_period.requests_used / v_period.request_limit))
      when v_period.budget_microusd is not null then
        least(100, round(100.0 * (v_period.cost_used_microusd + v_period.cost_reserved_microusd) / v_period.budget_microusd))
      else 0
    end,
    'reset_at', v_period.ends_at
  );
end;
$$;

create or replace function public.basecode_gateway_access(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.basecode_billing_accounts%rowtype;
  v_plan public.basecode_plans%rowtype;
  v_period public.basecode_usage_periods%rowtype;
  v_reservation public.basecode_turn_reservations%rowtype;
  v_plan_code text;
begin
  select * into v_account
  from public.basecode_billing_accounts
  where user_id = p_user_id;

  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'account_missing');
  end if;

  v_plan_code := public.basecode_effective_plan(v_account);
  select * into v_plan from public.basecode_plans where code = v_plan_code and enabled;
  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'plan_unavailable');
  end if;

  select * into v_reservation
  from public.basecode_turn_reservations
  where account_id = v_account.id
    and status in ('reserved', 'running')
    and expires_at > now()
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'turn_not_reserved', 'plan', v_plan.code);
  end if;

  select * into v_period from public.basecode_usage_periods where id = v_reservation.usage_period_id;

  if v_period.budget_microusd is not null
    and v_period.cost_used_microusd >= v_period.budget_microusd then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'weekly_budget_limit',
      'plan', v_plan.code,
      'reset_at', v_period.ends_at
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'reservation_id', v_reservation.id,
    'plan', v_plan.code,
    'model_policy', v_plan.model_policy,
    'reset_at', v_period.ends_at
  );
end;
$$;

create or replace function public.basecode_record_gateway_usage(
  p_user_id uuid,
  p_gateway_request_id text,
  p_cost_microusd bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.basecode_billing_accounts%rowtype;
  v_reservation public.basecode_turn_reservations%rowtype;
  v_inserted bigint;
begin
  if p_user_id is null or nullif(trim(p_gateway_request_id), '') is null or p_cost_microusd < 0 then
    return false;
  end if;

  select * into v_account
  from public.basecode_billing_accounts
  where user_id = p_user_id
  for update;
  if not found then return false; end if;

  select * into v_reservation
  from public.basecode_turn_reservations
  where account_id = v_account.id
    and status in ('reserved', 'running')
    and expires_at > now()
  order by created_at desc
  limit 1
  for update;
  if not found then return false; end if;

  insert into public.basecode_usage_events(
    account_id,
    usage_period_id,
    reservation_id,
    kind,
    cost_delta_microusd,
    gateway_request_id
  ) values (
    v_account.id,
    v_reservation.usage_period_id,
    v_reservation.id,
    'gateway_usage',
    p_cost_microusd,
    left(trim(p_gateway_request_id), 200)
  )
  on conflict (gateway_request_id) where gateway_request_id is not null do nothing
  returning id into v_inserted;

  if v_inserted is null then return true; end if;

  update public.basecode_usage_periods
  set
    cost_used_microusd = cost_used_microusd + p_cost_microusd,
    cost_reserved_microusd = greatest(cost_reserved_microusd - v_reservation.reserved_microusd, 0)
  where id = v_reservation.usage_period_id;

  update public.basecode_turn_reservations
  set
    status = 'running',
    actual_cost_microusd = actual_cost_microusd + p_cost_microusd,
    gateway_calls = gateway_calls + 1,
    reserved_microusd = 0
  where id = v_reservation.id;

  return true;
end;
$$;

create or replace function public.basecode_finish_turn(
  p_user_id uuid,
  p_client_turn_key uuid,
  p_runtime_turn_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_reservation public.basecode_turn_reservations%rowtype;
begin
  select id into v_account_id
  from public.basecode_billing_accounts
  where user_id = p_user_id;
  if v_account_id is null then return false; end if;

  select * into v_reservation
  from public.basecode_turn_reservations
  where account_id = v_account_id and client_turn_key = p_client_turn_key
  for update;
  if not found then return false; end if;
  if v_reservation.status in ('completed', 'released', 'expired') then return true; end if;

  -- A turn that never reached an upstream model is released and does not burn
  -- the free request. Once provider cost exists, finishing closes the lease but
  -- preserves the usage. Server-side gateway failures can post a separate,
  -- audited refund event after their cause is verified.
  if v_reservation.gateway_calls = 0 then
    update public.basecode_usage_periods
    set
      requests_used = greatest(requests_used - case when v_reservation.reserved_microusd = 0 then 1 else 0 end, 0),
      cost_reserved_microusd = greatest(cost_reserved_microusd - v_reservation.reserved_microusd, 0)
    where id = v_reservation.usage_period_id;

    insert into public.basecode_usage_events(
      account_id,
      usage_period_id,
      reservation_id,
      kind,
      request_delta,
      cost_delta_microusd
    ) values (
      v_account_id,
      v_reservation.usage_period_id,
      v_reservation.id,
      'release',
      case when v_reservation.reserved_microusd = 0 then -1 else 0 end,
      -v_reservation.reserved_microusd
    );
  end if;

  update public.basecode_turn_reservations
  set
    runtime_turn_id = nullif(left(coalesce(p_runtime_turn_id, ''), 200), ''),
    status = case when gateway_calls = 0 then 'released' else 'completed' end,
    reserved_microusd = 0,
    completed_at = now()
  where id = v_reservation.id;

  return true;
end;
$$;

create or replace function public.basecode_apply_verified_payment(
  p_checkout_session_id uuid,
  p_provider_transaction_id text,
  p_amount_minor bigint,
  p_currency text,
  p_payment_method text,
  p_paid_at timestamptz,
  p_provider_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_checkout public.basecode_checkout_sessions%rowtype;
  v_plan public.basecode_plans%rowtype;
  v_period_start timestamptz := coalesce(p_paid_at, now());
  v_period_end timestamptz;
begin
  select * into v_checkout
  from public.basecode_checkout_sessions
  where id = p_checkout_session_id
  for update;

  if not found then raise exception 'basecode_checkout_not_found'; end if;
  if v_checkout.status = 'paid' then
    return jsonb_build_object('applied', false, 'duplicate', true, 'account_id', v_checkout.account_id);
  end if;
  if v_checkout.status <> 'pending' then raise exception 'basecode_checkout_not_pending'; end if;
  -- Provider delivery can be delayed. Accept a payment made before checkout expiry even when its
  -- verified webhook arrives later, but never grant access for a payment initiated after expiry.
  if v_checkout.expires_at <= v_period_start then raise exception 'basecode_checkout_expired'; end if;
  if p_amount_minor < v_checkout.expected_amount_minor then raise exception 'basecode_payment_underpaid'; end if;
  if upper(p_currency) <> v_checkout.currency then raise exception 'basecode_payment_currency_mismatch'; end if;
  if nullif(trim(p_provider_transaction_id), '') is null then raise exception 'basecode_payment_id_missing'; end if;

  select * into v_plan from public.basecode_plans where code = v_checkout.plan_code and enabled;
  if not found or v_plan.code in ('free', 'enterprise') then
    raise exception 'basecode_paid_plan_unavailable';
  end if;
  v_period_end := v_period_start + make_interval(days => v_plan.billing_period_days);

  insert into public.basecode_payments(
    account_id,
    checkout_session_id,
    provider,
    provider_transaction_id,
    reference,
    amount_minor,
    currency,
    status,
    payment_method,
    provider_payload,
    paid_at
  ) values (
    v_checkout.account_id,
    v_checkout.id,
    v_checkout.provider,
    left(trim(p_provider_transaction_id), 200),
    v_checkout.reference,
    p_amount_minor,
    upper(p_currency),
    'successful',
    nullif(left(coalesce(p_payment_method, ''), 100), ''),
    coalesce(p_provider_payload, '{}'::jsonb),
    v_period_start
  )
  on conflict (provider, provider_transaction_id) do nothing;

  if not found then
    return jsonb_build_object('applied', false, 'duplicate', true, 'account_id', v_checkout.account_id);
  end if;

  update public.basecode_checkout_sessions
  set status = 'paid', paid_at = v_period_start
  where id = v_checkout.id;

  update public.basecode_subscriptions
  set status = 'expired', updated_at = now()
  where account_id = v_checkout.account_id and status in ('active', 'past_due', 'paused');

  insert into public.basecode_subscriptions(
    account_id,
    plan_code,
    provider,
    status,
    current_period_start,
    current_period_end,
    auto_renews
  ) values (
    v_checkout.account_id,
    v_checkout.plan_code,
    v_checkout.provider,
    'active',
    v_period_start,
    v_period_end,
    false
  );

  update public.basecode_billing_accounts
  set
    plan_code = v_checkout.plan_code,
    status = 'active',
    entitlement_starts_at = v_period_start,
    entitlement_ends_at = v_period_end,
    cancel_at_period_end = false
  where id = v_checkout.account_id;

  return jsonb_build_object(
    'applied', true,
    'account_id', v_checkout.account_id,
    'plan', v_checkout.plan_code,
    'period_start', v_period_start,
    'period_end', v_period_end
  );
end;
$$;

alter table public.basecode_plans enable row level security;
alter table public.basecode_billing_accounts enable row level security;
alter table public.basecode_billing_customers enable row level security;
alter table public.basecode_checkout_sessions enable row level security;
alter table public.basecode_payments enable row level security;
alter table public.basecode_subscriptions enable row level security;
alter table public.basecode_webhook_events enable row level security;
alter table public.basecode_usage_periods enable row level security;
alter table public.basecode_turn_reservations enable row level security;
alter table public.basecode_usage_events enable row level security;

-- No user policies. The desktop and web UI use authenticated server routes;
-- service_role bypasses RLS and is the only writer/reader of raw billing data.
revoke all on table public.basecode_plans from anon, authenticated;
revoke all on table public.basecode_billing_accounts from anon, authenticated;
revoke all on table public.basecode_billing_customers from anon, authenticated;
revoke all on table public.basecode_checkout_sessions from anon, authenticated;
revoke all on table public.basecode_payments from anon, authenticated;
revoke all on table public.basecode_subscriptions from anon, authenticated;
revoke all on table public.basecode_webhook_events from anon, authenticated;
revoke all on table public.basecode_usage_periods from anon, authenticated;
revoke all on table public.basecode_turn_reservations from anon, authenticated;
revoke all on table public.basecode_usage_events from anon, authenticated;
revoke all on sequence public.basecode_usage_events_id_seq from anon, authenticated;

revoke all on function public.basecode_billing_set_updated_at() from public;
revoke all on function public.basecode_week_bounds(timestamptz) from public;
revoke all on function public.basecode_effective_plan(public.basecode_billing_accounts) from public;
revoke all on function public.basecode_reserve_turn(uuid, uuid, text) from public;
revoke all on function public.basecode_gateway_access(uuid) from public;
revoke all on function public.basecode_record_gateway_usage(uuid, text, bigint) from public;
revoke all on function public.basecode_finish_turn(uuid, uuid, text) from public;
revoke all on function public.basecode_apply_verified_payment(uuid, text, bigint, text, text, timestamptz, jsonb) from public;

grant execute on function public.basecode_reserve_turn(uuid, uuid, text) to service_role;
grant execute on function public.basecode_gateway_access(uuid) to service_role;
grant execute on function public.basecode_record_gateway_usage(uuid, text, bigint) to service_role;
grant execute on function public.basecode_finish_turn(uuid, uuid, text) to service_role;
grant execute on function public.basecode_apply_verified_payment(uuid, text, bigint, text, text, timestamptz, jsonb) to service_role;

comment on table public.basecode_billing_accounts is
  'Basecode consumer entitlement, keyed to the existing Cencori auth user.';
comment on table public.basecode_usage_periods is
  'Weekly Lagos-time quota buckets. Raw limits stay server-side; clients receive percentages.';
comment on function public.basecode_apply_verified_payment(uuid, text, bigint, text, text, timestamptz, jsonb) is
  'Atomically grants a 30-day entitlement after a server independently verifies the provider transaction.';
