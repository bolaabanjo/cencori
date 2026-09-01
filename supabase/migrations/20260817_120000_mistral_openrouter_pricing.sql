-- Managed-provider pricing for Mistral and OpenRouter.
--
-- Both providers are already wired for managed keys in
-- lib/gateway/providers-setup.ts (MISTRAL_API_KEY, OPENROUTER_API_KEY) and both
-- route through OpenAICompatibleProvider, so funding the key is the only
-- integration step. What was missing is pricing: getPricingFromDB fails closed,
-- so every model below returned 503 `pricing_unavailable` regardless of whether
-- a key was configured. These rows are the other half of that unlock.
--
-- Mistral rates from https://docs.mistral.ai/inference/pricing (cross-checked
-- against https://mistral.ai/pricing/api/ — the two agree), observed 2026-08-17.
--
-- The Mistral catalog entries are `-latest` aliases, so pricing follows whatever
-- the alias currently resolves to rather than the display name in config.ts.
-- Two display names there are stale as of this migration: `mistral-medium-latest`
-- is labelled "Mistral Medium 3.1" but the alias now serves Medium 3.5, and
-- `mistral-small-latest` is labelled "Mistral Small 3" but serves Small 4. The
-- rates below are for what the alias actually serves. Worth correcting the
-- labels in config.ts separately; it does not affect billing.
--
-- OpenRouter rates read live from https://openrouter.ai/api/v1/models on
-- 2026-08-17 (per-token values there, multiplied by 1000 for this table).
-- OpenRouter's published price already includes their own margin, so the 50%
-- cencori_markup_percentage below stacks on top of it — a model reached via
-- OpenRouter costs the end user more than the same model reached direct. That
-- is the intended trade for one balance and one key across the long tail, but
-- it is a deliberate choice, not an oversight.
--
-- NOT PRICED HERE, deliberately:
--   groq/compound, groq/compound-mini — Groq publishes no flat token rate for
--     these; they are agentic systems billed via the underlying models they
--     invoke, so any figure entered here would be invented.
--   allam-2-7b — no longer present in Groq's model documentation at all.
--   mistral devstral-latest, magistral-medium — absent from both Mistral
--     pricing pages. A `devstral-medium-2507` rate ($0.4/$2.00 per 1M) appears
--     in Mistral's news posts, but that is a different, older model id than the
--     `devstral-latest` alias in the catalog, so it is not safe to apply.
-- Those five stay unpriced and will keep returning `pricing_unavailable`. They
-- should be deactivated in lib/providers/config.ts rather than advertised.

INSERT INTO public.model_pricing (
    provider, model_name,
    input_price_per_1k_tokens, output_price_per_1k_tokens,
    cached_input_price_per_1k_tokens,
    cencori_markup_percentage, is_active,
    pricing_source_url, pricing_reviewed_at, review_notes
) VALUES
    -- ── Mistral ───────────────────────────────────────────────────────────
    -- Mistral publishes no separate cache-read rate, so cached_input stays NULL
    -- and cached tokens bill at the full input rate.
    ('mistral','mistral-large-latest',  0.00050000, 0.00150000, NULL, 50.00, true,
     'https://docs.mistral.ai/inference/pricing','2026-08-17T00:00:00Z',
     'Mistral Large 3: $0.50/$1.50 per 1M. Alias -latest.'),
    ('mistral','mistral-medium-latest', 0.00150000, 0.00750000, NULL, 50.00, true,
     'https://docs.mistral.ai/inference/pricing','2026-08-17T00:00:00Z',
     'Mistral Medium 3.5: $1.50/$7.50 per 1M. Alias -latest; config.ts still labels this 3.1.'),
    ('mistral','mistral-small-latest',  0.00015000, 0.00060000, NULL, 50.00, true,
     'https://docs.mistral.ai/inference/pricing','2026-08-17T00:00:00Z',
     'Mistral Small 4: $0.15/$0.60 per 1M. Alias -latest; config.ts still labels this Small 3.'),
    ('mistral','ministral-3b',          0.00010000, 0.00010000, NULL, 50.00, true,
     'https://docs.mistral.ai/inference/pricing','2026-08-17T00:00:00Z',
     'Ministral 3 3B: $0.10/$0.10 per 1M. Symmetric input/output rate.'),
    ('mistral','ministral-8b',          0.00015000, 0.00015000, NULL, 50.00, true,
     'https://docs.mistral.ai/inference/pricing','2026-08-17T00:00:00Z',
     'Ministral 3 8B: $0.15/$0.15 per 1M. Symmetric input/output rate.'),
    ('mistral','codestral-latest',      0.00030000, 0.00090000, NULL, 50.00, true,
     'https://docs.mistral.ai/inference/pricing','2026-08-17T00:00:00Z',
     'Codestral: $0.30/$0.90 per 1M. Alias -latest.'),

    -- ── OpenRouter ────────────────────────────────────────────────────────
    -- OpenRouter reports cache hits inside prompt_tokens in the OpenAI-compatible
    -- wire format, which OpenAICompatibleProvider already splits out via
    -- splitOpenAICachedTokens -- so these cache rates are live, not bookkeeping.
    -- Without them a cached token bills at up to 10x its real cost.
    ('openrouter','openai/gpt-5',              0.00125000, 0.01000000, 0.00012500, 50.00, true,
     'https://openrouter.ai/api/v1/models','2026-08-17T00:00:00Z',
     'GPT-5 via OpenRouter: $1.25/$10.00 per 1M, cache read $0.125 per 1M. OpenRouter margin already included before Cencori markup.'),
    ('openrouter','anthropic/claude-opus-4.5', 0.00500000, 0.02500000, 0.00050000, 50.00, true,
     'https://openrouter.ai/api/v1/models','2026-08-17T00:00:00Z',
     'Claude Opus 4.5 via OpenRouter: $5.00/$25.00 per 1M, cache read $0.50 per 1M. OpenRouter margin already included before Cencori markup.'),
    ('openrouter','x-ai/grok-4.3',             0.00125000, 0.00250000, 0.00020000, 50.00, true,
     'https://openrouter.ai/api/v1/models','2026-08-17T00:00:00Z',
     'Grok 4.3 via OpenRouter: $1.25/$2.50 per 1M, cache read $0.20 per 1M. OpenRouter margin already included before Cencori markup.')
ON CONFLICT (provider, model_name) DO UPDATE SET
    input_price_per_1k_tokens = EXCLUDED.input_price_per_1k_tokens,
    output_price_per_1k_tokens = EXCLUDED.output_price_per_1k_tokens,
    cached_input_price_per_1k_tokens = EXCLUDED.cached_input_price_per_1k_tokens,
    cencori_markup_percentage = EXCLUDED.cencori_markup_percentage,
    is_active = EXCLUDED.is_active,
    pricing_source_url = EXCLUDED.pricing_source_url,
    pricing_reviewed_at = EXCLUDED.pricing_reviewed_at,
    review_notes = EXCLUDED.review_notes,
    updated_at = now();
