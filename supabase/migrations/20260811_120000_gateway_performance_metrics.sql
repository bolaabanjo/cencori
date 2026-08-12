-- Phase-level gateway latency metrics. Nullable columns keep historical and
-- non-inference request logs valid while allowing streaming requests to update
-- their measurements after the response body finishes.

alter table public.api_gateway_request_logs
    add column if not exists gateway_preflight_ms integer,
    add column if not exists provider_ttft_ms integer,
    add column if not exists client_ttft_ms integer,
    add column if not exists total_completion_ms integer,
    add column if not exists tokens_per_second numeric;

create index if not exists idx_api_gateway_logs_project_client_ttft
    on public.api_gateway_request_logs(project_id, client_ttft_ms)
    where client_ttft_ms is not null;

comment on column public.api_gateway_request_logs.gateway_preflight_ms is
    'Time from request receipt until mandatory gateway checks and routing are complete.';
comment on column public.api_gateway_request_logs.provider_ttft_ms is
    'Time from upstream provider start until its first content or tool-call chunk.';
comment on column public.api_gateway_request_logs.client_ttft_ms is
    'Time from request receipt until the first response content is enqueued for the client.';
comment on column public.api_gateway_request_logs.total_completion_ms is
    'Time from request receipt until provider output and gateway settlement complete.';
comment on column public.api_gateway_request_logs.tokens_per_second is
    'Completion tokens divided by elapsed output-generation time after the first provider token.';
