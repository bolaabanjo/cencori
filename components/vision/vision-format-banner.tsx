/**
 * VisionFormatBanner
 *
 * Drop-in banner that documents the supported image formats and size limits
 * for the Cencori Vision API. Zero external state — safe to embed anywhere,
 * including inside a customer's own product.
 *
 * Deps: react, lucide-react, tailwindcss.
 */

'use client';

import { ImageIcon, Info } from 'lucide-react';
import type { ReactNode } from 'react';

export type VisionProvider = 'openai' | 'anthropic' | 'google';

export interface VisionFormatBannerProps {
    /** Restrict displayed limits to a specific provider. Omit to show universal (all-provider) limits. */
    provider?: VisionProvider;
    /** Tone. */
    variant?: 'info' | 'muted';
    /** Extra classes. */
    className?: string;
    /** Optional title override. */
    title?: ReactNode;
}

const UNIVERSAL_FORMATS = ['JPEG', 'PNG', 'WEBP', 'GIF'];

const PROVIDER_LIMITS: Record<VisionProvider, { formats: string[]; maxMB: number; notes: string }> = {
    openai: { formats: ['JPEG', 'PNG', 'WEBP', 'GIF'], maxMB: 20, notes: 'Non-animated GIFs only.' },
    anthropic: { formats: ['JPEG', 'PNG', 'WEBP', 'GIF'], maxMB: 5, notes: 'Max 8000×8000 dimensions.' },
    google: { formats: ['JPEG', 'PNG', 'WEBP', 'GIF', 'HEIC', 'HEIF'], maxMB: 20, notes: 'HEIC/HEIF supported.' },
};

function joinClasses(...parts: Array<string | undefined | false>): string {
    return parts.filter(Boolean).join(' ');
}

export function VisionFormatBanner({
    provider,
    variant = 'info',
    className,
    title,
}: VisionFormatBannerProps) {
    const info = provider ? PROVIDER_LIMITS[provider] : { formats: UNIVERSAL_FORMATS, maxMB: 5, notes: 'These formats work across every supported provider.' };
    const heading = title ?? (provider ? `Supported for ${providerLabel(provider)}` : 'Supported image formats');

    const base = variant === 'info'
        ? 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-100'
        : 'bg-neutral-50 border-neutral-200 text-neutral-800 dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-100';

    return (
        <div
            role="note"
            className={joinClasses(
                'flex gap-3 rounded-lg border p-4 text-sm',
                base,
                className
            )}
        >
            <div className="flex-shrink-0 pt-0.5">
                <Info className="h-5 w-5 opacity-70" aria-hidden />
            </div>
            <div className="flex flex-col gap-2">
                <p className="font-medium">{heading}</p>
                <div className="flex flex-wrap gap-1.5">
                    {info.formats.map(f => (
                        <span
                            key={f}
                            className="inline-flex items-center gap-1 rounded-md border border-current/20 bg-white/50 px-2 py-0.5 text-xs font-medium dark:bg-black/20"
                        >
                            <ImageIcon className="h-3 w-3 opacity-70" aria-hidden />
                            {f}
                        </span>
                    ))}
                </div>
                <p className="text-xs opacity-80">
                    Up to <strong>{info.maxMB}MB</strong> per image. {info.notes}
                </p>
            </div>
        </div>
    );
}

function providerLabel(p: VisionProvider): string {
    if (p === 'openai') return 'OpenAI';
    if (p === 'anthropic') return 'Anthropic';
    return 'Google';
}
