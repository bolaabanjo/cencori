import { describe, expect, it, vi } from 'vitest';
import { settleStreamUsage } from '../stream-usage';
import type { ModelPricing } from '@/lib/providers/base';

const pricing: ModelPricing = {
    inputPer1KTokens: 0.005,
    outputPer1KTokens: 0.025,
    cachedInputPer1KTokens: 0.0005,
    cacheWriteMultiplier: 1.25,
    cencoriMarkupPercentage: 50,
};

describe('settleStreamUsage', () => {
    it('falls back to the estimator when the provider reports nothing', async () => {
        const estimate = vi.fn().mockResolvedValue({ promptTokens: 100, completionTokens: 20 });
        const settled = await settleStreamUsage({ reported: undefined, estimate, pricing });

        expect(estimate).toHaveBeenCalledOnce();
        expect(settled.fromProvider).toBe(false);
        expect(settled.promptTokens).toBe(100);
        expect(settled.totalTokens).toBe(120);
        expect(settled.providerCostUsd).toBeCloseTo(0.0005 + 0.0005);
    });

    it('prefers reported usage and never calls the estimator', async () => {
        const estimate = vi.fn();
        const settled = await settleStreamUsage({
            reported: { promptTokens: 1_000, completionTokens: 100, totalTokens: 1_100 },
            estimate,
            pricing,
        });

        expect(estimate).not.toHaveBeenCalled();
        expect(settled.fromProvider).toBe(true);
        expect(settled.providerCostUsd).toBeCloseTo(0.005 + 0.0025);
    });

    it('bills cached tokens at the cache rate but reports them in the prompt total', async () => {
        const settled = await settleStreamUsage({
            reported: {
                promptTokens: 1_000,
                completionTokens: 0,
                totalTokens: 11_000,
                cacheReadTokens: 10_000,
            },
            estimate: vi.fn(),
            pricing,
        });

        // Reported prompt is cache-inclusive so quota reflects real context...
        expect(settled.promptTokens).toBe(11_000);
        // ...while cost splits: 1k at input, 10k at the cache rate.
        expect(settled.providerCostUsd).toBeCloseTo(0.005 + 0.005);
    });

    it('applies the write premium to cache creation tokens', async () => {
        const settled = await settleStreamUsage({
            reported: {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 1_000,
                cacheWriteTokens: 1_000,
            },
            estimate: vi.fn(),
            pricing,
        });

        expect(settled.providerCostUsd).toBeCloseTo(0.005 * 1.25);
    });
});
