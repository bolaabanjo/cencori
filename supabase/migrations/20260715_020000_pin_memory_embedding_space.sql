-- Pin each project's Gateway memory vectors to one embedding space.
-- OpenAI and Gemini both emit 1536 dimensions here, but their vectors are not
-- semantically comparable. Once claimed, a project must never silently switch.

alter table public.project_memory_settings
    add column if not exists embedding_provider text,
    add column if not exists embedding_model text;

alter table public.project_memory_settings
    drop constraint if exists project_memory_settings_embedding_provider_check;

alter table public.project_memory_settings
    add constraint project_memory_settings_embedding_provider_check
    check (embedding_provider is null or embedding_provider in ('openai', 'google'));

-- Preserve the space most likely used by existing rows. Before this migration,
-- active project OpenAI BYOK won; otherwise the managed Google model was used.
insert into public.project_memory_settings (
    project_id,
    embedding_provider,
    embedding_model
)
select
    projects_with_memory.project_id,
    case when exists (
        select 1
        from public.provider_keys pk
        where pk.project_id = projects_with_memory.project_id
          and pk.provider = 'openai'
          and pk.is_active = true
    ) then 'openai' else 'google' end,
    case when exists (
        select 1
        from public.provider_keys pk
        where pk.project_id = projects_with_memory.project_id
          and pk.provider = 'openai'
          and pk.is_active = true
    ) then 'text-embedding-3-small' else 'gemini-embedding-001' end
from (
    select distinct project_id from public.gateway_memories
) projects_with_memory
on conflict (project_id) do update
set embedding_provider = coalesce(
        public.project_memory_settings.embedding_provider,
        excluded.embedding_provider
    ),
    embedding_model = coalesce(
        public.project_memory_settings.embedding_model,
        excluded.embedding_model
    ),
    updated_at = now();

create or replace function public.claim_gateway_memory_embedding_config(
    p_project_id uuid,
    p_provider text,
    p_model text
)
returns table (embedding_provider text, embedding_model text)
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_provider not in ('openai', 'google') then
        raise exception 'Unsupported memory embedding provider';
    end if;

    insert into public.project_memory_settings (
        project_id,
        embedding_provider,
        embedding_model
    ) values (
        p_project_id,
        p_provider,
        p_model
    )
    on conflict (project_id) do update
    set embedding_provider = coalesce(
            public.project_memory_settings.embedding_provider,
            excluded.embedding_provider
        ),
        embedding_model = coalesce(
            public.project_memory_settings.embedding_model,
            excluded.embedding_model
        ),
        updated_at = now();

    return query
    select pms.embedding_provider, pms.embedding_model
    from public.project_memory_settings pms
    where pms.project_id = p_project_id;
end;
$$;

revoke all on function public.claim_gateway_memory_embedding_config(uuid, text, text) from public;
grant execute on function public.claim_gateway_memory_embedding_config(uuid, text, text) to service_role;
