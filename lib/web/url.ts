import { WebRuntimeError } from './errors';

const TRACKING_PARAMS = new Set([
    'fbclid',
    'gclid',
    'mc_cid',
    'mc_eid',
    'ref',
    'ref_src',
]);

export function normalizeWebUrl(value: string, base?: string): string {
    let url: URL;
    try {
        url = base ? new URL(value, base) : new URL(value);
    } catch {
        throw new WebRuntimeError('invalid_url', 'URL is invalid');
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new WebRuntimeError('invalid_url', 'Only HTTP and HTTPS URLs are supported');
    }

    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
        url.port = '';
    }

    const ordered = [...url.searchParams.entries()]
        .filter(([key]) => !key.toLowerCase().startsWith('utm_') && !TRACKING_PARAMS.has(key.toLowerCase()))
        .sort(([aKey, aValue], [bKey, bValue]) => aKey.localeCompare(bKey) || aValue.localeCompare(bValue));
    url.search = '';
    for (const [key, value] of ordered) url.searchParams.append(key, value);

    return url.toString();
}

export function normalizeDomain(value: string): string {
    const domain = value.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].replace(/:\d+$/, '');
    if (!domain || domain.includes(' ') || !domain.includes('.')) {
        throw new WebRuntimeError('invalid_domain', 'domain must be a valid hostname');
    }
    return domain;
}

export function parseFreshness(value: unknown): string | null {
    if (value == null || value === '') return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value !== 'string') {
        throw new WebRuntimeError('invalid_freshness', 'freshness must be an ISO timestamp or duration such as 7d');
    }

    const duration = value.trim().match(/^(\d+)([hdwmy])$/i);
    if (duration) {
        const amount = Number(duration[1]);
        const unitMs: Record<string, number> = {
            h: 60 * 60 * 1000,
            d: 24 * 60 * 60 * 1000,
            w: 7 * 24 * 60 * 60 * 1000,
            m: 30 * 24 * 60 * 60 * 1000,
            y: 365 * 24 * 60 * 60 * 1000,
        };
        if (amount < 1 || amount > 10_000) {
            throw new WebRuntimeError('invalid_freshness', 'freshness duration is outside the supported range');
        }
        return new Date(Date.now() - amount * unitMs[duration[2].toLowerCase()]).toISOString();
    }

    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) {
        throw new WebRuntimeError('invalid_freshness', 'freshness must be an ISO timestamp or duration such as 7d');
    }
    return new Date(timestamp).toISOString();
}
