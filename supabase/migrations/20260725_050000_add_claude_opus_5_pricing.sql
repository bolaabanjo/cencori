-- ============================================================================
-- Register claude-opus-5 pricing (released 2026-07-24)
-- ============================================================================
-- PROVISIONAL PRICING: mirrored from claude-opus-4-8 ($5 / $25 per MTok,
-- cached input $0.50 per MTok) as a placeholder. Replace input/output/cached
-- values with Anthropic's published Opus 5 first-party rates once confirmed.
-- Without a row here the gateway pricing lookup fails and any request routed to
-- claude-opus-5 is rejected (see lib/providers/pricing.ts).
-- ============================================================================

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
    ('anthropic', 'claude-opus-5', 0.00500000, 0.02500000, 50.00, true, 'https://platform.claude.com/docs/en/about-claude/pricing', '2026-07-25T00:00:00Z', NULL, 0.00050000, NULL, NULL, NULL, NULL, 'PROVISIONAL: mirrored from claude-opus-4-8 pending confirmed Opus 5 first-party pricing.')
ON CONFLICT (provider, model_name) DO UPDATE SET
    input_price_per_1k_tokens        = EXCLUDED.input_price_per_1k_tokens,
    output_price_per_1k_tokens       = EXCLUDED.output_price_per_1k_tokens,
    cencori_markup_percentage        = EXCLUDED.cencori_markup_percentage,
    is_active                        = EXCLUDED.is_active,
    pricing_source_url               = EXCLUDED.pricing_source_url,
    pricing_reviewed_at              = EXCLUDED.pricing_reviewed_at,
    cached_input_price_per_1k_tokens = EXCLUDED.cached_input_price_per_1k_tokens,
    review_notes                     = EXCLUDED.review_notes;
