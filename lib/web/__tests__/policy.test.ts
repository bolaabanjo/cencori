/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { documentPolicyDecision, hasSensitiveWebLocation, parseRobotsDirectives, prefetchPolicyDecision } from '@/lib/web/policy';

describe('web policy enforcement', () => {
    it('blocks privacy-sensitive paths and query secrets', () => {
        expect(hasSensitiveWebLocation('https://example.com/account')).toBe(true);
        expect(hasSensitiveWebLocation('https://example.com/docs?token=secret')).toBe(true);
        expect(prefetchPolicyDecision('https://example.com/docs', [{ pathPrefix: '/docs/private', action: 'deny', reason: 'legal' }]).fetch).toBe(true);
    });

    it('uses the most specific domain policy scope', () => {
        const decision = prefetchPolicyDecision('https://example.com/docs/public/page', [
            { pathPrefix: '/docs', action: 'deny', reason: 'broad' },
            { pathPrefix: '/docs/public', action: 'allow', reason: 'exception' },
        ]);
        expect(decision.fetch).toBe(true);
    });

    it('honors header and meta robots directives', () => {
        expect(parseRobotsDirectives('noindex, nofollow')).toEqual(new Set(['noindex', 'nofollow']));
        const decision = documentPolicyDecision({ metadata: { robots: 'nosnippet, nofollow' } } as never, {
            headers: { xRobotsTag: 'noarchive', cacheControl: null },
        } as never, { fetch: true, index: true, follow: true, archive: true, snippet: true, reasons: [] });
        expect(decision).toMatchObject({ index: true, follow: false, archive: false, snippet: false });
    });
});
