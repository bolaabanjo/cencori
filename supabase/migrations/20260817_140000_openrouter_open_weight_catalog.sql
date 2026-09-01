-- OpenRouter pricing for the open-weight tier (DeepSeek, Kimi, Qwen) plus
-- repairs to two OpenRouter ids that never existed.
--
-- Context: /v1/models hides nothing anymore, but an unpriced model is still
-- reported `available: false` and still 503s `pricing_unavailable` at inference,
-- because getPricingFromDB fails closed rather than billing a guess. These rows
-- are what actually make the models callable.
--
-- Why OpenRouter rather than direct keys: DeepSeek, Moonshot and Qwen all have
-- catalog entries under their own provider ids, but none of those providers has
-- a funded managed key (no DEEPSEEK_API_KEY / MOONSHOT_API_KEY / working
-- QWEN_API_KEY), so getManagedProviderNames() never yields them and the models
-- are unreachable regardless of pricing. OPENROUTER_API_KEY is funded and
-- verified working, so routing the open-weight tier through it makes these
-- models usable today without provisioning three new vendor accounts. Funding
-- direct keys later is strictly cheaper — see the margin note below — but this
-- unblocks the team now.
--
-- All rates read live from https://openrouter.ai/api/v1/models on 2026-08-17.
-- That endpoint publishes per-token prices; every figure below is the published
-- value multiplied by 1000 for this table's per-1k-token unit.
--
-- MARGIN WARNING: OpenRouter's published price already includes OpenRouter's own
-- cut, and the 50% cencori_markup_percentage stacks on top of it. A model reached
-- via OpenRouter therefore costs the end user meaningfully more than the same
-- model reached through a funded direct key. That is the deliberate trade for one
-- balance and one key across the long tail, not an oversight.

INSERT INTO public.model_pricing (
    provider, model_name,
    input_price_per_1k_tokens, output_price_per_1k_tokens,
    cached_input_price_per_1k_tokens,
    long_context_threshold_tokens,
    long_context_input_price_per_1k_tokens,
    long_context_output_price_per_1k_tokens,
    long_context_cached_input_price_per_1k_tokens,
    cencori_markup_percentage, is_active,
    pricing_source_url, pricing_reviewed_at, review_notes
) VALUES
    -- ── DeepSeek (open weight) ────────────────────────────────────────────
    -- V4 Pro carries time-of-day pricing on OpenRouter: the off-peak window is
    -- half the peak rate. This table has no concept of a time-varying rate, so
    -- the PEAK rate is recorded. That over-bills off-peak traffic relative to
    -- true cost, which is the safe direction to be wrong — the alternative
    -- under-bills and Cencori absorbs the difference.
    ('openrouter','deepseek/deepseek-v4-pro',    0.00132000, 0.00396000, 0.00004400,
     NULL, NULL, NULL, NULL, 50.00, true,
     'https://openrouter.ai/api/v1/models','2026-08-17T00:00:00Z',
     'DeepSeek V4 Pro via OpenRouter: $1.32/$3.96 per 1M peak, cache read $0.044 per 1M. Off-peak is 50% of these rates; peak recorded because the schema has no time-of-day tier.'),
    ('openrouter','deepseek/deepseek-v4-flash',  0.00008260, 0.00016520, 0.00001652,
     NULL, NULL, NULL, NULL, 50.00, true,
     'https://openrouter.ai/api/v1/models','2026-08-17T00:00:00Z',
     'DeepSeek V4 Flash via OpenRouter: $0.0826/$0.1652 per 1M, cache read $0.01652 per 1M.'),

    -- ── Moonshot / Kimi (open weight) ─────────────────────────────────────
    ('openrouter','moonshotai/kimi-k3',          0.00300000, 0.01500000, 0.00030000,
     NULL, NULL, NULL, NULL, 50.00, true,
     'https://openrouter.ai/api/v1/models','2026-08-17T00:00:00Z',
     'Kimi K3 via OpenRouter: $3.00/$15.00 per 1M, cache read $0.30 per 1M. Moonshot flagship tier.'),
    ('openrouter','moonshotai/kimi-k2.7-code',   0.00071000, 0.00350000, 0.00015000,
     NULL, NULL, NULL, NULL, 50.00, true,
     'https://openrouter.ai/api/v1/models','2026-08-17T00:00:00Z',
     'Kimi K2.7 Code via OpenRouter: $0.71/$3.50 per 1M, cache read $0.15 per 1M.'),
    ('openrouter','moonshotai/kimi-k2.6',        0.00095000, 0.00400000, 0.00016000,
     NULL, NULL, NULL, NULL, 50.00, true,
     'https://openrouter.ai/api/v1/models','2026-08-17T00:00:00Z',
     'Kimi K2.6 via OpenRouter: $0.95/$4.00 per 1M, cache read $0.16 per 1M.'),

    -- ── Qwen (open weight) ────────────────────────────────────────────────
    ('openrouter','qwen/qwen3.8-max',            0.00200000, 0.00600000, 0.00025000,
     NULL, NULL, NULL, NULL, 50.00, true,
     'https://openrouter.ai/api/v1/models','2026-08-17T00:00:00Z',
     'Qwen 3.8 Max via OpenRouter: $2.00/$6.00 per 1M, cache read $0.25 per 1M.'),
    -- Qwen 3 Coder Plus has TWO long-context step-ups on OpenRouter (at 32k and
    -- again at 128k prompt tokens); this table holds one threshold, so the 32k
    -- step is recorded and prompts above 128k under-bill against true cost.
    ('openrouter','qwen/qwen3-coder-plus',       0.00065000, 0.00325000, 0.00013000,
     32000, 0.00117000, 0.00585000, 0.00023400,
     50.00, true,
     'https://openrouter.ai/api/v1/models','2026-08-17T00:00:00Z',
     'Qwen 3 Coder Plus via OpenRouter: $0.65/$3.25 per 1M base, $1.17/$5.85 above 32k. A third tier at 128k ($1.95/$9.75) is not representable here and under-bills.'),

    -- ── Replacements for the two ids OpenRouter does not serve ────────────
    -- `google/gemini-3-pro` and `x-ai/grok-4` are absent from OpenRouter's live
    -- catalog and 404 at inference. lib/providers/config.ts now points at these
    -- ids instead.
    ('openrouter','google/gemini-3.1-pro-preview', 0.00200000, 0.01200000, 0.00020000,
     200000, 0.00400000, 0.01800000, 0.00040000,
     50.00, true,
     'https://openrouter.ai/api/v1/models','2026-08-17T00:00:00Z',
     'Gemini 3.1 Pro Preview via OpenRouter: $2.00/$12.00 per 1M, $4.00/$18.00 above 200k prompt tokens. Replaces the nonexistent google/gemini-3-pro.'),
    ('openrouter','x-ai/grok-4.6',               0.00200000, 0.00600000, 0.00050000,
     200000, 0.00400000, 0.01200000, 0.00100000,
     50.00, true,
     'https://openrouter.ai/api/v1/models','2026-08-17T00:00:00Z',
     'Grok 4.6 via OpenRouter: $2.00/$6.00 per 1M, $4.00/$12.00 above 200k prompt tokens. Replaces the nonexistent x-ai/grok-4.')
ON CONFLICT (provider, model_name) DO UPDATE SET
    input_price_per_1k_tokens = EXCLUDED.input_price_per_1k_tokens,
    output_price_per_1k_tokens = EXCLUDED.output_price_per_1k_tokens,
    cached_input_price_per_1k_tokens = EXCLUDED.cached_input_price_per_1k_tokens,
    long_context_threshold_tokens = EXCLUDED.long_context_threshold_tokens,
    long_context_input_price_per_1k_tokens = EXCLUDED.long_context_input_price_per_1k_tokens,
    long_context_output_price_per_1k_tokens = EXCLUDED.long_context_output_price_per_1k_tokens,
    long_context_cached_input_price_per_1k_tokens = EXCLUDED.long_context_cached_input_price_per_1k_tokens,
    cencori_markup_percentage = EXCLUDED.cencori_markup_percentage,
    is_active = EXCLUDED.is_active,
    pricing_source_url = EXCLUDED.pricing_source_url,
    pricing_reviewed_at = EXCLUDED.pricing_reviewed_at,
    review_notes = EXCLUDED.review_notes,
    updated_at = now();

-- x-ai/grok-4.3 was priced in 20260817_120000 without its long-context tier.
-- OpenRouter doubles the rate above a 200k-token prompt; without these columns
-- a long-context Grok call bills at half its real cost.
UPDATE public.model_pricing
SET long_context_threshold_tokens = 200000,
    long_context_input_price_per_1k_tokens = 0.00250000,
    long_context_output_price_per_1k_tokens = 0.00500000,
    long_context_cached_input_price_per_1k_tokens = 0.00040000,
    review_notes = 'Grok 4.3 via OpenRouter: $1.25/$2.50 per 1M, $2.50/$5.00 above 200k prompt tokens, cache read $0.20/$0.40 per 1M. OpenRouter margin already included before Cencori markup.',
    updated_at = now()
WHERE provider = 'openrouter' AND model_name = 'x-ai/grok-4.3';

-- Retire the two ids OpenRouter never served, so they stop being advertised.
UPDATE public.model_pricing
SET is_active = false,
    review_notes = coalesce(review_notes || ' ', '') || 'Retired 2026-08-17: id absent from OpenRouter''s live catalog.',
    updated_at = now()
WHERE provider = 'openrouter'
  AND model_name IN ('google/gemini-3-pro', 'x-ai/grok-4');
