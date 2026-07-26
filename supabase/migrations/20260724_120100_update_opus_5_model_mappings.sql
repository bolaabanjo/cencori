-- Sync model_mappings for Claude Opus 5 becoming the default Anthropic
-- fallback target, replacing claude-opus-4-8 in these specific mappings.
-- Claude Opus 4.8 remains fully available; its own 'claude-opus-4-8' source
-- row (its fallback targets on other providers) is untouched.
--
-- Mirrors the lib/providers/failover.ts MODEL_MAPPINGS change. This table
-- is the live source read at request time (failover.ts's hardcoded object
-- is only a fallback-of-last-resort if the DB is unavailable), so the app
-- won't pick up the new default without this migration.

-- Repoint existing anthropic-target rows from claude-opus-4-8 to
-- claude-opus-5 for the models where Opus 5 is now the default equivalent.
-- A no-op if these rows were never seeded from the hardcoded object.
UPDATE public.model_mappings
SET target_model = 'claude-opus-5', updated_at = now()
WHERE target_provider = 'anthropic'
  AND target_model = 'claude-opus-4-8'
  AND source_model IN ('gpt-5.6-sol', 'gpt-5.5', 'gpt-5.4', 'o3', 'gemini-3.1-pro-preview');

-- Add claude-opus-5's own fallback targets on other providers (idempotent).
INSERT INTO public.model_mappings (source_model, target_provider, target_model)
VALUES
    ('claude-opus-5', 'openai', 'gpt-5.5'),
    ('claude-opus-5', 'google', 'gemini-3.1-pro-preview')
ON CONFLICT (source_model, target_provider) DO UPDATE SET
    target_model = EXCLUDED.target_model,
    updated_at = now();
