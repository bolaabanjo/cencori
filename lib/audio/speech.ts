/**
 * Text-to-Speech core.
 *
 * Shared speech generator with provider dispatch. Each provider has its own
 * notion of "model", "voice" and output format, so every provider gets a small
 * adapter that normalizes down to a single result: raw audio bytes + a content
 * type + the character count we bill on.
 *
 * The gateway concerns (input guard, pricing, logging, usage) stay in the route
 * — this lib is purely "give me audio for this provider/model/voice/format".
 *
 * Providers:
 *   - openai      tts-1 / tts-1-hd                     (named voices)
 *   - deepgram    aura-*-en                            (voice encoded in model)
 *   - cartesia    sonic-2 / sonic-*                    (voice = UUID id)
 *   - spitch      African languages (yo/ha/ig/en/am)  (named voices + language)
 *   - elevenlabs  eleven_* (voice = id)               (requires paid plan)
 */

import type { GatewayContext } from '@/lib/gateway-middleware';
import { decryptApiKey } from '@/lib/encryption';

export type TTSProvider = 'openai' | 'deepgram' | 'cartesia' | 'spitch' | 'elevenlabs';

export type ResponseFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';

export interface SpeechRequest {
    input: string;
    /** Provider is inferred from `model` when omitted (default: openai). */
    provider?: TTSProvider;
    model?: string;
    voice?: string;
    response_format?: ResponseFormat;
    speed?: number;
    /** Spitch only: ISO code (en/yo/ha/ig/am). Ignored by other providers. */
    language?: string;
}

export interface SpeechResult {
    audio: ArrayBuffer;
    contentType: string;
    provider: TTSProvider;
    model: string;
    voice: string;
    /** Billable unit count (characters of guarded input). */
    charCount: number;
}

/** Thrown for caller-fixable problems so the route can map to a 4xx. */
export class SpeechRequestError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly status: number = 400,
    ) {
        super(message);
        this.name = 'SpeechRequestError';
    }
}

export const MAX_INPUT_CHARS = 4096;

const CONTENT_TYPES: Record<ResponseFormat, string> = {
    mp3: 'audio/mpeg',
    opus: 'audio/opus',
    aac: 'audio/aac',
    flac: 'audio/flac',
    wav: 'audio/wav',
    pcm: 'audio/pcm',
};

// ── Model / voice registry ──────────────────────────────────────
//
// One entry per selectable model. `voices` is the closed set we validate
// against; `defaultVoice` is used when the caller omits `voice`. Deepgram
// encodes the voice in the model name, so its "voices" list is empty and the
// model itself carries the selection.

interface ModelInfo {
    provider: TTSProvider;
    description: string;
    voices: string[];
    defaultVoice: string;
    formats: ResponseFormat[];
}

export const VOICE_MODELS: Record<string, ModelInfo> = {
    // OpenAI
    'tts-1': {
        provider: 'openai',
        description: 'OpenAI standard, low latency',
        voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
        defaultVoice: 'alloy',
        formats: ['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'],
    },
    'tts-1-hd': {
        provider: 'openai',
        description: 'OpenAI HD, higher quality',
        voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
        defaultVoice: 'alloy',
        formats: ['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'],
    },
    // Deepgram Aura — voice is baked into the model id
    'aura-asteria-en': { provider: 'deepgram', description: 'Deepgram Aura — Asteria (feminine, US)', voices: [], defaultVoice: 'aura-asteria-en', formats: ['mp3', 'wav'] },
    'aura-luna-en': { provider: 'deepgram', description: 'Deepgram Aura — Luna (feminine, US)', voices: [], defaultVoice: 'aura-luna-en', formats: ['mp3', 'wav'] },
    'aura-stella-en': { provider: 'deepgram', description: 'Deepgram Aura — Stella (feminine, US)', voices: [], defaultVoice: 'aura-stella-en', formats: ['mp3', 'wav'] },
    'aura-orion-en': { provider: 'deepgram', description: 'Deepgram Aura — Orion (masculine, US)', voices: [], defaultVoice: 'aura-orion-en', formats: ['mp3', 'wav'] },
    'aura-arcas-en': { provider: 'deepgram', description: 'Deepgram Aura — Arcas (masculine, US)', voices: [], defaultVoice: 'aura-arcas-en', formats: ['mp3', 'wav'] },
    // Cartesia Sonic — voice is a UUID id
    'sonic-2': {
        provider: 'cartesia',
        description: 'Cartesia Sonic 2, sub-100ms',
        voices: [],
        defaultVoice: 'a0e99841-438c-4a64-b679-ae501e7d6091', // Barbershop Man (public)
        formats: ['mp3', 'wav', 'pcm'],
    },
    'sonic-english': {
        provider: 'cartesia',
        description: 'Cartesia Sonic (English)',
        voices: [],
        defaultVoice: 'a0e99841-438c-4a64-b679-ae501e7d6091',
        formats: ['mp3', 'wav', 'pcm'],
    },
    // Spitch — African languages
    'spitch-tts': {
        provider: 'spitch',
        description: 'Spitch — Yoruba, Hausa, Igbo, English, Amharic',
        voices: ['sade', 'funmi', 'segun', 'femi', 'amara', 'amina', 'aliyu', 'hasan', 'ngozi', 'obinna', 'henry', 'kani'],
        defaultVoice: 'sade',
        formats: ['mp3'],
    },
    // ElevenLabs — requires a paid plan to synthesize via API
    'eleven_turbo_v2_5': { provider: 'elevenlabs', description: 'ElevenLabs Turbo v2.5', voices: [], defaultVoice: '21m00Tcm4TlvDq8ikWAM', formats: ['mp3'] },
    'eleven_flash_v2_5': { provider: 'elevenlabs', description: 'ElevenLabs Flash v2.5', voices: [], defaultVoice: '21m00Tcm4TlvDq8ikWAM', formats: ['mp3'] },
    'eleven_multilingual_v2': { provider: 'elevenlabs', description: 'ElevenLabs Multilingual v2', voices: [], defaultVoice: '21m00Tcm4TlvDq8ikWAM', formats: ['mp3'] },
};

/**
 * Resolve and validate the provider + model for a request without doing any
 * synthesis. Lets the route fetch pricing *before* the billable provider call,
 * so a missing pricing row fails closed instead of charging for dropped audio.
 */
export function resolveProviderModel(req: Pick<SpeechRequest, 'provider' | 'model'>): {
    provider: TTSProvider;
    model: string;
} {
    const model = req.model ?? 'tts-1';
    const info = VOICE_MODELS[model];
    if (!info) {
        throw new SpeechRequestError('bad_request', `Unsupported speech model: ${model}`);
    }
    const provider = req.provider ?? info.provider;
    if (provider !== info.provider) {
        throw new SpeechRequestError('bad_request', `Model ${model} belongs to provider ${info.provider}, not ${provider}`);
    }
    return { provider, model };
}

export function listVoiceModels() {
    return Object.entries(VOICE_MODELS).map(([id, info]) => ({
        id,
        provider: info.provider,
        description: info.description,
        voices: info.voices,
        formats: info.formats,
    }));
}

// ── Provider key resolution ─────────────────────────────────────

const ENV_KEYS: Record<TTSProvider, string | undefined> = {
    openai: process.env.OPENAI_API_KEY,
    deepgram: process.env.DEEPGRAM_API_KEY,
    cartesia: process.env.CARTESIA_API_KEY,
    spitch: process.env.SPITCH_API_KEY,
    elevenlabs: process.env.ELEVENLABS_API_KEY,
};

async function getProviderKey(ctx: GatewayContext, provider: TTSProvider): Promise<string | null> {
    const { data: providerKey } = await ctx.supabase
        .from('provider_keys')
        .select('encrypted_key, is_active')
        .eq('project_id', ctx.projectId)
        .eq('provider', provider)
        .eq('is_active', true)
        .maybeSingle();

    if (providerKey?.encrypted_key) {
        return decryptApiKey(providerKey.encrypted_key, ctx.organizationId);
    }
    return ENV_KEYS[provider] ?? null;
}

// ── Public entry point ──────────────────────────────────────────

export async function generateSpeech(ctx: GatewayContext, req: SpeechRequest): Promise<SpeechResult> {
    const input = typeof req.input === 'string' ? req.input : '';
    if (!input.trim()) {
        throw new SpeechRequestError('bad_request', 'Input text is required');
    }
    if (input.length > MAX_INPUT_CHARS) {
        throw new SpeechRequestError('bad_request', `Input text exceeds maximum length of ${MAX_INPUT_CHARS} characters`);
    }

    const model = req.model ?? 'tts-1';
    const info = VOICE_MODELS[model];
    if (!info) {
        throw new SpeechRequestError('bad_request', `Unsupported speech model: ${model}`);
    }

    // Provider is inferred from the model, but if the caller passed one it must agree.
    const provider = req.provider ?? info.provider;
    if (provider !== info.provider) {
        throw new SpeechRequestError('bad_request', `Model ${model} belongs to provider ${info.provider}, not ${provider}`);
    }

    const response_format = req.response_format ?? 'mp3';
    if (!info.formats.includes(response_format)) {
        throw new SpeechRequestError(
            'bad_request',
            `${provider} model ${model} does not support format ${response_format} (supported: ${info.formats.join(', ')})`,
        );
    }

    const voice = req.voice ?? info.defaultVoice;
    if (info.voices.length > 0 && !info.voices.includes(voice)) {
        throw new SpeechRequestError('bad_request', `Unsupported voice ${voice} for ${model} (supported: ${info.voices.join(', ')})`);
    }

    const speed = req.speed ?? 1.0;
    if (typeof speed !== 'number' || !Number.isFinite(speed) || speed < 0.25 || speed > 4) {
        throw new SpeechRequestError('bad_request', 'speed must be between 0.25 and 4');
    }

    const apiKey = await getProviderKey(ctx, provider);
    if (!apiKey) {
        throw new SpeechRequestError('provider_not_configured', `No ${provider} API key configured`, 400);
    }

    const params = { input, model, voice, response_format, speed, language: req.language };
    let audio: ArrayBuffer;
    switch (provider) {
        case 'openai':
            audio = await synthOpenAI(apiKey, params);
            break;
        case 'deepgram':
            audio = await synthDeepgram(apiKey, params);
            break;
        case 'cartesia':
            audio = await synthCartesia(apiKey, params);
            break;
        case 'spitch':
            audio = await synthSpitch(apiKey, params);
            break;
        case 'elevenlabs':
            audio = await synthElevenLabs(apiKey, params);
            break;
        default:
            throw new SpeechRequestError('bad_request', `Unsupported provider: ${provider}`);
    }

    return {
        audio,
        contentType: CONTENT_TYPES[response_format],
        provider,
        model,
        voice,
        charCount: input.length,
    };
}

// ── Provider adapters ───────────────────────────────────────────

interface SynthParams {
    input: string;
    model: string;
    voice: string;
    response_format: ResponseFormat;
    speed: number;
    language?: string;
}

const PROVIDER_TIMEOUT_MS = 55_000;

/** Read an upstream error body without letting a huge payload through. */
async function upstreamError(provider: TTSProvider, res: Response): Promise<never> {
    let detail = '';
    try {
        detail = (await res.text()).slice(0, 500);
    } catch {
        // ignore
    }
    // 4xx from the provider is usually a caller/config problem (bad voice, plan
    // limits); surface as 400. 5xx is the provider's fault → 502.
    const status = res.status >= 400 && res.status < 500 ? 400 : 502;
    throw new SpeechRequestError(
        'provider_error',
        `${provider} TTS failed (${res.status})${detail ? `: ${detail}` : ''}`,
        status,
    );
}

async function synthOpenAI(apiKey: string, p: SynthParams): Promise<ArrayBuffer> {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: p.model,
            input: p.input,
            voice: p.voice,
            response_format: p.response_format,
            speed: p.speed,
        }),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!res.ok) return upstreamError('openai', res);
    return res.arrayBuffer();
}

async function synthDeepgram(apiKey: string, p: SynthParams): Promise<ArrayBuffer> {
    // Deepgram encodes the voice in the model id; format is a query param.
    // mp3 is the default container; wav → linear16 PCM in a wav container.
    const query = new URLSearchParams({ model: p.model });
    if (p.response_format === 'wav') {
        query.set('encoding', 'linear16');
        query.set('container', 'wav');
        query.set('sample_rate', '24000');
    } else {
        query.set('encoding', 'mp3');
    }
    const res = await fetch(`https://api.deepgram.com/v1/speak?${query.toString()}`, {
        method: 'POST',
        headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: p.input }),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!res.ok) return upstreamError('deepgram', res);
    return res.arrayBuffer();
}

async function synthCartesia(apiKey: string, p: SynthParams): Promise<ArrayBuffer> {
    const output_format =
        p.response_format === 'wav'
            ? { container: 'wav', encoding: 'pcm_s16le', sample_rate: 44100 }
            : p.response_format === 'pcm'
                ? { container: 'raw', encoding: 'pcm_s16le', sample_rate: 44100 }
                : { container: 'mp3', encoding: 'mp3', sample_rate: 44100 };
    const res = await fetch('https://api.cartesia.ai/tts/bytes', {
        method: 'POST',
        headers: {
            'X-API-Key': apiKey,
            'Cartesia-Version': '2024-06-10',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model_id: p.model,
            transcript: p.input,
            voice: { mode: 'id', id: p.voice },
            output_format,
        }),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!res.ok) return upstreamError('cartesia', res);
    return res.arrayBuffer();
}

async function synthSpitch(apiKey: string, p: SynthParams): Promise<ArrayBuffer> {
    const res = await fetch('https://api.spi-tch.com/v1/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            text: p.input,
            language: p.language ?? 'en',
            voice: p.voice,
        }),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!res.ok) return upstreamError('spitch', res);
    return res.arrayBuffer();
}

async function synthElevenLabs(apiKey: string, p: SynthParams): Promise<ArrayBuffer> {
    // Voice id is carried in `voice`; the model id is the ElevenLabs model.
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(p.voice)}`, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: p.input, model_id: p.model }),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!res.ok) return upstreamError('elevenlabs', res);
    return res.arrayBuffer();
}
