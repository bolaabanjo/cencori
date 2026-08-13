-- Per-key model scoping and sponsorship for trusted first-party products.
-- NULL allowed_models preserves the existing unrestricted behavior. A `*`
-- entry explicitly grants every model, including restricted partner models.
-- An empty array permits no models. sponsored_models never changes provider-cost
-- accounting; it only zeroes the customer-facing Cencori charge.
ALTER TABLE public.api_keys
    ADD COLUMN IF NOT EXISTS allowed_models text[],
    ADD COLUMN IF NOT EXISTS sponsored_models text[];

COMMENT ON COLUMN public.api_keys.allowed_models IS
    'Optional canonical provider:model allowlist. NULL permits ordinary models; * explicitly permits every model.';
COMMENT ON COLUMN public.api_keys.sponsored_models IS
    'Canonical provider:model entries whose provider cost is sponsored by Cencori.';
