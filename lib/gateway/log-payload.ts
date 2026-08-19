/**
 * Helpers for building the `request_payload` / `response_payload` that every
 * gateway endpoint writes to `ai_requests`. Without them a console log row has
 * nothing to inspect — the user sees a request happened but not what it was.
 *
 * Two things must never reach the log: unbounded text (a repo-sized prompt) and
 * binary blobs (base64 images, audio). Both are summarised instead.
 */

/** Per-field ceiling. Long prompts are real, but a row is a log line, not storage. */
export const LOG_TEXT_LIMIT = 20_000;

export function truncateForLog(value: string, limit = LOG_TEXT_LIMIT): string {
    if (value.length <= limit) return value;
    return `${value.slice(0, limit)}… [truncated ${value.length - limit} chars]`;
}

/**
 * Replace inline binary with a description of it. `data:` URIs are megabytes of
 * base64 that would bloat every row and tell the reader nothing.
 */
export function redactBinaryRef(value: string): string {
    if (!value.startsWith('data:')) return truncateForLog(value, 2_000);
    const mime = value.slice(5, value.indexOf(';') > 0 ? value.indexOf(';') : 5) || 'application/octet-stream';
    return `[inline ${mime}, ${value.length} chars]`;
}

/** Flatten message content — a string, or OpenAI-style content parts — to text. */
export function toLoggedText(content: unknown): string {
    if (typeof content === 'string') {
        return truncateForLog(content.startsWith('data:') ? redactBinaryRef(content) : content);
    }
    if (Array.isArray(content)) {
        return truncateForLog(
            content
                .map((part) => {
                    if (typeof part === 'string') return part;
                    const p = part as {
                        type?: unknown;
                        text?: unknown;
                        image_url?: { url?: unknown } | string;
                    };
                    if (typeof p?.text === 'string') return p.text;
                    const url = typeof p?.image_url === 'string' ? p.image_url : p?.image_url?.url;
                    if (typeof url === 'string') return `[image: ${redactBinaryRef(url)}]`;
                    return p?.type ? `[${String(p.type)}]` : '';
                })
                .filter(Boolean)
                .join('\n')
        );
    }
    if (content == null) return '';
    return truncateForLog(JSON.stringify(content));
}

/** Normalise messages into the `{ role, content }` string shape the console renders. */
export function toLoggedMessages(
    messages: Array<{ role: string; content: unknown }> | undefined | null
): Array<{ role: string; content: string }> {
    if (!Array.isArray(messages)) return [];
    return messages.map((m) => ({ role: String(m.role), content: toLoggedText(m.content) }));
}

/** A single prompt string logged in the same shape as a chat turn. */
export function promptPayload(
    prompt: unknown,
    extra?: Record<string, unknown>
): Record<string, unknown> {
    return {
        messages: [{ role: 'user', content: toLoggedText(prompt) }],
        ...(extra || {}),
    };
}

/** A completion logged in the same shape as a chat response. */
export function textResponsePayload(
    text: unknown,
    extra?: Record<string, unknown>
): Record<string, unknown> {
    return { content: toLoggedText(text), ...(extra || {}) };
}
