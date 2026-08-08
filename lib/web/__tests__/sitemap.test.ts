/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { looksLikeSitemap, parseSitemap } from '@/lib/web/sitemap';

describe('sitemap parsing', () => {
    it('parses URL sets, XML entities, last-modified dates, and duplicates', () => {
        const entries = parseSitemap(`
            <?xml version="1.0"?>
            <urlset>
              <url><loc>https://example.com/a?x=1&amp;y=2</loc><lastmod>2026-08-01</lastmod></url>
              <url><loc>https://example.com/a?y=2&amp;x=1</loc></url>
              <url><loc><![CDATA[/relative]]></loc></url>
            </urlset>
        `, 'https://example.com/sitemap.xml');

        expect(entries).toEqual([
            {
                url: 'https://example.com/a?x=1&y=2',
                kind: 'page',
                lastModified: '2026-08-01T00:00:00.000Z',
            },
            { url: 'https://example.com/relative', kind: 'page', lastModified: null },
        ]);
    });

    it('parses nested sitemap indexes', () => {
        expect(parseSitemap(`
            <sitemapindex>
              <sitemap><loc>/docs.xml</loc></sitemap>
              <sitemap><loc>https://example.com/news.xml</loc></sitemap>
            </sitemapindex>
        `, 'https://example.com/sitemap-index.xml')).toEqual([
            { url: 'https://example.com/docs.xml', kind: 'sitemap', lastModified: null },
            { url: 'https://example.com/news.xml', kind: 'sitemap', lastModified: null },
        ]);
    });

    it('recognizes sitemap responses by URL, MIME type, or body', () => {
        expect(looksLikeSitemap('https://example.com/sitemap.xml', 'text/plain', '')).toBe(true);
        expect(looksLikeSitemap('https://example.com/feed', 'application/xml', '')).toBe(true);
        expect(looksLikeSitemap('https://example.com/feed', 'text/plain', '<?xml version="1.0"?><urlset>')).toBe(true);
    });
});
