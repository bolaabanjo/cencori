import type { ExtractedWebDocument, WebSearchOptions, WebSearchResult } from './types';
import { normalizeDomain, parseFreshness } from './url';
import { WebRuntimeError } from './errors';
import type { WebDataStore } from './store';
import { embedWebDocument, embedWebText, webEmbeddingModel } from './embeddings';
import { deriveWebDocumentSignals, rerankWebCandidates, type HybridSearchCandidate } from './ranking';

export interface WebIndexOptions {
    authorityScore?: number;
    noarchive?: boolean;
    nosnippet?: boolean;
    metadata?: Record<string, unknown>;
}

function webDocumentRecord(
    document: ExtractedWebDocument,
    scope: {
        collectionId: string;
        visibility: 'public' | 'project';
        organizationId: string | null;
        projectId: string | null;
        nextCrawlAt?: string | null;
        indexOptions?: WebIndexOptions;
    },
    embedding: number[] | null,
) {
    const canonical = new URL(document.canonicalUrl);
    const signals = deriveWebDocumentSignals(document, scope.indexOptions?.authorityScore);
    const semanticBuckets = embedding ? Array.from({ length: 4 }, (_, bucket) => {
        let value = 0;
        for (let bit = 0; bit < 8; bit += 1) if ((embedding[bucket * 8 + bit] ?? -1) >= 0) value |= (1 << bit);
        return value;
    }) : [null, null, null, null];
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
        metadata: { ...document.metadata, ...scope.indexOptions?.metadata },
        semantic_embedding: embedding,
        embedding_model: embedding ? webEmbeddingModel() : null,
        semantic_bucket_1: semanticBuckets[0],
        semantic_bucket_2: semanticBuckets[1],
        semantic_bucket_3: semanticBuckets[2],
        semantic_bucket_4: semanticBuckets[3],
        authority_score: signals.authorityScore,
        quality_score: signals.qualityScore,
        spam_score: signals.spamScore,
        noarchive: scope.indexOptions?.noarchive === true,
        nosnippet: scope.indexOptions?.nosnippet === true,
    };
}

async function createWebDocumentRecord(document: ExtractedWebDocument, scope: Parameters<typeof webDocumentRecord>[1]) {
    let embedding: number[] | null = null;
    try {
        embedding = await embedWebDocument(document.title, document.content);
    } catch (error) {
        console.warn('[cencori-web] semantic document embedding failed; indexing lexically', error);
    }
    return webDocumentRecord(document, scope, embedding);
}

async function upsertWebDocument(store: WebDataStore, record: Awaited<ReturnType<typeof createWebDocumentRecord>>): Promise<string> {
    return store.upsertDocument(record);
}

export async function indexWebDocument(
    store: WebDataStore,
    organizationId: string,
    projectId: string,
    document: ExtractedWebDocument,
    options: WebIndexOptions = {},
): Promise<string> {
    await store.ensureProjectScope(organizationId, projectId);
    return upsertWebDocument(store, await createWebDocumentRecord(document, {
        collectionId: `project:${projectId}`,
        visibility: 'project',
        organizationId,
        projectId,
        indexOptions: options,
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
    options: WebIndexOptions = {},
): Promise<string> {
    return upsertWebDocument(store, await createWebDocumentRecord(document, {
        collectionId: 'public',
        visibility: 'public',
        organizationId: null,
        projectId: null,
        nextCrawlAt: nextPublicRecrawlAt(document),
        indexOptions: options,
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
    modified_at?: unknown;
    host?: unknown;
    lexical_score?: unknown;
    semantic_score?: unknown;
    authority_score?: unknown;
    quality_score?: unknown;
    spam_score?: unknown;
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
    const language = typeof options.language === 'string' && options.language.trim()
        ? options.language.trim().toLowerCase().slice(0, 35)
        : null;
    let queryEmbedding: number[] | null = options.queryEmbedding || null;
    if (!queryEmbedding) {
        try {
            queryEmbedding = await embedWebText(normalizedQuery);
        } catch (error) {
            console.warn('[cencori-web] semantic query embedding failed; searching lexically', error);
        }
    }
    const candidateLimit = Math.min(Math.max(limit * 8, 50), 250);
    const data = await store.searchDocuments(projectId, normalizedQuery, {
        limit: candidateLimit,
        domain,
        freshAfter,
        language,
        queryEmbedding,
    });

    const candidates = data.flatMap((row: SearchRow): HybridSearchCandidate[] => {
        if (
            typeof row.id !== 'string'
            || typeof row.title !== 'string'
            || typeof row.url !== 'string'
            || typeof row.canonical_url !== 'string'
            || typeof row.snippet !== 'string'
            || typeof row.content_hash !== 'string'
        ) return [];
        const retrievedAt = asTimestamp(row.retrieved_at);
        if (!retrievedAt) return [];
        const publishedAt = asTimestamp(row.published_at);
        const snippet = normalizeSnippet(row.snippet);
        const canonicalUrl = row.canonical_url;
        return [{
            id: row.id,
            title: row.title,
            url: row.url,
            canonicalUrl,
            host: typeof row.host === 'string' ? row.host : new URL(canonicalUrl).hostname,
            snippet,
            contentHash: row.content_hash,
            retrievedAt,
            publishedAt,
            modifiedAt: asTimestamp(row.modified_at),
            lexicalScore: Number(row.lexical_score ?? row.score) || 0,
            semanticScore: Number(row.semantic_score) || 0,
            authorityScore: Number(row.authority_score) || 0.5,
            qualityScore: Number(row.quality_score) || 0.5,
            spamScore: Number(row.spam_score) || 0,
        }];
    });
    return rerankWebCandidates(candidates, limit, { domainConstrained: Boolean(domain) }).map(candidate => ({
        id: candidate.id,
        title: candidate.title,
        url: candidate.url,
        canonicalUrl: candidate.canonicalUrl,
        snippet: candidate.snippet,
        score: candidate.score,
        contentHash: candidate.contentHash,
        retrievedAt: candidate.retrievedAt,
        publishedAt: candidate.publishedAt,
        evidence: {
            quote: candidate.snippet,
            contentHash: candidate.contentHash,
            retrievedAt: candidate.retrievedAt,
        },
    } satisfies WebSearchResult));
}
