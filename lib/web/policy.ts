import type { ExtractedWebDocument, FetchedWebResource } from './types';

export type WebPolicyAction = 'allow' | 'deny' | 'noindex' | 'noarchive' | 'nosnippet';

export interface WebDomainPolicy {
    pathPrefix: string;
    action: WebPolicyAction;
    reason: string;
}

export interface WebPolicyDecision {
    fetch: boolean;
    index: boolean;
    follow: boolean;
    archive: boolean;
    snippet: boolean;
    reasons: string[];
}

const SENSITIVE_PATH = /\/(?:account|accounts|admin|auth|billing|cart|checkout|login|logout|orders?|password|profile|reset|settings|signin|signup)(?:\/|$)/i;
const SECRET_QUERY_KEYS = new Set(['access_token', 'auth', 'code', 'key', 'password', 'session', 'signature', 'token']);

export function hasSensitiveWebLocation(value: string): boolean {
    const url = new URL(value);
    if (SENSITIVE_PATH.test(url.pathname)) return true;
    return [...url.searchParams.keys()].some(key => SECRET_QUERY_KEYS.has(key.toLowerCase()));
}

export function mapDomainPolicies(rows: Record<string, unknown>[]): WebDomainPolicy[] {
    return rows.flatMap(row => {
        const action = String(row.action) as WebPolicyAction;
        if (!['allow', 'deny', 'noindex', 'noarchive', 'nosnippet'].includes(action)) return [];
        return [{
            pathPrefix: typeof row.path_prefix === 'string' ? row.path_prefix : '/',
            action,
            reason: typeof row.reason === 'string' ? row.reason : 'operator policy',
        }];
    });
}

function activePolicies(url: string, policies: WebDomainPolicy[]): WebDomainPolicy[] {
    const path = new URL(url).pathname;
    const matching = policies.filter(policy => path.startsWith(policy.pathPrefix));
    if (matching.length === 0) return [];
    const longest = Math.max(...matching.map(policy => policy.pathPrefix.length));
    return matching.filter(policy => policy.pathPrefix.length === longest);
}

export function prefetchPolicyDecision(url: string, policies: WebDomainPolicy[]): WebPolicyDecision {
    const decision: WebPolicyDecision = { fetch: true, index: true, follow: true, archive: true, snippet: true, reasons: [] };
    if (hasSensitiveWebLocation(url)) {
        decision.fetch = false;
        decision.index = false;
        decision.follow = false;
        decision.archive = false;
        decision.snippet = false;
        decision.reasons.push('privacy-sensitive URL pattern');
    }
    for (const policy of activePolicies(url, policies)) {
        decision.reasons.push(`${policy.action}: ${policy.reason}`);
        if (policy.action === 'allow') continue;
        if (policy.action === 'deny') decision.fetch = decision.index = decision.follow = decision.archive = decision.snippet = false;
        if (policy.action === 'noindex') decision.index = false;
        if (policy.action === 'noarchive') decision.archive = false;
        if (policy.action === 'nosnippet') decision.snippet = false;
    }
    return decision;
}

export function parseRobotsDirectives(...values: Array<string | null | undefined>): Set<string> {
    const directives = new Set<string>();
    for (const value of values) {
        for (const directive of (value || '').toLowerCase().split(/[\s,;]+/).filter(Boolean)) {
            directives.add(directive.split(':')[0]);
        }
    }
    return directives;
}

export function documentPolicyDecision(
    document: ExtractedWebDocument,
    resource: FetchedWebResource,
    base: WebPolicyDecision,
): WebPolicyDecision {
    const decision = { ...base, reasons: [...base.reasons] };
    const directives = parseRobotsDirectives(
        resource.headers.xRobotsTag,
        document.metadata.robots,
        document.metadata.googlebot,
        document.metadata.cencoriweb,
    );
    if (directives.has('none') || directives.has('noindex')) {
        decision.index = false;
        decision.reasons.push('page requested noindex');
    }
    if (directives.has('none') || directives.has('nofollow')) {
        decision.follow = false;
        decision.reasons.push('page requested nofollow');
    }
    if (directives.has('noarchive')) {
        decision.archive = false;
        decision.reasons.push('page requested noarchive');
    }
    if (directives.has('nosnippet')) {
        decision.snippet = false;
        decision.reasons.push('page requested nosnippet');
    }
    if (/\bprivate\b/i.test(resource.headers.cacheControl || '')) {
        decision.index = false;
        decision.archive = false;
        decision.snippet = false;
        decision.reasons.push('response cache-control is private');
    }
    return decision;
}
