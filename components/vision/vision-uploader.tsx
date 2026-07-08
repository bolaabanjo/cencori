/**
 * VisionUploader
 *
 * Drop-in image uploader for the Cencori Vision API. Handles drag-drop,
 * client-side format + size validation, and calls the endpoint via
 * multipart/form-data. Renders clear error messages and a supported-formats
 * banner. Zero external state — safe to embed in a customer's own product.
 *
 * Usage:
 *   <VisionUploader
 *       endpoint="https://api.cencori.com/api/ai/vision"
 *       apiKey={process.env.NEXT_PUBLIC_CENCORI_KEY}
 *       task="describe"
 *       onResult={(result) => console.log(result)}
 *   />
 *
 * Deps: react, lucide-react, tailwindcss.
 */

'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { AlertCircle, Loader2, Upload, X } from 'lucide-react';
import { VisionFormatBanner, type VisionProvider } from './vision-format-banner';
import { canDownscale, downscaleImage } from './downscale';

// ── Public types ────────────────────────────────────────────────

export type VisionTask = 'analyze' | 'describe' | 'ocr' | 'classify';

export interface VisionUploaderProps {
    /** Base Vision endpoint. Defaults to same-origin `/api/ai/vision`. */
    endpoint?: string;
    /** Cencori API key. Sent as `Authorization: Bearer`. */
    apiKey?: string;
    /** Which task to run: analyze (default), describe, ocr, or classify. */
    task?: VisionTask;
    /** Provider to target — informs client-side validation. Defaults to universal (all providers). */
    provider?: VisionProvider;
    /** Optional model override. */
    model?: string;
    /** Custom prompt (only meaningful for task="analyze"). */
    prompt?: string;
    /** Called on success. */
    onResult?: (result: unknown) => void;
    /** Called on error (before the built-in banner renders it). */
    onError?: (error: { code: string; message: string }) => void;
    /** Hide the supported-formats banner. Default: shown. */
    hideBanner?: boolean;
    /**
     * Auto-compress images that exceed the provider's size limit. JPEG/PNG/WEBP only.
     * Default: true.
     */
    autoCompress?: boolean;
    /** Additional request headers to forward on upload (in addition to Authorization). */
    headers?: Record<string, string>;
    /** Extra classes. */
    className?: string;
}

// ── Client-side validation rules (mirror the server) ────────────

const UNIVERSAL_FORMATS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const PROVIDER_RULES: Record<VisionProvider, { formats: string[]; maxBytes: number }> = {
    openai: { formats: UNIVERSAL_FORMATS, maxBytes: 20 * 1024 * 1024 },
    anthropic: { formats: UNIVERSAL_FORMATS, maxBytes: 5 * 1024 * 1024 },
    google: { formats: [...UNIVERSAL_FORMATS, 'image/heic', 'image/heif'], maxBytes: 20 * 1024 * 1024 },
};

function rulesFor(provider?: VisionProvider) {
    if (provider) return PROVIDER_RULES[provider];
    return { formats: UNIVERSAL_FORMATS, maxBytes: 5 * 1024 * 1024 };
}

function formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    return `${(bytes / 1024).toFixed(0)}KB`;
}

function friendlyFormats(mimes: string[]): string {
    return mimes.map(m => m.replace('image/', '').toUpperCase()).join(', ');
}

function joinClasses(...parts: Array<string | undefined | false>): string {
    return parts.filter(Boolean).join(' ');
}

// ── Component ───────────────────────────────────────────────────

export function VisionUploader({
    endpoint = '/api/ai/vision',
    apiKey,
    task = 'analyze',
    provider,
    model,
    prompt,
    onResult,
    onError,
    hideBanner = false,
    autoCompress = true,
    headers,
    className,
}: VisionUploaderProps) {
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [error, setError] = useState<{ code: string; message: string } | null>(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<unknown>(null);
    const [dragging, setDragging] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const rules = useMemo(() => rulesFor(provider), [provider]);
    const targetUrl = task === 'analyze' ? endpoint : `${endpoint.replace(/\/$/, '')}/${task}`;

    const acceptFile = useCallback(async (f: File) => {
        setResult(null);
        setNotice(null);
        let effective = f;

        // Wrong format: fail fast, no attempt at compression
        const mime = (f.type || '').toLowerCase();
        if (!rules.formats.includes(mime)) {
            const err = {
                code: 'unsupported_format',
                message: `"${f.name}" is ${mime || 'an unknown type'}. Please upload one of: ${friendlyFormats(rules.formats)}.`,
            };
            setError(err);
            setFile(null);
            setPreview(null);
            onError?.(err);
            return;
        }

        // Too big: try auto-compression if allowed and format is downscalable
        if (f.size > rules.maxBytes) {
            if (autoCompress && canDownscale(mime)) {
                try {
                    const result = await downscaleImage(f, rules.maxBytes);
                    effective = result.file;
                    setNotice(
                        `Compressed from ${formatBytes(result.originalBytes)} to ${formatBytes(result.finalBytes)} to fit the ${provider ?? 'universal'} limit.`
                    );
                } catch (compressErr) {
                    const err = {
                        code: 'image_too_large',
                        message: compressErr instanceof Error
                            ? compressErr.message
                            : `"${f.name}" is ${formatBytes(f.size)} — the limit is ${formatBytes(rules.maxBytes)}${provider ? ` for ${provider}` : ''}.`,
                    };
                    setError(err);
                    setFile(null);
                    setPreview(null);
                    onError?.(err);
                    return;
                }
            } else {
                const err = {
                    code: 'image_too_large',
                    message: `"${f.name}" is ${formatBytes(f.size)} — the limit is ${formatBytes(rules.maxBytes)}${provider ? ` for ${provider}` : ''}.`,
                };
                setError(err);
                setFile(null);
                setPreview(null);
                onError?.(err);
                return;
            }
        }

        setError(null);
        setFile(effective);
        setPreview(URL.createObjectURL(effective));
    }, [rules, provider, autoCompress, onError]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) acceptFile(f);
    }, [acceptFile]);

    const handleSubmit = useCallback(async () => {
        if (!file) return;
        setLoading(true);
        setError(null);
        setResult(null);
        try {
            const form = new FormData();
            form.append('file', file);
            if (prompt && task === 'analyze') form.append('prompt', prompt);
            if (model) form.append('model', model);

            const requestHeaders: Record<string, string> = { ...(headers ?? {}) };
            if (apiKey) requestHeaders.Authorization = `Bearer ${apiKey}`;

            const res = await fetch(targetUrl, {
                method: 'POST',
                headers: Object.keys(requestHeaders).length ? requestHeaders : undefined,
                body: form,
            });
            const data = await res.json();
            if (!res.ok) {
                const err = {
                    code: (data && typeof data === 'object' && 'error' in data ? String(data.error) : 'request_failed'),
                    message: (data && typeof data === 'object' && 'message' in data ? String(data.message) : `Request failed with status ${res.status}`),
                };
                setError(err);
                onError?.(err);
                return;
            }
            setResult(data);
            onResult?.(data);
        } catch (err) {
            const e = { code: 'network_error', message: err instanceof Error ? err.message : 'Network error' };
            setError(e);
            onError?.(e);
        } finally {
            setLoading(false);
        }
    }, [file, prompt, model, task, targetUrl, apiKey, headers, onResult, onError]);

    const clear = useCallback(() => {
        setFile(null);
        setPreview(null);
        setResult(null);
        setError(null);
        setNotice(null);
        if (inputRef.current) inputRef.current.value = '';
    }, []);

    return (
        <div className={joinClasses('flex flex-col gap-3', className)}>
            {!hideBanner && <VisionFormatBanner provider={provider} />}

            <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="Upload image"
                className={joinClasses(
                    'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition',
                    dragging
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                        : 'border-neutral-300 hover:border-neutral-400 dark:border-neutral-700 dark:hover:border-neutral-600',
                )}
            >
                {preview ? (
                    <div className="relative">
                        <img src={preview} alt="Preview" className="max-h-64 rounded-lg object-contain" />
                        <button
                            type="button"
                            onClick={e => { e.stopPropagation(); clear(); }}
                            className="absolute -right-2 -top-2 rounded-full bg-white p-1 shadow ring-1 ring-neutral-200 hover:bg-neutral-100 dark:bg-neutral-900 dark:ring-neutral-700"
                            aria-label="Remove image"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                ) : (
                    <>
                        <Upload className="h-8 w-8 text-neutral-400" aria-hidden />
                        <p className="text-sm font-medium">Drop an image or click to upload</p>
                        <p className="text-xs text-neutral-500">{friendlyFormats(rules.formats)} · up to {formatBytes(rules.maxBytes)}</p>
                    </>
                )}
                <input
                    ref={inputRef}
                    type="file"
                    accept={rules.formats.join(',')}
                    className="hidden"
                    onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) acceptFile(f);
                    }}
                />
            </div>

            {error && (
                <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
                    <div>
                        <p className="font-medium">Can't process this image</p>
                        <p className="text-xs opacity-90">{error.message}</p>
                    </div>
                </div>
            )}

            {notice && !error && (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{notice}</p>
            )}

            {file && !loading && !result && (
                <button
                    type="button"
                    onClick={handleSubmit}
                    className="inline-flex items-center justify-center rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
                >
                    Analyze image
                </button>
            )}

            {loading && (
                <div className="inline-flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Analyzing…
                </div>
            )}

            {result !== null && (
                <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
                    <p className="mb-1 text-xs font-medium uppercase text-neutral-500">Result</p>
                    <pre className="overflow-auto whitespace-pre-wrap break-words text-xs">
                        {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
}
