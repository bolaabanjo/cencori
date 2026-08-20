/**
 * Multimodal content on the /v1/responses surface.
 *
 * An agent sends an image two ways: as a content part on a user message, and as the output of an
 * image tool such as `view_image`. Both arrive as arrays of content parts, while the gateway's
 * UnifiedMessage carries text in a plain string. This module is the single place that reads those
 * arrays — it validates them, pulls the text out for the security pipeline, and separates the
 * images so the provider adapters can attach them.
 */

import type { UnifiedImagePart } from '@/lib/providers/base';

/** What an image tool's output leaves on the tool turn, which may not itself carry an image. */
export const TOOL_IMAGE_PLACEHOLDER = '[image returned by the tool; it follows on the next turn]';

/**
 * The user turn the image rides on. It is never empty: a provider that ignores images would
 * otherwise receive a message with no content at all, which several reject outright.
 */
export const TOOL_IMAGE_CAPTION = 'Image returned by the tool call above.';

export type ResponsesContentPart = Record<string, unknown>;

export type ContentLimits = {
    /** Per-field cap on text, matching the caller's own text limit. */
    maxTextBytes: number;
    /** Per-image cap. A `data:` URL carries base64 bytes, so this bounds the decoded image too. */
    maxImageBytes: number;
    maxImages: number;
};

export type NormalizedContent = {
    text: string;
    images: UnifiedImagePart[];
};

export type ContentMeasurement = {
    error?: string;
    textBytes: number;
    imageBytes: number;
    imageCount: number;
};

function utf8Bytes(value: string): number {
    return new TextEncoder().encode(value).byteLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `input_text` from a user turn, `output_text` from an assistant one, `text` from either. */
function textOfPart(part: Record<string, unknown>): string | null {
    const type = part.type;
    if (type !== 'input_text' && type !== 'output_text' && type !== 'text') return null;
    return typeof part.text === 'string' ? part.text : '';
}

/**
 * Reads the several spellings of an image part in the wild: `image_url` as a bare string (chat
 * completions), as `{ url }` (OpenAI Responses), and `input_image` with either.
 */
function imageOfPart(part: Record<string, unknown>): UnifiedImagePart | null {
    const type = part.type;
    if (type !== 'input_image' && type !== 'image_url' && type !== 'image') return null;

    const raw = part.image_url ?? part.url;
    const url = typeof raw === 'string'
        ? raw
        : isRecord(raw) && typeof raw.url === 'string' ? raw.url : null;
    if (!url) return null;

    const detail = isRecord(raw) && typeof raw.detail === 'string' ? raw.detail : part.detail;
    return {
        url,
        ...(detail === 'auto' || detail === 'low' || detail === 'high' ? { detail } : {}),
    };
}

export function isContentPartArray(value: unknown): value is ResponsesContentPart[] {
    return Array.isArray(value) && value.every(isRecord);
}

/**
 * Flattens a content value into the text the pipeline scans and the images the provider receives.
 *
 * A part this gateway does not understand contributes nothing rather than failing the request: the
 * turn still reaches the model with everything that could be read.
 */
export function normalizeResponsesContent(value: unknown): NormalizedContent {
    if (typeof value === 'string') return { text: value, images: [] };
    if (!isContentPartArray(value)) return { text: '', images: [] };

    const texts: string[] = [];
    const images: UnifiedImagePart[] = [];
    for (const part of value) {
        const text = textOfPart(part);
        if (text !== null) {
            texts.push(text);
            continue;
        }
        const image = imageOfPart(part);
        if (image) images.push(image);
    }
    return { text: texts.join('\n'), images };
}

/**
 * Checks one content value against the caller's limits, and reports what it costs so the caller can
 * hold it against the request's combined caps.
 */
export function measureResponsesContent(
    value: unknown,
    label: string,
    limits: ContentLimits,
): ContentMeasurement {
    if (typeof value === 'string') {
        return utf8Bytes(value) > limits.maxTextBytes
            ? { error: `${label} exceeds the text size limit.`, textBytes: 0, imageBytes: 0, imageCount: 0 }
            : { textBytes: utf8Bytes(value), imageBytes: 0, imageCount: 0 };
    }

    if (!isContentPartArray(value)) {
        return {
            error: `${label} must be a string or an array of content parts.`,
            textBytes: 0,
            imageBytes: 0,
            imageCount: 0,
        };
    }

    let textBytes = 0;
    let imageBytes = 0;
    let imageCount = 0;
    for (const part of value) {
        if (typeof part.type !== 'string') {
            return { error: `${label} contains a part with no type.`, textBytes: 0, imageBytes: 0, imageCount: 0 };
        }

        const text = textOfPart(part);
        if (text !== null) {
            textBytes += utf8Bytes(text);
            if (textBytes > limits.maxTextBytes) {
                return { error: `${label} exceeds the text size limit.`, textBytes: 0, imageBytes: 0, imageCount: 0 };
            }
            continue;
        }

        const image = imageOfPart(part);
        if (!image) continue;

        imageCount += 1;
        if (imageCount > limits.maxImages) {
            return {
                error: `${label} may contain at most ${limits.maxImages} images.`,
                textBytes: 0,
                imageBytes: 0,
                imageCount: 0,
            };
        }
        const bytes = utf8Bytes(image.url);
        if (bytes > limits.maxImageBytes) {
            return { error: `${label} contains an image that exceeds the per-image limit.`, textBytes: 0, imageBytes: 0, imageCount: 0 };
        }
        imageBytes += bytes;
    }

    return { textBytes, imageBytes, imageCount };
}

/**
 * A tool result that carries images becomes two turns: the tool turn keeps the text, and the images
 * move to a user turn behind it. Tool messages cannot carry images on the chat-completions wire
 * format every provider here speaks, and an image dropped silently is an agent staring at a blank.
 */
export function toolOutputTurns(
    output: unknown,
    callId: string,
): Array<{ role: 'tool' | 'user'; content: string; images?: UnifiedImagePart[]; toolCallId?: string }> {
    const { text, images } = normalizeResponsesContent(output);
    if (!images.length) return [{ role: 'tool', content: text, toolCallId: callId }];

    return [
        { role: 'tool', content: text || TOOL_IMAGE_PLACEHOLDER, toolCallId: callId },
        { role: 'user', content: TOOL_IMAGE_CAPTION, images },
    ];
}
