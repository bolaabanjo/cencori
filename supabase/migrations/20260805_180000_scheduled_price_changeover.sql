-- Scheduled price changeovers
--
-- `pricing_expires_at` fails closed: getPricingFromDB throws
-- PricingUnavailableError once it elapses, and /v1/models drops the model from
-- the catalog. That is the right behaviour for a promotional rate nobody has
-- reviewed — better a 503 than silently billing a stale price.
--
-- It is the wrong behaviour when the successor rate is already known. Exactly
-- one row is in that state today: claude-sonnet-5 carries the $2/$10
-- introductory rate, which ends 2026-08-31, with the standard $3/$15 published
-- well in advance. As deployed, Sonnet 5 would have started returning 503
-- `pricing_unavailable` on 2026-09-01 and disappeared from /v1/models — a
-- timed outage on a flagship model.
--
-- These columns let a row carry the rate it switches to. From
-- `pricing_expires_at` onward the next_* rates are billed instead of the base
-- ones; the model keeps serving and the price is right on the day. A row with
-- an elapsed expiry and NO next_* rates still fails closed exactly as before,
-- so the forcing function survives for genuinely unreviewed promos.

ALTER TABLE public.model_pricing
    ADD COLUMN IF NOT EXISTS next_input_price_per_1k_tokens numeric(12, 8)
        CHECK (next_input_price_per_1k_tokens IS NULL OR next_input_price_per_1k_tokens >= 0),
    ADD COLUMN IF NOT EXISTS next_output_price_per_1k_tokens numeric(12, 8)
        CHECK (next_output_price_per_1k_tokens IS NULL OR next_output_price_per_1k_tokens >= 0),
    ADD COLUMN IF NOT EXISTS next_cached_input_price_per_1k_tokens numeric(12, 8)
        CHECK (next_cached_input_price_per_1k_tokens IS NULL OR next_cached_input_price_per_1k_tokens >= 0);

COMMENT ON COLUMN public.model_pricing.next_input_price_per_1k_tokens IS
    'Rate billed from pricing_expires_at onward. Set alongside next_output_* to schedule a price change; both must be present or the row fails closed on expiry.';

-- Claude Sonnet 5: $2/$10 per MTok introductory through 2026-08-31, then the
-- standard $3/$15 (cache read 0.1x). Source:
-- https://platform.claude.com/docs/en/about-claude/pricing
UPDATE public.model_pricing
SET next_input_price_per_1k_tokens = 0.00300000,
    next_output_price_per_1k_tokens = 0.01500000,
    next_cached_input_price_per_1k_tokens = 0.00030000,
    review_notes = 'Introductory $2/$10 per MTok through 2026-08-31; switches automatically to the standard $3/$15 at pricing_expires_at.',
    updated_at = now()
WHERE provider = 'anthropic'
  AND model_name = 'claude-sonnet-5';
