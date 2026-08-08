import { normalizeWebUrl } from './url';

export interface SitemapEntry {
    url: string;
    kind: 'page' | 'sitemap';
    lastModified: string | null;
}

function decodeXml(value: string): string {
    return value
        .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')
        .replaceAll('&amp;', '&')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"')
        .replaceAll('&apos;', "'")
        .trim();
}

function elementValue(block: string, name: string): string | null {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
    return match ? decodeXml(match[1]) : null;
}

export function parseSitemap(value: string, baseUrl: string, limit = 50_000): SitemapEntry[] {
    const entries: SitemapEntry[] = [];
    const seen = new Set<string>();
    const sitemapIndex = /<sitemapindex(?:\s[^>]*)?>/i.test(value);
    const itemPattern = sitemapIndex
        ? /<sitemap(?:\s[^>]*)?>([\s\S]*?)<\/sitemap>/gi
        : /<url(?:\s[^>]*)?>([\s\S]*?)<\/url>/gi;

    let match: RegExpExecArray | null;
    while ((match = itemPattern.exec(value)) !== null && entries.length < limit) {
        const location = elementValue(match[1], 'loc');
        if (!location) continue;
        try {
            const url = normalizeWebUrl(location, baseUrl);
            if (seen.has(url)) continue;
            seen.add(url);
            const lastModifiedRaw = elementValue(match[1], 'lastmod');
            const lastModifiedTimestamp = lastModifiedRaw ? Date.parse(lastModifiedRaw) : Number.NaN;
            entries.push({
                url,
                kind: sitemapIndex ? 'sitemap' : 'page',
                lastModified: Number.isFinite(lastModifiedTimestamp)
                    ? new Date(lastModifiedTimestamp).toISOString()
                    : null,
            });
        } catch {
            // Ignore malformed or non-HTTP locations.
        }
    }

    // Some non-standard feeds expose a flat list of <loc> elements without a
    // urlset/sitemapindex wrapper. Treat those as page URLs.
    if (entries.length === 0) {
        const locPattern = /<loc(?:\s[^>]*)?>([\s\S]*?)<\/loc>/gi;
        while ((match = locPattern.exec(value)) !== null && entries.length < limit) {
            try {
                const url = normalizeWebUrl(decodeXml(match[1]), baseUrl);
                if (!seen.has(url)) {
                    seen.add(url);
                    entries.push({ url, kind: 'page', lastModified: null });
                }
            } catch {
                // Ignore malformed locations.
            }
        }
    }
    return entries;
}

export function looksLikeSitemap(url: string, mimeType: string, body: string): boolean {
    return /(?:sitemap|\.xml)(?:\.gz)?(?:$|[?#])/i.test(url)
        || mimeType.includes('xml')
        || /^\s*<\?xml[\s\S]*<(?:urlset|sitemapindex)\b/i.test(body);
}
