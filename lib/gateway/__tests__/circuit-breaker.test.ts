import { describe, expect, it } from 'vitest';
import {
    circuitKey,
    circuitProvider,
    getCircuitStatus,
    isCircuitOpen,
    recordFailure,
    recordSuccess,
    resetCircuit,
} from '@/lib/providers/circuit-breaker';

describe('provider circuit breaker', () => {
    it('counts consecutive failures and clears the streak on success', async () => {
        const provider = `test-provider-${Date.now()}`;
        await resetCircuit(provider);
        await recordFailure(provider, { enabled: true, failureThreshold: 3 });
        await recordFailure(provider, { enabled: true, failureThreshold: 3 });
        expect((await getCircuitStatus(provider)).failures).toBe(2);

        await recordSuccess(provider);
        const state = await getCircuitStatus(provider);
        expect(state.failures).toBe(0);
        expect(state.state).toBe('closed');
    });

    it('does not mutate state while disabled', async () => {
        const provider = `disabled-provider-${Date.now()}`;
        await resetCircuit(provider);
        await recordFailure(provider, { enabled: false, failureThreshold: 1 });
        expect((await getCircuitStatus(provider)).failures).toBe(0);
    });

    /**
     * The failure this scoping exists to prevent: `stealth/ox-alpha` retired and began returning a
     * hard 404 on every call, which tripped the shared `openrouter` circuit and would have gated
     * every other openrouter-routed model for the timeout window on the strength of one dead id.
     */
    it('confines a failing model to its own circuit', async () => {
        const provider = `scoped-provider-${Date.now()}`;
        const dead = circuitKey(provider, 'retired-model');
        const healthy = circuitKey(provider, 'working-model');
        const config = { enabled: true, failureThreshold: 2 };
        await resetCircuit(dead);
        await resetCircuit(healthy);

        await recordFailure(dead, config);
        await recordFailure(dead, config);

        expect((await getCircuitStatus(dead)).state).toBe('open');
        expect(await isCircuitOpen(dead, config)).toBe(true);
        // The other model on the same provider is untouched.
        expect(await isCircuitOpen(healthy, config)).toBe(false);
        expect((await getCircuitStatus(healthy)).failures).toBe(0);
    });

    it('keeps one model’s recovery from clearing another’s failures', async () => {
        const provider = `independent-${Date.now()}`;
        const first = circuitKey(provider, 'model-a');
        const second = circuitKey(provider, 'model-b');
        const config = { enabled: true, failureThreshold: 5 };
        await resetCircuit(first);
        await resetCircuit(second);

        await recordFailure(first, config);
        await recordFailure(first, config);
        await recordSuccess(second);

        expect((await getCircuitStatus(first)).failures).toBe(2);
    });

    it('reports a scoped circuit against its provider', () => {
        expect(circuitKey('openrouter', 'stealth/ox-alpha')).toBe('openrouter::stealth/ox-alpha');
        expect(circuitProvider('openrouter::stealth/ox-alpha')).toBe('openrouter');
        // An unscoped key is still its own provider, so older callers keep working.
        expect(circuitKey('openrouter')).toBe('openrouter');
        expect(circuitProvider('openrouter')).toBe('openrouter');
    });
});
