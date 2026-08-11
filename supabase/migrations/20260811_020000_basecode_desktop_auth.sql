-- Short-lived, single-use handoffs from the authenticated Cencori web session
-- to Basecode Desktop. The desktop callback receives only an opaque code; the
-- Supabase session is returned after the PKCE verifier is proven server-side.

CREATE TABLE IF NOT EXISTS public.basecode_auth_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email text NOT NULL,
    code_hash text NOT NULL UNIQUE,
    code_challenge text NOT NULL,
    magic_link_token text NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT basecode_auth_codes_code_hash_length CHECK (char_length(code_hash) = 43),
    CONSTRAINT basecode_auth_codes_challenge_length CHECK (char_length(code_challenge) = 43)
);

CREATE INDEX IF NOT EXISTS basecode_auth_codes_expires_at_idx
    ON public.basecode_auth_codes (expires_at);

ALTER TABLE public.basecode_auth_codes ENABLE ROW LEVEL SECURITY;

-- Intentionally no user policies. Only the server-side service role may create,
-- read, atomically delete, or clean up authentication handoffs.
REVOKE ALL ON TABLE public.basecode_auth_codes FROM anon, authenticated;
