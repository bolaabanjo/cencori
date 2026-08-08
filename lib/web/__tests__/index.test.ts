/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import { nextPublicRecrawlAt, searchWebIndex } from '@/lib/web/index';

describe('searchWebIndex', () => {
    it('scopes the RPC to the project and returns evidence provenance', async () => {
        const searchDocuments = vi.fn().mockResolvedValue([{
                id: 'doc_1',
                title: 'Cencori Web',
                url: 'https://example.com/page',
                canonical_url: 'https://example.com/page',
                snippet: ' <b>Evidence</b>   agents can inspect. ',
                score: 0.75,
                content_hash: 'hash_1',
                retrieved_at: '2026-08-07T12:00:00.000Z',
                published_at: '2026-08-01T12:00:00.000Z',
            }]);
        const store = { searchDocuments } as never;

        const results = await searchWebIndex(store, 'project_1', 'agent evidence', {
            limit: 5,
            domain: 'https://Example.com/docs',
            freshness: '7d',
        });

        expect(searchDocuments).toHaveBeenCalledWith('project_1', 'agent evidence', expect.objectContaining({
            limit: 50,
            domain: 'example.com',
            queryEmbedding: null,
        }));
        expect(results[0]).toMatchObject({
            canonicalUrl: 'https://example.com/page',
            snippet: 'Evidence agents can inspect.',
            evidence: {
                quote: 'Evidence agents can inspect.',
                contentHash: 'hash_1',
            },
        });
    });
});

describe('nextPublicRecrawlAt', () => {
    const now = Date.parse('2026-08-08T00:00:00.000Z');
    const document = {
        modifiedAt: null,
        publishedAt: null,
    } as never;

    it('recrawls recently changed pages daily', () => {
        expect(nextPublicRecrawlAt({
            ...document,
            modifiedAt: '2026-08-07T00:00:00.000Z',
        }, now)).toBe('2026-08-09T00:00:00.000Z');
    });

    it('backs stable pages off to a monthly cadence', () => {
        expect(nextPublicRecrawlAt(document, now)).toBe('2026-09-07T00:00:00.000Z');
    });
});
