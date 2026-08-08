import type { ExtractedWebDocument, WebSearchOptions, WebSearchResult } from './types';
import { normalizeDomain, parseFreshness } from './url';
import { WebRuntimeError } from './errors';
import type { WebDataStore } from './store';

function webDocumentRecord(
    document: ExtractedWebDocument,
    scope: {
        collectionId: string;
        visibility: 'public' | 'project';
        organizationId: string | null;
        projectId: string | null;
        nextCrawlAt?: string | null;
    },
) {
    const canonical = new URL(document.canonicalUrl);
    return {
        collection_id: scope.collectionId,
        visibility: scope.visibility,
        organization_id: scope.organizationId,
        project_id: scope.projectId,
        url: document.url,
        canonical_url: document.canonicalUrl,
        host: canonical.hostname.toLowerCase(),
        path: `${canonical.pathname}${canonical.search}`,
        title: document.title,
        description: document.description,
        language: document.language,
        content: document.content.slice(0, 2_000_000),
        content_hash: document.contentHash,
        mime_type: document.mimeType,
        status_code: document.statusCode,
        published_at: document.publishedAt,
        modified_at: document.modifiedAt,
        retrieved_at: document.retrievedAt,
        indexed_at: new Date().toISOString(),
        next_crawl_at: scope.nextCrawlAt ?? null,
        links: document.links.slice(0, 2_000),
        evidence_spans: document.evidenceSpans,
        metadata: document.metadata,
    };
}

async function upsertWebDocument(store: WebDataStore, record: ReturnType<typeof webDocumentRecord>): Promise<string> {
    return store.upsertDocument(record);
}

export async function indexWebDocument(
    store: WebDataStore,
    organizationId: string,
    projectId: string,
    document: ExtractedWebDocument,
): Promise<string> {
    await store.ensureProjectScope(organizationId, projectId);
    return upsertWebDocument(store, webDocumentRecord(document, {
        collectionId: `project:${projectId}`,
        visibility: 'project',
        organizationId,
        projectId,
    }));
}

export function nextPublicRecrawlAt(document: ExtractedWebDocument, now = Date.now()): string {
    const lastChange = document.modifiedAt || document.publishedAt;
    const ageMs = lastChange ? Math.max(0, now - Date.parse(lastChange)) : Number.POSITIVE_INFINITY;
    const intervalMs = ageMs <= 7 * 86_400_000
        ? 24 * 60 * 60 * 1000
        : ageMs <= 90 * 86_400_000
            ? 7 * 86_400_000
            : 30 * 86_400_000;
    return new Date(now + intervalMs).toISOString();
}

export async function indexPublicWebDocument(
    store: WebDataStore,
    document: ExtractedWebDocument,
): Promise<string> {
    return upsertWebDocument(store, webDocumentRecord(document, {
        collectionId: 'public',
        visibility: 'public',
        organizationId: null,
        projectId: null,
        nextCrawlAt: nextPublicRecrawlAt(document),
    }));
}

interface SearchRow {
    id?: unknown;
    title?: unknown;
    url?: unknown;
    canonical_url?: unknown;
    snippet?: unknown;
    score?: unknown;
    content_hash?: unknown;
    retrieved_at?: unknown;
    published_at?: unknown;
}

function asTimestamp(value: unknown): string | null {
    if (value instanceof Date) return value.toISOString();
    return typeof value === 'string' ? value : null;
}

function normalizeSnippet(value: string): string {
    return value.replace(/<\/?b>/gi, '').replace(/\s+/g, ' ').trim();
}

export async function searchWebIndex(
    store: WebDataStore,
    projectId: string,
    query: string,
    options: WebSearchOptions = {},
): Promise<WebSearchResult[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) throw new WebRuntimeError('invalid_query', 'query is required');
    if (normalizedQuery.length > 2_000) {
        throw new WebRuntimeError('invalid_query', 'query exceeds the 2,000-character limit');
    }

    const limit = Math.min(Math.max(Math.floor(options.limit ?? 10), 1), 50);
    const domain = options.domain ? normalizeDomain(options.domain) : null;
    const freshAfter = parseFreshness(options.freshness);
    const data = await store.searchDocuments(projectId, normalizedQuery, { limit, domain, freshAfter });

    return data.flatMap((row: SearchRow) => {
        if (
            typeof row.id !== 'string'
            || typeof row.title !== 'string'
            || typeof row.url !== 'string'
            || typeof row.canonical_url !== 'string'
            || typeof row.snippet !== 'string'
            || typeof row.content_hash !== 'string'
        ) return [];
        const score = Number(row.score);
        const retrievedAt = asTimestamp(row.retrieved_at);
        if (!retrievedAt) return [];
        const publishedAt = asTimestamp(row.published_at);
        const snippet = normalizeSnippet(row.snippet);
        return [{
            id: row.id,
            title: row.title,
            url: row.url,
            canonicalUrl: row.canonical_url,
            snippet,
            score: Number.isFinite(score) ? score : 0,
            contentHash: row.content_hash,
            retrievedAt,
            publishedAt,
            evidence: {
                quote: snippet,
                contentHash: row.content_hash,
                retrievedAt,
            },
        } satisfies WebSearchResult];
    });
}
