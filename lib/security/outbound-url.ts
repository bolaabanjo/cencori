import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const BLOCKED_HOSTNAMES = new Set([
    'localhost',
    'metadata.google.internal',
    'metadata.google',
    'instance-data',
]);

export class UnsafeOutboundUrlError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UnsafeOutboundUrlError';
    }
}

export function isPrivateOrReservedAddress(address: string): boolean {
    const normalized = address.toLowerCase().split('%')[0];

    if (isIP(normalized) === 4) {
        const [a, b] = normalized.split('.').map(Number);
        return (
            a === 0
            || a === 10
            || a === 127
            || (a === 100 && b >= 64 && b <= 127)
            || (a === 169 && b === 254)
            || (a === 172 && b >= 16 && b <= 31)
            || (a === 192 && b === 0)
            || (a === 192 && b === 168)
            || (a === 198 && (b === 18 || b === 19))
            || a >= 224
        );
    }

    if (isIP(normalized) === 6) {
        if (normalized === '::' || normalized === '::1') return true;
        if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
        if (/^fe[89ab]/.test(normalized)) return true;
        if (normalized.startsWith('ff')) return true;
        if (normalized.startsWith('2001:db8:')) return true;

        const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
        if (mapped) return isPrivateOrReservedAddress(mapped);
    }

    return false;
}

export async function assertSafeOutboundUrl(value: string | URL): Promise<URL> {
    let url: URL;
    try {
        url = value instanceof URL ? new URL(value) : new URL(value);
    } catch {
        throw new UnsafeOutboundUrlError('URL is invalid');
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new UnsafeOutboundUrlError('Only HTTP and HTTPS URLs are allowed');
    }
    if (url.username || url.password) {
        throw new UnsafeOutboundUrlError('URLs containing credentials are not allowed');
    }

    const hostname = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
    if (
        BLOCKED_HOSTNAMES.has(hostname)
        || hostname.endsWith('.localhost')
        || hostname.endsWith('.local')
        || hostname.endsWith('.internal')
        || hostname.endsWith('.home')
        || hostname.endsWith('.lan')
    ) {
        throw new UnsafeOutboundUrlError('Private or local network destinations are not allowed');
    }

    if (isIP(hostname)) {
        if (isPrivateOrReservedAddress(hostname)) {
            throw new UnsafeOutboundUrlError('Private or reserved IP destinations are not allowed');
        }
        return url;
    }

    let addresses: Array<{ address: string }>;
    try {
        addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch {
        throw new UnsafeOutboundUrlError('URL hostname could not be resolved');
    }

    if (addresses.length === 0 || addresses.some(({ address }) => isPrivateOrReservedAddress(address))) {
        throw new UnsafeOutboundUrlError('URL resolves to a private or reserved network address');
    }

    return url;
}

export async function safeOutboundFetch(
    value: string | URL,
    init: RequestInit = {},
    options: { maxRedirects?: number } = {},
): Promise<Response> {
    const maxRedirects = options.maxRedirects ?? 0;
    let url = await assertSafeOutboundUrl(value);
    let requestInit: RequestInit = { ...init, redirect: 'manual' };

    for (let redirects = 0; ; redirects++) {
        const response = await fetch(url, requestInit);
        if (![301, 302, 303, 307, 308].includes(response.status)) return response;

        const location = response.headers.get('location');
        if (!location || redirects >= maxRedirects) {
            await response.body?.cancel().catch(() => undefined);
            throw new UnsafeOutboundUrlError('Outbound redirect was not allowed');
        }

        url = await assertSafeOutboundUrl(new URL(location, url));
        if (response.status === 303 || ((response.status === 301 || response.status === 302) && requestInit.method?.toUpperCase() === 'POST')) {
            const { body: _body, ...withoutBody } = requestInit;
            requestInit = { ...withoutBody, method: 'GET', redirect: 'manual' };
        }
    }
}

/**
 * Fetch adapter for provider SDKs. It re-validates DNS at request time,
 * rejects redirects, and caps response bytes for both JSON and SSE bodies.
 */
export async function safeProviderFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
    maxResponseBytes = 32 * 1024 * 1024,
): Promise<Response> {
    const value = input instanceof Request ? input.url : input;
    const response = await safeOutboundFetch(value, init, { maxRedirects: 0 });
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > maxResponseBytes) {
        await response.body?.cancel().catch(() => undefined);
        throw new UnsafeOutboundUrlError(`Provider response exceeds the ${maxResponseBytes}-byte limit`);
    }
    if (!response.body) return response;

    let total = 0;
    const limiter = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
            total += chunk.byteLength;
            if (total > maxResponseBytes) {
                controller.error(
                    new UnsafeOutboundUrlError(`Provider response exceeds the ${maxResponseBytes}-byte limit`)
                );
                return;
            }
            controller.enqueue(chunk);
        },
    });
    return new Response(response.body.pipeThrough(limiter), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
    });
}

export async function readResponseBuffer(response: Response, maxBytes: number): Promise<Buffer> {
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > maxBytes) {
        await response.body?.cancel().catch(() => undefined);
        throw new UnsafeOutboundUrlError(`Remote response exceeds the ${maxBytes}-byte limit`);
    }

    if (!response.body) return Buffer.alloc(0);

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > maxBytes) {
                await reader.cancel();
                throw new UnsafeOutboundUrlError(`Remote response exceeds the ${maxBytes}-byte limit`);
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }

    return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), total);
}
