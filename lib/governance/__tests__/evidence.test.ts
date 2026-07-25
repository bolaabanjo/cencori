import { describe, it, expect, vi } from 'vitest';
import { generateEvidencePack, controlMatchesFramework } from '../evidence';

describe('controlMatchesFramework', () => {
    it('matches exact and namespaced controls', () => {
        expect(controlMatchesFramework('CBN-AML', 'CBN-AML')).toBe(true);
        expect(controlMatchesFramework('CBN-AML:model-monitoring', 'CBN-AML')).toBe(true);
        expect(controlMatchesFramework('NDPR', 'CBN-AML')).toBe(false);
    });
});

/** Thenable query-builder chain that ignores method calls and resolves `result`. */
function chain(result: unknown) {
    const b: Record<string, unknown> = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) };
    for (const m of ['select', 'eq', 'order', 'limit', 'gte', 'lte']) b[m] = () => b;
    return b;
}

function mockSupabase(ledgerRows: unknown[], policyRows: unknown[] = []) {
    return {
        rpc: vi.fn().mockResolvedValue({ data: [{ chain_ok: true, entries: 3, pending_deadletter: 0, complete: true }], error: null }),
        from: vi.fn((table: string) => {
            if (table === 'governance_audit_ledger') return chain({ data: ledgerRows, error: null });
            if (table === 'governance_policies') return chain({ data: policyRows, error: null });
            return chain({ data: [], error: null });
        }),
    } as never;
}

describe('generateEvidencePack', () => {
    const ledger = [
        { seq: 3, ts: 't3', decision: 'block', rationale: 'jailbreak', event_type: 'policy.decision', payload: { controls: ['CBN-AML', 'ISO-42001:A.8'] } },
        { seq: 2, ts: 't2', decision: 'require_approval', rationale: 'high value', event_type: 'policy.decision', payload: { controls: ['CBN-AML'] } },
        { seq: 1, ts: 't1', decision: 'allow', rationale: null, event_type: 'policy.decision', payload: { controls: ['NDPR'] } }, // different framework
    ];
    const policies = [{ name: 'cbn-aml', version: 1, spec: { controls: ['CBN-AML'] } }];

    it('aggregates matching controls with decision breakdown, samples, and policies', async () => {
        const pack = await generateEvidencePack(mockSupabase(ledger, policies), { orgId: 'o1', framework: 'CBN-AML' });

        expect(pack.chain).toEqual({ ok: true, entries: 3, pendingDeadletter: 0, complete: true });
        expect(pack.summary.totalEnforcements).toBe(2); // seq 3 + seq 2 (NDPR excluded)
        expect(pack.summary.byDecision).toEqual({ block: 1, require_approval: 1 });

        const cbn = pack.controls.find(c => c.control === 'CBN-AML')!;
        expect(cbn.enforcements).toBe(2);
        expect(cbn.byDecision).toEqual({ block: 1, require_approval: 1 });
        expect(cbn.policies).toEqual(['cbn-aml v1']);
        expect(cbn.samples).toHaveLength(2);
    });

    it('excludes entries from other frameworks entirely', async () => {
        const pack = await generateEvidencePack(mockSupabase(ledger), { orgId: 'o1', framework: 'NDPR' });
        expect(pack.summary.totalEnforcements).toBe(1);
        expect(pack.controls.map(c => c.control)).toEqual(['NDPR']);
    });

    it('reports an empty but valid pack when nothing matches', async () => {
        const pack = await generateEvidencePack(mockSupabase(ledger), { orgId: 'o1', framework: 'HIPAA' });
        expect(pack.summary.totalEnforcements).toBe(0);
        expect(pack.controls).toEqual([]);
        expect(pack.chain.complete).toBe(true);
    });
});
