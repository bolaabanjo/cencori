import crypto from 'node:crypto';
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
import type { WebDataStore } from './store';
import { documentPolicyDecision, mapDomainPolicies, prefetchPolicyDecision, type WebDomainPolicy } from './policy';

type SupabaseClient = WebDataStore;

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

interface CrawlJobRules {
    pathPrefixes: string[];
    languages: string[];
    authorityScore: number;
    metadata: Record<string, unknown>;
    domainPolicies: Map<string, WebDomainPolicy[]>;
}

function asNumber(value: unknown): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function asTimestamp(value: unknown): string | null {
    if (value instanceof Date) return value.toISOString();
    if (typeof value !== 'string') return null;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : value;
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
        createdAt: asTimestamp(row.created_at) || '',
        startedAt: asTimestamp(row.started_at),
        finishedAt: asTimestamp(row.finished_at),
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
        const count = await supabase.enqueueCrawlUrls(jobId, chunk);
        inserted += count;
        if (count < chunk.length) {
            // Either duplicates were ignored or the durable frontier reached its
            // configured ceiling. Continuing is safe but usually wasted work.
            const job = await supabase.getCrawlJobBudget(jobId);
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

    const data = await supabase.createCrawlJob({
        collection_id: 'public',
        visibility: 'public',
        organization_id: null,
        project_id: null,
        seeds,
        allowed_origins: allowedOrigins,
        same_origin: options.sameOrigin !== false,
        max_pages: maxPages,
        max_frontier: maxFrontier,
        max_depth: maxDepth,
        max_attempts: maxAttempts,
        priority,
        metadata: options.metadata || {},
    });

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
        await supabase.failCrawlJob(
            String(data.id),
            enqueueError instanceof Error ? enqueueError.message : 'Seed enqueue failed',
        );
        throw enqueueError;
    }

    const refreshed = await supabase.getCrawlJob(String(data.id));
    if (!refreshed) throw new WebRuntimeError('frontier_unavailable', 'Crawl job could not be loaded', 503);
    return mapJob(refreshed);
}

export async function getPublicCrawlJob(supabase: SupabaseClient, jobId: string): Promise<WebCrawlJob | null> {
    const data = await supabase.getCrawlJob(jobId);
    return data && data.visibility === 'public' ? mapJob(data) : null;
}

export async function listPublicCrawlJobs(
    supabase: SupabaseClient,
    limit = 50,
): Promise<WebCrawlJob[]> {
    const data = await supabase.listPublicCrawlJobs(Math.min(Math.max(limit, 1), 100));
    return data.map(mapJob);
}

async function claimFrontierBatch(
    supabase: SupabaseClient,
    workerId: string,
    limit: number,
): Promise<ClaimedFrontierItem[]> {
    const data = await supabase.claimCrawlBatch(workerId, Math.min(Math.max(limit, 1), 25), 90);
    return data.map(row => ({
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
    const completed = await supabase.completeCrawlItem({
        jobId: item.jobId,
        frontierId: item.frontierId,
        workerId,
        status: result.status,
        documentId: result.documentId || null,
        error: result.error || null,
        retry: result.retry === true,
        retryDelaySeconds: retryDelay,
    });
    if (!completed) {
        throw new WebRuntimeError('frontier_unavailable', 'Crawl item lease could not be completed', 503);
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

function stringList(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function pageAllowedByJob(url: string, rules: CrawlJobRules): boolean {
    if (rules.pathPrefixes.length === 0) return true;
    return rules.pathPrefixes.some(prefix => new URL(url).pathname.startsWith(prefix));
}

function languageAllowed(language: string | null, rules: CrawlJobRules): boolean {
    if (rules.languages.length === 0 || !language) return true;
    const normalized = language.toLowerCase();
    return rules.languages.some(allowed => normalized === allowed || normalized.startsWith(`${allowed}-`));
}

async function loadCrawlJobRules(store: WebDataStore, jobId: string): Promise<CrawlJobRules> {
    const row = await store.getCrawlJob(jobId);
    const metadata = row?.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? row.metadata as Record<string, unknown>
        : {};
    return {
        pathPrefixes: stringList(metadata.pathPrefixes),
        languages: stringList(metadata.languages).map(language => language.toLowerCase()),
        authorityScore: Math.min(Math.max(Number(metadata.authorityScore) || 0.5, 0), 1),
        metadata,
        domainPolicies: new Map(),
    };
}

async function domainPolicies(store: WebDataStore, url: string, rules: CrawlJobRules): Promise<WebDomainPolicy[]> {
    const host = new URL(url).hostname.toLowerCase();
    const cached = rules.domainPolicies.get(host);
    if (cached) return cached;
    const policies = mapDomainPolicies(await store.getDomainPolicies(host));
    rules.domainPolicies.set(host, policies);
    return policies;
}

async function processFrontierItem(
    supabase: SupabaseClient,
    workerId: string,
    item: ClaimedFrontierItem,
    rules: CrawlJobRules,
): Promise<ItemOutcome> {
    let discovered = 0;
    try {
        if (item.kind === 'page' && !pageAllowedByJob(item.url, rules)) {
            await completeFrontierItem(supabase, workerId, item, { status: 'skipped', error: 'outside configured corpus path' });
            return { indexed: 0, failed: 0, skipped: 1, retried: 0, discovered: 0 };
        }
        if (await supabase.isDocumentTombstoned(normalizeWebUrl(item.url))) {
            await completeFrontierItem(supabase, workerId, item, { status: 'skipped', error: 'document is tombstoned' });
            return { indexed: 0, failed: 0, skipped: 1, retried: 0, discovered: 0 };
        }
        const baseDecision = prefetchPolicyDecision(item.url, await domainPolicies(supabase, item.url, rules));
        if (!baseDecision.fetch) {
            await completeFrontierItem(supabase, workerId, item, { status: 'skipped', error: baseDecision.reasons.join('; ') });
            return { indexed: 0, failed: 0, skipped: 1, retried: 0, discovered: 0 };
        }
        const resource = await fetchWebResource(item.url, { timeoutMs: 8_000 });
        if (item.kind === 'sitemap' || looksLikeSitemap(item.url, resource.mimeType, resource.body)) {
            const entries = parseSitemap(resource.body, resource.finalUrl, item.maxFrontier)
                .filter(entry => (entry.kind !== 'sitemap' || item.depth < 5)
                    && (entry.kind === 'sitemap' || pageAllowedByJob(entry.url, rules)))
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
        const policy = documentPolicyDecision(document, resource, baseDecision);
        if (!languageAllowed(document.language, rules)) {
            await completeFrontierItem(supabase, workerId, item, { status: 'skipped', error: 'outside configured corpus language' });
            return { indexed: 0, failed: 0, skipped: 1, retried: 0, discovered: 0 };
        }
        if (document.content.length < 20) {
            await completeFrontierItem(supabase, workerId, item, {
                status: 'skipped',
                error: 'Page did not contain enough indexable text',
            });
            return { indexed: 0, failed: 0, skipped: 1, retried: 0, discovered };
        }

        let documentId: string | null = null;
        if (!policy.index) await supabase.deleteDocument(document.canonicalUrl);
        if (policy.index) documentId = item.visibility === 'public'
            ? await indexPublicWebDocument(supabase, document, {
                authorityScore: rules.authorityScore,
                noarchive: !policy.archive,
                nosnippet: !policy.snippet,
                metadata: { corpus: rules.metadata, policyReasons: policy.reasons },
            })
            : item.organizationId && item.projectId
                ? await indexWebDocument(supabase, item.organizationId, item.projectId, document, {
                    authorityScore: rules.authorityScore,
                    noarchive: !policy.archive,
                    nosnippet: !policy.snippet,
                    metadata: { corpus: rules.metadata, policyReasons: policy.reasons },
                })
                : null;
        if (policy.index && !documentId) throw new WebRuntimeError('invalid_crawl_scope', 'Project crawl scope is incomplete', 500);

        const expansion: FrontierEntryInput[] = [];
        if (policy.follow && item.depth < item.maxDepth) {
            for (const link of document.links) {
                if (link.rel.includes('nofollow')) continue;
                try {
                    if (!pageAllowedByJob(link.url, rules)) continue;
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
        await completeFrontierItem(supabase, workerId, item, policy.index
            ? { status: 'completed', documentId: documentId || undefined }
            : { status: 'skipped', error: policy.reasons.join('; ') || 'indexing disallowed' });
        return { indexed: policy.index ? 1 : 0, failed: 0, skipped: policy.index ? 0 : 1, retried: 0, discovered };
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
    const rulesByJob = new Map<string, CrawlJobRules>();
    for (const item of items) {
        if (!rulesByJob.has(item.jobId)) rulesByJob.set(item.jobId, await loadCrawlJobRules(supabase, item.jobId));
    }
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
            outcomes.push(await processFrontierItem(supabase, workerId, group[index], rulesByJob.get(group[index].jobId)!));
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
    const data = await supabase.getDuePublicDocuments(boundedLimit);
    if (!data || data.length === 0) return null;

    const job = await createPublicCrawlJob(supabase, {
        seeds: data.map(row => String(row.canonical_url)),
        maxPages: data.length,
        maxFrontier: data.length * 2,
        maxDepth: 0,
        priority: 10,
        metadata: { type: 'scheduled_recrawl' },
    });
    await supabase.reserveDocuments(
        data.map(row => row.id),
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    );
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

        await supabase.releaseCrawlJob(jobId, workerId);
    }

    result.elapsedMs = Date.now() - startedAt;
    return result;
}
