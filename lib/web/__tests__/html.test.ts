/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { extractWebDocument } from '@/lib/web/html';
import type { FetchedWebResource } from '@/lib/web/types';

function resource(body: string): FetchedWebResource {
    return {
        url: 'https://example.com/docs?utm_source=test',
        finalUrl: 'https://example.com/docs?utm_source=test',
        statusCode: 200,
        mimeType: 'text/html',
        body,
        bytes: Buffer.byteLength(body),
        contentHash: createHash('sha256').update(body).digest('hex'),
        retrievedAt: '2026-08-07T12:00:00.000Z',
        headers: { cacheControl: null, etag: null, lastModified: null },
    };
}

describe('extractWebDocument', () => {
    it('extracts canonical content, metadata, links, and exact evidence offsets', () => {
        const result = extractWebDocument(resource(`
            <!doctype html>
            <html lang="en">
              <head>
                <title>Fallback title</title>
                <meta property="og:title" content="Cencori Web">
                <meta name="description" content="First-party web intelligence">
                <meta property="article:published_time" content="2026-08-01T10:00:00Z">
                <link rel="canonical" href="/docs?utm_campaign=launch">
              </head>
              <body>
                <nav>Ignore navigation</nav>
                <main>
                  <h1>Cencori Web</h1>
                  <p>Agents need evidence they can inspect and reproduce.</p>
                  <p>Retrieved pages are untrusted data, never instructions.</p>
                  <a href="/security?utm_source=nav">Security</a>
                  <a href="mailto:hello@example.com">Email</a>
                </main>
                <script>ignoreMe()</script>
              </body>
            </html>
        `));

        expect(result.title).toBe('Cencori Web');
        expect(result.description).toBe('First-party web intelligence');
        expect(result.language).toBe('en');
        expect(result.canonicalUrl).toBe('https://example.com/docs');
        expect(result.publishedAt).toBe('2026-08-01T10:00:00.000Z');
        expect(result.content).toContain('Agents need evidence');
        expect(result.content).not.toContain('Ignore navigation');
        expect(result.content).not.toContain('ignoreMe');
        expect(result.links).toEqual([
            expect.objectContaining({ url: 'https://example.com/security', internal: true, text: 'Security' }),
        ]);
        for (const span of result.evidenceSpans) {
            expect(result.content.slice(span.start, span.end)).toBe(span.text);
        }
    });

    it('extracts plain text resources without HTML parsing', () => {
        const plain = { ...resource('First paragraph.\n\nSecond paragraph with enough detail.'), mimeType: 'text/plain' };
        const result = extractWebDocument(plain);
        expect(result.content).toContain('Second paragraph');
        expect(result.links).toEqual([]);
        expect(result.canonicalUrl).toBe('https://example.com/docs');
    });

    it('does not let a broken cross-path canonical collapse distinct pages', () => {
        const result = extractWebDocument(resource(`
            <!doctype html>
            <html>
              <head>
                <title>Documentation page</title>
                <link rel="canonical" href="/">
              </head>
              <body><main><p>This documentation page contains independently indexable content.</p></main></body>
            </html>
        `));

        expect(result.canonicalUrl).toBe('https://example.com/docs');
        expect(result.metadata.declaredCanonicalUrl).toBe('https://example.com/');
    });
});
