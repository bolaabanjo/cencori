/**
 * The door on /v1/responses input.
 *
 * An agent turn resends its whole conversation as input items — every message, function call, and
 * function call output — so a coding session legitimately reaches hundreds of items. The aggregate
 * byte caps, not the item count, are what bound the payload.
 *
 * Lives beside the route rather than inside it so the limits can be exercised directly: a payload
 * this rejects is a turn the caller's agent cannot finish.
 */

import { measureResponsesContent } from '@/lib/gateway/responses-content';

export const MAX_INPUT_ITEMS = 2000;
const MAX_TOTAL_TEXT_BYTES = 8 * 1024 * 1024;
const MAX_INLINE_FILES = 20;
const MAX_INLINE_FILE_BYTES = 512 * 1024;
const MAX_TOTAL_INLINE_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_TEXT_FIELD_BYTES = 1024 * 1024;
const MAX_FILENAME_LENGTH = 255;

// Images get their own budget rather than sharing the inline-file one. An agent replays its whole
// conversation on every request, so each screenshot it has ever looked at is resent — a shared cap
// would start failing a long session partway through, which is the failure this path exists to end.
const MAX_INPUT_IMAGES = 40;
const MAX_TOTAL_IMAGE_BYTES = 4 * 1024 * 1024;

const CONTENT_LIMITS = {
    maxTextBytes: MAX_TEXT_FIELD_BYTES,
    maxImageBytes: MAX_INLINE_FILE_BYTES,
    maxImages: MAX_INPUT_IMAGES,
} as const;

export function utf8Bytes(value: string): number {
    return new TextEncoder().encode(value).byteLength;
}

export function validateResponsesInput(input: unknown): string | null {
    if (typeof input === 'string') {
        if (!input.trim()) return 'Input must not be empty.';
        if (utf8Bytes(input) > MAX_TEXT_FIELD_BYTES) {
            return 'Input text exceeds the 1 MiB limit.';
        }
        return null;
    }

    if (!Array.isArray(input) || input.length === 0) {
        return 'Missing input. Provide a string or a non-empty array of input items.';
    }
    if (input.length > MAX_INPUT_ITEMS) {
        return `Input may contain at most ${MAX_INPUT_ITEMS} items.`;
    }

    let fileCount = 0;
    let totalFileBytes = 0;
    let totalTextBytes = 0;
    let imageCount = 0;
    let totalImageBytes = 0;

    /** Holds one item's images against the request-wide budget. */
    const chargeImages = (measured: { imageCount: number; imageBytes: number }): string | null => {
        imageCount += measured.imageCount;
        if (imageCount > MAX_INPUT_IMAGES) {
            return `Input may contain at most ${MAX_INPUT_IMAGES} images.`;
        }
        totalImageBytes += measured.imageBytes;
        if (totalImageBytes > MAX_TOTAL_IMAGE_BYTES) {
            return 'Images exceed the 4 MiB combined limit.';
        }
        return null;
    };

    for (const rawItem of input) {
        if (!rawItem || typeof rawItem !== 'object') return 'Every input item must be an object.';
        const item = rawItem as Record<string, unknown>;

        if (item.type === 'message') {
            if (!['user', 'assistant', 'system'].includes(String(item.role))) {
                return 'Message input items require a valid role.';
            }
            const measured = measureResponsesContent(item.content, 'Message content', CONTENT_LIMITS);
            if (measured.error) return measured.error;
            totalTextBytes += measured.textBytes;
            const overBudget = chargeImages(measured);
            if (overBudget) return overBudget;
        } else if (item.type === 'function_call') {
            if (typeof item.id !== 'string' || typeof item.call_id !== 'string'
                || typeof item.name !== 'string' || typeof item.arguments !== 'string') {
                return 'Function call input items require string id, call_id, name, and arguments fields.';
            }
            if (utf8Bytes(item.arguments) > MAX_TEXT_FIELD_BYTES) {
                return 'Function call arguments exceed the 1 MiB limit.';
            }
            totalTextBytes += utf8Bytes(item.arguments);
        } else if (item.type === 'function_call_output') {
            if (typeof item.call_id !== 'string') {
                return 'Function call output items require a string call_id field.';
            }
            // An image tool — `view_image` in a coding agent — answers with content parts rather
            // than text, so the output is a string or a part list, never only a string.
            const measured = measureResponsesContent(item.output, 'Function call output', CONTENT_LIMITS);
            if (measured.error) return measured.error;
            totalTextBytes += measured.textBytes;
            const overBudget = chargeImages(measured);
            if (overBudget) return overBudget;
        } else if (item.type === 'file') {
            fileCount += 1;
            if (fileCount > MAX_INLINE_FILES) return `Input may contain at most ${MAX_INLINE_FILES} inline files.`;
            if (typeof item.filename !== 'string' || !item.filename.trim()
                || item.filename.length > MAX_FILENAME_LENGTH || /[\0\r\n]/.test(item.filename)) {
                return 'Inline files require a valid filename no longer than 255 characters.';
            }
            if (typeof item.content !== 'string' || item.content.length === 0) {
                return 'Inline file content must be a non-empty string.';
            }
            if (item.mime_type !== undefined && typeof item.mime_type !== 'string') {
                return 'Inline file mime_type must be a string when provided.';
            }
            const fileBytes = utf8Bytes(item.content);
            if (fileBytes > MAX_INLINE_FILE_BYTES) {
                return 'An inline file exceeds the 512 KiB per-file limit.';
            }
            totalFileBytes += fileBytes;
            if (totalFileBytes > MAX_TOTAL_INLINE_FILE_BYTES) {
                return 'Inline files exceed the 2 MiB combined limit.';
            }
        } else {
            return 'Unsupported input item type.';
        }

        if (totalTextBytes > MAX_TOTAL_TEXT_BYTES) {
            return 'Input text exceeds the 8 MiB combined limit.';
        }
    }

    return null;
}
