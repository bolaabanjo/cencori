import { describe, expect, it, vi } from 'vitest';
import { runWebCrawlerWorker, type WebCrawlerWorkerConfig, type WebCrawlerWorkerLog } from '@/lib/web/worker';

const config: WebCrawlerWorkerConfig = {
    workerId: 'test_worker',
    batchSize: 5,
    maxItemsPerCycle: 25,
    timeBudgetMs: 45_000,
    idleMinMs: 1_000,
    idleMaxMs: 30_000,
    errorMinMs: 5_000,
    errorMaxMs: 60_000,
    heartbeatMs: 60_000,
    recrawlIntervalMs: 900_000,
    recrawlLimit: 100,
    runOnce: true,
};

function emptyResult() {
    return {
        workerId: 'test_worker',
        batches: 0,
        claimed: 0,
        indexed: 0,
        failed: 0,
        skipped: 0,
        retried: 0,
        discovered: 0,
        jobs: [],
        elapsedMs: 1,
    };
}

describe('runWebCrawlerWorker', () => {
    it('schedules recrawls and executes one bounded cycle', async () => {
        const logs: WebCrawlerWorkerLog[] = [];
        const processFrontier = vi.fn().mockResolvedValue({ ...emptyResult(), claimed: 2, indexed: 2 });
        const scheduleRecrawls = vi.fn().mockResolvedValue({ id: 'recrawl-job' });

        await runWebCrawlerWorker({} as never, config, new AbortController().signal, {
            now: () => Date.parse('2026-08-08T12:00:00.000Z'),
            processFrontier,
            scheduleRecrawls,
            log: entry => logs.push(entry),
        });

        expect(scheduleRecrawls).toHaveBeenCalledWith({}, 100);
        expect(processFrontier).toHaveBeenCalledWith({}, {
            maxItems: 25,
            batchSize: 5,
            timeBudgetMs: 45_000,
            workerId: 'test_worker',
            signal: expect.any(AbortSignal),
        });
        expect(logs.map(log => log.event)).toEqual(['started', 'recrawls_scheduled', 'batch', 'stopped']);
    });

    it('logs and rethrows failures in one-shot mode', async () => {
        const logs: WebCrawlerWorkerLog[] = [];
        const failure = new Error('database offline');

        await expect(runWebCrawlerWorker({} as never, config, new AbortController().signal, {
            now: () => Date.parse('2026-08-08T12:00:00.000Z'),
            scheduleRecrawls: vi.fn().mockResolvedValue(null),
            processFrontier: vi.fn().mockRejectedValue(failure),
            log: entry => logs.push(entry),
        })).rejects.toThrow('database offline');

        expect(logs.at(-1)).toMatchObject({ event: 'error', retryInMs: 5_000 });
    });
});
