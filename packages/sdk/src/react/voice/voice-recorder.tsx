/**
 * VoiceRecorder
 *
 * Drop-in microphone recorder + transcriber for the Cencori Voice API. Records
 * from the mic, uploads to the transcriptions endpoint, and returns the text.
 * Zero external state — safe to embed in a customer's own product.
 *
 * Usage:
 *   <VoiceRecorder
 *       endpoint="https://api.cencori.com/api/ai/audio/transcriptions"
 *       apiKey={process.env.NEXT_PUBLIC_CENCORI_KEY}
 *       model="nova-3"
 *       onTranscript={(text) => console.log(text)}
 *   />
 *
 * Deps: react, lucide-react, tailwindcss.
 */

'use client';

import { useCallback, useState } from 'react';
import { AlertCircle, Loader2, Mic, Square } from 'lucide-react';
import { useVoiceRecorder } from './use-voice-recorder';

export interface VoiceTranscript {
    text: string;
    language?: string;
    duration?: number;
    provider?: string;
    model?: string;
    segments?: Array<{ start: number; end: number; text: string; speaker?: string }>;
}

export interface VoiceRecorderProps {
    /** Transcriptions endpoint. Defaults to same-origin `/api/ai/audio/transcriptions`. */
    endpoint?: string;
    /** Cencori API key. Sent as `Authorization: Bearer`. */
    apiKey?: string;
    /** Transcription model — provider is inferred from it. Default: `whisper-1`. */
    model?: string;
    /** Language hint (e.g. `en`, `yo`, `ha`, `ig`). */
    language?: string;
    /** Request speaker labels (use a diarization-capable model). */
    diarize?: boolean;
    /** Called with the final transcript text. */
    onTranscript?: (text: string, full: VoiceTranscript) => void;
    /** Called on error (before the built-in banner renders it). */
    onError?: (error: { code: string; message: string }) => void;
    /** Additional request headers to forward (in addition to Authorization). */
    headers?: Record<string, string>;
    /** Extra classes on the root element. */
    className?: string;
}

function joinClasses(...parts: Array<string | undefined | false>): string {
    return parts.filter(Boolean).join(' ');
}

function formatClock(total: number): string {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

export function VoiceRecorder({
    endpoint = '/api/ai/audio/transcriptions',
    apiKey,
    model = 'whisper-1',
    language,
    diarize = false,
    onTranscript,
    onError,
    headers,
    className,
}: VoiceRecorderProps) {
    const rec = useVoiceRecorder();
    const [uploading, setUploading] = useState(false);
    const [transcript, setTranscript] = useState<VoiceTranscript | null>(null);
    const [error, setError] = useState<{ code: string; message: string } | null>(null);

    const transcribe = useCallback(async (blob: Blob) => {
        setUploading(true);
        setError(null);
        try {
            const form = new FormData();
            const ext = (blob.type.split('/')[1] || 'webm').split(';')[0];
            form.append('file', blob, `recording.${ext}`);
            form.append('model', model);
            form.append('response_format', diarize ? 'verbose_json' : 'json');
            if (language) form.append('language', language);
            if (diarize) form.append('diarize', 'true');

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}), ...headers },
                body: form,
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const err = {
                    code: typeof data.error === 'string' ? data.error : 'request_failed',
                    message: typeof data.message === 'string' ? data.message : `Transcription failed (${res.status})`,
                };
                setError(err);
                onError?.(err);
                return;
            }
            const full = data as VoiceTranscript;
            setTranscript(full);
            onTranscript?.(full.text ?? '', full);
        } catch (e) {
            const err = { code: 'network_error', message: e instanceof Error ? e.message : 'Network error' };
            setError(err);
            onError?.(err);
        } finally {
            setUploading(false);
        }
    }, [endpoint, apiKey, model, language, diarize, headers, onTranscript, onError]);

    const toggle = useCallback(async () => {
        if (rec.state === 'recording') {
            const blob = await rec.stop();
            if (blob) await transcribe(blob);
        } else {
            setTranscript(null);
            await rec.start();
        }
    }, [rec, transcribe]);

    const recording = rec.state === 'recording';
    const busy = rec.state === 'requesting' || uploading;
    const activeError = error || (rec.error ? { code: 'mic_error', message: rec.error } : null);

    return (
        <div className={joinClasses('cencori-voice-recorder', className)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                    type="button"
                    onClick={toggle}
                    disabled={busy}
                    aria-label={recording ? 'Stop recording' : 'Start recording'}
                    className={joinClasses('cencori-voice-btn', recording && 'is-recording')}
                    style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 56, height: 56, borderRadius: '9999px', border: 'none', cursor: busy ? 'default' : 'pointer',
                        background: recording ? '#dc2626' : '#111827', color: '#fff',
                        opacity: busy ? 0.6 : 1, transition: 'background 0.15s',
                    }}
                >
                    {busy ? <Loader2 size={22} className="animate-spin" /> : recording ? <Square size={20} /> : <Mic size={22} />}
                </button>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {recording ? formatClock(rec.seconds) : uploading ? 'Transcribing…' : 'Tap to record'}
                    </span>
                    {recording && (
                        <span style={{ fontSize: 12, color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '9999px', background: '#dc2626', display: 'inline-block' }} />
                            recording
                        </span>
                    )}
                </div>
            </div>

            {activeError && (
                <div role="alert" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: '#b91c1c', fontSize: 13 }}>
                    <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>{activeError.message}</span>
                </div>
            )}

            {transcript && (
                <div className="cencori-voice-result" style={{ fontSize: 14, lineHeight: 1.5 }}>
                    {transcript.segments && transcript.segments.some((s) => s.speaker)
                        ? transcript.segments.map((s, i) => (
                            <p key={i} style={{ margin: '4px 0' }}>
                                {s.speaker && <strong style={{ marginRight: 6 }}>{s.speaker}:</strong>}
                                {s.text}
                            </p>
                        ))
                        : <p style={{ margin: 0 }}>{transcript.text}</p>}
                </div>
            )}
        </div>
    );
}
