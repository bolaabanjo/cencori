import crypto from 'node:crypto';
import type { GatewayContext } from '@/lib/gateway-middleware';
import { extractWebDocument } from './html';
import { fetchWebResource } from './fetch';
import { indexPublicWebDocument, indexWebDocument } from './index';
import { WebRuntimeError } from './errors';
import { getRobotsSitemaps } from './robots';
import { looksLikeSitemap, parseSitemap } from './sitemap';
import type {
    PublicCrawlJobOptions,
    WebCrawlJob,
    WebFrontierKind,
    WebFrontierWorkerResult,
} from './types';
import { normalizeWebUrl } from './url';

type SupabaseClient = GatewayContext['supabase'];

interface FrontierEntryInput {
    url: string;
    origin: string;
    parent_url: string | null;
    depth: number;
    kind: WebFrontierKind;
    metadata: Record<string, unknown>;
}

interface ClaimedFrontierItem {
    jobId: string;
    frontierId: number;
    url: string;
    origin: string;
    parentUrl: string | null;
    depth: number;
    kind: WebFrontierKind;
    attempts: number;
    maxDepth: number;
    maxAttempts: number;
    sameOrigin: boolean;
    allowedOrigins: string[];
    maxPages: number;
    maxFrontier: number;
    visibility: 'public' | 'project';
    collectionId: string;
    organizationId: string | null;
    projectId: string | null;
}

interface ItemOutcome {
    indexed: number;
    failed: number;
    skipped: number;
    retried: number;
    discovered: number;
}

function asNumber(value: unknown): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function mapJob(row: Record<string, unknown>): WebCrawlJob {
    return {
        id: String(row.id),
        collectionId: String(row.collection_id),
        visibility: row.visibility === 'project' ? 'project' : 'public',
        status: row.status as WebCrawlJob['status'],
        seeds: Array.isArray(row.seeds) ? row.seeds.filter((seed): seed is string => typeof seed === 'string') : [],
        allowedOrigins: Array.isArray(row.allowed_origins)
            ? row.allowed_origins.filter((origin): origin is string => typeof origin === 'string')
            : [],
        sameOrigin: row.same_origin !== false,
        maxPages: asNumber(row.max_pages),
        maxFrontier: asNumber(row.max_frontier),
        maxDepth: asNumber(row.max_depth),
        maxAttempts: asNumber(row.max_attempts),
        pagesDiscovered: asNumber(row.pages_discovered),
        itemsProcessed: asNumber(row.items_processed),
        pagesProcessed: asNumber(row.pages_processed),
        pagesIndexed: asNumber(row.pages_indexed),
        pagesFailed: asNumber(row.pages_failed),
        pagesSkipped: asNumber(row.pages_skipped),
        lastError: typeof row.last_error === 'string' ? row.last_error : null,
        createdAt: String(row.created_at),
        startedAt: typeof row.started_at === 'string' ? row.started_at : null,
        finishedAt: typeof row.finished_at === 'string' ? row.finished_at : null,
    };
}

export async function enqueueFrontierEntries(
    supabase: SupabaseClient,
    jobId: string,
    entries: FrontierEntryInput[],
): Promise<number> {
    let inserted = 0;
    for (let start = 0; start < entries.length; start += 500) {
        const chunk = entries.slice(start, start + 500);
        const { data, error } = await supabase.rpc('enqueue_web_crawl_urls', {
            p_job_id: jobId,
            p_entries: chunk,
        });
        if (error) throw new WebRuntimeError('frontier_unavailable', error.message, 503);
        const count = asNumber(data);
        inserted += count;
        if (count < chunk.length) {
            // Either duplicates were ignored or the durable frontier reached its
            // configured ceiling. Continuing is safe but usually wasted work.
            const { data: job } = await supabase
                .from('web_crawl_jobs')
                .select('pages_discovered,max_frontier')
                .eq('id', jobId)
                .maybeSingle();
            if (job && asNumber(job.pages_discovered) >= asNumber(job.max_frontier)) break;
        }
    }
    return inserted;
}

export async function createPublicCrawlJob(
    supabase: SupabaseClient,
    options: PublicCrawlJobOptions,
): Promise<WebCrawlJob> {
    if (!Array.isArray(options.seeds) || options.seeds.length === 0) {
        throw new WebRuntimeError('invalid_seeds', 'At least one public crawl seed is required');
    }
    if (options.seeds.length > 500) {
        throw new WebRuntimeError('invalid_seeds', 'A public crawl job may contain at most 500 seeds');
    }

    const seeds = [...new Set(options.seeds.map(seed => normalizeWebUrl(seed)))];
    const allowedOrigins = [...new Set(seeds.map(seed => new URL(seed).origin))];
    const maxPages = Math.min(Math.max(Math.floor(options.maxPages ?? 1_000), 1), 1_000_000);
    const maxFrontier = Math.min(
        Math.max(
            Math.floor(options.maxFrontier ?? Math.max(maxPages * 20, seeds.length * 2)),
            maxPages,
            seeds.length * 2,
        ),
        5_000_000,
    );
    const maxDepth = Math.min(Math.max(Math.floor(options.maxDepth ?? 2), 0), 10);
    const maxAttempts = Math.min(Math.max(Math.floor(options.maxAttempts ?? 3), 1), 10);
    const priority = Math.min(Math.max(Math.floor(options.priority ?? 0), -100), 100);

    const { data, error } = await supabase
        .from('web_crawl_jobs')
        .insert({
            collection_id: 'public',
            visibility: 'public',
            seeds,
            allowed_origins: allowedOrigins,
            same_origin: options.sameOrigin !== false,
            max_pages: maxPages,
            max_frontier: maxFrontier,
            max_depth: maxDepth,
            max_attempts: maxAttempts,
            priority,
            metadata: options.metadata || {},
        })
        .select('*')
        .single();
    if (error || !data) throw new WebRuntimeError('frontier_unavailable', error?.message || 'Crawl job could not be created', 503);

    const seedEntries: FrontierEntryInput[] = [];
    for (const seed of seeds) {
        const parsed = new URL(seed);
        seedEntries.push({
            url: seed,
            origin: parsed.origin,
            parent_url: null,
            depth: 0,
            kind: /(?:sitemap|\.xml)(?:$|[?#])/i.test(seed) ? 'sitemap' : 'page',
            metadata: { seed: true },
        });
        if (!/(?:sitemap|\.xml)(?:$|[?#])/i.test(seed)) {
            const sitemapUrl = normalizeWebUrl('/sitemap.xml', seed);
            seedEntries.push({
                url: sitemapUrl,
                origin: parsed.origin,
                parent_url: seed,
                depth: 0,
                kind: 'sitemap',
                metadata: { conventional: true },
            });
        }
    }

    try {
        await enqueueFrontierEntries(supabase, String(data.id), seedEntries);
    } catch (enqueueError) {
        await supabase
            .from('web_crawl_jobs')
            .update({ status: 'failed', last_error: enqueueError instanceof Error ? enqueueError.message : 'Seed enqueue failed' })
            .eq('id', data.id);
        throw enqueueError;
    }

    const { data: refreshed, error: refreshError } = await supabase
        .from('web_crawl_jobs')
        .select('*')
        .eq('id', data.id)
        .single();
    if (refreshError || !refreshed) throw new WebRuntimeError('frontier_unavailable', refreshError?.message || 'Crawl job could not be loaded', 503);
    return mapJob(refreshed as Record<string, unknown>);
}

export async function getPublicCrawlJob(supabase: SupabaseClient, jobId: string): Promise<WebCrawlJob | null> {
    const { data, error } = await supabase
        .from('web_crawl_jobs')
        .select('*')
        .eq('id', jobId)
        .eq('visibility', 'public')
        .maybeSingle();
    if (error) throw new WebRuntimeError('frontier_unavailable', error.message, 503);
    return data ? mapJob(data as Record<string, unknown>) : null;
}

export async function listPublicCrawlJobs(
    supabase: SupabaseClient,
    limit = 50,
): Promise<WebCrawlJob[]> {
    const { data, error } = await supabase
        .from('web_crawl_jobs')
        .select('*')
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .limit(Math.min(Math.max(limit, 1), 100));
    if (error) throw new WebRuntimeError('frontier_unavailable', error.message, 503);
    return (data || []).map(row => mapJob(row as Record<string, unknown>));
}

async function claimFrontierBatch(
    supabase: SupabaseClient,
    workerId: string,
    limit: number,
): Promise<ClaimedFrontierItem[]> {
    const { data, error } = await supabase.rpc('claim_web_crawl_batch', {
        p_worker_id: workerId,
        p_limit: Math.min(Math.max(limit, 1), 25),
        p_lease_seconds: 90,
    });
    if (error) throw new WebRuntimeError('frontier_unavailable', error.message, 503);
    return (Array.isArray(data) ? data : []).map(row => ({
        jobId: String(row.job_id),
        frontierId: asNumber(row.frontier_id),
        url: String(row.url),
        origin: String(row.origin),
        parentUrl: typeof row.parent_url === 'string' ? row.parent_url : null,
        depth: asNumber(row.depth),
        kind: row.kind === 'sitemap' ? 'sitemap' : 'page',
        attempts: asNumber(row.attempts),
        maxDepth: asNumber(row.max_depth),
        maxAttempts: asNumber(row.max_attempts),
        sameOrigin: row.same_origin !== false,
        allowedOrigins: Array.isArray(row.allowed_origins) ? row.allowed_origins : [],
        maxPages: asNumber(row.max_pages),
        maxFrontier: asNumber(row.max_frontier),
        visibility: row.visibility === 'project' ? 'project' : 'public',
        collectionId: String(row.collection_id),
        organizationId: typeof row.organization_id === 'string' ? row.organization_id : null,
        projectId: typeof row.project_id === 'string' ? row.project_id : null,
    }));
}

async function completeFrontierItem(
    supabase: SupabaseClient,
    workerId: string,
    item: ClaimedFrontierItem,
    result: {
        status: 'completed' | 'failed' | 'skipped';
        documentId?: string;
        error?: string;
        retry?: boolean;
    },
): Promise<void> {
    const retryDelay = Math.min(30 * 2 ** Math.max(item.attempts - 1, 0), 3_600);
    const { data, error } = await supabase.rpc('complete_web_crawl_item', {
        p_job_id: item.jobId,
        p_frontier_id: item.frontierId,
        p_worker_id: workerId,
        p_status: result.status,
        p_document_id: result.documentId || null,
        p_error: result.error || null,
        p_retry: result.retry === true,
        p_retry_delay_seconds: retryDelay,
    });
    if (error || data !== true) {
        throw new WebRuntimeError('frontier_unavailable', error?.message || 'Crawl item lease could not be completed', 503);
    }
}

function isRetryable(error: unknown): boolean {
    if (!(error instanceof WebRuntimeError)) return true;
    if (['robots_denied', 'unsafe_url', 'invalid_url', 'unsupported_content_type', 'response_too_large'].includes(error.code)) {
        return false;
    }
    const remoteStatus = Number(error.details?.statusCode);
    return error.status >= 500 || remoteStatus === 408 || remoteStatus === 429 || remoteStatus >= 500;
}

function frontierEntry(
    url: string,
    kind: WebFrontierKind,
    depth: number,
    parentUrl: string,
    metadata: Record<string, unknown> = {},
): FrontierEntryInput {
    const normalized = normalizeWebUrl(url, parentUrl);
    return {
        url: normalized,
        origin: new URL(normalized).origin,
        parent_url: parentUrl,
        depth,
        kind,
        metadata,
    };
}

async function processFrontierItem(
    supabase: SupabaseClient,
    workerId: string,
    item: ClaimedFrontierItem,
): Promise<ItemOutcome> {
    let discovered = 0;
    try {
        const resource = await fetchWebResource(item.url, { timeoutMs: 8_000 });
        if (item.kind === 'sitemap' || looksLikeSitemap(item.url, resource.mimeType, resource.body)) {
            const entries = parseSitemap(resource.body, resource.finalUrl, item.maxFrontier)
                .filter(entry => entry.kind !== 'sitemap' || item.depth < 5)
                .map(entry => frontierEntry(
                    entry.url,
                    entry.kind,
                    entry.kind === 'sitemap' ? item.depth + 1 : 0,
                    item.url,
                    entry.lastModified ? { lastModified: entry.lastModified } : {},
                ));
            discovered += await enqueueFrontierEntries(supabase, item.jobId, entries);
            await completeFrontierItem(supabase, workerId, item, { status: 'completed' });
            return { indexed: 0, failed: 0, skipped: 0, retried: 0, discovered };
        }

        const document = extractWebDocument(resource);
        if (document.content.length < 20) {
            await completeFrontierItem(supabase, workerId, item, {
                status: 'skipped',
                error: 'Page did not contain enough indexable text',
            });
            return { indexed: 0, failed: 0, skipped: 1, retried: 0, discovered };
        }

        const documentId = item.visibility === 'public'
            ? await indexPublicWebDocument(supabase, document)
            : item.organizationId && item.projectId
                ? await indexWebDocument(supabase, item.organizationId, item.projectId, document)
                : null;
        if (!documentId) throw new WebRuntimeError('invalid_crawl_scope', 'Project crawl scope is incomplete', 500);

        const expansion: FrontierEntryInput[] = [];
        if (item.depth < item.maxDepth) {
            for (const link of document.links) {
                if (link.rel.includes('nofollow')) continue;
                try {
                    expansion.push(frontierEntry(link.url, 'page', item.depth + 1, item.url));
                } catch {
                    // The extraction layer already filters malformed links, but
                    // frontier normalization remains a separate trust boundary.
                }
            }
        }
        if (item.depth === 0) {
            const sitemaps = await getRobotsSitemaps(item.url);
            for (const sitemap of sitemaps) {
                try {
                    expansion.push(frontierEntry(sitemap, 'sitemap', 0, item.url, { robots: true }));
                } catch {
                    // Ignore malformed robots sitemap declarations.
                }
            }
        }
        discovered += await enqueueFrontierEntries(supabase, item.jobId, expansion);
        await completeFrontierItem(supabase, workerId, item, { status: 'completed', documentId });
        return { indexed: 1, failed: 0, skipped: 0, retried: 0, discovered };
    } catch (error) {
        const retry = isRetryable(error) && item.attempts < item.maxAttempts;
        const skipped = error instanceof WebRuntimeError && !isRetryable(error);
        await completeFrontierItem(supabase, workerId, item, {
            status: skipped ? 'skipped' : 'failed',
            error: error instanceof Error ? error.message : 'Crawl item failed',
            retry,
        });
        return {
            indexed: 0,
            failed: retry || skipped ? 0 : 1,
            skipped: skipped ? 1 : 0,
            retried: retry ? 1 : 0,
            discovered,
        };
    }
}

async function processBatchWithOriginPoliteness(
    supabase: SupabaseClient,
    workerId: string,
    items: ClaimedFrontierItem[],
): Promise<ItemOutcome[]> {
    const groups = new Map<string, ClaimedFrontierItem[]>();
    for (const item of items) {
        const group = groups.get(item.origin) || [];
        group.push(item);
        groups.set(item.origin, group);
    }

    const groupedOutcomes = await Promise.all([...groups.values()].map(async group => {
        const outcomes: ItemOutcome[] = [];
        for (let index = 0; index < group.length; index += 1) {
            if (index > 0) await new Promise(resolve => setTimeout(resolve, 250));
            outcomes.push(await processFrontierItem(supabase, workerId, group[index]));
        }
        return outcomes;
    }));
    return groupedOutcomes.flat();
}

export async function scheduleDuePublicRecrawls(
    supabase: SupabaseClient,
    limit = 100,
): Promise<WebCrawlJob | null> {
    const boundedLimit = Math.min(Math.max(limit, 1), 1_000);
    const { data, error } = await supabase
        .from('web_documents')
        .select('id,canonical_url')
        .eq('visibility', 'public')
        .not('next_crawl_at', 'is', null)
        .lte('next_crawl_at', new Date().toISOString())
        .order('next_crawl_at', { ascending: true })
        .limit(boundedLimit);
    if (error) throw new WebRuntimeError('frontier_unavailable', error.message, 503);
    if (!data || data.length === 0) return null;

    const job = await createPublicCrawlJob(supabase, {
        seeds: data.map(row => String(row.canonical_url)),
        maxPages: data.length,
        maxFrontier: data.length * 2,
        maxDepth: 0,
        priority: 10,
        metadata: { type: 'scheduled_recrawl' },
    });
    await supabase
        .from('web_documents')
        .update({ next_crawl_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })
        .in('id', data.map(row => row.id));
    return job;
}

export async function processWebFrontier(
    supabase: SupabaseClient,
    options: { maxItems?: number; batchSize?: number; timeBudgetMs?: number; workerId?: string; signal?: AbortSignal } = {},
): Promise<WebFrontierWorkerResult> {
    const startedAt = Date.now();
    const maxItems = Math.min(Math.max(options.maxItems ?? 25, 1), 250);
    const batchSize = Math.min(Math.max(options.batchSize ?? 5, 1), 25);
    const timeBudgetMs = Math.min(Math.max(options.timeBudgetMs ?? 45_000, 5_000), 240_000);
    const workerId = options.workerId || `web_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`;
    const result: WebFrontierWorkerResult = {
        workerId,
        batches: 0,
        claimed: 0,
        indexed: 0,
        failed: 0,
        skipped: 0,
        retried: 0,
        discovered: 0,
        jobs: [],
        elapsedMs: 0,
    };

    while (
        !options.signal?.aborted
        && result.claimed < maxItems
        && Date.now() - startedAt < Math.max(timeBudgetMs - 15_000, 1_000)
    ) {
        const items = await claimFrontierBatch(supabase, workerId, Math.min(batchSize, maxItems - result.claimed));
        if (items.length === 0) break;
        result.batches += 1;
        result.claimed += items.length;
        const jobId = items[0].jobId;
        if (!result.jobs.includes(jobId)) result.jobs.push(jobId);

        const outcomes = await processBatchWithOriginPoliteness(supabase, workerId, items);
        for (const outcome of outcomes) {
            result.indexed += outcome.indexed;
            result.failed += outcome.failed;
            result.skipped += outcome.skipped;
            result.retried += outcome.retried;
            result.discovered += outcome.discovered;
        }

        const { error } = await supabase.rpc('release_web_crawl_job', {
            p_job_id: jobId,
            p_worker_id: workerId,
        });
        if (error) throw new WebRuntimeError('frontier_unavailable', error.message, 503);
    }

    result.elapsedMs = Date.now() - startedAt;
    return result;
}
