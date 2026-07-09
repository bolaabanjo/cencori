-- Fix silent logging failures in ai_requests
--
-- Two production bugs:
-- 1. The live status check constraint only allows ('success', 'error', 'filtered'),
--    but the gateway writes 'success_fallback', 'blocked', 'blocked_output', and
--    'rate_limited' — those inserts fail silently (errors are swallowed in code).
-- 2. request_payload is NOT NULL with no default, but logGatewayRequest() inserts
--    without it — so EVERY log insert from the shared middleware fails silently.
--    This affects /v1/chat/completions, /v1/responses, embeddings, completions,
--    vision, documents, audio, images, moderation, RAG, memory, and sessions.

-- 1. Widen the status constraint to every status the app writes
ALTER TABLE public.ai_requests
    DROP CONSTRAINT IF EXISTS ai_requests_status_check;

ALTER TABLE public.ai_requests
    ADD CONSTRAINT ai_requests_status_check
    CHECK (status IN (
        'success',
        'success_fallback',
        'error',
        'filtered',
        'blocked',
        'blocked_output',
        'rate_limited'
    ));

-- 2. Never let a missing payload kill a log row
ALTER TABLE public.ai_requests
    ALTER COLUMN request_payload SET DEFAULT '{}'::jsonb;

ALTER TABLE public.ai_requests
    ALTER COLUMN request_payload DROP NOT NULL;

-- 3. Columns logGatewayRequest() writes that never existed in the live table.
--    PostgREST rejects the whole insert when any column is unknown, which is
--    the third reason gateway logs were silently lost.
ALTER TABLE public.ai_requests
    ADD COLUMN IF NOT EXISTS endpoint TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS request_id TEXT,
    ADD COLUMN IF NOT EXISTS fallback_provider TEXT,
    ADD COLUMN IF NOT EXISTS fallback_model TEXT;

-- Request IDs are surfaced to customers via the X-Request-Id header;
-- make them findable.
CREATE INDEX IF NOT EXISTS idx_ai_requests_request_id
    ON public.ai_requests(request_id)
    WHERE request_id IS NOT NULL;
