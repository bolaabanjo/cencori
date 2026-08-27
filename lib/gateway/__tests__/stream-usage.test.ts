import { describe, expect, it, vi } from 'vitest';
import { settleStreamUsage, toOpenAiUsage } from '../stream-usage';
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

/**
 * Prompt caching was unobservable from outside the gateway: cached tokens were parsed from every
 * provider, folded into the prompt total for billing, and then dropped when the client-facing
 * usage was rebuilt from three fields. `/v1/responses` went further and hardcoded
 * `cached_tokens: 0`, so a fully cached prefix and a cold one reported identically — which is why
 * nobody could tell whether caching worked at all.
 */
describe('reporting cached tokens to the client', () => {
    it('carries the provider cache figures out of settlement', async () => {
        const settled = await settleStreamUsage({
            reported: {
                promptTokens: 1_000,
                completionTokens: 5,
                totalTokens: 11_005,
                cacheReadTokens: 10_000,
            },
            estimate: vi.fn(),
            pricing,
        });

        expect(settled.cacheReadTokens).toBe(10_000);
    });

    /** Absent and zero mean different things and must stay distinguishable. */
    it('reports nothing when the provider reported nothing', async () => {
        const settled = await settleStreamUsage({
            reported: { promptTokens: 1_000, completionTokens: 5, totalTokens: 1_005 },
            estimate: vi.fn(),
            pricing,
        });

        expect(settled.cacheReadTokens).toBeUndefined();
        expect(toOpenAiUsage(settled)).not.toHaveProperty('prompt_tokens_details');
    });

    it('surfaces a cache hit in the OpenAI usage shape', () => {
        const usage = toOpenAiUsage({
            promptTokens: 11_000,
            completionTokens: 5,
            totalTokens: 11_005,
            cacheReadTokens: 10_000,
        });

        expect(usage).toMatchObject({
            prompt_tokens: 11_000,
            prompt_tokens_details: { cached_tokens: 10_000 },
        });
    });

    /** A cache that genuinely did not hit reports zero, which is not the same as silence. */
    it('distinguishes a miss from a provider that never reports', () => {
        expect(
            toOpenAiUsage({
                promptTokens: 100,
                completionTokens: 1,
                totalTokens: 101,
                cacheReadTokens: 0,
            }),
        ).toMatchObject({ prompt_tokens_details: { cached_tokens: 0 } });
    });
});
