import { describe, expect, it } from 'vitest';
import { calculateCustomerCharge, type PricingTier } from '../end-user-billing';

// $0.01/unit for the first 1,000 units, $0.005 beyond that.
const twoTiers: PricingTier[] = [
    { up_to: 1000, unit_amount: 0.01 },
    { up_to: null, unit_amount: 0.005 },
];

const threeTiers: PricingTier[] = [
    { up_to: 100, unit_amount: 0.10 },
    { up_to: 200, unit_amount: 0.05 },
    { up_to: null, unit_amount: 0.01 },
];

describe('calculateCustomerCharge', () => {
    describe('flat pricing', () => {
        it('applies the markup percentage to the Cencori charge', () => {
            expect(calculateCustomerCharge(1, 50, null)).toBeCloseTo(1.5, 10);
        });

        it('adds the per-request flat rate on top of the marked-up charge', () => {
            expect(calculateCustomerCharge(1, 50, 0.25)).toBeCloseTo(1.75, 10);
        });

        it('passes the cost through unchanged at zero markup', () => {
            expect(calculateCustomerCharge(2, 0, null)).toBeCloseTo(2, 10);
        });

        it('ignores tiers when the plan is flat', () => {
            expect(calculateCustomerCharge(1, 50, null, 'flat', twoTiers, 5000, 0))
                .toBeCloseTo(1.5, 10);
        });

        it('falls back to markup when a tiered plan has no tiers configured', () => {
            expect(calculateCustomerCharge(1, 50, null, 'tiered', [], 500, 0))
                .toBeCloseTo(1.5, 10);
        });
    });

    describe('graduated (tiered) pricing', () => {
        it('charges every unit at the first tier while usage stays inside it', () => {
            // 500 units, all within the first 1,000.
            expect(calculateCustomerCharge(0, 0, null, 'tiered', twoTiers, 500, 0))
                .toBeCloseTo(5, 10);
        });

        it('splits a request that crosses a tier boundary across both rates', () => {
            // Used 900. This request of 200 takes 100 at $0.01 and 100 at $0.005.
            expect(calculateCustomerCharge(0, 0, null, 'tiered', twoTiers, 200, 900))
                .toBeCloseTo(100 * 0.01 + 100 * 0.005, 10);
        });

        it('charges entirely at the upper tier once the boundary is behind us', () => {
            expect(calculateCustomerCharge(0, 0, null, 'tiered', twoTiers, 200, 5000))
                .toBeCloseTo(1, 10);
        });

        it('spans three tiers in a single request', () => {
            // 0 -> 250: 100 at $0.10, 100 at $0.05, 50 at $0.01.
            expect(calculateCustomerCharge(0, 0, null, 'tiered', threeTiers, 250, 0))
                .toBeCloseTo(100 * 0.10 + 100 * 0.05 + 50 * 0.01, 10);
        });

        it('reads tiers in ascending order regardless of configured order', () => {
            const shuffled = [twoTiers[1], twoTiers[0]];
            expect(calculateCustomerCharge(0, 0, null, 'tiered', shuffled, 200, 900))
                .toBeCloseTo(calculateCustomerCharge(0, 0, null, 'tiered', twoTiers, 200, 900), 10);
        });

        it('bills usage above the highest finite tier at that tier rate', () => {
            // No open-ended tier: usage past 1,000 must not become free.
            const capped: PricingTier[] = [{ up_to: 1000, unit_amount: 0.01 }];
            expect(calculateCustomerCharge(0, 0, null, 'tiered', capped, 500, 900))
                .toBeCloseTo(100 * 0.01 + 400 * 0.01, 10);
        });

        it('charges nothing for a zero-unit request', () => {
            expect(calculateCustomerCharge(0, 0, null, 'tiered', twoTiers, 0, 0)).toBe(0);
        });

        it('is additive across requests — splitting a request does not change the total', () => {
            const whole = calculateCustomerCharge(0, 0, null, 'tiered', threeTiers, 250, 0);
            const first = calculateCustomerCharge(0, 0, null, 'tiered', threeTiers, 120, 0);
            const second = calculateCustomerCharge(0, 0, null, 'tiered', threeTiers, 130, 120);
            expect(first + second).toBeCloseTo(whole, 10);
        });
    });

    describe('volume pricing', () => {
        it('charges all units at the tier the period total reaches', () => {
            // Total lands at 1,500 -> the $0.005 tier applies to all 1,500 units.
            expect(calculateCustomerCharge(0, 0, null, 'volume', twoTiers, 1500, 0))
                .toBeCloseTo(1500 * 0.005, 10);
        });

        it('uses the cheaper tier for a first request large enough to reach it', () => {
            // Regression: pricing off usage-before would bill this at $0.01.
            const charge = calculateCustomerCharge(0, 0, null, 'volume', twoTiers, 2000, 0);
            expect(charge).toBeCloseTo(2000 * 0.005, 10);
            expect(charge).toBeLessThan(2000 * 0.01);
        });

        it('stays in the first tier while the total remains inside it', () => {
            expect(calculateCustomerCharge(0, 0, null, 'volume', twoTiers, 100, 0))
                .toBeCloseTo(1, 10);
        });

        it('prices later requests at the tier reached by cumulative usage', () => {
            expect(calculateCustomerCharge(0, 0, null, 'volume', twoTiers, 100, 5000))
                .toBeCloseTo(100 * 0.005, 10);
        });

        it('reads tiers in ascending order regardless of configured order', () => {
            const shuffled = [threeTiers[2], threeTiers[0], threeTiers[1]];
            expect(calculateCustomerCharge(0, 0, null, 'volume', shuffled, 150, 0))
                .toBeCloseTo(calculateCustomerCharge(0, 0, null, 'volume', threeTiers, 150, 0), 10);
        });
    });

    describe('graduated and volume are distinct models', () => {
        it('prices the same usage differently', () => {
            // The whole point: these must not collapse to the same number.
            const graduated = calculateCustomerCharge(0, 0, null, 'tiered', twoTiers, 2000, 0);
            const volume = calculateCustomerCharge(0, 0, null, 'volume', twoTiers, 2000, 0);

            expect(graduated).toBeCloseTo(1000 * 0.01 + 1000 * 0.005, 10);
            expect(volume).toBeCloseTo(2000 * 0.005, 10);
            expect(graduated).toBeGreaterThan(volume);
        });
    });
});
