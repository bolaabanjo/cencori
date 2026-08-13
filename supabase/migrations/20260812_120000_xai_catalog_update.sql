-- xAI catalog update: Grok 4.6 (announced 2026-08-12) + Grok 4.5, and a
-- cache-read correction for Grok 4.3.
--
-- Companion to the lib/providers/config.ts entries in the same commit. Without
-- an active model_pricing row, getPricingFromDB fails closed and every request
-- for the model returns 503 `pricing_unavailable`.
--
-- Rates from https://docs.x.ai/docs/models. The whole Grok line is tiered by
-- request context length, which maps onto the long_context_* columns. xAI
-- applies the higher tier to ALL tokens in the request once the threshold is
-- crossed.
--
-- 4.6 and 4.5 carry identical headline pricing ($2.00/$6.00 per 1M under 200k,
-- $4.00/$12.00 at or above); the only thing that moved between them is the
-- cache read rate, $0.30 -> $0.50 per 1M.
--
-- Grok 4.3 was priced in 20260805_160000_catalog_reconciliation.sql with a NULL
-- cached_input_price_per_1k_tokens; the published rate is $0.20/1M. Filled in
-- below for consistency with the rest of the table. The input/output rates are
-- re-asserted unchanged so the ON CONFLICT update is a no-op for them.
--
-- NOTE: when this migration was written the column was bookkeeping only --
-- calculateProviderTokenCost took no cached-token argument and never read
-- cachedInputPer1KTokens. That was fixed in the same branch, so this rate is
-- now live: xAI reports cache hits inside prompt_tokens (OpenAI-compatible
-- wire format) and the adapter splits them out before costing.

INSERT INTO public.model_pricing (
    provider, model_name,
    input_price_per_1k_tokens, output_price_per_1k_tokens,
    cached_input_price_per_1k_tokens,
    long_context_threshold_tokens,
    long_context_input_price_per_1k_tokens, long_context_output_price_per_1k_tokens,
    cencori_markup_percentage, is_active,
    pricing_source_url, pricing_reviewed_at, review_notes
) VALUES
    ('xai','grok-4.6', 0.00200000, 0.00600000, 0.00050000, 200000, 0.00400000, 0.01200000, 50.00, true,
     'https://docs.x.ai/docs/models','2026-08-12T00:00:00Z',
     '$2.00/$6.00 per 1M under 200k context; $4.00/$12.00 at or above. Cached input $0.50 per 1M. 500k context window.'),
    ('xai','grok-4.5', 0.00200000, 0.00600000, 0.00030000, 200000, 0.00400000, 0.01200000, 50.00, true,
     'https://docs.x.ai/docs/models','2026-08-12T00:00:00Z',
     '$2.00/$6.00 per 1M under 200k context; $4.00/$12.00 at or above. Cached input $0.30 per 1M. 500k context window. Superseded by grok-4.6 at the same price.'),
    ('xai','grok-4.3', 0.00125000, 0.00250000, 0.00020000, 200000, 0.00250000, 0.00500000, 50.00, true,
     'https://docs.x.ai/docs/models','2026-08-12T00:00:00Z',
     '$1.25/$2.50 per 1M under 200k context; $2.50/$5.00 at or above. Cached input $0.20 per 1M (was NULL, i.e. billed at the full input rate).')
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
