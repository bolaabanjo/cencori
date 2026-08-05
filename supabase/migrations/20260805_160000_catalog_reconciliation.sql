-- Model catalog reconciliation, non-Anthropic providers
--
-- Companion to the lib/providers/config.ts changes in the same commit. The
-- catalog advertised 150 models; only ~36 had active pricing, so the rest
-- returned 503 `pricing_unavailable`. Three separate causes, handled
-- differently:
--
-- 1. NO ADAPTER (removed from the catalog, nothing to price). 16 providers
--    were listed that resolveGatewayProvider can never construct: they are
--    neither native (google/openai/anthropic/cohere) nor in
--    OPENAI_COMPATIBLE_ENDPOINTS, so initializeBYOKProviders cannot serve
--    them even with a customer key. ai21, bedrock, nova, azure, cloudflare,
--    deepinfra, fireworks, nvidia, sambanova, upstage, minimax, moonshot,
--    stepfun, baseten, alibaba, baidu — 33 models of pure false advertising.
--
-- 2. RETIRED UPSTREAM (removed from the catalog). Verified against each
--    provider's own model listing where a key was available, and against
--    published docs otherwise: openai gpt-4-turbo, o3-pro, dall-e-3, dall-e-2;
--    google gemini-3-pro, gemini-3-deep-think, imagen-3; xai grok-4/4.1/
--    4.1-fast/4-heavy/3/3-mini/code-fast-1/voice-think-fast (only grok-4.3
--    survives); deepseek v3.2/v3.2-speciale/v3.1/chat/reasoner/coder-v2 (only
--    v4-flash and v4-pro survive); perplexity llama-3.1-sonar-large-128k-online;
--    cohere command-a-03-2025, command-r.
--
-- 3. REAL BUT UNPRICED (priced below, from each vendor's published rate card).

INSERT INTO public.model_pricing (
    provider, model_name,
    input_price_per_1k_tokens, output_price_per_1k_tokens,
    cached_input_price_per_1k_tokens,
    long_context_threshold_tokens,
    long_context_input_price_per_1k_tokens, long_context_output_price_per_1k_tokens,
    cencori_markup_percentage, is_active,
    pricing_source_url, pricing_reviewed_at, review_notes
) VALUES
    -- OpenAI (developers.openai.com/api/docs/pricing). Managed provider.
    ('openai','gpt-5.4-pro',        0.03000000, 0.18000000, NULL,        NULL, NULL, NULL, 50.00, true,
     'https://developers.openai.com/api/docs/pricing','2026-08-05T00:00:00Z','OpenAI list price $30/$180 per 1M tokens.'),
    ('openai','gpt-5.3-chat-latest',0.00175000, 0.01400000, 0.00017500,  NULL, NULL, NULL, 50.00, true,
     'https://developers.openai.com/api/docs/pricing','2026-08-05T00:00:00Z','OpenAI list price $1.75/$14 per 1M tokens.'),
    ('openai','gpt-5.2-pro',        0.02100000, 0.16800000, NULL,        NULL, NULL, NULL, 50.00, true,
     'https://developers.openai.com/api/docs/pricing','2026-08-05T00:00:00Z','OpenAI list price $21/$168 per 1M tokens.'),
    ('openai','gpt-5.1',            0.00125000, 0.01000000, 0.00012500,  NULL, NULL, NULL, 50.00, true,
     'https://developers.openai.com/api/docs/pricing','2026-08-05T00:00:00Z','OpenAI list price $1.25/$10 per 1M tokens.'),
    ('openai','gpt-5-pro',          0.01500000, 0.12000000, NULL,        NULL, NULL, NULL, 50.00, true,
     'https://developers.openai.com/api/docs/pricing','2026-08-05T00:00:00Z','OpenAI list price $15/$120 per 1M tokens.'),
    ('openai','o3-mini',            0.00110000, 0.00440000, 0.00055000,  NULL, NULL, NULL, 50.00, true,
     'https://developers.openai.com/api/docs/pricing','2026-08-05T00:00:00Z','OpenAI list price $1.10/$4.40 per 1M tokens.'),
    ('openai','o1',                 0.01500000, 0.06000000, 0.00750000,  NULL, NULL, NULL, 50.00, true,
     'https://developers.openai.com/api/docs/pricing','2026-08-05T00:00:00Z','OpenAI list price $15/$60 per 1M tokens.'),

    -- xAI (docs.x.ai). Tiered by context length, which maps onto the
    -- long_context_* columns: $1.25/$2.50 under 200k, $2.50/$5.00 at or above.
    ('xai','grok-4.3',              0.00125000, 0.00250000, NULL,        200000, 0.00250000, 0.00500000, 50.00, true,
     'https://docs.x.ai/docs/models','2026-08-05T00:00:00Z','$1.25/$2.50 per 1M under 200k context; $2.50/$5.00 at or above.'),

    -- DeepSeek (api-docs.deepseek.com). Input shown is the cache-miss rate.
    ('deepseek','deepseek-v4-flash',0.00014000, 0.00028000, 0.00000280,  NULL, NULL, NULL, 50.00, true,
     'https://api-docs.deepseek.com/quick_start/pricing','2026-08-05T00:00:00Z','$0.14 in (cache miss) / $0.28 out per 1M; cache hit $0.0028.'),
    ('deepseek','deepseek-v4-pro',  0.00043500, 0.00087000, 0.00000363,  NULL, NULL, NULL, 50.00, true,
     'https://api-docs.deepseek.com/quick_start/pricing','2026-08-05T00:00:00Z','$0.435 in (cache miss) / $0.87 out per 1M; cache hit $0.003625.'),

    -- Perplexity (docs.perplexity.ai). ⚠️ Token rates only — Perplexity also
    -- charges $5-14 per 1,000 requests for search, and model_pricing has no
    -- per-request fee column, so those requests are under-billed.
    ('perplexity','sonar',              0.00100000, 0.00100000, NULL, NULL, NULL, NULL, 50.00, true,
     'https://docs.perplexity.ai/getting-started/pricing','2026-08-05T00:00:00Z','$1/$1 per 1M. Per-request search fee ($5-12 per 1k) NOT modelled.'),
    ('perplexity','sonar-pro',          0.00300000, 0.01500000, NULL, NULL, NULL, NULL, 50.00, true,
     'https://docs.perplexity.ai/getting-started/pricing','2026-08-05T00:00:00Z','$3/$15 per 1M. Per-request search fee ($6-14 per 1k) NOT modelled.'),
    ('perplexity','sonar-reasoning-pro', 0.00200000, 0.00800000, NULL, NULL, NULL, NULL, 50.00, true,
     'https://docs.perplexity.ai/getting-started/pricing','2026-08-05T00:00:00Z','$2/$8 per 1M. Per-request search fee ($6-14 per 1k) NOT modelled.'),

    -- Cohere (cohere.com/pricing).
    ('cohere','command-r-plus-08-2024', 0.00250000, 0.01000000, NULL, NULL, NULL, NULL, 50.00, true,
     'https://cohere.com/pricing','2026-08-05T00:00:00Z','$2.50/$10 per 1M.'),
    ('cohere','command-light',          0.00030000, 0.00060000, NULL, NULL, NULL, NULL, 50.00, true,
     'https://cohere.com/pricing','2026-08-05T00:00:00Z','$0.30/$0.60 per 1M.')
ON CONFLICT (provider, model_name) DO UPDATE SET
    input_price_per_1k_tokens = EXCLUDED.input_price_per_1k_tokens,
    output_price_per_1k_tokens = EXCLUDED.output_price_per_1k_tokens,
    cached_input_price_per_1k_tokens = EXCLUDED.cached_input_price_per_1k_tokens,
    long_context_threshold_tokens = EXCLUDED.long_context_threshold_tokens,
    long_context_input_price_per_1k_tokens = EXCLUDED.long_context_input_price_per_1k_tokens,
    long_context_output_price_per_1k_tokens = EXCLUDED.long_context_output_price_per_1k_tokens,
    cencori_markup_percentage = EXCLUDED.cencori_markup_percentage,
    is_active = EXCLUDED.is_active,
    pricing_source_url = EXCLUDED.pricing_source_url,
    pricing_reviewed_at = EXCLUDED.pricing_reviewed_at,
    review_notes = EXCLUDED.review_notes,
    updated_at = now();

-- STILL UNPRICED, deliberately left advertised for a follow-up decision:
--   groq/allam-2-7b            - model exists (verified via Groq's /v1/models)
--                                but no published rate was obtainable.
--   mistral (8), qwen (4), together (4), openrouter (5), meta (6)
--                              - all BYOK-only (no API key in any environment),
--                                catalogs demonstrably stale (openrouter still
--                                lists anthropic/claude-opus-4.5, an ID that
--                                404s), and no rate card could be retrieved.
--                                Model IDs are unverifiable without a key.
--   5 image models             - priced from gateway_image_pricing, a separate
--                                table keyed by (provider, model, size,
--                                quality). That table is EMPTY, so all image
--                                generation returns 503 today.
