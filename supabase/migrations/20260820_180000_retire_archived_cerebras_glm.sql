-- Cerebras archived `zai-glm-4.7`: the API answers 404 model_archived, so the
-- model is not orderable at any price and its catalog entry has been removed.
-- Retire the pricing row to match, using the same deactivate-don't-delete rule
-- as 20260820_170000 so historical ai_requests rows still resolve their price.
--
-- Note the two OTHER Cerebras models (gpt-oss-120b, gemma-4-31b) are deliberately
-- left active. They are not archived — they return 402 payment_required because
-- the Cerebras account is unfunded. They start working again the moment it is
-- topped up, and they now bill from these rows rather than being advertised as
-- free (they were in EXPLICITLY_FREE_MODELS while returning 402, which is why
-- the free tier appeared broken).

UPDATE model_pricing
SET is_active = false,
    review_notes = 'Retired 2026-08-20: archived by Cerebras, API returns 404 model_archived.',
    updated_at = NOW()
WHERE provider = 'cerebras'
  AND model_name IN ('zai-glm-4.7');
