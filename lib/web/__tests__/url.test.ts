/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { normalizeDomain, normalizeWebUrl, parseFreshness } from '@/lib/web/url';

describe('web URL utilities', () => {
    it('normalizes URLs and strips tracking without dropping functional query parameters', () => {
        expect(normalizeWebUrl('HTTPS://Example.COM:443/a?z=2&utm_source=x&a=1#section'))
            .toBe('https://example.com/a?a=1&z=2');
    });

    it('normalizes domain filters', () => {
        expect(normalizeDomain('https://Docs.Example.com:443/path')).toBe('docs.example.com');
    });

    it('accepts relative freshness durations and ISO timestamps', () => {
        const parsed = parseFreshness('7d');
        expect(parsed).not.toBeNull();
        expect(Date.parse(parsed!)).toBeLessThan(Date.now());
        expect(parseFreshness('2026-08-01T00:00:00Z')).toBe('2026-08-01T00:00:00.000Z');
    });
});
