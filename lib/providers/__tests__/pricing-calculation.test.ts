import { describe, expect, it } from 'vitest';
import { calculateProviderTokenCost, splitOpenAICachedTokens, type ModelPricing } from '../base';

const tieredPricing: ModelPricing = {
    inputPer1KTokens: 0.002,
    outputPer1KTokens: 0.012,
    cencoriMarkupPercentage: 50,
    longContextThresholdTokens: 200_000,
    longContextInputPer1KTokens: 0.004,
    longContextOutputPer1KTokens: 0.018,
};

describe('calculateProviderTokenCost', () => {
    it('uses standard rates at and below the threshold', () => {
        expect(calculateProviderTokenCost(200_000, 1_000, tieredPricing)).toBeCloseTo(0.412);
    });

    it('uses long-context rates for the full request above the threshold', () => {
        expect(calculateProviderTokenCost(200_001, 1_000, tieredPricing)).toBeCloseTo(0.818004);
    });

    it('clamps invalid negative token counts to zero', () => {
        expect(calculateProviderTokenCost(-100, -50, tieredPricing)).toBe(0);
    });

    it('rejects incomplete long-context pricing', () => {
        expect(() => calculateProviderTokenCost(200_001, 1_000, {
            ...tieredPricing,
            longContextOutputPer1KTokens: undefined,
        })).toThrow('Long-context pricing is incomplete');
    });
});

// Anthropic reports cache reads and writes as fields excluded from
// input_tokens, so before these were billed explicitly they cost nothing.
const anthropicPricing: ModelPricing = {
    inputPer1KTokens: 0.005,
    outputPer1KTokens: 0.025,
    cachedInputPer1KTokens: 0.0005,
    cacheWriteMultiplier: 1.25,
    cencoriMarkupPercentage: 50,
};

describe('calculateProviderTokenCost with cached tokens', () => {
    it('bills cache reads at the cache rate, not at zero', () => {
        // 10k uncached input + 100k cache read + 500 output.
        expect(calculateProviderTokenCost(10_000, 500, anthropicPricing, {
            cacheReadTokens: 100_000,
        })).toBeCloseTo(0.05 + 0.05 + 0.0125);
    });

    it('bills cache writes at the input rate plus the write premium', () => {
        // 100k written at 1.25x the $0.005/1k input rate.
        expect(calculateProviderTokenCost(0, 0, anthropicPricing, {
            cacheWriteTokens: 100_000,
        })).toBeCloseTo(0.625);
    });

    it('is unchanged when the provider reports no cache activity', () => {
        const withoutCache = calculateProviderTokenCost(10_000, 500, anthropicPricing);
        const withZeroes = calculateProviderTokenCost(10_000, 500, anthropicPricing, {
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
        });
        expect(withZeroes).toBe(withoutCache);
    });

    it('falls back to the input rate when no cache rate is priced', () => {
        // Failing toward the input rate keeps an unpriced cache read from
        // being billed as free, which is how the undercharge arose.
        const unpriced: ModelPricing = { ...anthropicPricing, cachedInputPer1KTokens: undefined };
        expect(calculateProviderTokenCost(0, 0, unpriced, {
            cacheReadTokens: 100_000,
        })).toBeCloseTo(0.5);
    });

    it('counts cached tokens toward the long-context threshold', () => {
        // 150k uncached + 60k cached is 210k of context, past the 200k tier.
        const cost = calculateProviderTokenCost(150_000, 0, tieredPricing, {
            cacheReadTokens: 60_000,
        });
        // Uncached at the long-context input rate, cache read falls back to it.
        expect(cost).toBeCloseTo(150_000 / 1000 * 0.004 + 60_000 / 1000 * 0.004);
    });
});

describe('splitOpenAICachedTokens', () => {
    it('subtracts cache hits from the billable prompt count', () => {
        // OpenAI reports cached tokens *inside* prompt_tokens.
        expect(splitOpenAICachedTokens({
            prompt_tokens: 10_000,
            prompt_tokens_details: { cached_tokens: 8_000 },
        })).toEqual({ promptTokens: 2_000, cached: { cacheReadTokens: 8_000 } });
    });

    it('leaves the prompt count alone when no details are reported', () => {
        // Most OpenAI-compatible providers omit the details object entirely.
        expect(splitOpenAICachedTokens({ prompt_tokens: 500 }))
            .toEqual({ promptTokens: 500, cached: { cacheReadTokens: 0 } });
    });

    it('never drives the billable remainder negative', () => {
        expect(splitOpenAICachedTokens({
            prompt_tokens: 100,
            prompt_tokens_details: { cached_tokens: 900 },
        })).toEqual({ promptTokens: 0, cached: { cacheReadTokens: 100 } });
    });

    it('treats null details and counts as no cache activity', () => {
        expect(splitOpenAICachedTokens({
            prompt_tokens: 42,
            prompt_tokens_details: { cached_tokens: null },
        })).toEqual({ promptTokens: 42, cached: { cacheReadTokens: 0 } });
    });

    it('cuts the bill on a cache-heavy GPT-5 request', () => {
        // $1.25/1M input, $0.125/1M cached: 90% of the prompt served from
        // cache should cost far less than billing it all as input.
        const gpt5: ModelPricing = {
            inputPer1KTokens: 0.00125,
            outputPer1KTokens: 0.01,
            cachedInputPer1KTokens: 0.000125,
            cencoriMarkupPercentage: 50,
        };
        const { promptTokens, cached } = splitOpenAICachedTokens({
            prompt_tokens: 100_000,
            prompt_tokens_details: { cached_tokens: 90_000 },
        });
        const corrected = calculateProviderTokenCost(promptTokens, 0, gpt5, cached);
        const overcharged = calculateProviderTokenCost(100_000, 0, gpt5);
        expect(corrected).toBeCloseTo(0.0125 + 0.01125);
        expect(overcharged).toBeCloseTo(0.125);
    });
});
