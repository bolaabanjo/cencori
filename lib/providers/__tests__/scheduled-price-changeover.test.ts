import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const singleMock = vi.fn();

vi.mock('@/lib/supabaseAdmin', () => ({
    createAdminClient: () => ({
        from: () => ({
            select: () => ({
                eq: () => ({
                    eq: () => ({
                        eq: () => ({ single: singleMock }),
                    }),
                }),
            }),
        }),
    }),
}));

const { getPricingFromDB } = await import('../pricing');
const { PricingUnavailableError } = await import('../errors');

const EXPIRY = '2026-09-01T00:00:00Z';
const BEFORE = new Date('2026-08-05T00:00:00Z');
const AFTER = new Date('2026-09-01T00:00:01Z');

/** Shaped like the live claude-sonnet-5 row: $2/$10 intro, $3/$15 after. */
function row(overrides: Record<string, unknown> = {}) {
    return {
        data: {
            input_price_per_1k_tokens: 0.002,
            output_price_per_1k_tokens: 0.010,
            cached_input_price_per_1k_tokens: 0.0002,
            cencori_markup_percentage: 50,
            pricing_expires_at: EXPIRY,
            next_input_price_per_1k_tokens: 0.003,
            next_output_price_per_1k_tokens: 0.015,
            next_cached_input_price_per_1k_tokens: 0.0003,
            long_context_threshold_tokens: null,
            long_context_input_price_per_1k_tokens: null,
            long_context_output_price_per_1k_tokens: null,
            long_context_cached_input_price_per_1k_tokens: null,
            ...overrides,
        },
        error: null,
    };
}

let n = 0;
const uniqueModel = () => `test-model-${++n}`;

beforeEach(() => {
    vi.useFakeTimers();
    singleMock.mockReset();
});
afterEach(() => {
    vi.useRealTimers();
});

describe('scheduled price changeover', () => {
    it('bills the introductory rate before the changeover', async () => {
        vi.setSystemTime(BEFORE);
        singleMock.mockResolvedValue(row());

        const pricing = await getPricingFromDB('anthropic', uniqueModel());

        expect(pricing.inputPer1KTokens).toBe(0.002);
        expect(pricing.outputPer1KTokens).toBe(0.010);
        expect(pricing.cachedInputPer1KTokens).toBe(0.0002);
        expect(pricing.pricingExpiresAt).toBe(EXPIRY);
    });

    it('switches to the follow-on rate once the expiry passes', async () => {
        vi.setSystemTime(AFTER);
        singleMock.mockResolvedValue(row());

        const pricing = await getPricingFromDB('anthropic', uniqueModel());

        expect(pricing.inputPer1KTokens).toBe(0.003);
        expect(pricing.outputPer1KTokens).toBe(0.015);
        expect(pricing.cachedInputPer1KTokens).toBe(0.0003);
        // The successor rate has no end date — don't report an elapsed deadline.
        expect(pricing.pricingExpiresAt).toBeUndefined();
    });

    it('still fails closed when an elapsed row has no follow-on rate', async () => {
        vi.setSystemTime(AFTER);
        singleMock.mockResolvedValue(row({
            next_input_price_per_1k_tokens: null,
            next_output_price_per_1k_tokens: null,
            next_cached_input_price_per_1k_tokens: null,
        }));

        await expect(getPricingFromDB('anthropic', uniqueModel()))
            .rejects.toBeInstanceOf(PricingUnavailableError);
    });

    it('fails closed on a half-configured follow-on rate', async () => {
        vi.setSystemTime(AFTER);
        singleMock.mockResolvedValue(row({ next_output_price_per_1k_tokens: null }));

        await expect(getPricingFromDB('anthropic', uniqueModel()))
            .rejects.toBeInstanceOf(PricingUnavailableError);
    });

    it('fails closed on a negative follow-on rate', async () => {
        vi.setSystemTime(AFTER);
        singleMock.mockResolvedValue(row({ next_input_price_per_1k_tokens: -1 }));

        await expect(getPricingFromDB('anthropic', uniqueModel()))
            .rejects.toBeInstanceOf(PricingUnavailableError);
    });

    it('ignores follow-on columns that are absent entirely', async () => {
        // Deploy ordering: the code ships before the migration adds the columns.
        vi.setSystemTime(BEFORE);
        const base = row();
        delete (base.data as Record<string, unknown>).next_input_price_per_1k_tokens;
        delete (base.data as Record<string, unknown>).next_output_price_per_1k_tokens;
        delete (base.data as Record<string, unknown>).next_cached_input_price_per_1k_tokens;
        singleMock.mockResolvedValue(base);

        const pricing = await getPricingFromDB('anthropic', uniqueModel());

        expect(pricing.inputPer1KTokens).toBe(0.002);
    });

    it('leaves rows without an expiry untouched', async () => {
        vi.setSystemTime(AFTER);
        singleMock.mockResolvedValue(row({
            pricing_expires_at: null,
            next_input_price_per_1k_tokens: null,
            next_output_price_per_1k_tokens: null,
        }));

        const pricing = await getPricingFromDB('anthropic', uniqueModel());

        expect(pricing.inputPer1KTokens).toBe(0.002);
        expect(pricing.pricingExpiresAt).toBeUndefined();
    });
});
