import type { GatewayContext } from '@/lib/gateway-middleware';
import type { ExtractedWebDocument, WebSearchOptions, WebSearchResult } from './types';
import { normalizeDomain, parseFreshness } from './url';
import { WebRuntimeError } from './errors';

type SupabaseClient = GatewayContext['supabase'];

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

async function upsertWebDocument(supabase: SupabaseClient, record: ReturnType<typeof webDocumentRecord>): Promise<string> {
    const { data, error } = await supabase
        .from('web_documents')
        .upsert(record, { onConflict: 'collection_id,canonical_url' })
        .select('id')
        .single();
    if (error || !data?.id) {
        throw new WebRuntimeError('index_unavailable', error?.message || 'Web document could not be indexed', 503);
    }
    return data.id as string;
}

export async function indexWebDocument(
    supabase: SupabaseClient,
    organizationId: string,
    projectId: string,
    document: ExtractedWebDocument,
): Promise<string> {
    return upsertWebDocument(supabase, webDocumentRecord(document, {
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
    supabase: SupabaseClient,
    document: ExtractedWebDocument,
): Promise<string> {
    return upsertWebDocument(supabase, webDocumentRecord(document, {
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

export async function searchWebIndex(
    supabase: SupabaseClient,
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
    const { data, error } = await supabase.rpc('search_cencori_web', {
        p_project_id: projectId,
        p_query: normalizedQuery,
        p_limit: limit,
        p_domain: domain,
        p_fresh_after: freshAfter,
    });
    if (error) throw new WebRuntimeError('search_unavailable', error.message, 503);

    return (Array.isArray(data) ? data : []).flatMap((row: SearchRow) => {
        if (
            typeof row.id !== 'string'
            || typeof row.title !== 'string'
            || typeof row.url !== 'string'
            || typeof row.canonical_url !== 'string'
            || typeof row.snippet !== 'string'
            || typeof row.content_hash !== 'string'
            || typeof row.retrieved_at !== 'string'
        ) return [];
        const score = Number(row.score);
        return [{
            id: row.id,
            title: row.title,
            url: row.url,
            canonicalUrl: row.canonical_url,
            snippet: row.snippet.replace(/\s+/g, ' ').trim(),
            score: Number.isFinite(score) ? score : 0,
            contentHash: row.content_hash,
            retrievedAt: row.retrieved_at,
            publishedAt: typeof row.published_at === 'string' ? row.published_at : null,
            evidence: {
                quote: row.snippet.replace(/\s+/g, ' ').trim(),
                contentHash: row.content_hash,
                retrievedAt: row.retrieved_at,
            },
        } satisfies WebSearchResult];
    });
}
