/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import { WebRuntimeError } from '@/lib/web/errors';
import { searchTinyFish } from '@/lib/web/tinyfish';

function searchResponse(results: unknown[]): Response {
    return new Response(JSON.stringify({ query: 'agent tools', results, total_results: results.length }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    });
}

describe('searchTinyFish', () => {
    it('keeps the provider key server-side and maps results to the Cencori Web contract', async () => {
        const fetch = vi.fn().mockResolvedValue(searchResponse([{
            position: 1,
            site_name: 'example.com',
            title: 'Agent tools',
            snippet: 'A useful result.',
            url: 'https://example.com/tools#section',
        }]));

        const results = await searchTinyFish('agent tools', {
            domain: 'https://Example.com/docs',
            language: 'en-US',
        }, {
            apiKey: 'server-secret',
            fetch,
            now: () => new Date('2026-08-29T12:00:00.000Z'),
        });

        const [url, request] = fetch.mock.calls[0] as [URL, RequestInit];
        expect(url.searchParams.get('query')).toBe('agent tools site:example.com');
        expect(url.searchParams.get('language')).toBe('en');
        expect(request.headers).toEqual({ 'X-API-Key': 'server-secret' });
        expect(results[0]).toMatchObject({
            title: 'Agent tools',
            canonicalUrl: 'https://example.com/tools',
            snippet: 'A useful result.',
            score: 1,
            retrievedAt: '2026-08-29T12:00:00.000Z',
            publishedAt: null,
            evidence: { quote: 'A useful result.' },
        });
        expect(results[0].contentHash).toBe(results[0].evidence.contentHash);
    });

    it('returns a controlled service error when the server credential is missing', async () => {
        await expect(searchTinyFish('agent tools', {}, { apiKey: '' })).rejects.toEqual(
            expect.objectContaining<WebRuntimeError>({
                code: 'web_provider_unavailable',
                status: 503,
            }),
        );
    });

    it('maps TinyFish rate limits without exposing its response body', async () => {
        const fetch = vi.fn().mockResolvedValue(new Response('provider details', { status: 429 }));

        await expect(searchTinyFish('agent tools', {}, { apiKey: 'server-secret', fetch })).rejects.toEqual(
            expect.objectContaining<WebRuntimeError>({
                code: 'web_rate_limited',
                status: 429,
            }),
        );
    });
});
