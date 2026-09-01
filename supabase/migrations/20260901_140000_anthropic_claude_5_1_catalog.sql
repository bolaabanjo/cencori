-- Claude Fable 5.1 and Claude Mythos 5.1
--
-- Announced 2026-09-01. Both are the same underlying model at the same rate;
-- they differ only in safeguard configuration, and Mythos is reachable only
-- through Anthropic's trusted-access program (vetted cybersecurity and
-- life-sciences professionals). Mythos is therefore gated behind an explicit
-- allowlist grant in lib/gateway/model-access.ts rather than served to every
-- key — the row exists so a granted key bills correctly, not so the model is
-- generally advertised as callable.
--
-- Base rates are unchanged from Fable 5: $10/$50 per MTok, stored per-1K, with
-- the 50% markup every other Anthropic row carries.
--
-- The one number that actually moved is the cache read. Fable 5 reads cache at
-- the usual 0.1x ($1/MTok); Fable 5.1 reads it at $0.25/MTok — 0.025x, a 75%
-- cut, and the source of the ~25-45% cost reduction in the announcement. That
-- rate is only confirmed for Fable 5.1, so Mythos deliberately carries no
-- cache-read rate: calculateProviderTokenCost falls back to the full input rate
-- when cachedInputPer1KTokens is null, which over-bills a cache hit rather than
-- under-billing it. Fill it in once Anthropic publishes the Mythos figure.
--
-- No long-context tier: like every Claude 4.6+ model these serve the full 1M
-- context at standard pricing, so long_context_threshold_tokens stays NULL.

INSERT INTO public.model_pricing (
    provider,
    model_name,
    input_price_per_1k_tokens,
    output_price_per_1k_tokens,
    cached_input_price_per_1k_tokens,
    cencori_markup_percentage,
    is_active,
    pricing_source_url,
    pricing_reviewed_at,
    review_notes
) VALUES
    ('anthropic', 'claude-fable-5-1', 0.01000000, 0.05000000, 0.00025000, 50.00, true,
     'https://platform.claude.com/docs/en/about-claude/pricing', '2026-09-01T00:00:00Z',
     'Base $10/$50 per MTok, same as Fable 5. Cache read $0.25/MTok (0.025x, not the usual 0.1x).'),

    ('anthropic', 'claude-mythos-5-1', 0.01000000, 0.05000000, NULL, 50.00, true,
     'https://platform.claude.com/docs/en/about-claude/pricing', '2026-09-01T00:00:00Z',
     'Same rate as Fable 5.1. Cache read left NULL until Anthropic publishes it — billing falls back to the full input rate, which over-charges a cache hit rather than under-charging. Trusted-access only; gated in lib/gateway/model-access.ts.')
ON CONFLICT (provider, model_name) DO UPDATE SET
    input_price_per_1k_tokens = EXCLUDED.input_price_per_1k_tokens,
    output_price_per_1k_tokens = EXCLUDED.output_price_per_1k_tokens,
    cached_input_price_per_1k_tokens = EXCLUDED.cached_input_price_per_1k_tokens,
    cencori_markup_percentage = EXCLUDED.cencori_markup_percentage,
    is_active = EXCLUDED.is_active,
    pricing_source_url = EXCLUDED.pricing_source_url,
    pricing_reviewed_at = EXCLUDED.pricing_reviewed_at,
    review_notes = EXCLUDED.review_notes,
    updated_at = now();

-- Fable 5 stays active and served — 5.1 is a successor in the same tier at the
-- same price, not a replacement Anthropic has retired. Record the succession so
-- the row is not mistaken for a stale duplicate.
UPDATE public.model_pricing
SET review_notes = 'Base $10/$50 per MTok; cache read 0.1x. Superseded by claude-fable-5-1 (same tier, same base rate, cheaper cache reads) but still served by Anthropic.',
    updated_at = now()
WHERE provider = 'anthropic'
  AND model_name = 'claude-fable-5';
