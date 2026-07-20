/**
 * @vitest-environment node
 *
 * Layer 3 retrieval routing: an `asOf` directive must query the temporal RPC
 * (validity window, incl. superseded facts) and must NOT reinforce — inspecting
 * history should never bump a memory's access count. Current-state recall keeps
 * using the ranked RPC and does reinforce.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../embeddings', () => ({
    embedForMemory: vi.fn(async () => ({
        embeddings: [[0.1, 0.2, 0.3]],
        totalTokens: 5,
        providerCostUsd: 0,
        cencoriChargeUsd: 0,
        markupPercentage: 0,
        model: 'gemini-embedding-001',
        provider: 'google',
    })),
}));

import { retrieveMemories } from '../retrieval';
import { parseMemoryDirective, type MemoryDirective } from '../types';

function directive(extra: Record<string, unknown>): MemoryDirective {
    const parsed = parseMemoryDirective({ userId: 'user_1', ...extra });
    if (!parsed.ok) throw new Error('fixture should parse');
    return parsed.directive;
}

const ROW = {
    id: '00000000-0000-0000-0000-0000000000aa',
    content: 'User used Python',
    namespace: null,
    importance: 0.7,
    similarity: 0.8,
    access_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    last_accessed_at: null,
};

describe('retrieveMemories temporal routing', () => {
    let rpc: ReturnType<typeof vi.fn>;
    let supabase: never;

    beforeEach(() => {
        vi.clearAllMocks();
        rpc = vi.fn(async (name: string) => (name === 'touch_gateway_memories' ? { data: null, error: null } : { data: [ROW], error: null }));
        supabase = { rpc } as never;
    });

    it('current-state recall uses the ranked RPC and reinforces (touch)', async () => {
        const out = await retrieveMemories({
            supabase,
            organizationId: 'org_1',
            projectId: 'proj_1',
            directive: directive({}),
            queryText: 'what language?',
        });

        const names = rpc.mock.calls.map(c => c[0]);
        expect(names).toContain('match_gateway_memories_ranked');
        expect(names).toContain('touch_gateway_memories');
        expect(out).toHaveLength(1);
    });

    it('as-of recall uses the temporal RPC with p_as_of and does NOT reinforce', async () => {
        const out = await retrieveMemories({
            supabase,
            organizationId: 'org_1',
            projectId: 'proj_1',
            directive: directive({ asOf: '2026-03-01T00:00:00Z' }),
            queryText: 'what language did I use back then?',
        });

        const asofCall = rpc.mock.calls.find(c => c[0] === 'match_gateway_memories_asof');
        expect(asofCall).toBeTruthy();
        expect((asofCall![1] as { p_as_of: string }).p_as_of).toBe('2026-03-01T00:00:00.000Z');

        // No ranked call, and crucially no reinforcement of historical memories.
        const names = rpc.mock.calls.map(c => c[0]);
        expect(names).not.toContain('match_gateway_memories_ranked');
        expect(names).not.toContain('touch_gateway_memories');
        expect(out).toHaveLength(1);
    });

    it('as-of RPC failure fails open to empty (no legacy fallback for history)', async () => {
        rpc = vi.fn(async () => ({ data: null, error: { message: 'function does not exist' } }));
        supabase = { rpc } as never;
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        const out = await retrieveMemories({
            supabase,
            organizationId: 'org_1',
            projectId: 'proj_1',
            directive: directive({ asOf: '2026-03-01T00:00:00Z' }),
            queryText: 'history',
        });
        expect(out).toEqual([]);
        expect(rpc.mock.calls.map(c => c[0])).not.toContain('match_gateway_memories');
    });
});
