-- Voice model pricing — Cencori Voice Phase 1
--
-- Voice models don't price in tokens: TTS is per-character, STT is
-- per-minute. Two dedicated nullable columns keep one pricing table and
-- one admin surface. Token columns are NOT NULL, so voice rows carry 0.
--
-- NOTE: ElevenLabs and Cartesia list prices are tier-dependent snapshots
-- (verified 2026-07 pay-as-you-go). Re-check their pricing pages before
-- applying, and adjust the two marked rows if your account tier differs.

ALTER TABLE model_pricing
  ADD COLUMN IF NOT EXISTS price_per_1k_chars DECIMAL(10, 6),
  ADD COLUMN IF NOT EXISTS price_per_minute   DECIMAL(10, 6);

INSERT INTO model_pricing (provider, model_name, input_price_per_1k_tokens, output_price_per_1k_tokens, cencori_markup_percentage, price_per_1k_chars, price_per_minute) VALUES
  -- ── TTS (price per 1k characters) ──
  ('openai',     'tts-1',                  0, 0, 50.00, 0.015000, NULL),  -- $15 / 1M chars
  ('openai',     'tts-1-hd',               0, 0, 50.00, 0.030000, NULL),  -- $30 / 1M chars
  ('elevenlabs', 'eleven_multilingual_v2', 0, 0, 50.00, 0.220000, NULL),  -- VERIFY: tier-dependent (~$0.22/1k)
  ('elevenlabs', 'eleven_turbo_v2_5',      0, 0, 50.00, 0.110000, NULL),  -- 0.5 credits/char
  ('elevenlabs', 'eleven_flash_v2_5',      0, 0, 50.00, 0.110000, NULL),  -- 0.5 credits/char
  ('deepgram',   'aura-asteria-en',        0, 0, 50.00, 0.015000, NULL),  -- $0.0150 / 1k chars
  ('deepgram',   'aura-luna-en',           0, 0, 50.00, 0.015000, NULL),
  ('deepgram',   'aura-stella-en',         0, 0, 50.00, 0.015000, NULL),
  ('cartesia',   'sonic-3',                0, 0, 50.00, 0.050000, NULL),  -- VERIFY: tier-dependent (~$0.05/1k)
  ('cartesia',   'sonic-2',                0, 0, 50.00, 0.050000, NULL),
  ('cartesia',   'sonic-turbo',            0, 0, 50.00, 0.050000, NULL),
  ('google',     'google-chirp3-hd',       0, 0, 50.00, 0.030000, NULL),  -- $30 / 1M chars
  ('google',     'google-studio',          0, 0, 50.00, 0.160000, NULL),  -- $160 / 1M chars
  -- ── STT (price per minute) ──
  ('openai',     'whisper-1',              0, 0, 50.00, NULL, 0.006000),  -- $0.006 / min
  ('deepgram',   'nova-3',                 0, 0, 50.00, NULL, 0.007700),  -- $0.0077 / min
  ('assemblyai', 'assemblyai-universal',   0, 0, 50.00, NULL, 0.006200),  -- $0.37 / hr
  ('google',     'google-stt-latest-long', 0, 0, 50.00, NULL, 0.024000),  -- $0.024 / min
  -- ── Spitch — Nigerian languages (partnership; VERIFY final rates with Spitch) ──
  ('spitch',     'spitch-tts',             0, 0, 50.00, 0.030000, NULL),
  ('spitch',     'spitch-stt',             0, 0, 50.00, NULL, 0.010000)
ON CONFLICT (provider, model_name) DO UPDATE SET
  price_per_1k_chars = EXCLUDED.price_per_1k_chars,
  price_per_minute   = EXCLUDED.price_per_minute,
  cencori_markup_percentage = EXCLUDED.cencori_markup_percentage,
  updated_at = NOW();
