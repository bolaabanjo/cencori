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
    language: string | null;
    queryEmbedding: number[] | null;
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
    getDomainPolicies(host: string): Promise<WebStoreRow[]>;
    isDocumentTombstoned(canonicalUrl: string): Promise<boolean>;
    createDomainPolicy(record: WebStoreRow): Promise<WebStoreRow>;
    deleteDomainPolicy(id: string): Promise<void>;
    createTakedownRequest(record: WebStoreRow): Promise<WebStoreRow>;
    listTakedownRequests(limit: number): Promise<WebStoreRow[]>;
    getTakedownRequest(id: string): Promise<WebStoreRow | null>;
    decideTakedownRequest(id: string, record: WebStoreRow): Promise<WebStoreRow>;
    tombstoneDocuments(urls: string[], reason: string, requestId: string): Promise<void>;
    deleteDocument(canonicalUrl: string): Promise<void>;
    deleteDocumentsByPolicy(host: string, pathPrefix: string): Promise<void>;
    createBrowserJob(record: WebStoreRow): Promise<WebStoreRow>;
    getBrowserJob(id: string, projectId?: string): Promise<WebStoreRow | null>;
    claimBrowserJob(workerId: string, leaseSeconds: number): Promise<WebStoreRow | null>;
    completeBrowserJob(args: { id: string; workerId: string; status: 'completed' | 'failed'; result: WebStoreRow | null; error: string | null; retry: boolean }): Promise<boolean>;
    createEmbeddingJob(projectId: string, query: string, model: string): Promise<WebStoreRow>;
    getEmbeddingJob(id: string, projectId: string): Promise<WebStoreRow | null>;
    deleteEmbeddingJob(id: string, projectId: string): Promise<void>;
    claimEmbeddingJob(workerId: string, leaseSeconds: number): Promise<WebStoreRow | null>;
    completeEmbeddingJob(id: string, workerId: string, embedding: number[] | null, error: string | null): Promise<boolean>;
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
        const { data, error } = await this.client.rpc('search_cencori_web_v2', {
            p_project_id: projectId,
            p_query: query,
            p_limit: options.limit,
            p_domain: options.domain,
            p_fresh_after: options.freshAfter,
            p_language: options.language,
            p_query_embedding: options.queryEmbedding,
        });
        if (error && /search_cencori_web_v2|schema cache|PGRST202/i.test(error.message)) {
            const fallback = await this.client.rpc('search_cencori_web', {
                p_project_id: projectId,
                p_query: query,
                p_limit: options.limit,
                p_domain: options.domain,
                p_fresh_after: options.freshAfter,
            });
            if (fallback.error) throw storeError(fallback.error.message);
            return Array.isArray(fallback.data) ? fallback.data as WebStoreRow[] : [];
        }
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

    async getDomainPolicies(host: string): Promise<WebStoreRow[]> {
        const { data, error } = await this.client.from('web_domain_policies').select('*').eq('host', host)
            .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).order('path_prefix', { ascending: false });
        if (error) throw storeError(error.message);
        return (data || []) as WebStoreRow[];
    }

    async isDocumentTombstoned(canonicalUrl: string): Promise<boolean> {
        const { data, error } = await this.client.from('web_document_tombstones').select('canonical_url')
            .eq('canonical_url', canonicalUrl).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).maybeSingle();
        if (error) throw storeError(error.message);
        return Boolean(data);
    }

    async createDomainPolicy(record: WebStoreRow): Promise<WebStoreRow> {
        const { data, error } = await this.client.from('web_domain_policies').upsert(record, {
            onConflict: 'host,path_prefix,action',
        }).select('*').single();
        if (error || !data) throw storeError(error?.message || 'Policy could not be created');
        return data as WebStoreRow;
    }

    async deleteDomainPolicy(id: string): Promise<void> {
        const { error } = await this.client.from('web_domain_policies').delete().eq('id', id);
        if (error) throw storeError(error.message);
    }

    async createTakedownRequest(record: WebStoreRow): Promise<WebStoreRow> {
        const { data, error } = await this.client.from('web_takedown_requests').insert(record).select('*').single();
        if (error || !data) throw storeError(error?.message || 'Takedown request could not be created');
        return data as WebStoreRow;
    }

    async listTakedownRequests(limit: number): Promise<WebStoreRow[]> {
        const { data, error } = await this.client.from('web_takedown_requests').select('*')
            .order('created_at', { ascending: false }).limit(limit);
        if (error) throw storeError(error.message);
        return (data || []) as WebStoreRow[];
    }

    async getTakedownRequest(id: string): Promise<WebStoreRow | null> {
        const { data, error } = await this.client.from('web_takedown_requests').select('*').eq('id', id).maybeSingle();
        if (error) throw storeError(error.message);
        return data as WebStoreRow | null;
    }

    async decideTakedownRequest(id: string, record: WebStoreRow): Promise<WebStoreRow> {
        const { data, error } = await this.client.rpc('decide_web_takedown', {
            p_request_id: id, p_status: record.status, p_reason: record.decision_reason, p_decided_by: record.decided_by,
        });
        const decided = Array.isArray(data) ? data[0] : null;
        if (error || !decided) throw storeError(error?.message || 'Pending takedown request was not found');
        return decided as WebStoreRow;
    }

    async tombstoneDocuments(urls: string[], reason: string, requestId: string): Promise<void> {
        const records = urls.map(canonicalUrl => ({ canonical_url: canonicalUrl, host: new URL(canonicalUrl).hostname, reason, source_request_id: requestId }));
        const { error: tombstoneError } = await this.client.from('web_document_tombstones').upsert(records, { onConflict: 'canonical_url' });
        if (tombstoneError) throw storeError(tombstoneError.message);
        const { error: deleteError } = await this.client.from('web_documents').delete().in('canonical_url', urls);
        if (deleteError) throw storeError(deleteError.message);
    }

    async deleteDocument(canonicalUrl: string): Promise<void> {
        const { error } = await this.client.from('web_documents').delete().eq('canonical_url', canonicalUrl);
        if (error) throw storeError(error.message);
    }

    async deleteDocumentsByPolicy(host: string, pathPrefix: string): Promise<void> {
        const { error } = await this.client.from('web_documents').delete().eq('host', host).like('path', `${pathPrefix}%`);
        if (error) throw storeError(error.message);
    }

    async createBrowserJob(record: WebStoreRow): Promise<WebStoreRow> {
        const { data, error } = await this.client.from('web_browser_jobs').insert(record).select('*').single();
        if (error || !data) throw storeError(error?.message || 'Browser job could not be created');
        return data as WebStoreRow;
    }

    async getBrowserJob(id: string, projectId?: string): Promise<WebStoreRow | null> {
        let query = this.client.from('web_browser_jobs').select('*').eq('id', id);
        if (projectId) query = query.eq('project_id', projectId);
        const { data, error } = await query.maybeSingle();
        if (error) throw storeError(error.message);
        return data as WebStoreRow | null;
    }

    async claimBrowserJob(workerId: string, leaseSeconds: number): Promise<WebStoreRow | null> {
        const { data, error } = await this.client.rpc('claim_web_browser_job', { p_worker_id: workerId, p_lease_seconds: leaseSeconds });
        if (error) throw storeError(error.message);
        return Array.isArray(data) ? data[0] as WebStoreRow || null : null;
    }

    async completeBrowserJob(args: Parameters<WebDataStore['completeBrowserJob']>[0]): Promise<boolean> {
        const { data, error } = await this.client.rpc('complete_web_browser_job', {
            p_job_id: args.id, p_worker_id: args.workerId, p_status: args.status,
            p_result: args.result, p_error: args.error, p_retry: args.retry,
        });
        if (error) throw storeError(error.message);
        return data === true;
    }

    async createEmbeddingJob(projectId: string, query: string, model: string): Promise<WebStoreRow> {
        const { data, error } = await this.client.from('web_embedding_jobs').insert({ project_id: projectId, query, model }).select('id,status,created_at').single();
        if (error || !data) throw storeError(error?.message || 'Embedding job could not be created');
        return data as WebStoreRow;
    }

    async getEmbeddingJob(id: string, projectId: string): Promise<WebStoreRow | null> {
        const { data, error } = await this.client.from('web_embedding_jobs').select('id,status,embedding,error').eq('id', id).eq('project_id', projectId).maybeSingle();
        if (error) throw storeError(error.message);
        return data as WebStoreRow | null;
    }

    async deleteEmbeddingJob(id: string, projectId: string): Promise<void> {
        const { error } = await this.client.from('web_embedding_jobs').delete().eq('id', id).eq('project_id', projectId);
        if (error) throw storeError(error.message);
    }

    async claimEmbeddingJob(workerId: string, leaseSeconds: number): Promise<WebStoreRow | null> {
        const { data, error } = await this.client.rpc('claim_web_embedding_job', { p_worker_id: workerId, p_lease_seconds: leaseSeconds });
        if (error) throw storeError(error.message);
        return Array.isArray(data) ? data[0] as WebStoreRow || null : null;
    }

    async completeEmbeddingJob(id: string, workerId: string, embedding: number[] | null, errorMessage: string | null): Promise<boolean> {
        const { data, error } = await this.client.rpc('complete_web_embedding_job', {
            p_job_id: id, p_worker_id: workerId, p_embedding: embedding, p_error: errorMessage,
        });
        if (error) throw storeError(error.message);
        return data === true;
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
            'semantic_embedding', 'embedding_model', 'authority_score', 'quality_score', 'spam_score', 'noarchive', 'nosnippet',
            'semantic_bucket_1', 'semantic_bucket_2', 'semantic_bucket_3', 'semantic_bucket_4',
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
            'SELECT * FROM public.search_cencori_web_v2($1::uuid, $2::text, $3::real[], $4::integer, $5::text, $6::timestamptz, $7::text)',
            [projectId, query, options.queryEmbedding, options.limit, options.domain, options.freshAfter, options.language],
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

    async getDomainPolicies(host: string): Promise<WebStoreRow[]> {
        return this.rows(`SELECT * FROM public.web_domain_policies WHERE host = $1 AND (expires_at IS NULL OR expires_at > now()) ORDER BY length(path_prefix) DESC`, [host]);
    }

    async isDocumentTombstoned(canonicalUrl: string): Promise<boolean> {
        const row = (await this.rows(`SELECT 1 FROM public.web_document_tombstones WHERE canonical_url = $1 AND (expires_at IS NULL OR expires_at > now())`, [canonicalUrl]))[0];
        return Boolean(row);
    }

    async createDomainPolicy(record: WebStoreRow): Promise<WebStoreRow> {
        const rows = await this.rows(`INSERT INTO public.web_domain_policies (host, path_prefix, action, reason, source, jurisdiction, expires_at, created_by)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (host,path_prefix,action) DO UPDATE SET reason=EXCLUDED.reason, source=EXCLUDED.source,
            jurisdiction=EXCLUDED.jurisdiction, expires_at=EXCLUDED.expires_at, updated_at=now() RETURNING *`,
        [record.host, record.path_prefix, record.action, record.reason, record.source, record.jurisdiction, record.expires_at, record.created_by]);
        return rows[0];
    }

    async deleteDomainPolicy(id: string): Promise<void> { await this.rows('DELETE FROM public.web_domain_policies WHERE id=$1', [id]); }

    async createTakedownRequest(record: WebStoreRow): Promise<WebStoreRow> {
        const rows = await this.rows(`INSERT INTO public.web_takedown_requests (requester_name,requester_email,requester_organization,urls,basis,statement)
            VALUES ($1,$2,$3,$4::jsonb,$5,$6) RETURNING *`, [record.requester_name, record.requester_email, record.requester_organization, JSON.stringify(record.urls), record.basis, record.statement]);
        return rows[0];
    }

    async listTakedownRequests(limit: number): Promise<WebStoreRow[]> {
        return this.rows('SELECT * FROM public.web_takedown_requests ORDER BY created_at DESC LIMIT $1', [limit]);
    }

    async getTakedownRequest(id: string): Promise<WebStoreRow | null> {
        return (await this.rows('SELECT * FROM public.web_takedown_requests WHERE id=$1', [id]))[0] || null;
    }

    async decideTakedownRequest(id: string, record: WebStoreRow): Promise<WebStoreRow> {
        const rows = await this.rows('SELECT * FROM public.decide_web_takedown($1,$2,$3,$4)', [id, record.status, record.decision_reason, record.decided_by]);
        if (!rows[0]) throw storeError('Takedown request was not found');
        return rows[0];
    }

    async tombstoneDocuments(urls: string[], reason: string, requestId: string): Promise<void> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            for (const canonicalUrl of urls) {
                await client.query(`INSERT INTO public.web_document_tombstones (canonical_url,host,reason,source_request_id) VALUES ($1,$2,$3,$4)
                    ON CONFLICT (canonical_url) DO UPDATE SET reason=EXCLUDED.reason,source_request_id=EXCLUDED.source_request_id,created_at=now()`,
                [canonicalUrl, new URL(canonicalUrl).hostname, reason, requestId]);
            }
            await client.query('DELETE FROM public.web_documents WHERE canonical_url = ANY($1::text[])', [urls]);
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw storeError(error);
        } finally { client.release(); }
    }

    async deleteDocument(canonicalUrl: string): Promise<void> {
        await this.rows('DELETE FROM public.web_documents WHERE canonical_url=$1', [canonicalUrl]);
    }

    async deleteDocumentsByPolicy(host: string, pathPrefix: string): Promise<void> {
        await this.rows('DELETE FROM public.web_documents WHERE host=$1 AND left(path, length($2))=$2', [host, pathPrefix]);
    }

    async createBrowserJob(record: WebStoreRow): Promise<WebStoreRow> {
        const rows = await this.rows(`INSERT INTO public.web_browser_jobs (organization_id,project_id,url,actions,options) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb) RETURNING *`,
            [record.organization_id, record.project_id, record.url, JSON.stringify(record.actions), JSON.stringify(record.options)]);
        return rows[0];
    }

    async getBrowserJob(id: string, projectId?: string): Promise<WebStoreRow | null> {
        const rows = projectId
            ? await this.rows('SELECT * FROM public.web_browser_jobs WHERE id=$1 AND project_id=$2', [id, projectId])
            : await this.rows('SELECT * FROM public.web_browser_jobs WHERE id=$1', [id]);
        return rows[0] || null;
    }

    async claimBrowserJob(workerId: string, leaseSeconds: number): Promise<WebStoreRow | null> {
        return (await this.rows('SELECT * FROM public.claim_web_browser_job($1,$2)', [workerId, leaseSeconds]))[0] || null;
    }

    async completeBrowserJob(args: Parameters<WebDataStore['completeBrowserJob']>[0]): Promise<boolean> {
        const rows = await this.rows('SELECT public.complete_web_browser_job($1,$2,$3,$4::jsonb,$5,$6) AS completed',
            [args.id, args.workerId, args.status, args.result ? JSON.stringify(args.result) : null, args.error, args.retry]);
        return rows[0]?.completed === true;
    }

    async createEmbeddingJob(projectId: string, query: string, model: string): Promise<WebStoreRow> {
        return (await this.rows(`INSERT INTO public.web_embedding_jobs(project_id,query,model) VALUES ($1,$2,$3) RETURNING id,status,created_at`, [projectId, query, model]))[0];
    }

    async getEmbeddingJob(id: string, projectId: string): Promise<WebStoreRow | null> {
        return (await this.rows('SELECT id,status,embedding,error FROM public.web_embedding_jobs WHERE id=$1 AND project_id=$2', [id, projectId]))[0] || null;
    }

    async deleteEmbeddingJob(id: string, projectId: string): Promise<void> {
        await this.rows('DELETE FROM public.web_embedding_jobs WHERE id=$1 AND project_id=$2', [id, projectId]);
    }

    async claimEmbeddingJob(workerId: string, leaseSeconds: number): Promise<WebStoreRow | null> {
        return (await this.rows('SELECT * FROM public.claim_web_embedding_job($1,$2)', [workerId, leaseSeconds]))[0] || null;
    }

    async completeEmbeddingJob(id: string, workerId: string, embedding: number[] | null, errorMessage: string | null): Promise<boolean> {
        const rows = await this.rows('SELECT public.complete_web_embedding_job($1,$2,$3::real[],$4) AS completed', [id, workerId, embedding, errorMessage]);
        return rows[0]?.completed === true;
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
