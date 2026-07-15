/**
 * Voice API — text-to-speech and speech-to-text across providers.
 *
 * @example
 *   // TTS — synthesize speech (default provider: OpenAI)
 *   const { audio, contentType } = await cencori.voice.speak({
 *       input: 'Hello from Cencori.',
 *       model: 'aura-asteria-en', // Deepgram; provider inferred from model
 *   });
 *   await fs.writeFile('hello.mp3', Buffer.from(audio));
 *
 * @example
 *   // STT — transcribe audio
 *   const { text } = await cencori.voice.transcribe({
 *       audio: fileBytes,
 *       model: 'nova-3', // Deepgram
 *   });
 *
 * @example
 *   // STT with speaker labels
 *   const { segments } = await cencori.voice.diarize({
 *       audio: fileBytes,
 *       model: 'assemblyai-universal',
 *   });
 */

import type { CencoriConfig } from '../types';

export type TTSProvider = 'openai' | 'deepgram' | 'cartesia' | 'spitch' | 'elevenlabs';
export type STTProvider = 'openai' | 'deepgram' | 'assemblyai' | 'spitch';

export type AudioFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
export type TranscriptFormat = 'json' | 'text' | 'srt' | 'vtt' | 'verbose_json';

/** Any audio payload the runtime can turn into bytes for upload. */
export type AudioInput = Blob | ArrayBuffer | ArrayBufferView | Uint8Array;

export interface SpeakRequest {
    /** Text to synthesize (max 4096 characters). */
    input: string;
    /** Model id — provider is inferred from it. Default: `tts-1` (OpenAI). */
    model?: string;
    /** Voice id/name. Provider-specific; falls back to the model's default. */
    voice?: string;
    /** Explicit provider. Optional — usually inferred from `model`. */
    provider?: TTSProvider;
    responseFormat?: AudioFormat;
    /** Playback speed, 0.25–4.0 (OpenAI only). */
    speed?: number;
    /** Language code (Spitch: e.g. `en`, `yo`, `ha`, `ig`, `am`). */
    language?: string;
}

export interface SpeakResult {
    /** Raw audio bytes. Wrap in `Buffer.from(audio)` or a `Blob` to use. */
    audio: ArrayBuffer;
    contentType: string;
    provider: string;
    requestId?: string;
}

export interface TranscribeRequest {
    /** Audio bytes to transcribe (max 25MB). */
    audio: AudioInput;
    /** Filename hint used for format detection. Default: `audio.mp3`. */
    filename?: string;
    /** Model id — provider is inferred from it. Default: `whisper-1` (OpenAI). */
    model?: string;
    /** Explicit provider. Optional — usually inferred from `model`. */
    provider?: STTProvider;
    /** Language hint (Spitch uses it as the target language). */
    language?: string;
    /** Optional context prompt (OpenAI only). */
    prompt?: string;
    temperature?: number;
    /** Request speaker labels where the provider supports it. */
    diarize?: boolean;
    /** Response shape. Default: `json`. */
    responseFormat?: TranscriptFormat;
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

export interface TranscribeResult {
    text: string;
    language?: string;
    duration?: number;
    provider?: string;
    model?: string;
    segments?: TranscriptSegment[];
    words?: TranscriptWord[];
}

export interface VoiceModelInfo {
    id: string;
    provider: string;
    description?: string;
}

function toBlob(input: AudioInput): Blob {
    if (typeof Blob !== 'undefined' && input instanceof Blob) return input;
    if (input instanceof ArrayBuffer) return new Blob([new Uint8Array(input)]);
    // ArrayBufferView (Buffer, Uint8Array, DataView, …). Copy into a fresh
    // ArrayBuffer-backed array so the result is always a valid BlobPart.
    const view = input as ArrayBufferView;
    const bytes = new Uint8Array(view.byteLength);
    bytes.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    return new Blob([bytes]);
}

export class VoiceNamespace {
    private config: Required<CencoriConfig>;

    constructor(config: Required<CencoriConfig>) {
        this.config = config;
    }

    /**
     * Text-to-speech. Returns raw audio bytes plus the resolved provider.
     * Provider is inferred from `model` (default `tts-1`); pass `provider`
     * only to be explicit.
     */
    async speak(request: SpeakRequest): Promise<SpeakResult> {
        if (!request.input || !request.input.trim()) {
            throw new Error('voice.speak requires non-empty `input`');
        }
        const body = {
            input: request.input,
            model: request.model,
            voice: request.voice,
            provider: request.provider,
            response_format: request.responseFormat,
            speed: request.speed,
            language: request.language,
        };
        const response = await fetch(`${this.config.baseUrl}/api/ai/audio/speech`, {
            method: 'POST',
            headers: {
                'CENCORI_API_KEY': this.config.apiKey,
                'Content-Type': 'application/json',
                ...this.config.headers,
            },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            throw await this.error(response, 'voice.speak');
        }
        return {
            audio: await response.arrayBuffer(),
            contentType: response.headers.get('content-type') ?? 'application/octet-stream',
            provider: response.headers.get('x-provider') ?? request.provider ?? 'openai',
            requestId: response.headers.get('x-request-id') ?? undefined,
        };
    }

    /**
     * Speech-to-text. Provider is inferred from `model` (default `whisper-1`).
     * For `text`/`srt`/`vtt` formats the transcript is returned in `text`.
     */
    async transcribe(request: TranscribeRequest): Promise<TranscribeResult> {
        if (!request.audio) {
            throw new Error('voice.transcribe requires `audio`');
        }
        const form = new FormData();
        form.append('file', toBlob(request.audio), request.filename ?? 'audio.mp3');
        if (request.model) form.append('model', request.model);
        if (request.provider) form.append('provider', request.provider);
        if (request.language) form.append('language', request.language);
        if (request.prompt) form.append('prompt', request.prompt);
        if (typeof request.temperature === 'number') form.append('temperature', String(request.temperature));
        if (request.diarize) form.append('diarize', 'true');
        form.append('response_format', request.responseFormat ?? 'json');

        const response = await fetch(`${this.config.baseUrl}/api/ai/audio/transcriptions`, {
            method: 'POST',
            headers: {
                'CENCORI_API_KEY': this.config.apiKey,
                ...this.config.headers,
            },
            body: form,
        });
        if (!response.ok) {
            throw await this.error(response, 'voice.transcribe');
        }
        // Text formats come back as plain text, not JSON.
        const format = request.responseFormat;
        if (format === 'text' || format === 'srt' || format === 'vtt') {
            return { text: await response.text(), provider: response.headers.get('x-provider') ?? undefined };
        }
        return (await response.json()) as TranscribeResult;
    }

    /**
     * Speech-to-text with speaker labels. Convenience wrapper over
     * `transcribe` that enables diarization and returns verbose segments.
     * Use a diarization-capable model (`nova-3`, `assemblyai-universal`).
     */
    async diarize(request: Omit<TranscribeRequest, 'diarize' | 'responseFormat'>): Promise<TranscribeResult> {
        return this.transcribe({ ...request, diarize: true, responseFormat: 'verbose_json' });
    }

    /** List the available voice models (TTS + STT) with their providers. */
    async listModels(): Promise<{ tts: VoiceModelInfo[]; stt: VoiceModelInfo[] }> {
        const [ttsRes, sttRes] = await Promise.all([
            fetch(`${this.config.baseUrl}/api/ai/audio/speech`, { headers: this.config.headers }),
            fetch(`${this.config.baseUrl}/api/ai/audio/transcriptions`, { headers: this.config.headers }),
        ]);
        const tts = ttsRes.ok ? (await ttsRes.json()).models ?? [] : [];
        const stt = sttRes.ok ? (await sttRes.json()).models ?? [] : [];
        return { tts, stt };
    }

    private async error(response: Response, op: string): Promise<Error> {
        const data = await response.json().catch(() => ({}));
        const message =
            (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string')
                ? data.message
                : `${op} failed with status ${response.status}`;
        const code =
            (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string')
                ? data.error
                : 'request_failed';
        const err = new Error(message) as Error & { code?: string; details?: unknown };
        err.code = code;
        err.details = data;
        return err;
    }
}
