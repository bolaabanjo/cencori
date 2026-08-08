/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import { createPublicCrawlJob, processWebFrontier } from '@/lib/web/frontier';

function jobRow(overrides: Record<string, unknown> = {}) {
    return {
        id: 'job_1',
        collection_id: 'public',
        visibility: 'public',
        status: 'queued',
        seeds: ['https://example.com/'],
        allowed_origins: ['https://example.com'],
        same_origin: true,
        max_pages: 100,
        max_frontier: 2_000,
        max_depth: 2,
        max_attempts: 3,
        pages_discovered: 2,
        items_processed: 0,
        pages_processed: 0,
        pages_indexed: 0,
        pages_failed: 0,
        pages_skipped: 0,
        last_error: null,
        created_at: '2026-08-08T00:00:00.000Z',
        started_at: null,
        finished_at: null,
        ...overrides,
    };
}

describe('durable web frontier', () => {
    it('creates a public job and seeds both the page and conventional sitemap', async () => {
        const inserted = jobRow({ pages_discovered: 0 });
        const refreshed = jobRow();
        const single = vi.fn()
            .mockResolvedValueOnce({ data: inserted, error: null })
            .mockResolvedValueOnce({ data: refreshed, error: null });
        const builder = {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single,
        };
        const rpc = vi.fn().mockResolvedValue({ data: 2, error: null });
        const supabase = { from: vi.fn().mockReturnValue(builder), rpc } as never;

        const job = await createPublicCrawlJob(supabase, {
            seeds: ['https://example.com'],
            maxPages: 100,
        });

        expect(job.id).toBe('job_1');
        expect(rpc).toHaveBeenCalledWith('enqueue_web_crawl_urls', expect.objectContaining({
            p_job_id: 'job_1',
            p_entries: [
                expect.objectContaining({ url: 'https://example.com/', kind: 'page' }),
                expect.objectContaining({ url: 'https://example.com/sitemap.xml', kind: 'sitemap' }),
            ],
        }));
    });

    it('returns an idle worker result when no frontier batch is claimable', async () => {
        const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
        const result = await processWebFrontier({ rpc } as never, {
            workerId: 'worker_1',
            maxItems: 5,
            timeBudgetMs: 20_000,
        });
        expect(result).toMatchObject({ workerId: 'worker_1', claimed: 0, batches: 0, indexed: 0 });
    });
});
