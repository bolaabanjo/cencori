-- Token spend per Basecode task, kept against the account rather than the device.
--
-- Basecode's usage surface used to count only what the machine in front of you had run since it
-- launched, so signing in on a second computer started from zero. Spend belongs to the account, so
-- it is stored here and summed across every device.
--
-- The unit is the thread, not the turn, because the agent runtime reports a thread's *running
-- total* rather than each turn's delta. Storing that as a replace makes every write idempotent: the
-- same figure can arrive from a turn lease, from a transcript import on a second machine, or twice
-- over, and the row lands on the same value. Summing it per turn would count a thread's earlier
-- turns again on each turn that follows -- a thread reporting 5K, 12K, 20K is a 20K thread, not 37K.
--
-- These are token counts, not money. Billing stays in basecode_usage_periods, which meters requests
-- and provider cost; nothing here feeds an entitlement.

create table if not exists public.basecode_thread_usage (
  account_id uuid not null references public.basecode_billing_accounts(id) on delete cascade,
  -- The agent runtime's own thread id, which is what both writers key by.
  thread_id text not null,
  total_tokens bigint not null default 0 check (total_tokens >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0),
  cache_write_input_tokens bigint not null default 0 check (cache_write_input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  reasoning_output_tokens bigint not null default 0 check (reasoning_output_tokens >= 0),
  -- The client's clock for this figure. Guards the replace so a late arrival from a slow device
  -- cannot walk a thread's total backwards.
  reported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, thread_id)
);

create index if not exists basecode_thread_usage_account_reported_idx
  on public.basecode_thread_usage(account_id, reported_at desc);

drop trigger if exists basecode_thread_usage_set_updated_at on public.basecode_thread_usage;
create trigger basecode_thread_usage_set_updated_at
  before update on public.basecode_thread_usage
  for each row execute function public.basecode_billing_set_updated_at();

alter table public.basecode_thread_usage enable row level security;

-- Written only through the service role, like every other Basecode billing table. Desktop clients
-- read a summed figure back through the billing snapshot and never touch rows directly.
revoke all on table public.basecode_thread_usage from anon, authenticated;

/**
 * Records where a set of threads' spend now stands.
 *
 * Takes an array so a device that has just imported its transcript history files the whole lot in
 * one request. Each entry is `{threadId, tokens: {...}, updatedAt}` with `updatedAt` in epoch
 * milliseconds; entries that are malformed are skipped rather than failing the batch, because one
 * bad row must not cost a device its history.
 */
create or replace function public.basecode_record_thread_usage(
  p_user_id uuid,
  p_threads jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_entry jsonb;
  v_tokens jsonb;
  v_thread_id text;
  v_reported_at timestamptz;
  v_written integer := 0;
begin
  if p_threads is null or jsonb_typeof(p_threads) <> 'array' then return 0; end if;

  select id into v_account_id
  from public.basecode_billing_accounts
  where user_id = p_user_id;
  if v_account_id is null then return 0; end if;

  for v_entry in select * from jsonb_array_elements(p_threads)
  loop
    v_thread_id := nullif(left(coalesce(v_entry->>'threadId', ''), 200), '');
    v_tokens := v_entry->'tokens';
    continue when v_thread_id is null or jsonb_typeof(v_tokens) <> 'object';

    v_reported_at := case
      when (v_entry->>'updatedAt') ~ '^[0-9]+$'
        then to_timestamp((v_entry->>'updatedAt')::bigint / 1000.0)
      else now()
    end;

    insert into public.basecode_thread_usage as existing (
      account_id,
      thread_id,
      total_tokens,
      input_tokens,
      cached_input_tokens,
      cache_write_input_tokens,
      output_tokens,
      reasoning_output_tokens,
      reported_at
    ) values (
      v_account_id,
      v_thread_id,
      greatest(coalesce((v_tokens->>'totalTokens')::bigint, 0), 0),
      greatest(coalesce((v_tokens->>'inputTokens')::bigint, 0), 0),
      greatest(coalesce((v_tokens->>'cachedInputTokens')::bigint, 0), 0),
      greatest(coalesce((v_tokens->>'cacheWriteInputTokens')::bigint, 0), 0),
      greatest(coalesce((v_tokens->>'outputTokens')::bigint, 0), 0),
      greatest(coalesce((v_tokens->>'reasoningOutputTokens')::bigint, 0), 0),
      v_reported_at
    )
    on conflict (account_id, thread_id) do update set
      total_tokens = excluded.total_tokens,
      input_tokens = excluded.input_tokens,
      cached_input_tokens = excluded.cached_input_tokens,
      cache_write_input_tokens = excluded.cache_write_input_tokens,
      output_tokens = excluded.output_tokens,
      reasoning_output_tokens = excluded.reasoning_output_tokens,
      reported_at = excluded.reported_at
      -- A replace, but never backwards: an older figure arriving late leaves the row alone.
      where excluded.reported_at >= existing.reported_at;

    v_written := v_written + 1;
  end loop;

  return v_written;
end;
$$;

/** The account's whole token spend, across every device it has ever been signed in on. */
create or replace function public.basecode_account_token_usage(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_result jsonb;
begin
  select id into v_account_id
  from public.basecode_billing_accounts
  where user_id = p_user_id;
  if v_account_id is null then return null; end if;

  select jsonb_build_object(
    'totalTokens', coalesce(sum(total_tokens), 0),
    'inputTokens', coalesce(sum(input_tokens), 0),
    'cachedInputTokens', coalesce(sum(cached_input_tokens), 0),
    'cacheWriteInputTokens', coalesce(sum(cache_write_input_tokens), 0),
    'outputTokens', coalesce(sum(output_tokens), 0),
    'reasoningOutputTokens', coalesce(sum(reasoning_output_tokens), 0)
  )
  into v_result
  from public.basecode_thread_usage
  where account_id = v_account_id;

  -- No rows is not zero spend: the desktop falls back to its own record rather than claiming an
  -- account has never spent anything.
  if not exists (select 1 from public.basecode_thread_usage where account_id = v_account_id) then
    return null;
  end if;

  return v_result;
end;
$$;

revoke all on function public.basecode_record_thread_usage(uuid, jsonb) from public;
revoke all on function public.basecode_account_token_usage(uuid) from public;

grant execute on function public.basecode_record_thread_usage(uuid, jsonb) to service_role;
grant execute on function public.basecode_account_token_usage(uuid) to service_role;
