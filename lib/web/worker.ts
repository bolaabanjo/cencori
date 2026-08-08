import { processWebFrontier, scheduleDuePublicRecrawls } from './frontier';
import type { WebFrontierWorkerResult } from './types';

type WebCrawlerSupabaseClient = Parameters<typeof processWebFrontier>[0];

export interface WebCrawlerWorkerConfig {
    workerId: string;
    batchSize: number;
    maxItemsPerCycle: number;
    timeBudgetMs: number;
    idleMinMs: number;
    idleMaxMs: number;
    errorMinMs: number;
    errorMaxMs: number;
    heartbeatMs: number;
    recrawlIntervalMs: number;
    recrawlLimit: number;
    runOnce?: boolean;
}

export type WebCrawlerWorkerLog = {
    event: 'started' | 'batch' | 'heartbeat' | 'recrawls_scheduled' | 'error' | 'stopped';
    workerId: string;
    timestamp: string;
    [key: string]: unknown;
};

interface WebCrawlerWorkerDependencies {
    now?: () => number;
    processFrontier?: (
        supabase: WebCrawlerSupabaseClient,
        options: { maxItems: number; batchSize: number; timeBudgetMs: number; workerId: string; signal: AbortSignal },
    ) => Promise<WebFrontierWorkerResult>;
    scheduleRecrawls?: (supabase: WebCrawlerSupabaseClient, limit: number) => Promise<{ id: string } | null>;
    sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
    log?: (entry: WebCrawlerWorkerLog) => void;
}

function abortableSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted || milliseconds <= 0) return Promise.resolve();
    return new Promise(resolve => {
        const timeout = setTimeout(done, milliseconds);
        signal.addEventListener('abort', done, { once: true });

        function done() {
            clearTimeout(timeout);
            signal.removeEventListener('abort', done);
            resolve();
        }
    });
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Runs bounded frontier claims continuously. All durable state remains in
 * PostgreSQL, so terminating, sleeping, or moving this process to another
 * machine cannot lose crawl work.
 */
export async function runWebCrawlerWorker(
    supabase: WebCrawlerSupabaseClient,
    config: WebCrawlerWorkerConfig,
    signal: AbortSignal,
    dependencies: WebCrawlerWorkerDependencies = {},
): Promise<void> {
    const now = dependencies.now || Date.now;
    const processFrontier = dependencies.processFrontier || (processWebFrontier as WebCrawlerWorkerDependencies['processFrontier']);
    const scheduleRecrawls = dependencies.scheduleRecrawls || (scheduleDuePublicRecrawls as WebCrawlerWorkerDependencies['scheduleRecrawls']);
    const sleep = dependencies.sleep || abortableSleep;
    const log = dependencies.log || (() => undefined);
    let idleDelayMs = config.idleMinMs;
    let errorDelayMs = config.errorMinMs;
    let lastHeartbeatAt = 0;
    let lastRecrawlAt = 0;

    log({
        event: 'started',
        workerId: config.workerId,
        timestamp: new Date(now()).toISOString(),
        batchSize: config.batchSize,
        maxItemsPerCycle: config.maxItemsPerCycle,
        timeBudgetMs: config.timeBudgetMs,
    });

    while (!signal.aborted) {
        const cycleStartedAt = now();
        try {
            if (lastRecrawlAt === 0 || cycleStartedAt - lastRecrawlAt >= config.recrawlIntervalMs) {
                const recrawlJob = await scheduleRecrawls!(supabase, config.recrawlLimit);
                lastRecrawlAt = now();
                if (recrawlJob) {
                    log({
                        event: 'recrawls_scheduled',
                        workerId: config.workerId,
                        timestamp: new Date(now()).toISOString(),
                        jobId: recrawlJob.id,
                    });
                }
            }

            const result = await processFrontier!(supabase, {
                maxItems: config.maxItemsPerCycle,
                batchSize: config.batchSize,
                timeBudgetMs: config.timeBudgetMs,
                workerId: config.workerId,
                signal,
            });

            if (result.claimed > 0) {
                log({
                    event: 'batch',
                    ...result,
                    workerId: config.workerId,
                    timestamp: new Date(now()).toISOString(),
                });
                idleDelayMs = config.idleMinMs;
                lastHeartbeatAt = now();
            } else if (lastHeartbeatAt === 0 || now() - lastHeartbeatAt >= config.heartbeatMs) {
                log({
                    event: 'heartbeat',
                    workerId: config.workerId,
                    timestamp: new Date(now()).toISOString(),
                    status: 'idle',
                    nextPollMs: idleDelayMs,
                });
                lastHeartbeatAt = now();
            }

            errorDelayMs = config.errorMinMs;
            if (config.runOnce) break;
            if (result.claimed === 0) {
                await sleep(idleDelayMs, signal);
                idleDelayMs = Math.min(idleDelayMs * 2, config.idleMaxMs);
            }
        } catch (error) {
            log({
                event: 'error',
                workerId: config.workerId,
                timestamp: new Date(now()).toISOString(),
                message: errorMessage(error),
                retryInMs: errorDelayMs,
            });
            if (config.runOnce) throw error;
            await sleep(errorDelayMs, signal);
            errorDelayMs = Math.min(errorDelayMs * 2, config.errorMaxMs);
        }
    }

    log({
        event: 'stopped',
        workerId: config.workerId,
        timestamp: new Date(now()).toISOString(),
        reason: signal.aborted ? 'signal' : 'run_once',
    });
}
