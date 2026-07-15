-- Exact non-token unit pricing used by audio gateway routes.
-- Values mirror the reviewed Voice Phase 1 pricing migration.

ALTER TABLE public.model_pricing
    ADD COLUMN IF NOT EXISTS price_per_1k_chars numeric(10, 6),
    ADD COLUMN IF NOT EXISTS price_per_minute numeric(10, 6);

INSERT INTO public.model_pricing (
    provider,
    model_name,
    input_price_per_1k_tokens,
    output_price_per_1k_tokens,
    cencori_markup_percentage,
    price_per_1k_chars,
    price_per_minute
) VALUES
    ('openai', 'tts-1', 0, 0, 50.00, 0.015000, NULL),
    ('openai', 'tts-1-hd', 0, 0, 50.00, 0.030000, NULL),
    ('openai', 'whisper-1', 0, 0, 50.00, NULL, 0.006000)
ON CONFLICT (provider, model_name) DO UPDATE SET
    price_per_1k_chars = EXCLUDED.price_per_1k_chars,
    price_per_minute = EXCLUDED.price_per_minute,
    cencori_markup_percentage = EXCLUDED.cencori_markup_percentage,
    updated_at = now();
