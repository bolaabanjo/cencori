-- B.AI provider catalog: DeepSeek V4 Flash (+ vision exp) and GLM-5.3 Flash
--
-- These three models are served by B.AI but branded under their public-facing
-- provider names (deepseek, zai) in the catalog. The routing overrides in
-- router.ts steer requests to the `bai` provider, so pricing lives under the
-- `bai` namespace here.
--
-- The existing deepseek:deepseek-v4-flash row (from catalog_reconciliation) is
-- retired because that model is no longer served by DeepSeek directly.

-- Retire the old direct-DeepSeek pricing for deepseek-v4-flash.
UPDATE model_pricing
SET is_active = false,
    review_notes = 'Retired 2026-08-30: deepseek-v4-flash now routes through B.AI, priced under bai namespace.',
    updated_at = NOW()
WHERE provider = 'deepseek'
  AND model_name = 'deepseek-v4-flash';

-- B.AI pricing rows. Prices match the rates B.AI charges Cencori; the 50%
-- markup is the standard managed-gateway rate.
INSERT INTO public.model_pricing (
    provider,
    model_name,
    input_price_per_1k_tokens,
    output_price_per_1k_tokens,
    cached_input_price_per_1k_tokens,
    long_context_threshold_tokens,
    long_context_input_price_per_1k_tokens,
    long_context_output_price_per_1k_tokens,
    long_context_cached_input_price_per_1k_tokens,
    cencori_markup_percentage,
    is_active,
    pricing_source_url,
    pricing_reviewed_at,
    review_notes
) VALUES
    -- DeepSeek V4 Flash via B.AI — same rate as the original DeepSeek row
    ('bai', 'deepseek-v4-flash', 0.00014000, 0.00028000, 0.00000280, NULL, NULL, NULL, NULL, 50.00, true,
     'https://api-docs.deepseek.com/quick_start/pricing', '2026-08-30T00:00:00Z',
     'DeepSeek V4 Flash served through B.AI. Rate matches DeepSeek published pricing.'),

    -- DeepSeek V4 Flash Vision (exp) via B.AI — vision experimental variant
    ('bai', 'deepseek-v4-flash-vision-exp', 0.00014000, 0.00028000, 0.00000280, NULL, NULL, NULL, NULL, 50.00, true,
     'https://api-docs.deepseek.com/quick_start/pricing', '2026-08-30T00:00:00Z',
     'DeepSeek V4 Flash Vision (exp) served through B.AI. Experimental vision variant; rate matches base Flash.'),

    -- GLM-5.3 Flash via B.AI — faster/cheaper successor to GLM-5.2
    ('bai', 'glm-5.3-flash', 0.00100000, 0.00300000, 0.00020000, NULL, NULL, NULL, NULL, 50.00, true,
     'https://docs.z.ai/guides/overview/pricing', '2026-08-30T00:00:00Z',
     'GLM-5.3 Flash served through B.AI. Flash-tier pricing below GLM-5.2 flagship rate.')
ON CONFLICT (provider, model_name) DO UPDATE SET
    input_price_per_1k_tokens = EXCLUDED.input_price_per_1k_tokens,
    output_price_per_1k_tokens = EXCLUDED.output_price_per_1k_tokens,
    cached_input_price_per_1k_tokens = EXCLUDED.cached_input_price_per_1k_tokens,
    cencori_markup_percentage = EXCLUDED.cencori_markup_percentage,
    is_active = EXCLUDED.is_active,
    pricing_source_url = EXCLUDED.pricing_source_url,
    pricing_reviewed_at = EXCLUDED.pricing_reviewed_at,
    review_notes = EXCLUDED.review_notes,
    updated_at = NOW();
