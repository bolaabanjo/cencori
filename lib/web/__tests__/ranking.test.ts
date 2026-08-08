/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { deriveWebDocumentSignals, rerankWebCandidates } from '@/lib/web/ranking';

describe('web ranking', () => {
    it('penalizes spam and diversifies repeated hosts', () => {
        const base = {
            title: 'Result', url: 'https://a.example/page', canonicalUrl: 'https://a.example/page', host: 'a.example',
            snippet: 'Result', contentHash: 'hash', retrievedAt: '2026-08-08T00:00:00Z', publishedAt: null, modifiedAt: null,
            lexicalScore: 1, semanticScore: 0.8, authorityScore: 0.8, qualityScore: 0.9, spamScore: 0,
        };
        const ranked = rerankWebCandidates([
            { ...base, id: 'a1' },
            { ...base, id: 'a2', title: 'Second', url: 'https://a.example/second', canonicalUrl: 'https://a.example/second', lexicalScore: 0.98 },
            { ...base, id: 'b1', title: 'Independent', host: 'b.example', url: 'https://b.example/page', canonicalUrl: 'https://b.example/page', lexicalScore: 0.92 },
            { ...base, id: 'spam', title: 'Spam', host: 'spam.example', url: 'https://spam.example', canonicalUrl: 'https://spam.example', lexicalScore: 2, spamScore: 1 },
        ], 3, { now: Date.parse('2026-08-08T00:00:00Z') });
        expect(ranked.map(item => item.id)).toEqual(['a1', 'b1', 'a2']);
    });

    it('derives better quality for substantive documents than thin spam pages', () => {
        const document = {
            canonicalUrl: 'https://example.com/docs', title: 'Useful reference', content: 'A useful technical sentence. '.repeat(200),
            links: [], description: 'Documentation', language: 'en', publishedAt: null, modifiedAt: null,
        } as never;
        const useful = deriveWebDocumentSignals(document, 0.9);
        const spam = deriveWebDocumentSignals({ ...document, canonicalUrl: 'https://example.com/casino', title: 'x', content: 'coupon '.repeat(60) } as never, 0.3);
        expect(useful.qualityScore).toBeGreaterThan(spam.qualityScore);
        expect(useful.spamScore).toBeLessThan(spam.spamScore);
    });
});
