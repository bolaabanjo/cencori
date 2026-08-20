-- Groq decommissioned its Llama models. Their live catalog no longer serves
-- `llama-3.3-70b-versatile` or `llama-3.1-8b-instant`; requests for either
-- return 404 "model does not exist or you do not have access to it".
--
-- These two were Cencori's free first-test models, so every onboarding
-- copy-paste snippet 404'd. Code now points at `groq/compound` and
-- `groq/compound-mini` (both live, both already in EXPLICITLY_FREE_MODELS).
--
-- Deactivate rather than delete: ai_requests rows still reference these model
-- names historically, and cost re-computation over old logs must keep resolving
-- the price that applied at the time.

UPDATE model_pricing
SET is_active = false,
    review_notes = 'Retired 2026-08-20: decommissioned by Groq, API returns 404.',
    updated_at = NOW()
WHERE provider = 'groq'
  AND model_name IN ('llama-3.3-70b-versatile', 'llama-3.1-8b-instant');
