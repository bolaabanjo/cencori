/**
 * SpeakButton
 *
 * Drop-in text-to-speech button for the Cencori Voice API. Synthesizes the
 * given text and plays it back, with loading/playing/error states. Zero
 * external state — safe to embed in a customer's own product.
 *
 * Usage:
 *   <SpeakButton
 *       endpoint="https://api.cencori.com/api/ai/audio/speech"
 *       apiKey={process.env.NEXT_PUBLIC_CENCORI_KEY}
 *       text="Hello from Cencori."
 *       model="aura-asteria-en"
 *   />
 *
 * Deps: react, lucide-react.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, Pause, Volume2 } from 'lucide-react';

export interface SpeakButtonProps {
    /** Text to synthesize. */
    text: string;
    /** Speech endpoint. Defaults to same-origin `/api/ai/audio/speech`. */
    endpoint?: string;
    /** Cencori API key. Sent as `Authorization: Bearer`. */
    apiKey?: string;
    /** TTS model — provider is inferred from it. Default: `tts-1`. */
    model?: string;
    /** Voice id/name. Provider-specific. */
    voice?: string;
    /** Language code (Spitch: `en`, `yo`, `ha`, `ig`, `am`). */
    language?: string;
    /** Button label. Default: "Listen". Pass null to render icon-only. */
    label?: string | null;
    /** Additional request headers to forward (in addition to Authorization). */
    headers?: Record<string, string>;
    onError?: (error: { code: string; message: string }) => void;
    className?: string;
}

function joinClasses(...parts: Array<string | undefined | false>): string {
    return parts.filter(Boolean).join(' ');
}

export function SpeakButton({
    text,
    endpoint = '/api/ai/audio/speech',
    apiKey,
    model = 'tts-1',
    voice,
    language,
    label = 'Listen',
    headers,
    onError,
    className,
}: SpeakButtonProps) {
    const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle');
    const [error, setError] = useState<{ code: string; message: string } | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const urlRef = useRef<string | null>(null);

    const cleanup = useCallback(() => {
        if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
        if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    }, []);

    // Revoke the object URL / stop audio on unmount.
    useEffect(() => cleanup, [cleanup]);

    const play = useCallback(async () => {
        // Toggle off if already playing.
        if (state === 'playing') { cleanup(); setState('idle'); return; }
        if (!text.trim()) return;

        setState('loading');
        setError(null);
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
                    ...headers,
                },
                body: JSON.stringify({ input: text, model, voice, language }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                const err = {
                    code: typeof data.error === 'string' ? data.error : 'request_failed',
                    message: typeof data.message === 'string' ? data.message : `Speech failed (${res.status})`,
                };
                setError(err);
                onError?.(err);
                setState('idle');
                return;
            }
            const blob = await res.blob();
            cleanup();
            const url = URL.createObjectURL(blob);
            urlRef.current = url;
            const audio = new Audio(url);
            audioRef.current = audio;
            audio.onended = () => { setState('idle'); cleanup(); };
            audio.onerror = () => { setState('idle'); cleanup(); };
            await audio.play();
            setState('playing');
        } catch (e) {
            const err = { code: 'network_error', message: e instanceof Error ? e.message : 'Network error' };
            setError(err);
            onError?.(err);
            setState('idle');
        }
    }, [state, text, endpoint, apiKey, model, voice, language, headers, onError, cleanup]);

    return (
        <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
            <button
                type="button"
                onClick={play}
                disabled={state === 'loading' || !text.trim()}
                aria-label={label ?? (state === 'playing' ? 'Pause' : 'Listen')}
                className={joinClasses('cencori-speak-btn', className)}
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: label ? '6px 12px' : 8, borderRadius: 8, border: '1px solid #e5e7eb',
                    background: '#fff', color: '#111827', cursor: state === 'loading' ? 'default' : 'pointer',
                    fontSize: 14, fontWeight: 500,
                }}
            >
                {state === 'loading'
                    ? <Loader2 size={16} className="animate-spin" />
                    : state === 'playing'
                        ? <Pause size={16} />
                        : <Volume2 size={16} />}
                {label && <span>{label}</span>}
            </button>
            {error && (
                <span role="alert" style={{ display: 'inline-flex', gap: 4, alignItems: 'center', color: '#b91c1c', fontSize: 12 }}>
                    <AlertCircle size={13} />{error.message}
                </span>
            )}
        </span>
    );
}
