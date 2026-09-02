/**
 * @vitest-environment node
 *
 * What the console shows for a request the gateway turned down.
 *
 * Only successes were ever logged, so a key that stopped working produced days of failing turns
 * against a dashboard showing nothing at all — which reads as an idle gateway rather than one
 * refusing every request.
 */
import { describe, expect, it } from 'vitest';
import { describeBasecodeRefusal } from '@/lib/gateway-middleware';

describe('what a Basecode entitlement refusal tells the caller', () => {
    /**
     * The reason that made this worth fixing. It means the request reached the gateway without the
     * turn the app reserves beforehand — a sequencing fault, and the only reason carrying no
     * `reset_at`, so the old reply told the user to wait for a reset that was null.
     */
    it('does not call a missing reservation a usage limit', () => {
        const refusal = describeBasecodeRefusal('turn_not_reserved');

        expect(refusal.code).toBe('basecode_turn_not_reserved');
        expect(refusal.error).not.toMatch(/usage limit/i);
        expect(refusal.status).toBe(409);
    });

    it('keeps the usage limit for an actual usage ceiling', () => {
        const refusal = describeBasecodeRefusal('weekly_budget_limit');

        expect(refusal.code).toBe('basecode_usage_limited');
        expect(refusal.status).toBe(429);
    });

    it('separates a running turn from a spent budget', () => {
        expect(describeBasecodeRefusal('concurrency_limit').status).toBe(409);
    });

    it('names an account or plan problem as one, since no reset fixes it', () => {
        for (const reason of ['account_missing', 'plan_unavailable']) {
            const refusal = describeBasecodeRefusal(reason);
            expect(refusal.status).toBe(403);
            expect(refusal.message).not.toMatch(/wait for the reset/i);
        }
    });

    /**
     * A reason a later migration adds is treated as a real ceiling rather than mislabelled with
     * somebody else's code — the conservative direction, since 429 is the one the client retries.
     */
    it('falls back to the usage limit for a reason it has never seen', () => {
        expect(describeBasecodeRefusal('some_future_reason').code).toBe('basecode_usage_limited');
        expect(describeBasecodeRefusal(undefined).status).toBe(429);
    });

    it('only offers the upgrade path where upgrading is the answer', () => {
        // Sending someone to /basecode over a sequencing fault wastes their time and their money.
        expect(describeBasecodeRefusal('weekly_budget_limit').status).toBe(429);
        expect(describeBasecodeRefusal('turn_not_reserved').status).not.toBe(429);
    });
});
