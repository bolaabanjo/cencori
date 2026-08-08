import { createHash } from 'node:crypto';
import { parse, type DefaultTreeAdapterTypes } from 'parse5';
import type { ExtractedWebDocument, FetchedWebResource, WebEvidenceSpan, WebLink } from './types';
import { normalizeWebUrl } from './url';

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;

const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'svg', 'canvas', 'template', 'form', 'dialog']);
const CHROME_TAGS = new Set(['nav', 'footer', 'aside']);
const CONTENT_TAGS = new Set([
    'address', 'blockquote', 'dd', 'dt', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'li', 'p', 'pre', 'summary', 'td', 'th',
]);
const LEAF_CONTAINER_TAGS = new Set(['article', 'div', 'main', 'section']);
const DATE_META_KEYS = [
    'article:published_time', 'date', 'datepublished', 'dc.date', 'dc.date.issued', 'pubdate', 'publishdate',
];
const MODIFIED_META_KEYS = ['article:modified_time', 'datemodified', 'last-modified', 'og:updated_time'];

function isElement(node: Node): node is Element {
    return 'tagName' in node;
}

function attr(element: Element, name: string): string | null {
    return element.attrs.find(item => item.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}

function descendants(node: Node, callback: (element: Element) => void): void {
    if (isElement(node)) callback(node);
    if ('childNodes' in node) {
        for (const child of node.childNodes) descendants(child, callback);
    }
}

function findFirst(node: Node, predicate: (element: Element) => boolean): Element | null {
    if (isElement(node) && predicate(node)) return node;
    if ('childNodes' in node) {
        for (const child of node.childNodes) {
            const match = findFirst(child, predicate);
            if (match) return match;
        }
    }
    return null;
}

function collapseWhitespace(value: string): string {
    return value.replace(/[\t\f\v ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

function textContent(node: Node): string {
    if ('value' in node) return node.value;
    if (!('childNodes' in node)) return '';
    if (isElement(node) && SKIP_TAGS.has(node.tagName)) return '';
    return node.childNodes.map(textContent).join(' ');
}

function hasContentDescendant(element: Element): boolean {
    return element.childNodes.some(child =>
        (isElement(child) && CONTENT_TAGS.has(child.tagName))
        || (isElement(child) && hasContentDescendant(child))
    );
}

function collectContentBlocks(root: Node): string[] {
    const blocks: string[] = [];
    const visit = (node: Node): void => {
        if (isElement(node) && (SKIP_TAGS.has(node.tagName) || CHROME_TAGS.has(node.tagName))) return;
        if (isElement(node) && CONTENT_TAGS.has(node.tagName)) {
            const text = collapseWhitespace(textContent(node));
            if (text) blocks.push(text);
            return;
        }
        if (isElement(node) && LEAF_CONTAINER_TAGS.has(node.tagName) && !hasContentDescendant(node)) {
            const text = collapseWhitespace(textContent(node));
            if (text) blocks.push(text);
            return;
        }
        if ('childNodes' in node) {
            for (const child of node.childNodes) visit(child);
        }
    };
    visit(root);

    if (blocks.length === 0) {
        const fallback = collapseWhitespace(textContent(root));
        if (fallback) blocks.push(fallback);
    }

    return blocks.filter((block, index) => index === 0 || block !== blocks[index - 1]);
}

function parseDate(value: string | null): string | null {
    if (!value) return null;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function comparablePath(pathname: string): string {
    const normalized = pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '');
    return normalized || '/';
}

function canonicalMatchesFetchedPage(candidate: string, finalUrl: string): boolean {
    const canonical = new URL(candidate);
    const fetched = new URL(finalUrl);
    return canonical.origin === fetched.origin
        && comparablePath(canonical.pathname) === comparablePath(fetched.pathname);
}

function buildEvidenceSpans(blocks: string[]): { content: string; spans: WebEvidenceSpan[] } {
    let content = '';
    const spans: WebEvidenceSpan[] = [];
    for (const block of blocks) {
        if (content) content += '\n\n';
        const start = content.length;
        content += block;
        if (block.length >= 24) {
            spans.push({
                id: `ev_${createHash('sha256').update(block).digest('hex').slice(0, 16)}`,
                text: block,
                start,
                end: content.length,
            });
        }
    }
    return { content, spans: spans.slice(0, 200) };
}

function extractHtml(resource: FetchedWebResource): ExtractedWebDocument {
    const document = parse(resource.body);
    const elements: Element[] = [];
    descendants(document, element => elements.push(element));

    const html = elements.find(element => element.tagName === 'html');
    const titleElement = elements.find(element => element.tagName === 'title');
    const h1 = elements.find(element => element.tagName === 'h1');
    const metadata = new Map<string, string>();
    for (const element of elements) {
        if (element.tagName !== 'meta') continue;
        const key = (attr(element, 'property') || attr(element, 'name') || attr(element, 'itemprop'))?.toLowerCase();
        const value = attr(element, 'content');
        if (key && value && !metadata.has(key)) metadata.set(key, value.trim());
    }

    const canonicalElement = elements.find(element =>
        element.tagName === 'link'
        && (attr(element, 'rel') || '').toLowerCase().split(/\s+/).includes('canonical')
    );
    let canonicalUrl = normalizeWebUrl(resource.finalUrl);
    let declaredCanonicalUrl: string | null = null;
    const canonicalHref = canonicalElement ? attr(canonicalElement, 'href') : null;
    if (canonicalHref) {
        try {
            declaredCanonicalUrl = normalizeWebUrl(canonicalHref, resource.finalUrl);
            // A page may remove tracking parameters through its canonical URL,
            // but a cross-path canonical is not safe as a storage identity. A
            // broken site-wide canonical would otherwise collapse the corpus
            // into one row. Preserve it as metadata for later dedup analysis.
            if (canonicalMatchesFetchedPage(declaredCanonicalUrl, resource.finalUrl)) {
                canonicalUrl = declaredCanonicalUrl;
            }
        } catch {
            declaredCanonicalUrl = null;
        }
    }

    const links: WebLink[] = [];
    const seenLinks = new Set<string>();
    const baseOrigin = new URL(resource.finalUrl).origin;
    for (const element of elements) {
        if (element.tagName !== 'a') continue;
        const href = attr(element, 'href');
        if (!href) continue;
        try {
            const url = normalizeWebUrl(href, resource.finalUrl);
            if (seenLinks.has(url)) continue;
            seenLinks.add(url);
            links.push({
                url,
                text: collapseWhitespace(textContent(element)).slice(0, 300),
                rel: (attr(element, 'rel') || '').toLowerCase().split(/\s+/).filter(Boolean),
                internal: new URL(url).origin === baseOrigin,
            });
        } catch {
            // Ignore mailto, javascript, malformed, and other non-web links.
        }
        if (links.length >= 2_000) break;
    }

    const main = findFirst(document, element => element.tagName === 'main')
        || findFirst(document, element => element.tagName === 'article')
        || findFirst(document, element => element.tagName === 'body')
        || document;
    const blocks = collectContentBlocks(main);
    const { content, spans } = buildEvidenceSpans(blocks);
    const title = collapseWhitespace(
        metadata.get('og:title') || (titleElement ? textContent(titleElement) : '') || (h1 ? textContent(h1) : '')
    ) || new URL(resource.finalUrl).hostname;

    const publishedAt = DATE_META_KEYS.map(key => parseDate(metadata.get(key) || null)).find(Boolean) || null;
    const modifiedAt = MODIFIED_META_KEYS.map(key => parseDate(metadata.get(key) || null)).find(Boolean) || null;

    const extractedMetadata = Object.fromEntries([...metadata.entries()].slice(0, 100));
    if (declaredCanonicalUrl && declaredCanonicalUrl !== canonicalUrl) {
        extractedMetadata.declaredCanonicalUrl = declaredCanonicalUrl;
    }

    return {
        url: resource.url,
        canonicalUrl,
        title: title.slice(0, 1_000),
        description: (metadata.get('description') || metadata.get('og:description') || '').slice(0, 4_000) || null,
        language: html ? attr(html, 'lang')?.slice(0, 32) || null : null,
        content,
        contentHash: resource.contentHash,
        mimeType: resource.mimeType,
        statusCode: resource.statusCode,
        retrievedAt: resource.retrievedAt,
        publishedAt,
        modifiedAt,
        links,
        evidenceSpans: spans,
        metadata: extractedMetadata,
    };
}

export function extractWebDocument(resource: FetchedWebResource): ExtractedWebDocument {
    if (resource.mimeType === 'text/html' || resource.mimeType === 'application/xhtml+xml') {
        return extractHtml(resource);
    }

    const content = resource.body.trim();
    const { content: normalized, spans } = buildEvidenceSpans(
        content.split(/\n{2,}/).map(collapseWhitespace).filter(Boolean)
    );
    const url = normalizeWebUrl(resource.finalUrl);
    return {
        url: resource.url,
        canonicalUrl: url,
        title: new URL(url).pathname.split('/').filter(Boolean).pop() || new URL(url).hostname,
        description: null,
        language: null,
        content: normalized,
        contentHash: resource.contentHash,
        mimeType: resource.mimeType,
        statusCode: resource.statusCode,
        retrievedAt: resource.retrievedAt,
        publishedAt: null,
        modifiedAt: parseDate(resource.headers.lastModified),
        links: [],
        evidenceSpans: spans,
        metadata: {},
    };
}
