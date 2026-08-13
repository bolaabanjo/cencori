-- Durable, user-scoped execution timelines for Basecode turns.
alter table public.basecode_turns
  add column if not exists work_trace jsonb;

alter table public.basecode_turns
  drop constraint if exists basecode_turns_work_trace_object;

alter table public.basecode_turns
  add constraint basecode_turns_work_trace_object
  check (work_trace is null or jsonb_typeof(work_trace) = 'object');
