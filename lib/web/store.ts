import { Pool, type PoolConfig } from 'pg';
import type { GatewayContext } from '@/lib/gateway-middleware';
import { WebRuntimeError } from './errors';

type SupabaseClient = GatewayContext['supabase'];
export type WebStoreRow = Record<string, unknown>;
export interface WebCrawlEntryRecord {
    url: string;
    origin: string;
    parent_url: string | null;
    depth: number;
    kind: string;
    metadata: Record<string, unknown>;
}

export interface WebSearchStoreOptions {
    limit: number;
    domain: string | null;
    freshAfter: string | null;
}

export interface WebDataStore {
    readonly backend: 'postgres' | 'supabase';
    close(): Promise<void>;
    ensureProjectScope(organizationId: string, projectId: string): Promise<void>;
    upsertDocument(record: WebStoreRow): Promise<string>;
    searchDocuments(projectId: string, query: string, options: WebSearchStoreOptions): Promise<WebStoreRow[]>;
    createCrawlJob(record: WebStoreRow): Promise<WebStoreRow>;
    failCrawlJob(jobId: string, message: string): Promise<void>;
    getCrawlJob(jobId: string): Promise<WebStoreRow | null>;
    listPublicCrawlJobs(limit: number): Promise<WebStoreRow[]>;
    enqueueCrawlUrls(jobId: string, entries: WebCrawlEntryRecord[]): Promise<number>;
    getCrawlJobBudget(jobId: string): Promise<{ pages_discovered: number; max_frontier: number } | null>;
    claimCrawlBatch(workerId: string, limit: number, leaseSeconds: number): Promise<WebStoreRow[]>;
    completeCrawlItem(args: {
        jobId: string;
        frontierId: number;
        workerId: string;
        status: string;
        documentId: string | null;
        error: string | null;
        retry: boolean;
        retryDelaySeconds: number;
    }): Promise<boolean>;
    releaseCrawlJob(jobId: string, workerId: string): Promise<string>;
    getDuePublicDocuments(limit: number): Promise<Array<{ id: string; canonical_url: string }>>;
    reserveDocuments(ids: string[], nextCrawlAt: string): Promise<void>;
    getFrontierStatusCounts(jobId: string): Promise<Record<string, number>>;
}

function storeError(error: unknown): WebRuntimeError {
    if (error instanceof WebRuntimeError) return error;
    const message = error instanceof Error ? error.message : String(error);
    return new WebRuntimeError('web_database_unavailable', message, 503);
}

export class SupabaseWebDataStore implements WebDataStore {
    readonly backend = 'supabase' as const;

    constructor(private readonly client: SupabaseClient) {}

    async close(): Promise<void> {}

    async ensureProjectScope(): Promise<void> {
        // The control-plane database already owns these foreign-key rows.
    }

    async upsertDocument(record: WebStoreRow): Promise<string> {
        const { data, error } = await this.client.from('web_documents')
            .upsert(record, { onConflict: 'collection_id,canonical_url' })
            .select('id')
            .single();
        if (error || !data?.id) throw storeError(error?.message || 'Web document could not be indexed');
        return String(data.id);
    }

    async searchDocuments(projectId: string, query: string, options: WebSearchStoreOptions): Promise<WebStoreRow[]> {
        const { data, error } = await this.client.rpc('search_cencori_web', {
            p_project_id: projectId,
            p_query: query,
            p_limit: options.limit,
            p_domain: options.domain,
            p_fresh_after: options.freshAfter,
        });
        if (error) throw storeError(error.message);
        return Array.isArray(data) ? data as WebStoreRow[] : [];
    }

    async createCrawlJob(record: WebStoreRow): Promise<WebStoreRow> {
        const { data, error } = await this.client.from('web_crawl_jobs').insert(record).select('*').single();
        if (error || !data) throw storeError(error?.message || 'Crawl job could not be created');
        return data as WebStoreRow;
    }

    async failCrawlJob(jobId: string, message: string): Promise<void> {
        const { error } = await this.client.from('web_crawl_jobs')
            .update({ status: 'failed', last_error: message })
            .eq('id', jobId);
        if (error) throw storeError(error.message);
    }

    async getCrawlJob(jobId: string): Promise<WebStoreRow | null> {
        const { data, error } = await this.client.from('web_crawl_jobs').select('*').eq('id', jobId).maybeSingle();
        if (error) throw storeError(error.message);
        return data as WebStoreRow | null;
    }

    async listPublicCrawlJobs(limit: number): Promise<WebStoreRow[]> {
        const { data, error } = await this.client.from('web_crawl_jobs')
            .select('*').eq('visibility', 'public').order('created_at', { ascending: false }).limit(limit);
        if (error) throw storeError(error.message);
        return (data || []) as WebStoreRow[];
    }

    async enqueueCrawlUrls(jobId: string, entries: WebCrawlEntryRecord[]): Promise<number> {
        const { data, error } = await this.client.rpc('enqueue_web_crawl_urls', { p_job_id: jobId, p_entries: entries });
        if (error) throw storeError(error.message);
        return Number(data) || 0;
    }

    async getCrawlJobBudget(jobId: string): Promise<{ pages_discovered: number; max_frontier: number } | null> {
        const { data, error } = await this.client.from('web_crawl_jobs')
            .select('pages_discovered,max_frontier').eq('id', jobId).maybeSingle();
        if (error) throw storeError(error.message);
        return data ? { pages_discovered: Number(data.pages_discovered), max_frontier: Number(data.max_frontier) } : null;
    }

    async claimCrawlBatch(workerId: string, limit: number, leaseSeconds: number): Promise<WebStoreRow[]> {
        const { data, error } = await this.client.rpc('claim_web_crawl_batch', {
            p_worker_id: workerId,
            p_limit: limit,
            p_lease_seconds: leaseSeconds,
        });
        if (error) throw storeError(error.message);
        return Array.isArray(data) ? data as WebStoreRow[] : [];
    }

    async completeCrawlItem(args: Parameters<WebDataStore['completeCrawlItem']>[0]): Promise<boolean> {
        const { data, error } = await this.client.rpc('complete_web_crawl_item', {
            p_job_id: args.jobId,
            p_frontier_id: args.frontierId,
            p_worker_id: args.workerId,
            p_status: args.status,
            p_document_id: args.documentId,
            p_error: args.error,
            p_retry: args.retry,
            p_retry_delay_seconds: args.retryDelaySeconds,
        });
        if (error) throw storeError(error.message);
        return data === true;
    }

    async releaseCrawlJob(jobId: string, workerId: string): Promise<string> {
        const { data, error } = await this.client.rpc('release_web_crawl_job', { p_job_id: jobId, p_worker_id: workerId });
        if (error) throw storeError(error.message);
        return String(data || 'not_owned');
    }

    async getDuePublicDocuments(limit: number): Promise<Array<{ id: string; canonical_url: string }>> {
        const { data, error } = await this.client.from('web_documents').select('id,canonical_url')
            .eq('visibility', 'public').not('next_crawl_at', 'is', null)
            .lte('next_crawl_at', new Date().toISOString()).order('next_crawl_at', { ascending: true }).limit(limit);
        if (error) throw storeError(error.message);
        return (data || []).map(row => ({ id: String(row.id), canonical_url: String(row.canonical_url) }));
    }

    async reserveDocuments(ids: string[], nextCrawlAt: string): Promise<void> {
        const { error } = await this.client.from('web_documents').update({ next_crawl_at: nextCrawlAt }).in('id', ids);
        if (error) throw storeError(error.message);
    }

    async getFrontierStatusCounts(jobId: string): Promise<Record<string, number>> {
        const { data, error } = await this.client.from('web_crawl_frontier').select('status,kind').eq('job_id', jobId);
        if (error) throw storeError(error.message);
        const counts: Record<string, number> = {};
        for (const row of data || []) {
            const key = `${String(row.kind)}_${String(row.status)}`;
            counts[key] = (counts[key] || 0) + 1;
        }
        return counts;
    }
}

export class PostgresWebDataStore implements WebDataStore {
    readonly backend = 'postgres' as const;
    private readonly pool: Pool;

    constructor(connectionString: string, options: PoolConfig = {}) {
        this.pool = new Pool({
            connectionString,
            max: Number(process.env.CENCORI_WEB_DATABASE_POOL_SIZE || 10),
            idleTimeoutMillis: 30_000,
            connectionTimeoutMillis: 10_000,
            application_name: 'cencori-web',
            ...options,
        });
        this.pool.on('error', error => console.error('[cencori-web:postgres]', error));
    }

    async close(): Promise<void> {
        await this.pool.end();
    }

    private async rows(sql: string, values: unknown[] = []): Promise<WebStoreRow[]> {
        try {
            const result = await this.pool.query(sql, values);
            return result.rows as WebStoreRow[];
        } catch (error) {
            throw storeError(error);
        }
    }

    async ensureProjectScope(organizationId: string, projectId: string): Promise<void> {
        await this.rows(`
            WITH organization AS (
                INSERT INTO public.organizations (id) VALUES ($1::uuid)
                ON CONFLICT (id) DO NOTHING
            )
            INSERT INTO public.projects (id) VALUES ($2::uuid)
            ON CONFLICT (id) DO NOTHING
        `, [organizationId, projectId]);
    }

    async upsertDocument(record: WebStoreRow): Promise<string> {
        const columns = [
            'collection_id', 'visibility', 'organization_id', 'project_id', 'url', 'canonical_url', 'host', 'path',
            'title', 'description', 'language', 'content', 'content_hash', 'mime_type', 'status_code', 'published_at',
            'modified_at', 'retrieved_at', 'indexed_at', 'next_crawl_at', 'links', 'evidence_spans', 'metadata',
        ];
        const jsonColumns = new Set(['links', 'evidence_spans', 'metadata']);
        const values = columns.map(column => jsonColumns.has(column) ? JSON.stringify(record[column]) : record[column]);
        const updates = columns.filter(column => !['collection_id', 'canonical_url'].includes(column))
            .map(column => `${column} = EXCLUDED.${column}`).join(', ');
        const rows = await this.rows(`
            INSERT INTO public.web_documents (${columns.join(', ')})
            VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})
            ON CONFLICT (collection_id, canonical_url) DO UPDATE SET ${updates}
            RETURNING id
        `, values);
        if (!rows[0]?.id) throw storeError('Web document could not be indexed');
        return String(rows[0].id);
    }

    async searchDocuments(projectId: string, query: string, options: WebSearchStoreOptions): Promise<WebStoreRow[]> {
        return this.rows(
            'SELECT * FROM public.search_cencori_web($1::uuid, $2::text, $3::integer, $4::text, $5::timestamptz)',
            [projectId, query, options.limit, options.domain, options.freshAfter],
        );
    }

    async createCrawlJob(record: WebStoreRow): Promise<WebStoreRow> {
        const columns = [
            'collection_id', 'visibility', 'organization_id', 'project_id', 'seeds', 'allowed_origins', 'same_origin',
            'max_pages', 'max_frontier', 'max_depth', 'max_attempts', 'priority', 'metadata',
        ];
        const jsonColumns = new Set(['seeds', 'metadata']);
        const rows = await this.rows(`
            INSERT INTO public.web_crawl_jobs (${columns.join(', ')})
            VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')}) RETURNING *
        `, columns.map(column => jsonColumns.has(column) ? JSON.stringify(record[column]) : record[column]));
        if (!rows[0]) throw storeError('Crawl job could not be created');
        return rows[0];
    }

    async failCrawlJob(jobId: string, message: string): Promise<void> {
        await this.rows('UPDATE public.web_crawl_jobs SET status = \'failed\', last_error = $2, updated_at = now() WHERE id = $1', [jobId, message]);
    }

    async getCrawlJob(jobId: string): Promise<WebStoreRow | null> {
        return (await this.rows('SELECT * FROM public.web_crawl_jobs WHERE id = $1', [jobId]))[0] || null;
    }

    async listPublicCrawlJobs(limit: number): Promise<WebStoreRow[]> {
        return this.rows('SELECT * FROM public.web_crawl_jobs WHERE visibility = \'public\' ORDER BY created_at DESC LIMIT $1', [limit]);
    }

    async enqueueCrawlUrls(jobId: string, entries: WebCrawlEntryRecord[]): Promise<number> {
        const rows = await this.rows('SELECT public.enqueue_web_crawl_urls($1::uuid, $2::jsonb) AS count', [jobId, JSON.stringify(entries)]);
        return Number(rows[0]?.count) || 0;
    }

    async getCrawlJobBudget(jobId: string): Promise<{ pages_discovered: number; max_frontier: number } | null> {
        const row = (await this.rows('SELECT pages_discovered, max_frontier FROM public.web_crawl_jobs WHERE id = $1', [jobId]))[0];
        return row ? { pages_discovered: Number(row.pages_discovered), max_frontier: Number(row.max_frontier) } : null;
    }

    async claimCrawlBatch(workerId: string, limit: number, leaseSeconds: number): Promise<WebStoreRow[]> {
        return this.rows('SELECT * FROM public.claim_web_crawl_batch($1::text, $2::integer, $3::integer)', [workerId, limit, leaseSeconds]);
    }

    async completeCrawlItem(args: Parameters<WebDataStore['completeCrawlItem']>[0]): Promise<boolean> {
        const rows = await this.rows(
            'SELECT public.complete_web_crawl_item($1::uuid, $2::bigint, $3::text, $4::text, $5::uuid, $6::text, $7::boolean, $8::integer) AS completed',
            [args.jobId, args.frontierId, args.workerId, args.status, args.documentId, args.error, args.retry, args.retryDelaySeconds],
        );
        return rows[0]?.completed === true;
    }

    async releaseCrawlJob(jobId: string, workerId: string): Promise<string> {
        const rows = await this.rows('SELECT public.release_web_crawl_job($1::uuid, $2::text) AS status', [jobId, workerId]);
        return String(rows[0]?.status || 'not_owned');
    }

    async getDuePublicDocuments(limit: number): Promise<Array<{ id: string; canonical_url: string }>> {
        return this.rows(`
            SELECT id, canonical_url FROM public.web_documents
            WHERE visibility = 'public' AND next_crawl_at IS NOT NULL AND next_crawl_at <= now()
            ORDER BY next_crawl_at ASC LIMIT $1
        `, [limit]) as Promise<Array<{ id: string; canonical_url: string }>>;
    }

    async reserveDocuments(ids: string[], nextCrawlAt: string): Promise<void> {
        await this.rows('UPDATE public.web_documents SET next_crawl_at = $2::timestamptz WHERE id = ANY($1::uuid[])', [ids, nextCrawlAt]);
    }

    async getFrontierStatusCounts(jobId: string): Promise<Record<string, number>> {
        const rows = await this.rows('SELECT kind, status, count(*)::integer AS count FROM public.web_crawl_frontier WHERE job_id = $1 GROUP BY kind, status', [jobId]);
        return Object.fromEntries(rows.map(row => [`${String(row.kind)}_${String(row.status)}`, Number(row.count)]));
    }
}

let directStore: PostgresWebDataStore | null = null;

export function createWebDataStore(fallbackClient?: SupabaseClient): WebDataStore {
    const connectionString = process.env.CENCORI_WEB_DATABASE_URL;
    if (connectionString) {
        directStore ||= new PostgresWebDataStore(connectionString);
        return directStore;
    }
    if (!fallbackClient) {
        throw new WebRuntimeError(
            'web_database_unavailable',
            'CENCORI_WEB_DATABASE_URL is required when no control-plane database client is provided',
            503,
        );
    }
    return new SupabaseWebDataStore(fallbackClient);
}
