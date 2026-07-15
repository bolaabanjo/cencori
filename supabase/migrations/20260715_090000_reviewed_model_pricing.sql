-- Reviewed, fail-closed pricing catalog for models available through the
-- managed gateway on 2026-07-15.
--
-- Prices are stored per 1,000 tokens. Provider source pages quote per
-- 1,000,000 tokens, so each published value is divided by 1,000 here.

ALTER TABLE public.model_pricing
    ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS pricing_source_url text,
    ADD COLUMN IF NOT EXISTS pricing_reviewed_at timestamptz,
    ADD COLUMN IF NOT EXISTS pricing_expires_at timestamptz,
    ADD COLUMN IF NOT EXISTS cached_input_price_per_1k_tokens numeric(12, 8),
    ADD COLUMN IF NOT EXISTS long_context_threshold_tokens integer,
    ADD COLUMN IF NOT EXISTS long_context_input_price_per_1k_tokens numeric(12, 8),
    ADD COLUMN IF NOT EXISTS long_context_output_price_per_1k_tokens numeric(12, 8),
    ADD COLUMN IF NOT EXISTS long_context_cached_input_price_per_1k_tokens numeric(12, 8),
    ADD COLUMN IF NOT EXISTS review_notes text;

CREATE INDEX IF NOT EXISTS idx_model_pricing_active_provider_model
    ON public.model_pricing (provider, model_name)
    WHERE is_active = true;

-- Rows from older migrations did not record provenance or review dates.
-- Keep them for history, but do not allow them to authorize billable calls.
UPDATE public.model_pricing
SET is_active = false
WHERE is_active = true;

INSERT INTO public.model_pricing (
    provider,
    model_name,
    input_price_per_1k_tokens,
    output_price_per_1k_tokens,
    cencori_markup_percentage,
    is_active,
    pricing_source_url,
    pricing_reviewed_at,
    pricing_expires_at,
    cached_input_price_per_1k_tokens,
    long_context_threshold_tokens,
    long_context_input_price_per_1k_tokens,
    long_context_output_price_per_1k_tokens,
    long_context_cached_input_price_per_1k_tokens,
    review_notes
) VALUES
    -- OpenAI standard processing. Long-context rates apply to the full request
    -- when prompt input exceeds 272,000 tokens.
    ('openai', 'gpt-5.6-sol',   0.00500000, 0.03000000, 50.00, true, 'https://developers.openai.com/api/docs/pricing', '2026-07-15T00:00:00Z', NULL, 0.00050000, 272000, 0.01000000, 0.04500000, 0.00100000, 'Standard processing; excludes batch, flex, priority, regional processing, cache writes, and tool fees.'),
    ('openai', 'gpt-5.6-terra', 0.00250000, 0.01500000, 50.00, true, 'https://developers.openai.com/api/docs/pricing', '2026-07-15T00:00:00Z', NULL, 0.00025000, 272000, 0.00500000, 0.02250000, 0.00050000, 'Standard processing; excludes batch, flex, priority, regional processing, cache writes, and tool fees.'),
    ('openai', 'gpt-5.6-luna',  0.00100000, 0.00600000, 50.00, true, 'https://developers.openai.com/api/docs/pricing', '2026-07-15T00:00:00Z', NULL, 0.00010000, 272000, 0.00200000, 0.00900000, 0.00020000, 'Standard processing; excludes batch, flex, priority, regional processing, cache writes, and tool fees.'),
    ('openai', 'gpt-5.5',       0.00500000, 0.03000000, 50.00, true, 'https://developers.openai.com/api/docs/models/gpt-5.5', '2026-07-15T00:00:00Z', NULL, 0.00050000, 272000, 0.01000000, 0.04500000, 0.00100000, 'Standard processing; excludes batch, flex, priority, regional processing, and tool fees.'),
    ('openai', 'gpt-5.4',       0.00250000, 0.01500000, 50.00, true, 'https://developers.openai.com/api/docs/models/gpt-5.4', '2026-07-15T00:00:00Z', NULL, 0.00025000, 272000, 0.00500000, 0.02250000, 0.00050000, 'Standard processing; excludes batch, flex, priority, regional processing, and tool fees.'),
    ('openai', 'gpt-5.4-mini',  0.00075000, 0.00450000, 50.00, true, 'https://developers.openai.com/api/docs/models/gpt-5.4-mini', '2026-07-15T00:00:00Z', NULL, 0.00007500, NULL, NULL, NULL, NULL, 'Standard processing; excludes batch, flex, priority, regional processing, and tool fees.'),
    ('openai', 'gpt-5.4-nano',  0.00020000, 0.00125000, 50.00, true, 'https://developers.openai.com/api/docs/models/gpt-5.4-nano', '2026-07-15T00:00:00Z', NULL, 0.00002000, NULL, NULL, NULL, NULL, 'Standard processing; excludes batch, flex, priority, regional processing, and tool fees.'),
    ('openai', 'gpt-5.2',       0.00175000, 0.01400000, 50.00, true, 'https://developers.openai.com/api/docs/models/gpt-5.2', '2026-07-15T00:00:00Z', NULL, 0.00017500, NULL, NULL, NULL, NULL, 'Standard processing; retained while the connected account lists this previous-generation model.'),
    ('openai', 'gpt-5',         0.00125000, 0.01000000, 50.00, true, 'https://developers.openai.com/api/docs/models/gpt-5', '2026-07-15T00:00:00Z', NULL, 0.00012500, NULL, NULL, NULL, NULL, 'Standard processing; retained while the connected account lists this previous-generation model.'),
    ('openai', 'gpt-5-mini',    0.00025000, 0.00200000, 50.00, true, 'https://developers.openai.com/api/docs/models/gpt-5-mini', '2026-07-15T00:00:00Z', NULL, 0.00002500, NULL, NULL, NULL, NULL, 'Standard processing; retained while the connected account lists this previous-generation model.'),
    ('openai', 'gpt-5-nano',    0.00005000, 0.00040000, 50.00, true, 'https://developers.openai.com/api/docs/models/gpt-5-nano', '2026-07-15T00:00:00Z', NULL, 0.00000500, NULL, NULL, NULL, NULL, 'Standard processing; retained while the connected account lists this previous-generation model.'),
    ('openai', 'gpt-4.1',       0.00200000, 0.00800000, 50.00, true, 'https://developers.openai.com/api/docs/models/gpt-4.1', '2026-07-15T00:00:00Z', NULL, 0.00050000, NULL, NULL, NULL, NULL, 'Standard processing; connected-account compatibility model.'),
    ('openai', 'gpt-4.1-mini',  0.00040000, 0.00160000, 50.00, true, 'https://developers.openai.com/api/docs/models/gpt-4.1-mini', '2026-07-15T00:00:00Z', NULL, 0.00010000, NULL, NULL, NULL, NULL, 'Standard processing; connected-account compatibility model.'),
    ('openai', 'gpt-4.1-nano',  0.00010000, 0.00040000, 50.00, true, 'https://developers.openai.com/api/docs/models/gpt-4.1-nano', '2026-07-15T00:00:00Z', NULL, 0.00002500, NULL, NULL, NULL, NULL, 'Standard processing; provider marks this model deprecated, but the connected account still lists it.'),
    ('openai', 'gpt-4o',        0.00250000, 0.01000000, 50.00, true, 'https://developers.openai.com/api/docs/models/gpt-4o', '2026-07-15T00:00:00Z', NULL, 0.00125000, NULL, NULL, NULL, NULL, 'Standard processing; provider marks this model deprecated, but internal compatibility paths still use it.'),
    ('openai', 'gpt-4o-mini',   0.00015000, 0.00060000, 50.00, true, 'https://developers.openai.com/api/docs/models/gpt-4o-mini', '2026-07-15T00:00:00Z', NULL, 0.00007500, NULL, NULL, NULL, NULL, 'Standard processing; internal document, memory, and vision compatibility model.'),
    ('openai', 'o3',            0.00200000, 0.00800000, 50.00, true, 'https://developers.openai.com/api/docs/models/o3', '2026-07-15T00:00:00Z', NULL, 0.00050000, NULL, NULL, NULL, NULL, 'Standard processing; provider marks this model deprecated, but the connected account still lists it.'),
    ('openai', 'o4-mini',       0.00110000, 0.00440000, 50.00, true, 'https://developers.openai.com/api/docs/models/o4-mini', '2026-07-15T00:00:00Z', NULL, 0.00027500, NULL, NULL, NULL, NULL, 'Standard processing; provider marks this model deprecated, but the connected account still lists it.'),

    -- OpenAI embeddings and the exact non-token units used by the audio routes.
    ('openai', 'text-embedding-3-small', 0.00002000, 0.00000000, 50.00, true, 'https://developers.openai.com/api/docs/models/text-embedding-3-small', '2026-07-15T00:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, 'Standard embeddings price.'),
    ('openai', 'text-embedding-3-large', 0.00013000, 0.00000000, 50.00, true, 'https://developers.openai.com/api/docs/models/text-embedding-3-large', '2026-07-15T00:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, 'Standard embeddings price.'),
    ('openai', 'text-embedding-ada-002', 0.00010000, 0.00000000, 50.00, true, 'https://developers.openai.com/api/docs/models/text-embedding-ada-002', '2026-07-15T00:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, 'Legacy embeddings price; retained for the existing embeddings route.'),
    ('openai', 'tts-1',                  0.00000000, 0.00000000, 50.00, true, 'https://developers.openai.com/api/docs/models/tts-1', '2026-07-15T00:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, 'Speech generation is $0.015 per 1,000 characters; token columns are intentionally zero.'),
    ('openai', 'tts-1-hd',               0.00000000, 0.00000000, 50.00, true, 'https://developers.openai.com/api/docs/models/tts-1-hd', '2026-07-15T00:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, 'Speech generation is $0.030 per 1,000 characters; token columns are intentionally zero.'),
    ('openai', 'whisper-1',              0.00000000, 0.00000000, 50.00, true, 'https://developers.openai.com/api/docs/models/whisper-1', '2026-07-15T00:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, 'Transcription is $0.006 per minute; token columns are intentionally zero.'),

    -- Anthropic first-party standard API. Sonnet 5's introductory price ends
    -- at the start of 2026-09-01 UTC and must be reviewed before then.
    ('anthropic', 'claude-sonnet-5',   0.00200000, 0.01000000, 50.00, true, 'https://platform.claude.com/docs/en/about-claude/pricing', '2026-07-15T00:00:00Z', '2026-09-01T00:00:00Z', 0.00020000, NULL, NULL, NULL, NULL, 'Introductory first-party price through 2026-08-31; standard pricing becomes $3/$15 per MTok afterward.'),
    ('anthropic', 'claude-opus-4-8',   0.00500000, 0.02500000, 50.00, true, 'https://platform.claude.com/docs/en/about-claude/pricing', '2026-07-15T00:00:00Z', NULL, 0.00050000, NULL, NULL, NULL, NULL, 'First-party base input/output price; excludes cache writes.'),
    ('anthropic', 'claude-opus-4-7',   0.00500000, 0.02500000, 50.00, true, 'https://platform.claude.com/docs/en/about-claude/pricing', '2026-07-15T00:00:00Z', NULL, 0.00050000, NULL, NULL, NULL, NULL, 'First-party base input/output price; excludes cache writes.'),
    ('anthropic', 'claude-sonnet-4-6', 0.00300000, 0.01500000, 50.00, true, 'https://platform.claude.com/docs/en/about-claude/pricing', '2026-07-15T00:00:00Z', NULL, 0.00030000, NULL, NULL, NULL, NULL, 'First-party base input/output price; excludes cache writes.'),
    ('anthropic', 'claude-opus-4-6',   0.00500000, 0.02500000, 50.00, true, 'https://platform.claude.com/docs/en/about-claude/pricing', '2026-07-15T00:00:00Z', NULL, 0.00050000, NULL, NULL, NULL, NULL, 'First-party base input/output price; excludes cache writes.'),

    -- Google Gemini Developer API paid-tier Standard pricing.
    ('google', 'gemini-3.5-flash',                    0.00150000, 0.00900000, 50.00, true, 'https://ai.google.dev/gemini-api/docs/pricing', '2026-07-15T00:00:00Z', NULL, 0.00015000, NULL, NULL, NULL, NULL, 'Paid-tier Standard text pricing; excludes grounding and other tool fees.'),
    ('google', 'gemini-3.1-pro-preview',              0.00200000, 0.01200000, 50.00, true, 'https://ai.google.dev/gemini-api/docs/pricing', '2026-07-15T00:00:00Z', NULL, 0.00020000, 200000, 0.00400000, 0.01800000, 0.00040000, 'Paid-tier Standard text pricing; preview model; excludes grounding and other tool fees.'),
    ('google', 'gemini-3.1-pro-preview-customtools',  0.00200000, 0.01200000, 50.00, true, 'https://ai.google.dev/gemini-api/docs/pricing', '2026-07-15T00:00:00Z', NULL, 0.00020000, 200000, 0.00400000, 0.01800000, 0.00040000, 'Paid-tier Standard text pricing; preview model; excludes grounding and other tool fees.'),
    ('google', 'gemini-3-flash-preview',              0.00050000, 0.00300000, 50.00, true, 'https://ai.google.dev/gemini-api/docs/pricing', '2026-07-15T00:00:00Z', NULL, 0.00005000, NULL, NULL, NULL, NULL, 'Paid-tier Standard text pricing; preview model; excludes grounding and other tool fees.'),
    ('google', 'gemini-2.5-pro',                      0.00125000, 0.01000000, 50.00, true, 'https://ai.google.dev/gemini-api/docs/pricing', '2026-07-15T00:00:00Z', NULL, 0.00012500, 200000, 0.00250000, 0.01500000, 0.00025000, 'Paid-tier Standard text pricing; excludes grounding and other tool fees.'),
    ('google', 'gemini-2.5-flash',                    0.00030000, 0.00250000, 50.00, true, 'https://ai.google.dev/gemini-api/docs/pricing', '2026-07-15T00:00:00Z', NULL, 0.00003000, NULL, NULL, NULL, NULL, 'Paid-tier Standard text pricing; excludes audio input, grounding, and other tool fees.'),
    ('google', 'gemini-2.5-flash-lite',               0.00010000, 0.00040000, 50.00, true, 'https://ai.google.dev/gemini-api/docs/pricing', '2026-07-15T00:00:00Z', NULL, 0.00001000, NULL, NULL, NULL, NULL, 'Paid-tier Standard text pricing; excludes audio input, grounding, and other tool fees.'),
    ('google', 'gemini-embedding-001',                 0.00015000, 0.00000000, 50.00, true, 'https://ai.google.dev/gemini-api/docs/pricing', '2026-07-15T00:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, 'Paid-tier Standard text embedding price.'),

    -- Groq production models with fixed token prices. Compound systems are
    -- intentionally absent because their underlying model and tool fees vary.
    ('groq', 'llama-3.1-8b-instant',    0.00005000, 0.00008000, 50.00, true, 'https://console.groq.com/docs/models', '2026-07-15T00:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, 'Production model price; excludes optional built-in tool charges.'),
    ('groq', 'llama-3.3-70b-versatile', 0.00059000, 0.00079000, 50.00, true, 'https://console.groq.com/docs/models', '2026-07-15T00:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, 'Production model price; excludes optional built-in tool charges.'),
    ('groq', 'openai/gpt-oss-120b',     0.00015000, 0.00060000, 50.00, true, 'https://console.groq.com/docs/models', '2026-07-15T00:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, 'Production model price; excludes optional built-in tool charges.'),
    ('groq', 'openai/gpt-oss-20b',      0.00007500, 0.00030000, 50.00, true, 'https://console.groq.com/docs/models', '2026-07-15T00:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, 'Production model price; excludes optional built-in tool charges.'),

    -- Cerebras public model endpoint prices are quoted per individual token.
    ('cerebras', 'gpt-oss-120b', 0.00035000, 0.00075000, 50.00, true, 'https://api.cerebras.ai/public/v1/models/gpt-oss-120b', '2026-07-15T00:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, 'Production public model price.'),
    ('cerebras', 'zai-glm-4.7',  0.00225000, 0.00275000, 50.00, true, 'https://api.cerebras.ai/public/v1/models/zai-glm-4.7', '2026-07-15T00:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, 'Preview public model price.'),
    ('cerebras', 'gemma-4-31b',  0.00099000, 0.00149000, 50.00, true, 'https://api.cerebras.ai/public/v1/models/gemma-4-31b', '2026-07-15T00:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, 'Production public model price.'),

    -- Z.AI first-party standard text price.
    ('zai', 'glm-5.2', 0.00140000, 0.00440000, 50.00, true, 'https://docs.z.ai/guides/overview/pricing', '2026-07-15T00:00:00Z', NULL, 0.00026000, NULL, NULL, NULL, NULL, 'Standard text price; excludes built-in web search fees.')
ON CONFLICT (provider, model_name) DO UPDATE SET
    input_price_per_1k_tokens = EXCLUDED.input_price_per_1k_tokens,
    output_price_per_1k_tokens = EXCLUDED.output_price_per_1k_tokens,
    cencori_markup_percentage = EXCLUDED.cencori_markup_percentage,
    is_active = EXCLUDED.is_active,
    pricing_source_url = EXCLUDED.pricing_source_url,
    pricing_reviewed_at = EXCLUDED.pricing_reviewed_at,
    pricing_expires_at = EXCLUDED.pricing_expires_at,
    cached_input_price_per_1k_tokens = EXCLUDED.cached_input_price_per_1k_tokens,
    long_context_threshold_tokens = EXCLUDED.long_context_threshold_tokens,
    long_context_input_price_per_1k_tokens = EXCLUDED.long_context_input_price_per_1k_tokens,
    long_context_output_price_per_1k_tokens = EXCLUDED.long_context_output_price_per_1k_tokens,
    long_context_cached_input_price_per_1k_tokens = EXCLUDED.long_context_cached_input_price_per_1k_tokens,
    review_notes = EXCLUDED.review_notes,
    effective_date = now(),
    updated_at = now();

-- Preserve the exact non-token units added by the earlier audio migration.
UPDATE public.model_pricing
SET
    price_per_1k_chars = CASE model_name
        WHEN 'tts-1' THEN 0.015000
        WHEN 'tts-1-hd' THEN 0.030000
        ELSE price_per_1k_chars
    END,
    price_per_minute = CASE model_name
        WHEN 'whisper-1' THEN 0.006000
        ELSE price_per_minute
    END,
    updated_at = now()
WHERE provider = 'openai'
  AND model_name IN ('tts-1', 'tts-1-hd', 'whisper-1');

COMMENT ON COLUMN public.model_pricing.is_active IS
    'True only for rows whose exact provider/model price has been reviewed.';
COMMENT ON COLUMN public.model_pricing.pricing_expires_at IS
    'After this instant the row must fail closed until reviewed or replaced.';
COMMENT ON COLUMN public.model_pricing.long_context_threshold_tokens IS
    'Prompt-token threshold above which long-context input/output rates apply to the full request.';
