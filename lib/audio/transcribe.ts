/**
 * Speech-to-Text core.
 *
 * Shared transcriber with provider dispatch. Each provider is normalized down
 * to one result: text + a billable audio duration + optional segments/words
 * (with speaker labels where the provider supports diarization).
 *
 * The gateway concerns (input guard, pricing, output guard, logging, usage)
 * stay in the route — this lib is purely "transcribe this audio with this
 * provider and give me a normalized result".
 *
 * Providers:
 *   - openai      whisper-1              verbose_json (duration + segments)
 *   - deepgram    nova-3                 metadata.duration + words + diarization
 *   - assemblyai  assemblyai-universal   async upload→create→poll + diarization
 *   - spitch      spitch-stt             African languages, sentence timestamps
 */

import type { GatewayContext } from '@/lib/gateway-middleware';
import { decryptApiKey } from '@/lib/encryption';

export type STTProvider = 'openai' | 'deepgram' | 'assemblyai' | 'spitch';

export interface TranscribeRequest {
    file: File;
    /** Provider is inferred from `model` when omitted (default: openai). */
    provider?: STTProvider;
    model?: string;
    /** ISO language hint. Spitch uses it as the target language. */
    language?: string;
    prompt?: string;
    temperature?: number;
    /** Request speaker labels where the provider supports it. */
    diarize?: boolean;
}

export interface TranscriptSegment {
    start: number;
    end: number;
    text: string;
    speaker?: string;
}

export interface TranscriptWord {
    start: number;
    end: number;
    word: string;
    speaker?: string;
}

export interface TranscriptionResult {
    text: string;
    /** Billable audio duration in seconds, always derived from provider data. */
    durationSeconds: number;
    language?: string;
    segments?: TranscriptSegment[];
    words?: TranscriptWord[];
    provider: STTProvider;
    model: string;
}

/** Thrown for caller-fixable problems so the route can map to a 4xx. */
export class TranscribeRequestError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly status: number = 400,
    ) {
        super(message);
        this.name = 'TranscribeRequestError';
    }
}

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25MB, matches the OpenAI limit

// ── Model registry ──────────────────────────────────────────────

interface ModelInfo {
    provider: STTProvider;
    description: string;
    diarization: boolean;
}

export const STT_MODELS: Record<string, ModelInfo> = {
    'whisper-1': { provider: 'openai', description: 'OpenAI Whisper', diarization: false },
    'nova-3': { provider: 'deepgram', description: 'Deepgram Nova-3 (fast, diarization)', diarization: true },
    'assemblyai-universal': { provider: 'assemblyai', description: 'AssemblyAI Universal (long-form, diarization)', diarization: true },
    'spitch-stt': { provider: 'spitch', description: 'Spitch STT — Yoruba, Hausa, Igbo, English, Amharic', diarization: false },
};

export function listTranscriptionModels() {
    return Object.entries(STT_MODELS).map(([id, info]) => ({
        id,
        provider: info.provider,
        description: info.description,
        diarization: info.diarization,
    }));
}

/**
 * Resolve and validate provider + model without transcribing, so the route can
 * fetch per-minute pricing before the billable provider call.
 */
export function resolveProviderModel(req: Pick<TranscribeRequest, 'provider' | 'model'>): {
    provider: STTProvider;
    model: string;
} {
    const model = req.model ?? 'whisper-1';
    const info = STT_MODELS[model];
    if (!info) {
        throw new TranscribeRequestError('bad_request', `Unsupported transcription model: ${model}`);
    }
    const provider = req.provider ?? info.provider;
    if (provider !== info.provider) {
        throw new TranscribeRequestError('bad_request', `Model ${model} belongs to provider ${info.provider}, not ${provider}`);
    }
    return { provider, model };
}

// ── Provider key resolution ─────────────────────────────────────

const ENV_KEYS: Record<STTProvider, string | undefined> = {
    openai: process.env.OPENAI_API_KEY,
    deepgram: process.env.DEEPGRAM_API_KEY,
    assemblyai: process.env.ASSEMBLYAI_API_KEY,
    spitch: process.env.SPITCH_API_KEY,
};

async function getProviderKey(ctx: GatewayContext, provider: STTProvider): Promise<string | null> {
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

export async function transcribeAudio(ctx: GatewayContext, req: TranscribeRequest): Promise<TranscriptionResult> {
    if (!req.file || typeof (req.file as File).arrayBuffer !== 'function') {
        throw new TranscribeRequestError('bad_request', 'Audio file is required');
    }
    if (req.file.size > MAX_AUDIO_BYTES) {
        throw new TranscribeRequestError('bad_request', 'File size exceeds maximum of 25MB');
    }

    const { provider, model } = resolveProviderModel(req);

    const apiKey = await getProviderKey(ctx, provider);
    if (!apiKey) {
        throw new TranscribeRequestError('provider_not_configured', `No ${provider} API key configured`, 400);
    }

    const diarize = req.diarize === true && STT_MODELS[model].diarization;

    let result: TranscriptionResult;
    switch (provider) {
        case 'openai':
            result = await transcribeOpenAI(apiKey, model, req);
            break;
        case 'deepgram':
            result = await transcribeDeepgram(apiKey, model, req, diarize);
            break;
        case 'assemblyai':
            result = await transcribeAssemblyAI(apiKey, model, req, diarize);
            break;
        case 'spitch':
            result = await transcribeSpitch(apiKey, model, req);
            break;
        default:
            throw new TranscribeRequestError('bad_request', `Unsupported provider: ${provider}`);
    }

    // Billing is fail-closed: without a real duration we cannot price the call.
    if (!Number.isFinite(result.durationSeconds) || result.durationSeconds <= 0) {
        throw new TranscribeRequestError('provider_error', `${provider} did not return a billable audio duration`, 502);
    }
    return result;
}

// ── Provider adapters ───────────────────────────────────────────

const PROVIDER_TIMEOUT_MS = 55_000;

const EXT_CONTENT_TYPES: Record<string, string> = {
    mp3: 'audio/mpeg', mpeg: 'audio/mpeg', mpga: 'audio/mpeg', m4a: 'audio/mp4',
    mp4: 'audio/mp4', wav: 'audio/wav', webm: 'audio/webm', ogg: 'audio/ogg', flac: 'audio/flac',
};

/**
 * A usable audio Content-Type for providers that need it in the request header
 * (Deepgram). Multipart uploads often arrive as application/octet-stream, so
 * fall back to the filename extension, then to audio/mpeg.
 */
function audioContentType(file: File): string {
    const type = (file.type || '').toLowerCase();
    if (type.startsWith('audio/')) return type;
    const ext = (file.name || '').toLowerCase().split('.').pop() ?? '';
    return EXT_CONTENT_TYPES[ext] ?? 'audio/mpeg';
}

async function upstreamError(provider: STTProvider, res: Response): Promise<never> {
    let detail = '';
    try {
        detail = (await res.text()).slice(0, 500);
    } catch {
        // ignore
    }
    const status = res.status >= 400 && res.status < 500 ? 400 : 502;
    throw new TranscribeRequestError(
        'provider_error',
        `${provider} transcription failed (${res.status})${detail ? `: ${detail}` : ''}`,
        status,
    );
}

interface WhisperVerbose {
    text?: string;
    duration?: number;
    language?: string;
    segments?: Array<{ start?: number; end?: number; text?: string }>;
}

async function transcribeOpenAI(apiKey: string, model: string, req: TranscribeRequest): Promise<TranscriptionResult> {
    const form = new FormData();
    form.append('file', req.file);
    form.append('model', model);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');
    if (req.language) form.append('language', req.language);
    if (req.prompt) form.append('prompt', req.prompt);
    if (typeof req.temperature === 'number') form.append('temperature', String(req.temperature));

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!res.ok) return upstreamError('openai', res);
    const data = (await res.json()) as WhisperVerbose;

    const segments = (data.segments || []).map((s) => ({
        start: Number(s.start || 0),
        end: Number(s.end || s.start || 0),
        text: (s.text || '').trim(),
    }));
    const duration = Number(data.duration) || segments.at(-1)?.end || 0;
    return {
        text: data.text || '',
        durationSeconds: duration,
        language: data.language,
        segments: segments.length ? segments : undefined,
        provider: 'openai',
        model,
    };
}

async function transcribeDeepgram(apiKey: string, model: string, req: TranscribeRequest, diarize: boolean): Promise<TranscriptionResult> {
    const query = new URLSearchParams({ model, smart_format: 'true', punctuate: 'true', utterances: 'true' });
    if (diarize) query.set('diarize', 'true');
    if (req.language) query.set('language', req.language);

    const res = await fetch(`https://api.deepgram.com/v1/listen?${query.toString()}`, {
        method: 'POST',
        headers: { Authorization: `Token ${apiKey}`, 'Content-Type': audioContentType(req.file) },
        body: await req.file.arrayBuffer(),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!res.ok) return upstreamError('deepgram', res);
    const data = await res.json();

    const alt = data?.results?.channels?.[0]?.alternatives?.[0] ?? {};
    const words: TranscriptWord[] = (alt.words || []).map((w: Record<string, unknown>) => ({
        start: Number(w.start || 0),
        end: Number(w.end || 0),
        word: String(w.punctuated_word ?? w.word ?? ''),
        speaker: w.speaker !== undefined ? `speaker_${w.speaker}` : undefined,
    }));
    const utterances = data?.results?.utterances;
    const segments: TranscriptSegment[] | undefined = Array.isArray(utterances)
        ? utterances.map((u: Record<string, unknown>) => ({
            start: Number(u.start || 0),
            end: Number(u.end || 0),
            text: String(u.transcript ?? '').trim(),
            speaker: u.speaker !== undefined ? `speaker_${u.speaker}` : undefined,
        }))
        : undefined;

    return {
        text: alt.transcript || '',
        durationSeconds: Number(data?.metadata?.duration) || 0,
        language: req.language,
        segments,
        words: words.length ? words : undefined,
        provider: 'deepgram',
        model,
    };
}

async function transcribeAssemblyAI(apiKey: string, model: string, req: TranscribeRequest, diarize: boolean): Promise<TranscriptionResult> {
    const headers = { Authorization: apiKey };
    // 1) upload the raw bytes
    const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/octet-stream' },
        body: await req.file.arrayBuffer(),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!uploadRes.ok) return upstreamError('assemblyai', uploadRes);
    const { upload_url } = await uploadRes.json();

    // 2) create the transcript job
    const createRes = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            audio_url: upload_url,
            speaker_labels: diarize,
            language_code: req.language || undefined,
        }),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!createRes.ok) return upstreamError('assemblyai', createRes);
    const created = await createRes.json();
    const id = created.id as string;

    // 3) poll until complete, staying within the overall request budget
    const deadline = Date.now() + PROVIDER_TIMEOUT_MS;
    let data = created;
    while (data.status !== 'completed' && data.status !== 'error') {
        if (Date.now() > deadline) {
            throw new TranscribeRequestError('provider_timeout', 'assemblyai transcription timed out', 504);
        }
        await new Promise((r) => setTimeout(r, 1500));
        const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, { headers });
        if (!pollRes.ok) return upstreamError('assemblyai', pollRes);
        data = await pollRes.json();
    }
    if (data.status === 'error') {
        throw new TranscribeRequestError('provider_error', `assemblyai transcription failed: ${data.error ?? 'unknown error'}`, 502);
    }

    const words: TranscriptWord[] = (data.words || []).map((w: Record<string, unknown>) => ({
        start: Number(w.start || 0) / 1000, // AssemblyAI reports milliseconds
        end: Number(w.end || 0) / 1000,
        word: String(w.text ?? ''),
        speaker: w.speaker !== undefined && w.speaker !== null ? `speaker_${w.speaker}` : undefined,
    }));
    const segments: TranscriptSegment[] | undefined = Array.isArray(data.utterances)
        ? data.utterances.map((u: Record<string, unknown>) => ({
            start: Number(u.start || 0) / 1000,
            end: Number(u.end || 0) / 1000,
            text: String(u.text ?? '').trim(),
            speaker: u.speaker !== undefined && u.speaker !== null ? `speaker_${u.speaker}` : undefined,
        }))
        : undefined;

    return {
        text: data.text || '',
        durationSeconds: Number(data.audio_duration) || 0,
        language: data.language_code,
        segments,
        words: words.length ? words : undefined,
        provider: 'assemblyai',
        model,
    };
}

async function transcribeSpitch(apiKey: string, model: string, req: TranscribeRequest): Promise<TranscriptionResult> {
    const form = new FormData();
    form.append('language', req.language || 'en');
    form.append('timestamp', 'sentence'); // needed to derive a billable duration
    form.append('content', req.file);

    const res = await fetch('https://api.spi-tch.com/v1/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!res.ok) return upstreamError('spitch', res);
    const data = await res.json();

    const rawSegments = Array.isArray(data.segments) ? data.segments : (Array.isArray(data.timestamps) ? data.timestamps : []);
    const segments: TranscriptSegment[] = rawSegments.map((s: Record<string, unknown>) => ({
        start: Number(s.start || 0),
        end: Number(s.end || s.start || 0),
        text: String(s.text ?? '').trim(),
    }));

    return {
        text: data.text || '',
        durationSeconds: segments.at(-1)?.end || 0,
        language: data.detected_language || req.language,
        segments: segments.length ? segments : undefined,
        provider: 'spitch',
        model,
    };
}
