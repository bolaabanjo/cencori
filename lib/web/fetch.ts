import { createHash } from 'node:crypto';
import { readResponseBuffer, safeOutboundFetch, UnsafeOutboundUrlError } from '@/lib/security/outbound-url';
import { WebRuntimeError } from './errors';
import { assertRobotsAllowed } from './robots';
import type { FetchedWebResource } from './types';
import { normalizeWebUrl } from './url';

export const WEB_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
    'application/json',
    'application/ld+json',
    'application/xml',
    'application/xhtml+xml',
    'text/html',
    'text/markdown',
    'text/plain',
    'text/xml',
]);

export interface FetchWebResourceOptions {
    maxBytes?: number;
    timeoutMs?: number;
    respectRobots?: boolean;
}

export function normalizeWebFetchError(error: unknown): WebRuntimeError {
    if (error instanceof WebRuntimeError) return error;
    if (error instanceof UnsafeOutboundUrlError) {
        if (error.message.includes('exceeds the')) {
            return new WebRuntimeError('response_too_large', error.message, 413);
        }
        if (error.message === 'URL hostname could not be resolved') {
            return new WebRuntimeError('dns_unavailable', error.message, 503);
        }
        return new WebRuntimeError('unsafe_url', error.message, 400);
    }
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        return new WebRuntimeError('fetch_timeout', 'The remote server did not respond before the timeout', 504);
    }
    return new WebRuntimeError('fetch_failed', error instanceof Error ? error.message : 'Web retrieval failed', 422);
}

export async function fetchWebResource(
    value: string,
    options: FetchWebResourceOptions = {},
): Promise<FetchedWebResource> {
    const url = normalizeWebUrl(value);
    const maxBytes = Math.min(Math.max(options.maxBytes ?? WEB_MAX_RESPONSE_BYTES, 1), WEB_MAX_RESPONSE_BYTES);
    const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 15_000, 1_000), 30_000);

    try {
        if (options.respectRobots !== false) await assertRobotsAllowed(url);
        const response = await safeOutboundFetch(url, {
            headers: {
                Accept: 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,text/markdown;q=0.8,*/*;q=0.1',
                'Accept-Encoding': 'gzip, deflate, br',
                'User-Agent': 'CencoriWeb/1.0 (+https://cencori.com/web)',
            },
            signal: AbortSignal.timeout(timeoutMs),
        }, {
            maxRedirects: 5,
            onRedirect: redirectedUrl => assertRobotsAllowed(redirectedUrl),
        });

        if (!response.ok) {
            await response.body?.cancel().catch(() => undefined);
            throw new WebRuntimeError('fetch_failed', `Remote server returned HTTP ${response.status}`, 422, {
                statusCode: response.status,
            });
        }

        const mimeType = (response.headers.get('content-type') || 'application/octet-stream')
            .split(';')[0]
            .trim()
            .toLowerCase();
        if (!ALLOWED_MIME_TYPES.has(mimeType)) {
            await response.body?.cancel().catch(() => undefined);
            throw new WebRuntimeError('unsupported_content_type', `Content type ${mimeType} is not supported by the web text runtime`, 415);
        }

        const bytes = await readResponseBuffer(response, maxBytes);
        const finalUrl = normalizeWebUrl(response.url || url);
        const retrievedAt = new Date().toISOString();
        return {
            url,
            finalUrl,
            statusCode: response.status,
            mimeType,
            body: bytes.toString('utf8'),
            bytes: bytes.byteLength,
            contentHash: createHash('sha256').update(bytes).digest('hex'),
            retrievedAt,
            headers: {
                cacheControl: response.headers.get('cache-control'),
                etag: response.headers.get('etag'),
                lastModified: response.headers.get('last-modified'),
                xRobotsTag: response.headers.get('x-robots-tag'),
            },
        };
    } catch (error) {
        throw normalizeWebFetchError(error);
    }
}
