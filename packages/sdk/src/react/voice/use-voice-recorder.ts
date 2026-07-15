/**
 * useVoiceRecorder
 *
 * Minimal microphone-recording hook built on the MediaRecorder API. Handles
 * permission, start/stop, elapsed time, and returns the recorded audio as a
 * Blob. No external state — safe to use inside a customer's own components.
 *
 * Usage:
 *   const rec = useVoiceRecorder();
 *   rec.start();            // prompts for mic permission
 *   const blob = await rec.stop();  // resolves with the recorded audio
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'stopped' | 'error';

export interface UseVoiceRecorderResult {
    state: RecorderState;
    /** Seconds elapsed in the current/last recording. */
    seconds: number;
    /** MediaRecorder mime type in use once recording starts. */
    mimeType: string | null;
    error: string | null;
    /** The most recent recording, available after stop(). */
    blob: Blob | null;
    start: () => Promise<void>;
    /** Stop and resolve with the recorded Blob (also set on `blob`). */
    stop: () => Promise<Blob | null>;
    /** Discard the current recording and reset to idle. */
    reset: () => void;
}

/** Pick the first mime type the browser can actually record. */
function pickMimeType(): string | undefined {
    if (typeof MediaRecorder === 'undefined') return undefined;
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

export function useVoiceRecorder(): UseVoiceRecorderResult {
    const [state, setState] = useState<RecorderState>('idle');
    const [seconds, setSeconds] = useState(0);
    const [mimeType, setMimeType] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [blob, setBlob] = useState<Blob | null>(null);

    const recorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const cleanupStream = useCallback(() => {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
    }, []);

    // Stop everything if the component unmounts mid-recording.
    useEffect(() => cleanupStream, [cleanupStream]);

    const start = useCallback(async () => {
        setError(null);
        setBlob(null);
        setSeconds(0);
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            setState('error');
            setError('Microphone recording is not supported in this browser.');
            return;
        }
        try {
            setState('requesting');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const type = pickMimeType();
            const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
            chunksRef.current = [];
            recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
            recorder.start();
            recorderRef.current = recorder;
            setMimeType(recorder.mimeType || type || 'audio/webm');
            setState('recording');
            timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
        } catch (e) {
            cleanupStream();
            setState('error');
            setError(e instanceof Error ? e.message : 'Could not access the microphone.');
        }
    }, [cleanupStream]);

    const stop = useCallback((): Promise<Blob | null> => {
        const recorder = recorderRef.current;
        if (!recorder || recorder.state === 'inactive') {
            return Promise.resolve(null);
        }
        return new Promise((resolve) => {
            recorder.onstop = () => {
                const type = recorder.mimeType || 'audio/webm';
                const recorded = new Blob(chunksRef.current, { type });
                cleanupStream();
                recorderRef.current = null;
                setBlob(recorded);
                setState('stopped');
                resolve(recorded);
            };
            recorder.stop();
        });
    }, [cleanupStream]);

    const reset = useCallback(() => {
        cleanupStream();
        recorderRef.current = null;
        chunksRef.current = [];
        setBlob(null);
        setSeconds(0);
        setError(null);
        setState('idle');
    }, [cleanupStream]);

    return { state, seconds, mimeType, error, blob, start, stop, reset };
}
