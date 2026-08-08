/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { isPathAllowedByRobots, parseRobotsSitemaps, parseRobotsTxt } from '@/lib/web/robots';

describe('robots policy', () => {
    const groups = parseRobotsTxt(`
        User-agent: *
        Disallow: /private/
        Allow: /private/public-page

        User-agent: CencoriWeb
        Disallow: /machine-only/
        Allow: /machine-only/reference$
    `);

    it('uses the most specific user-agent group', () => {
        expect(isPathAllowedByRobots(groups, '/private/report')).toBe(true);
        expect(isPathAllowedByRobots(groups, '/machine-only/secret')).toBe(false);
    });

    it('lets the longest matching allow rule win', () => {
        expect(isPathAllowedByRobots(groups, '/machine-only/reference')).toBe(true);
        expect(isPathAllowedByRobots(groups, '/machine-only/reference/child')).toBe(false);
    });

    it('honors wildcard policy for other crawlers', () => {
        expect(isPathAllowedByRobots(groups, '/private/report', 'OtherBot')).toBe(false);
        expect(isPathAllowedByRobots(groups, '/private/public-page', 'OtherBot')).toBe(true);
    });

    it('discovers absolute and relative sitemap declarations', () => {
        expect(parseRobotsSitemaps(`
            Sitemap: https://example.com/sitemap-index.xml
            sitemap: /news-sitemap.xml
        `, 'https://example.com')).toEqual([
            'https://example.com/sitemap-index.xml',
            'https://example.com/news-sitemap.xml',
        ]);
    });
});
