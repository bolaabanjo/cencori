import crypto from 'node:crypto';
import os from 'node:os';
import process from 'node:process';
import { config as loadEnvironment } from 'dotenv';

loadEnvironment({ path: ['.env.web.local', '.env.local', '.env'], quiet: true });

function integerEnvironment(name: string, fallback: number, minimum: number, maximum: number): number {
    const value = process.env[name];
    if (value === undefined || value === '') return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
        throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
    }
    return parsed;
}

function booleanEnvironment(name: string, fallback = false): boolean {
    const value = process.env[name];
    if (value === undefined || value === '') return fallback;
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    throw new Error(`${name} must be true, false, 1, or 0`);
}

async function main(): Promise<void> {
    const [{ runWebCrawlerWorker }, { createWorkerWebDataStore }] = await Promise.all([
        import('../lib/web/worker'),
        import('./web-runtime'),
    ]);
    const store = createWorkerWebDataStore();
    const workerId = process.env.WEB_CRAWL_WORKER_ID
        || `web_${os.hostname().replace(/[^a-zA-Z0-9_-]/g, '_')}_${process.pid}_${crypto.randomUUID().slice(0, 8)}`;
    const abortController = new AbortController();
    let stopping = false;

    const stop = (signal: NodeJS.Signals) => {
        if (stopping) return;
        stopping = true;
        process.stdout.write(`${JSON.stringify({
            event: 'shutdown_requested',
            workerId,
            signal,
            timestamp: new Date().toISOString(),
        })}\n`);
        abortController.abort();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);

    try {
        await runWebCrawlerWorker(store, {
            workerId,
            batchSize: integerEnvironment('WEB_CRAWL_BATCH_SIZE', 5, 1, 25),
            maxItemsPerCycle: integerEnvironment('WEB_CRAWL_MAX_ITEMS_PER_CYCLE', 100, 1, 250),
            timeBudgetMs: integerEnvironment('WEB_CRAWL_TIME_BUDGET_MS', 45_000, 5_000, 240_000),
            idleMinMs: integerEnvironment('WEB_CRAWL_IDLE_MIN_MS', 1_000, 100, 60_000),
            idleMaxMs: integerEnvironment('WEB_CRAWL_IDLE_MAX_MS', 30_000, 1_000, 300_000),
            errorMinMs: integerEnvironment('WEB_CRAWL_ERROR_MIN_MS', 5_000, 100, 60_000),
            errorMaxMs: integerEnvironment('WEB_CRAWL_ERROR_MAX_MS', 60_000, 1_000, 600_000),
            heartbeatMs: integerEnvironment('WEB_CRAWL_HEARTBEAT_MS', 60_000, 1_000, 3_600_000),
            recrawlIntervalMs: integerEnvironment('WEB_CRAWL_RECRAWL_INTERVAL_MS', 900_000, 60_000, 86_400_000),
            recrawlLimit: integerEnvironment('WEB_CRAWL_RECRAWL_LIMIT', 100, 1, 1_000),
            runOnce: booleanEnvironment('WEB_CRAWL_RUN_ONCE'),
        }, abortController.signal, {
            log: entry => process.stdout.write(`${JSON.stringify(entry)}\n`),
        });
    } finally {
        const { disposeWebEmbeddingPipeline } = await import('../lib/web/embeddings');
        await disposeWebEmbeddingPipeline();
        await store.close();
    }
}

main().catch(error => {
    process.stderr.write(`${JSON.stringify({
        event: 'fatal',
        timestamp: new Date().toISOString(),
        message: error instanceof Error ? error.message : String(error),
    })}\n`);
    process.exitCode = 1;
});
