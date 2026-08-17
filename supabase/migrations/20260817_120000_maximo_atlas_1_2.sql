-- Price Maximo Atlas 1.2, including the scheduled end of its launch discount.
--
-- Companion to the lib/providers/config.ts entry in the same commit. Without an
-- active model_pricing row, getPricingFromDB fails closed and every request for
-- the model returns 503 `pricing_unavailable`.
--
-- Rates confirmed against GET https://api.maximoai.co/v1/models, which reports
-- the live launch rates for maximo-atlas-1.2 (per token: prompt 0.00000011,
-- completion 0.0000003, input_cache_reads 0.00000001). Prices are stored per
-- 1,000 tokens, so each published per-1M figure is divided by 1,000.
--
--   launch offer (through 2026-08-31): $0.11 in / $0.01 cached / $0.30 out per 1M
--   standard rate (from 2026-09-01):   $0.55 in / $0.05 cached / $1.50 out per 1M
--
-- The launch rate is stored as the current price with `pricing_expires_at` set
-- to the changeover, and the standard rate stored in the `next_*` columns.
-- resolveScheduledPricing (lib/providers/pricing.ts) switches to the successor
-- at that instant and expires the pricing cache exactly then, so nothing has to
-- be redeployed on 2026-09-01. Storing the promo *without* a successor would
-- fail closed on that date instead, which is the behaviour this avoids.
--
-- The changeover is pinned to 00:00 UTC because Maximo published a date, not a
-- time. If their promo actually runs into 2026-09-01 in a western timezone we
-- start charging the standard rate a few hours early — the error direction that
-- can only ever over-recover cost, never bill below what we pay.
--
-- Atlas 1.2 is the first Atlas with prompt caching (1.1 published no cache
-- rate). Cache reads are billed at the cached rate by calculateProviderTokenCost
-- as of the 2026-08-12 provider-cache billing fix. Maximo prices cache *writes*
-- at the normal input rate, i.e. a 1.0x multiplier, which is the default when a
-- provider has no entry in CACHE_WRITE_MULTIPLIERS — so none is added.
--
-- 1.1 is left active and unchanged: it is a different model at a different
-- price, not a slug this one replaces.

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
    next_input_price_per_1k_tokens,
    next_output_price_per_1k_tokens,
    next_cached_input_price_per_1k_tokens,
    review_notes
) VALUES
    ('maximo', 'maximo-atlas-1.2',
     0.00011000, 0.00030000, 50.00, true,
     'https://maximoai.co/platform', '2026-08-17T00:00:00Z', '2026-09-01T00:00:00Z',
     0.00001000,
     NULL, NULL, NULL, NULL,
     0.00055000, 0.00150000, 0.00005000,
     'Launch pricing (80% off) verified against the Maximo models API on 2026-08-17; standard rate stored in next_* and applied automatically from 2026-09-01. Maximo publishes no long-context tier for Atlas.')
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
    next_input_price_per_1k_tokens = EXCLUDED.next_input_price_per_1k_tokens,
    next_output_price_per_1k_tokens = EXCLUDED.next_output_price_per_1k_tokens,
    next_cached_input_price_per_1k_tokens = EXCLUDED.next_cached_input_price_per_1k_tokens,
    review_notes = EXCLUDED.review_notes,
    effective_date = now(),
    updated_at = now();
