/**
 * Lightweight Reliable Queue using Upstash Redis
 * 
 * Used for persistent tasks that must survive process crashes
 * like usage recording and credit deductions.
 */

import { Redis } from '@upstash/redis';

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const USAGE_QUEUE_KEY = 'queue:usage';

export interface UsageTask {
    projectId: string;
    externalUserId: string;
    environment: string;
    tokens: { prompt: number; completion: number; total: number };
    cost: { providerUsd: number; cencoriChargeUsd: number };
    customerMarkupPercentage: number;
    flatRatePerRequest: number | null;
    currency: string;
    pricingModel: 'flat' | 'tiered' | 'volume';
    pricingTiers: any[];
    monthlyTokensUsed: number;
    platformCommissionPercentage: number;
    timestamp: number;
}

/**
 * Enqueue a usage record for background processing.
 * This is nearly instantaneous and survives process crashes.
 */
export async function enqueueUsageRecord(task: UsageTask): Promise<void> {
    try {
        await redis.rpush(USAGE_QUEUE_KEY, JSON.stringify(task));
    } catch (err) {
        console.error('[Queue] Failed to enqueue usage record:', err);
        // Redis degradation must not silently lose billable usage. Fall back
        // to the durable database write on this request.
        const { recordEndUserUsageAsync } = await import('./end-user-billing');
        await recordEndUserUsageAsync(task);
    }
}

/**
 * Process a batch of usage records from the queue.
 * Should be called by a cron job or background worker.
 */
export async function processUsageQueue(batchSize = 50): Promise<number> {
    try {
        // LPOP multiple items
        const tasks: string[] = [];
        for (let i = 0; i < batchSize; i++) {
            const task = await redis.lpop<string>(USAGE_QUEUE_KEY);
            if (!task) break;
            tasks.push(task);
        }

        if (tasks.length === 0) return 0;

        const { recordEndUserUsageAsync } = await import('./end-user-billing');
        
        // Process in parallel
        await Promise.allSettled(
            tasks.map(async (json) => {
                try {
                    const task: UsageTask = JSON.parse(json);
                    await recordEndUserUsageAsync(task);
                } catch (err) {
                    console.error('[Queue] Failed to process usage task:', err);
                    // Re-enqueue failed tasks (optional, maybe push to DLQ)
                    await redis.rpush(USAGE_QUEUE_KEY + ':dlq', json);
                }
            })
        );

        return tasks.length;
    } catch (err) {
        console.error('[Queue] Error processing queue:', err);
        return 0;
    }
}
