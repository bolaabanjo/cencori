-- Retire the Atlas preview slug and carry its reviewed commercial pricing
-- forward to the production Maximo Atlas 1.1 model.
WITH retired_preview AS (
    UPDATE public.model_pricing
    SET
        is_active = false,
        review_notes = 'Retired in favor of maximo-atlas-1.1.',
        updated_at = now()
    WHERE provider = 'maximo'
      AND model_name = 'maximo-atlas-preview'
    RETURNING
        provider,
        input_price_per_1k_tokens,
        output_price_per_1k_tokens,
        cencori_markup_percentage,
        pricing_source_url,
        pricing_expires_at,
        cached_input_price_per_1k_tokens,
        long_context_threshold_tokens,
        long_context_input_price_per_1k_tokens,
        long_context_output_price_per_1k_tokens,
        long_context_cached_input_price_per_1k_tokens,
        next_input_price_per_1k_tokens,
        next_output_price_per_1k_tokens,
        next_cached_input_price_per_1k_tokens
)
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
)
SELECT
    provider,
    'maximo-atlas-1.1',
    input_price_per_1k_tokens,
    output_price_per_1k_tokens,
    cencori_markup_percentage,
    true,
    pricing_source_url,
    now(),
    pricing_expires_at,
    cached_input_price_per_1k_tokens,
    long_context_threshold_tokens,
    long_context_input_price_per_1k_tokens,
    long_context_output_price_per_1k_tokens,
    long_context_cached_input_price_per_1k_tokens,
    next_input_price_per_1k_tokens,
    next_output_price_per_1k_tokens,
    next_cached_input_price_per_1k_tokens,
    'Maximo Atlas 1.1 production model. Pricing carried forward from the reviewed Atlas partner rate.'
FROM retired_preview
ON CONFLICT (provider, model_name) DO UPDATE SET
    input_price_per_1k_tokens = EXCLUDED.input_price_per_1k_tokens,
    output_price_per_1k_tokens = EXCLUDED.output_price_per_1k_tokens,
    cencori_markup_percentage = EXCLUDED.cencori_markup_percentage,
    is_active = true,
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
