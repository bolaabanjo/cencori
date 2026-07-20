/**
 * @vitest-environment node
 *
 * Layer 3 write semantics: a reconcile UPDATE must preserve history — insert
 * the new fact as a fresh row AND supersede the old one (linking them), rather
 * than mutating in place. That is what makes as-of temporal recall possible.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    reconcileFacts: vi.fn(),
    checkMemoryQuota: vi.fn(),
    embedForMemory: vi.fn(),
    redactFact: vi.fn(),
}));

vi.mock('../reconcile', async (importActual) => {
    const actual = await importActual<typeof import('../reconcile')>();
    return { ...actual, reconcileFacts: (...a: unknown[]) => mocks.reconcileFacts(...a) };
});
vi.mock('../quota', () => ({ checkMemoryQuota: (...a: unknown[]) => mocks.checkMemoryQuota(...a) }));
vi.mock('../embeddings', () => ({ embedForMemory: (...a: unknown[]) => mocks.embedForMemory(...a) }));
vi.mock('../redact', () => ({ redactFact: (...a: unknown[]) => mocks.redactFact(...a) }));

import { writeMemories } from '../writeback';

describe('writeMemories UPDATE preserves history (supersede + insert)', () => {
    let inserted: Record<string, unknown>[];
    let rpcCalls: { name: string; args: Record<string, unknown> }[];
    let supabase: never;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        inserted = [];
        rpcCalls = [];

        mocks.checkMemoryQuota.mockResolvedValue({ allowed: true, used: 1, limit: 1000 });
        mocks.redactFact.mockImplementation(async (_s: unknown, _p: string, content: string) => ({ content, redactions: 0, blocked: false }));
        mocks.embedForMemory.mockImplementation(async (_s: unknown, _p: string, _o: string, input: string | string[]) => ({
            embeddings: (Array.isArray(input) ? input : [input]).map(() => [0.1, 0.2]),
            totalTokens: 5, providerCostUsd: 0, cencoriChargeUsd: 0, markupPercentage: 0,
            model: 'gemini-embedding-001', provider: 'google',
        }));
        // Reconcile decides: the new fact UPDATEs existing memory "old-id".
        mocks.reconcileFacts.mockResolvedValue({
            plan: { adds: [], updates: [{ id: 'old-id', content: 'User uses Rust', importance: 0.8 }], deletes: [], noops: 0, fellBack: false },
            costUsd: 0,
        });

        supabase = {
            rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
                rpcCalls.push({ name, args });
                if (name === 'match_gateway_memories_for_write') return { data: [], error: null };
                return { data: null, error: null };
            }),
            from: vi.fn(() => ({
                insert: vi.fn((row: Record<string, unknown>) => {
                    inserted.push(row);
                    return { select: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: 'new-id', content: row.content, importance: row.importance }, error: null })) })) };
                }),
            })),
        } as never;
    });

    it('inserts the new fact and supersedes the old one, linked', async () => {
        const result = await writeMemories({
            supabase,
            organizationId: 'org_1',
            projectId: 'proj_1',
            tier: 'pro',
            scope: 'user',
            scopeKey: 'user_1',
            namespace: null,
            facts: [{ content: 'User switched to Rust', importance: 0.8 }],
        });

        // A brand-new active row was inserted for the reconciled content.
        expect(inserted).toHaveLength(1);
        expect(inserted[0].content).toBe('User uses Rust');
        expect((inserted[0].metadata as Record<string, unknown>).supersedes).toBe('old-id');

        // The old fact was superseded and linked to the new row.
        const sup = rpcCalls.find(c => c.name === 'supersede_gateway_memory');
        expect(sup).toBeTruthy();
        expect(sup!.args.p_old_id).toBe('old-id');
        expect(sup!.args.p_new_id).toBe('new-id');

        // The write reports the new memory + reconciliation stats.
        expect(result.written).toEqual([{ id: 'mem_new-id', content: 'User uses Rust', importance: 0.8 }]);
        expect(result.reconciliation).toMatchObject({ updated: 1, added: 0, superseded: 0 });
    });
});
