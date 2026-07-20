-- Cencori Memory — managed, Google-only.
--
-- Memory is a MANAGED product that runs entirely on Cencori's Gemini key. The
-- Phase-1 default extraction model was 'gpt-4o-mini' (OpenAI), which predates
-- the managed-Gemini decision: it makes OpenAI the PRIMARY provider (so the
-- dedicated paid Google key override never applies) and cascades into the
-- unfunded fallback chain. Move the default and every existing memory project
-- to the managed Gemini model.

alter table public.project_memory_settings
    alter column extraction_model set default 'gemini-2.5-flash';

-- Backfill: any memory project not already on a Gemini model moves to the
-- managed model. Memory has no BYOK path, so a non-Google model is always the
-- stale default (or a misconfiguration), never a deliberate customer choice.
update public.project_memory_settings
    set extraction_model = 'gemini-2.5-flash',
        updated_at = now()
    where extraction_model is null
       or extraction_model not ilike 'gemini%';
