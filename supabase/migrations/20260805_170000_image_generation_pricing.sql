-- Image generation pricing
--
-- gateway_image_pricing was EMPTY, so app/api/ai/images/generate/route.ts
-- failed closed on every request: it requires an exact
-- (provider, model_name, size, quality) row and returns 503
-- `pricing_unavailable` without one. Image generation has therefore never
-- worked in production.
--
-- OpenAI bills image output by tokens, not per image, so the per-image figures
-- below come from the cost table in OpenAI's image generation guide rather
-- than from the per-MTok rate card. Cross-check: gpt-image-1 at 1024x1024
-- resolves to $0.011 / $0.042 / $0.167 for low / medium / high, matching
-- OpenAI's published per-image approximations.
--
-- Quality values match what the route actually queries with:
--   gpt-image-*  -> mapOpenAIQuality() yields 'low' | 'medium' | 'high'
--                   (the API's 'standard' and 'hd' map to medium/high),
--                   defaulting to 'medium'
--   google       -> 'standard', and the route rejects anything other than
--                   1024x1024 for Google models, so one row each
--
-- Sizes are limited to those the gpt-image family actually supports. The
-- route's allowedSizes still contains the legacy DALL-E sizes (256x256,
-- 512x512, 1024x1792, 1792x1024); those are intentionally left unpriced so a
-- request for one fails closed rather than being billed at a guessed rate.

INSERT INTO public.gateway_image_pricing
    (provider, model_name, size, quality, price_per_image, cencori_markup_percentage, is_active)
VALUES
    -- gpt-image-2
    ('openai','gpt-image-2','1024x1024','low',    0.00600000, 50, true),
    ('openai','gpt-image-2','1024x1536','low',    0.00500000, 50, true),
    ('openai','gpt-image-2','1536x1024','low',    0.00500000, 50, true),
    ('openai','gpt-image-2','1024x1024','medium', 0.05300000, 50, true),
    ('openai','gpt-image-2','1024x1536','medium', 0.04100000, 50, true),
    ('openai','gpt-image-2','1536x1024','medium', 0.04100000, 50, true),
    ('openai','gpt-image-2','1024x1024','high',   0.21100000, 50, true),
    ('openai','gpt-image-2','1024x1536','high',   0.16500000, 50, true),
    ('openai','gpt-image-2','1536x1024','high',   0.16500000, 50, true),
    -- gpt-image-1.5
    ('openai','gpt-image-1.5','1024x1024','low',    0.00900000, 50, true),
    ('openai','gpt-image-1.5','1024x1536','low',    0.01300000, 50, true),
    ('openai','gpt-image-1.5','1536x1024','low',    0.01300000, 50, true),
    ('openai','gpt-image-1.5','1024x1024','medium', 0.03400000, 50, true),
    ('openai','gpt-image-1.5','1024x1536','medium', 0.05000000, 50, true),
    ('openai','gpt-image-1.5','1536x1024','medium', 0.05000000, 50, true),
    ('openai','gpt-image-1.5','1024x1024','high',   0.13300000, 50, true),
    ('openai','gpt-image-1.5','1024x1536','high',   0.20000000, 50, true),
    ('openai','gpt-image-1.5','1536x1024','high',   0.20000000, 50, true),
    -- gpt-image-1
    ('openai','gpt-image-1','1024x1024','low',    0.01100000, 50, true),
    ('openai','gpt-image-1','1024x1536','low',    0.01600000, 50, true),
    ('openai','gpt-image-1','1536x1024','low',    0.01600000, 50, true),
    ('openai','gpt-image-1','1024x1024','medium', 0.04200000, 50, true),
    ('openai','gpt-image-1','1024x1536','medium', 0.06300000, 50, true),
    ('openai','gpt-image-1','1536x1024','medium', 0.06300000, 50, true),
    ('openai','gpt-image-1','1024x1024','high',   0.16700000, 50, true),
    ('openai','gpt-image-1','1024x1536','high',   0.25000000, 50, true),
    ('openai','gpt-image-1','1536x1024','high',   0.25000000, 50, true),
    -- Google (ai.google.dev/gemini-api/docs/pricing): a 1024x1024 output is
    -- 1120 tokens, which the pricing page states as a per-image equivalent.
    ('google','gemini-3-pro-image',    '1024x1024','standard', 0.13400000, 50, true),
    ('google','gemini-3.1-flash-image','1024x1024','standard', 0.06700000, 50, true)
ON CONFLICT (provider, model_name, size, quality) DO UPDATE SET
    price_per_image = EXCLUDED.price_per_image,
    cencori_markup_percentage = EXCLUDED.cencori_markup_percentage,
    is_active = EXCLUDED.is_active,
    updated_at = now();
