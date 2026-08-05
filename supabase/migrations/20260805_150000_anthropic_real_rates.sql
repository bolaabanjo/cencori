-- Anthropic pricing reconciled against the published rate card
--
-- Source: https://platform.claude.com/docs/en/about-claude/pricing (2026-08-05).
-- Rates are per-MTok on that page; stored here per-1K (divide by 1000).
--
--   model                base in    base out   cache read (0.1x)
--   claude-fable-5       $10/MTok   $50/MTok   $1/MTok
--   claude-opus-5        $5         $25        $0.50
--   claude-opus-4-8      $5         $25        $0.50
--   claude-opus-4-7      $5         $25        $0.50
--   claude-opus-4-6      $5         $25        $0.50
--   claude-opus-4-5      $5         $25        $0.50
--   claude-sonnet-5      $2/$10 intro through 2026-08-31, then $3/$15
--   claude-sonnet-4-6    $3         $15        $0.30
--   claude-sonnet-4-5    $3         $15        $0.30
--   claude-haiku-4-5     $1         $5         $0.10
--
-- Base input/output for every already-active row was verified correct; this
-- migration only (a) adds claude-opus-4-5, which had no active row, and
-- (b) backfills the 0.1x cache-read rate where it was null.
--
-- claude-opus-4-5 is the one that was actually mispriced: the deactivated
-- dotted `claude-opus-4.5` row carried $15/$75, which is Claude 3 Opus
-- pricing — 3x the real rate. Its numbers are corrected below even though it
-- stays inactive, so a future reactivation can't silently overcharge.
--
-- No long-context tier for any of these: Claude 4.6+ serves the full 1M
-- context at standard pricing, so long_context_threshold_tokens stays NULL.

INSERT INTO public.model_pricing (
    provider, model_name,
    input_price_per_1k_tokens, output_price_per_1k_tokens,
    cached_input_price_per_1k_tokens, cencori_markup_percentage,
    is_active, pricing_source_url, pricing_reviewed_at, review_notes
) VALUES
    ('anthropic', 'claude-opus-4-5',   0.00500000, 0.02500000, 0.00050000, 50.00, true,
     'https://platform.claude.com/docs/en/about-claude/pricing', '2026-08-05T00:00:00Z',
     'Opus 4.5 base rate $5/$25 per MTok. The old dotted row''s $15/$75 was stale Claude 3 Opus pricing.'),
    ('anthropic', 'claude-fable-5',    0.01000000, 0.05000000, 0.00100000, 50.00, true,
     'https://platform.claude.com/docs/en/about-claude/pricing', '2026-08-05T00:00:00Z',
     'Base $10/$50 per MTok; cache read 0.1x.'),
    ('anthropic', 'claude-haiku-4-5',  0.00100000, 0.00500000, 0.00010000, 50.00, true,
     'https://platform.claude.com/docs/en/about-claude/pricing', '2026-08-05T00:00:00Z',
     'Base $1/$5 per MTok; cache read 0.1x.'),
    ('anthropic', 'claude-sonnet-4-5', 0.00300000, 0.01500000, 0.00030000, 50.00, true,
     'https://platform.claude.com/docs/en/about-claude/pricing', '2026-08-05T00:00:00Z',
     'Base $3/$15 per MTok; cache read 0.1x.')
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

-- Stays inactive (invalid dotted ID, aliased in lib/providers/router.ts), but
-- carry the real rate so reactivating it can't overcharge by 3x.
UPDATE public.model_pricing
SET input_price_per_1k_tokens = 0.00500000,
    output_price_per_1k_tokens = 0.02500000,
    review_notes = 'Invalid Anthropic model ID (dotted); aliased to claude-opus-4-5. Rates corrected from stale $15/$75 (Claude 3 Opus) to the real $5/$25 so this is not reactivated at the wrong price.',
    updated_at = now()
WHERE provider = 'anthropic' AND model_name = 'claude-opus-4.5';

-- ⚠️ claude-sonnet-5 carries pricing_expires_at = 2026-09-01 (its $2/$10
-- introductory rate ends 2026-08-31; standard is $3/$15). getPricingFromDB
-- treats an elapsed pricing_expires_at as invalid and throws
-- PricingUnavailableError, so on 2026-09-01 Sonnet 5 starts returning 503
-- `pricing_unavailable` until the row is updated to 0.003/0.015 with the
-- expiry cleared. Left as-is deliberately — failing closed rather than
-- silently billing the wrong rate is the intended behaviour of that column.
