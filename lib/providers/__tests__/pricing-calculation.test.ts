import { describe, expect, it } from 'vitest';
import { calculateProviderTokenCost, type ModelPricing } from '../base';

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
