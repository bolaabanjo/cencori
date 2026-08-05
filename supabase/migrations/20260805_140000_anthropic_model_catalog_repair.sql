-- Anthropic catalog repair
--
-- The gateway advertised nine Anthropic models it could not actually serve.
-- A customer on BYOK hit `pricing_unavailable` (503) on claude-haiku-4.5 and
-- the flagship claude-opus-5 was failing the same way for everyone.
--
-- Two separate defects, both fixed here:
--
-- 1. WRONG MODEL IDs. Anthropic's IDs are hyphenated (`claude-haiku-4-5`).
--    An earlier pass renamed part of the catalog and deactivated the dotted
--    rows, but Haiku 4.5, Sonnet 4.5 and Opus 4.5 never got hyphenated
--    replacements. The dotted names were never valid at Anthropic, so those
--    requests would have failed upstream even with pricing configured.
--    Verified against Anthropic's GET /v1/models for this account.
--
-- 2. claude-opus-5 HAD NO ROW AT ALL. 20260724_120000_add_claude_opus_5_pricing
--    was never applied to the live database, so the featured flagship 503'd.
--
-- Prices are Anthropic's published first-party per-MTok rates converted to
-- per-1K (Fable 5 $10/$50, Opus 5 $5/$25, Haiku 4.5 $1/$5, Sonnet 4.5 $3/$15),
-- carrying the 50% markup every other Anthropic row already uses. Sonnet 5's
-- introductory rate is deliberately not modelled — it reverts 2026-08-31 and
-- that row is already live and correct.
--
-- Deliberately NOT included: claude-opus-4-5. Its deactivated dotted row reads
-- $15/$75, which is stale Claude 3 Opus pricing (the entire Opus 4.x line is
-- $5/$25). Activating that would overcharge ~3x, so it stays unpriced until
-- someone confirms the real rate.

INSERT INTO public.model_pricing (
    provider,
    model_name,
    input_price_per_1k_tokens,
    output_price_per_1k_tokens,
    cencori_markup_percentage,
    is_active,
    pricing_source_url,
    pricing_reviewed_at,
    cached_input_price_per_1k_tokens,
    review_notes
) VALUES
    ('anthropic', 'claude-opus-5',    0.00500000, 0.02500000, 50.00, true,
     'https://platform.claude.com/docs/en/about-claude/pricing', '2026-08-05T00:00:00Z', 0.00050000,
     'Opus-tier flagship. Same rate as Opus 4.8/4.7/4.6. Row was missing entirely in prod.'),
    ('anthropic', 'claude-fable-5',   0.01000000, 0.05000000, 50.00, true,
     'https://platform.claude.com/docs/en/about-claude/pricing', '2026-08-05T00:00:00Z', NULL,
     'Most capable model; priced above Opus tier. Live at Anthropic but never listed in our catalog.'),
    ('anthropic', 'claude-haiku-4-5', 0.00100000, 0.00500000, 50.00, true,
     'https://platform.claude.com/docs/en/about-claude/pricing', '2026-08-05T00:00:00Z', NULL,
     'Replaces the deactivated dotted claude-haiku-4.5 row, whose ID Anthropic never accepted.'),
    ('anthropic', 'claude-sonnet-4-5', 0.00300000, 0.01500000, 50.00, true,
     'https://platform.claude.com/docs/en/about-claude/pricing', '2026-08-05T00:00:00Z', NULL,
     'Replaces the deactivated dotted claude-sonnet-4.5 row.')
ON CONFLICT (provider, model_name) DO UPDATE SET
    input_price_per_1k_tokens = EXCLUDED.input_price_per_1k_tokens,
    output_price_per_1k_tokens = EXCLUDED.output_price_per_1k_tokens,
    cencori_markup_percentage = EXCLUDED.cencori_markup_percentage,
    is_active = EXCLUDED.is_active,
    pricing_source_url = EXCLUDED.pricing_source_url,
    pricing_reviewed_at = EXCLUDED.pricing_reviewed_at,
    cached_input_price_per_1k_tokens = EXCLUDED.cached_input_price_per_1k_tokens,
    review_notes = EXCLUDED.review_notes,
    updated_at = now();

-- Models Anthropic has retired. They were already inactive; this records why,
-- so nobody reactivates them expecting them to work.
UPDATE public.model_pricing
SET review_notes = 'Retired at Anthropic (absent from GET /v1/models 2026-08-05). Do not reactivate.',
    updated_at = now()
WHERE provider = 'anthropic'
  AND is_active = false
  AND model_name IN (
      'claude-opus-4',
      'claude-sonnet-4',
      'claude-3-7-sonnet',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-haiku-20240307',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229'
  );

-- The dotted IDs stay inactive but are now reachable through MODEL_ALIASES in
-- lib/providers/router.ts, which rewrites them to the hyphenated rows above.
UPDATE public.model_pricing
SET review_notes = 'Invalid Anthropic model ID (dotted). Aliased to the hyphenated row in lib/providers/router.ts.',
    updated_at = now()
WHERE provider = 'anthropic'
  AND is_active = false
  AND model_name IN ('claude-haiku-4.5', 'claude-sonnet-4.5', 'claude-opus-4.5', 'claude-sonnet-4.6', 'claude-opus-4.6', 'claude-opus-4.7');
