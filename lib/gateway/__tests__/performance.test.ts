import { describe, expect, it } from 'vitest';
import { GatewayPerformanceTracker } from '@/lib/gateway/performance';

describe('GatewayPerformanceTracker', () => {
    it('records phase latency and output throughput', () => {
        const tracker = new GatewayPerformanceTracker(1_000);
        tracker.markPreflightComplete(1_025);
        tracker.markProviderStart(1_030);
        tracker.markProviderFirstToken(1_080);
        tracker.markClientFirstByte(1_090);
        tracker.markComplete(100, 2_080);

        expect(tracker.snapshot()).toEqual({
            gatewayPreflightMs: 25,
            providerTtftMs: 50,
            clientTtftMs: 90,
            totalCompletionMs: 1080,
            tokensPerSecond: 100,
        });
    });

    it('keeps the first mark when retries or fallbacks mark a phase again', () => {
        const tracker = new GatewayPerformanceTracker(100);
        tracker.markProviderStart(110);
        tracker.markProviderStart(150);
        tracker.markProviderFirstToken(200);
        expect(tracker.snapshot().providerTtftMs).toBe(90);
    });
});
