-- Add Claude Opus 5 pricing.
--
-- Anthropic announced Claude Opus 5 on 2026-07-24 as the new Opus-tier
-- flagship, succeeding Claude Opus 4.8 as the recommended default for
-- complex agentic coding and enterprise work. Pricing is identical to
-- Opus 4.8/4.7/4.6 ($5/$25 per MTok). Opus 4.8 remains active and is
-- untouched by this migration.
--
-- Prices are stored per 1,000 tokens; Anthropic quotes per 1,000,000 tokens.

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
    ('anthropic', 'claude-opus-5', 0.00500000, 0.02500000, 50.00, true, 'https://platform.claude.com/docs/en/about-claude/pricing', '2026-07-24T00:00:00Z', NULL, 0.00050000, NULL, NULL, NULL, NULL, 'First-party base input/output price; excludes cache writes. Succeeds Opus 4.8 as Anthropic''s Opus-tier flagship (announced 2026-07-24); same price as Opus 4.8/4.7/4.6.')
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
