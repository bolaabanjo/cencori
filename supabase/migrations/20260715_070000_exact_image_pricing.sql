-- Image generation pricing varies by model, size, and quality. Keep it in a
-- dedicated exact-variant table so the gateway never guesses a flat fee.

CREATE TABLE IF NOT EXISTS public.gateway_image_pricing (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider text NOT NULL,
    model_name text NOT NULL,
    size text NOT NULL,
    quality text NOT NULL,
    price_per_image numeric(12, 8) NOT NULL CHECK (price_per_image >= 0),
    cencori_markup_percentage numeric(7, 3) NOT NULL DEFAULT 50
        CHECK (cencori_markup_percentage >= 0),
    is_active boolean NOT NULL DEFAULT true,
    effective_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, model_name, size, quality)
);

CREATE INDEX IF NOT EXISTS gateway_image_pricing_active_lookup_idx
    ON public.gateway_image_pricing (provider, model_name, size, quality)
    WHERE is_active = true;

ALTER TABLE public.gateway_image_pricing ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.gateway_image_pricing IS
    'Exact image generation unit prices. Routes fail closed until a reviewed variant row is active.';
