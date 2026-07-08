# Cencori Voice — Feature Roadmap

## The Story

Every AI platform wraps TTS and STT. That's table stakes now. The *actual* differentiator for Cencori Voice is **realtime voice through a billable, logged, PII-redacted gateway** — nobody offers that today. You get all the operational primitives (spend caps, model routing, cost tracking, security scanning) applied to voice sessions instead of just chat completions.

The wedge is the same as the rest of the platform: **one SDK, any provider, ops built in, and we ship you the UI**.

---

## Competitive Landscape

### Direct Competitors

| Product | Killer Feature | Weakness |
|---|---|---|
| **OpenAI Realtime API** | Best latency, native tool calling, mature | Single provider, expensive ($0.06/min input), no billing/spend layer |
| **Vapi** | Voice-agent orchestration, telephony built in | Locked to Twilio/Deepgram/Eleven, no BYOK for weird providers |
| **Retell** | Turn-key voice agent stack | Same lock-in, no gateway story |
| **Deepgram Voice Agent API** | Cheap, integrated STT+TTS+LLM | Deepgram-only stack, no multi-provider |
| **ElevenLabs Turbo** | Best voice quality | TTS only, no realtime brain |
| **Google Gemini Live** | Cheapest realtime, 1M context | New, thin ecosystem |

### The gap Cencori fills

None of them offer: **model-agnostic realtime + spend caps + PII redaction on live audio + BYOK across providers + drop-in React components**. Every existing player either locks you to one stack or leaves ops as an exercise for the customer.

---

## Current State (v1.4.0)

- `POST /api/ai/audio/speech` — OpenAI `tts-1` / `tts-1-hd` only, 6 voices, mp3/opus/aac/flac/wav/pcm
- `POST /api/ai/audio/transcriptions` — OpenAI Whisper only
- No realtime path
- Voice models effectively absent from the gateway model registry (`lib/providers/config.ts`)
- No SDK `voice` namespace (audio calls go through raw HTTP or the OpenAI SDK)
- No React components
- No dedicated docs page (audio.mdx exists as reference for the two OpenAI endpoints)

---

## Phase 1 — Voice Foundation (weeks 1–2)

Ship non-realtime voice first: multi-provider TTS + STT + gateway integration + SDKs. Ships loud enough for a launch on its own; makes the realtime rollout easier because provider routing is already wired.

### 1a — Multi-provider TTS

- **New endpoint:** rename `POST /api/ai/audio/speech` behavior to route by `provider` param. Backward-compatible: default stays OpenAI.
- **Providers to add:**
  - ✅ OpenAI (`tts-1`, `tts-1-hd`) — already there
  - **ElevenLabs** (`eleven_multilingual_v2`, `eleven_turbo_v2_5`, `eleven_flash_v2_5`) — market leader on quality
  - **Deepgram Aura** (`aura-asteria-en`, `aura-luna-en`, `aura-stella-en`) — sub-200ms, good default for agents
  - **Cartesia Sonic** (`sonic-english`, `sonic-multilingual`) — sub-100ms, purpose-built for realtime
  - **Google Chirp / Studio** — 40+ languages, enterprise story
- **Cost tracking** — pricing table entries per model per character (or per second, per provider convention)
- **Voice cloning surface** (later) — some providers support it, ship a separate `/api/ai/voice/clone` endpoint in Phase 4

**Files to touch:**
- `lib/audio/speech.ts` (new) — shared speech generator with provider dispatch
- `app/api/ai/audio/speech/route.ts` — refactor to use the shared lib
- `lib/providers/config.ts` — add voice model registry entries
- Seed `model_pricing` DB with voice-model rows

### 1b — Multi-provider STT

- **New capability:** streaming STT via WebSocket (Phase 2 unlocks this; Phase 1 is HTTP request/response)
- **Providers to add:**
  - ✅ OpenAI Whisper — already there
  - **Deepgram Nova-3** — cheap, fast, best-in-class
  - **AssemblyAI** — strong for long-form, speaker diarization
  - **Google Speech-to-Text** — enterprise
- **Diarization** — mandatory table stakes for meeting notes / customer calls. Deepgram + AssemblyAI have first-class support.
- **Word-level timestamps** — needed for subtitle generation, agent latency measurement
- **Language auto-detect** — pass through

**Files to touch:**
- `lib/audio/transcribe.ts` (new) — shared transcription with provider dispatch
- `app/api/ai/audio/transcriptions/route.ts` — refactor
- Diarization support in the response schema

### 1c — Voice models on the gateway

- **Model registry** — add all voice models to `lib/providers/config.ts` alongside chat/embedding models. Show up in `/dashboard/…/models`, `/api/v1/models`, `cencori.ai.listModels()`.
- **Pricing** — DB entries so `getPricingFromDB()` works consistently
- **Failover** — extend the failover map (`lib/providers/failover.ts`) with voice equivalents (`elevenlabs/eleven_v2 → cartesia/sonic-english → openai/tts-1`)
- **Dashboard** — voice model card on the models page, with sample audio playback

### 1d — SDK expansion

Add `cencori.voice.*` namespace across all 5 SDKs. Same shape as `cencori.vision.*`.

```typescript
await cencori.voice.speak({ text, model, voice });        // TTS
await cencori.voice.transcribe({ audio, model });         // STT
await cencori.voice.diarize({ audio, model, speakers });  // STT + speakers
```

- **TS SDK** — `packages/sdk/src/voice/index.ts` + `cencori/voice` subpath
- **Python** — `cencori/voice.py` module, sync + async
- **Go** — `voice.go` service
- **PHP** — `VoiceModule.php`
- **Rust** — `voice.rs` sync + async

### 1e — Launch pack

Same rhythm as Vision + Documents:
- `content/docs/ai/endpoints/voice.mdx` — full reference
- `content/docs/guides/build-a-voicemail-transcriber.mdx` — end-to-end tutorial
- `content/blog/YYYY-MM-voice.mdx` — launch post
- `scripts/send-voice-test.ts` + `scripts/send-voice-bulk.ts` — email drops
- Add Voice section to all 5 SDK READMEs
- Add `examples/voice.*` files

---

## Phase 2 — Realtime Voice (weeks 3–4)

The **real** wedge. WebSocket API, low-latency, tool calling mid-conversation, interruption handling, VAD. Sit in front of OpenAI Realtime, Gemini Live, and (when GA) Claude Voice with the same shape.

### 2a — Protocol design

- **Transport:** WebSocket at `wss://cencori.com/api/ai/voice/realtime` (Next.js WebSocket support via edge runtime or a dedicated Node server — decide during design)
- **Message shape:** align with OpenAI Realtime event schema (`session.update`, `input_audio_buffer.append`, `response.create`, etc.) so clients can switch providers with zero code change
- **Audio format:** PCM16 in/out at 24kHz (OpenAI standard) with pluggable transcode to Gemini's 16kHz on the fly
- **VAD:** server-side by default, `mode: "manual"` opt-out for phone-integration use cases

### 2b — Providers

- **OpenAI Realtime** (`gpt-4o-realtime-preview`, `gpt-4o-mini-realtime-preview`) — first provider, closest match to canonical shape
- **Gemini Live** (`gemini-2.0-flash-exp-realtime`) — cheaper alternative; needs message-shape translation
- **Anthropic Voice** — planned once GA; write the shape now so the adapter slot is ready

### 2c — Gateway operations on live sessions

This is the differentiator. On a live voice session:
- **Spend caps** — session terminates when the project's per-minute or absolute budget is exhausted
- **Rate limits** — per-project concurrent-session cap
- **PII redaction** — real-time transcript scrubbing before the audio hits the LLM (the input_audio_transcription event stream lets us intercept)
- **Full logging** — every session recorded with transcript, model events, tool calls, duration, cost. Playable in the dashboard.
- **BYOK** — bring your own OpenAI/Gemini/Anthropic realtime key
- **Failover** — if OpenAI Realtime is down mid-session, we don't auto-fail-over (breaks conversation state) but we do surface a clear error and log the incident

### 2d — Files to touch

- `lib/voice/realtime/session.ts` — session state machine
- `lib/voice/realtime/openai.ts` — OpenAI Realtime adapter
- `lib/voice/realtime/gemini.ts` — Gemini Live adapter
- `lib/voice/realtime/router.ts` — provider dispatch, message translation
- `app/api/ai/voice/realtime/route.ts` — WebSocket handler (or a dedicated server route)
- `lib/gateway/voice-session-billing.ts` — per-second billing tick, spend cap enforcement

### 2e — SDK integration

```typescript
// TS SDK
const session = await cencori.voice.realtime.connect({
  model: 'gpt-4o-realtime-preview',
  instructions: 'You are a customer support agent...',
  tools: [...],
  turnDetection: 'server_vad',
});

session.on('audio.delta', (chunk) => audioContext.play(chunk));
session.on('transcript.delta', (text) => console.log(text));
session.on('response.done', (usage) => console.log(usage));

session.send({ type: 'audio', data: microphoneChunk });
```

Match this shape across all 5 SDKs. WebSocket handling in each — TS uses `ws`, Python uses `websockets`, Go uses `nhooyr.io/websocket`, PHP uses `ratchet/pawl`, Rust uses `tokio-tungstenite`.

### 2f — Dashboard: session viewer

- `/dashboard/…/voice-sessions` — list of recent live sessions with duration, cost, transcript preview
- Click into one → full transcript playback with audio scrubber, model events timeline, tool call inspector
- **Same design language as the existing Sessions viewer** (durable execution) — reuse components

---

## Phase 3 — React Components (week 5)

Ship the UI so customers don't build it. Same story as `<VisionUploader />`.

### `<VoiceRecorder />`

Drop-in audio recorder with waveform preview, permission prompt handling, format detection.

```tsx
import { VoiceRecorder } from 'cencori/react';

<VoiceRecorder
  endpoint="/api/ai/audio/transcriptions"
  model="deepgram-nova-3"
  onResult={(r) => setTranscript(r.text)}
/>
```

### `<VoicePlayer />`

Playback UI for generated speech, with waveform, scrubber, download.

```tsx
<VoicePlayer text="Welcome to Cencori" voice="alloy" autoPlay />
```

### `<VoiceCall />` — the flagship

The one nobody ships: a WebRTC-ish component that opens a realtime session, streams mic → Cencori, plays back TTS deltas, handles interruption.

```tsx
<VoiceCall
  endpoint="wss://cencori.com/api/ai/voice/realtime"
  apiKey={sessionToken}
  agentId="ag_customer_support"
  onStart={() => log('call started')}
  onTranscript={(msg) => appendMessage(msg)}
  onEnd={(summary) => saveCallLog(summary)}
/>
```

Handles: mic permission, echo cancellation, VAD indication, mute/unmute, hang up, interrupt. All the phone-app UX primitives.

**This is the launch demo.** A working voice agent in five lines of JSX.

---

## Phase 4 — Provider Expansion + Polish (ongoing)

### Voice cloning
- ElevenLabs voice cloning API passthrough
- Cartesia voice ID management
- Consent flow for cloned voices (legal requirement)
- `POST /api/ai/voice/clone`, `GET/DELETE /api/ai/voice/voices`

### Anthropic Voice (when GA)
- Adapter slot is already there from Phase 2
- Update failover map, docs, blog

### Telephony bridge (Phase 5 candidate)
- Twilio SIP inbound → Cencori Realtime session
- Every voice agent gets a phone number without a separate Vapi/Retell contract
- Big product surface — might be its own launch

### Voice analytics dashboard
- Talk time per model, per user
- Interruption rate, average turn length
- Cost per voice-minute
- Same widget language as the existing usage dashboard

---

## Cross-cutting: The Ops Layer

Everything above assumes voice sessions plug into the existing platform primitives without workarounds:

- **Spend caps** — voice minutes hit the same wallet as chat tokens
- **Rate limits** — per-key concurrent session cap
- **PII redaction** — real-time transcript scrubbing before it hits the LLM
- **Audit logs** — every session end-to-end
- **BYOK** — bring your own OpenAI Realtime / Gemini Live / ElevenLabs key
- **End-user billing** — meter voice-minutes to end-users like we meter tokens
- **Failover** — for non-realtime; for realtime we surface clean errors instead of switching mid-session

If any of these are hard, that's an infrastructure gap worth surfacing before Phase 2 ships.

---

## Launch Sequence

| Phase | What ships | Loud launch? |
|---|---|---|
| 1a + 1b + 1c + 1d + 1e | Multi-provider TTS/STT + gateway + SDKs + docs + blog | Yes — "Voice on Cencori: any provider, one API" |
| 2 (all sub-phases) | Realtime API + dashboard session viewer | Yes — this is the wedge; press moment |
| 3 | React components including `<VoiceCall />` | Yes — bundled with `cencori/react` broader story |
| 4 | Cloning, telephony, analytics | Roll out quietly; standalone posts as we hit each |

---

## Success Criteria

- **A working voice agent in five lines of React.** If a customer can't get there, we haven't shipped.
- **Cost parity or better vs going direct.** Cencori's markup pays for ops (logs, dashboards, PII). If we're 3× more expensive than direct-to-OpenAI, we lose.
- **Sub-500ms perceived latency on realtime.** Anything more feels like a phone-call delay. Test on Deepgram + Cartesia because they'll set the bar.
- **BYOK works out of the box.** Customers routing their own ElevenLabs subscription through Cencori is a big enterprise unlock.

---

## Known Unknowns

- **Next.js WebSocket support in production.** Vercel edge functions have WebSocket support but it's still evolving. May need a dedicated Node WS server (Fly, Railway) fronted by the API domain. Decide during Phase 2 design.
- **PCM audio encoding in the browser SDK.** Non-trivial — the audio worklet needs to encode at 24kHz PCM16 for OpenAI. Consider shipping a small WASM helper via `cencori/react`.
- **Session recording storage cost.** If we record every voice session for logs, storage grows fast. Default: keep 7 days for free tier, 30 days for pro, unlimited for enterprise. Compress with Opus.
- **Real-time PII redaction latency.** Scrubbing transcripts before they hit the LLM adds 50–100ms. Might be a per-project opt-in for latency-sensitive use cases.
