-- Activate paid pricing for Maximo Atlas Preview.
--
-- Atlas shipped as a free Cencori preview that expired on 2026-07-22. The
-- expiry was enforced in code (lib/providers/pricing.ts) but no pricing row
-- was ever deployed, so every Atlas call has failed closed with
-- PricingUnavailableError -> 503 pricing_unavailable since that date, while
-- the model catalog still advertised it as free.
--
-- Maximo lists Atlas at $0.20 input / $1.00 output per 1,000,000 tokens.
-- Prices are stored per 1,000 tokens, so each value is divided by 1,000.

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
    ('maximo', 'maximo-atlas-preview', 0.00020000, 0.00100000, 50.00, true, 'https://maximoai.co/platform', '2026-08-03T00:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, 'Post-preview list price ($0.20/$1.00 per MTok) under the Cencori partner agreement. Free preview ended 2026-07-22. No cached-input or long-context tier is published for Atlas.')
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
