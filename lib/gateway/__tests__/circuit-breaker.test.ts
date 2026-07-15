import { describe, expect, it } from 'vitest';
import {
    getCircuitStatus,
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
});
