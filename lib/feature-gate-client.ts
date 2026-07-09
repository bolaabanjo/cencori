/**
 * Client-side helper for API routes gated by requireTierFeatureForProject().
 * Those routes return 403 with { code: 'FEATURE_NOT_INCLUDED' } when the
 * org's plan doesn't include the feature — dashboard pages should surface
 * an upgrade prompt instead of hanging on skeletons.
 */

export class FeatureGateError extends Error {
    readonly code = 'FEATURE_NOT_INCLUDED';

    constructor(message: string) {
        super(message);
        this.name = 'FeatureGateError';
    }
}

export function isFeatureGateError(error: unknown): error is FeatureGateError {
    return error instanceof FeatureGateError
        || (error instanceof Error && (error as { code?: string }).code === 'FEATURE_NOT_INCLUDED');
}

/**
 * fetch + res.json() that throws FeatureGateError on a 403 feature gate,
 * and a plain Error on any other non-OK response.
 */
export async function fetchJsonWithFeatureGate<T>(url: string): Promise<T> {
    const res = await fetch(url);

    if (res.status === 403) {
        const body = await res.json().catch(() => null);
        if (body?.code === 'FEATURE_NOT_INCLUDED') {
            throw new FeatureGateError(body.error || 'This feature requires a paid plan');
        }
        throw new Error(body?.error || `Request failed (${res.status})`);
    }

    if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
    }

    return res.json();
}
