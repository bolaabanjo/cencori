/**
 * @vitest-environment node
 *
 * Layer 1 conflict resolution. The parse layer must be bulletproof (a bad plan
 * can never drop a fact) and the orchestrator must fail open to ADD-all.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    executeGatewayChat: vi.fn(),
}));

vi.mock('@/lib/gateway/chat-executor', () => ({
    executeGatewayChat: (...a: unknown[]) => mocks.executeGatewayChat(...a),
}));

import {
    parseReconcilePlan,
    reconcileFacts,
    hashContent,
    buildReconcileUserMessage,
    type ReconcileCandidate,
} from '../reconcile';
import { ensureGoogleMemoryModel, MEMORY_MANAGED_MODEL, type ExtractedFact } from '../types';

const facts = (...contents: string[]): ExtractedFact[] =>
    contents.map(c => ({ content: c, importance: 0.7 }));

const candidate = (id: string, content: string, importance = 0.6): ReconcileCandidate => ({
    id,
    content,
    importance,
    contentHash: hashContent(content),
});

describe('parseReconcilePlan', () => {
    it('maps ADD / NOOP / UPDATE / DELETE to concrete ops', () => {
        const f = facts('User moved to Rust', 'User likes dark mode', 'User is named Sam');
        const cands = [candidate('c0', 'User uses Python'), candidate('c1', 'User likes light mode')];
        const raw = JSON.stringify({
            operations: [
                { action: 'UPDATE', new: 0, existing: 0, content: 'User uses Rust' },
                { action: 'DELETE', existing: 1 },
                { action: 'NOOP', new: 1 },
                { action: 'ADD', new: 2 },
            ],
        });

        const plan = parseReconcilePlan(raw, f, cands);

        expect(plan.fellBack).toBe(false);
        expect(plan.updates).toEqual([{ id: 'c0', content: 'User uses Rust', importance: 0.7 }]);
        expect(plan.deletes).toEqual(['c1']);
        expect(plan.noops).toBe(1);
        expect(plan.adds).toEqual([{ content: 'User is named Sam', importance: 0.7 }]);
    });

    it('defaults any unaddressed fact to ADD (never drops a fact)', () => {
        const f = facts('fact A', 'fact B');
        const raw = JSON.stringify({ operations: [{ action: 'NOOP', new: 0 }] });

        const plan = parseReconcilePlan(raw, f, []);

        // fact B was never mentioned by the model → must be ADDed.
        expect(plan.adds).toEqual([{ content: 'fact B', importance: 0.7 }]);
        expect(plan.noops).toBe(1);
    });

    it('falls back to ADD-all on unparseable output', () => {
        const f = facts('a', 'b');
        const plan = parseReconcilePlan('not json at all', f, [candidate('c0', 'x')]);
        expect(plan.fellBack).toBe(true);
        expect(plan.adds).toHaveLength(2);
        expect(plan.updates).toHaveLength(0);
    });

    it('ignores out-of-range indices', () => {
        const f = facts('only fact');
        const cands = [candidate('c0', 'existing')];
        const raw = JSON.stringify({
            operations: [
                { action: 'UPDATE', new: 5, existing: 0, content: 'nope' }, // new OOR
                { action: 'DELETE', existing: 9 },                          // existing OOR
            ],
        });
        const plan = parseReconcilePlan(raw, f, cands);
        // Nothing valid applied → the one fact defaults to ADD, no deletes.
        expect(plan.adds).toEqual([{ content: 'only fact', importance: 0.7 }]);
        expect(plan.deletes).toHaveLength(0);
        expect(plan.updates).toHaveLength(0);
    });

    it('treats a contentless UPDATE as an ADD of the new fact', () => {
        const f = facts('new fact');
        const cands = [candidate('c0', 'old fact')];
        const raw = JSON.stringify({ operations: [{ action: 'UPDATE', new: 0, existing: 0 }] });
        const plan = parseReconcilePlan(raw, f, cands);
        expect(plan.updates).toHaveLength(0);
        expect(plan.adds).toEqual([{ content: 'new fact', importance: 0.7 }]);
    });

    it('lets at most one op target a given existing memory', () => {
        const f = facts('x', 'y');
        const cands = [candidate('c0', 'shared target')];
        const raw = JSON.stringify({
            operations: [
                { action: 'UPDATE', new: 0, existing: 0, content: 'first wins' },
                { action: 'UPDATE', new: 1, existing: 0, content: 'second ignored' },
            ],
        });
        const plan = parseReconcilePlan(raw, f, cands);
        expect(plan.updates).toEqual([{ id: 'c0', content: 'first wins', importance: 0.7 }]);
        // second fact couldn't take the same target → ADD.
        expect(plan.adds).toEqual([{ content: 'y', importance: 0.7 }]);
    });

    it('takes importance = max(existing, new) on UPDATE', () => {
        const f: ExtractedFact[] = [{ content: 'refined', importance: 0.4 }];
        const cands = [candidate('c0', 'original', 0.9)];
        const raw = JSON.stringify({ operations: [{ action: 'UPDATE', new: 0, existing: 0, content: 'merged' }] });
        const plan = parseReconcilePlan(raw, f, cands);
        expect(plan.updates[0].importance).toBe(0.9);
    });
});

describe('ensureGoogleMemoryModel (managed, Google-only)', () => {
    it('keeps any gemini model as-is', () => {
        expect(ensureGoogleMemoryModel('gemini-2.5-flash')).toBe('gemini-2.5-flash');
        expect(ensureGoogleMemoryModel('gemini-3-pro')).toBe('gemini-3-pro');
        expect(ensureGoogleMemoryModel('  Gemini-2.5-Flash  ')).toBe('Gemini-2.5-Flash');
    });

    it('coerces any non-Google model (or empty) to the managed model', () => {
        expect(ensureGoogleMemoryModel('gpt-4o-mini')).toBe(MEMORY_MANAGED_MODEL);
        expect(ensureGoogleMemoryModel('claude-sonnet-4-6')).toBe(MEMORY_MANAGED_MODEL);
        expect(ensureGoogleMemoryModel('')).toBe(MEMORY_MANAGED_MODEL);
        expect(ensureGoogleMemoryModel(null)).toBe(MEMORY_MANAGED_MODEL);
        expect(ensureGoogleMemoryModel(undefined)).toBe(MEMORY_MANAGED_MODEL);
    });
});

describe('buildReconcileUserMessage', () => {
    it('labels existing E# and new N#, and marks empty existing set', () => {
        const msg = buildReconcileUserMessage(facts('new one'), []);
        expect(msg).toContain('EXISTING memories:\n(none)');
        expect(msg).toContain('N0: new one');
    });
});

describe('reconcileFacts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    const baseParams = {
        supabase: {} as never,
        projectId: 'proj_1',
        organizationId: 'org_1',
        tier: 'free' as never,
        model: 'gemini-2.5-flash',
    };

    it('skips the LLM entirely when there are no candidates (all new)', async () => {
        const result = await reconcileFacts({ ...baseParams, facts: facts('a', 'b'), candidates: [] });
        expect(mocks.executeGatewayChat).not.toHaveBeenCalled();
        expect(result.plan.adds).toHaveLength(2);
        expect(result.plan.fellBack).toBe(false);
    });

    it('short-circuits exact duplicates to NOOP without calling the LLM', async () => {
        const dup = candidate('c0', 'User likes dark mode');
        const result = await reconcileFacts({
            ...baseParams,
            facts: facts('User likes dark mode'), // identical content → same hash
            candidates: [dup],
        });
        expect(mocks.executeGatewayChat).not.toHaveBeenCalled();
        expect(result.plan.noops).toBe(1);
        expect(result.plan.adds).toHaveLength(0);
    });

    it('applies the model plan and carries exact-dup noops through', async () => {
        mocks.executeGatewayChat.mockResolvedValue({
            content: JSON.stringify({
                operations: [{ action: 'UPDATE', new: 0, existing: 0, content: 'User uses Rust' }],
            }),
            cost: { cencoriChargeUsd: 0.0001 },
        });

        const result = await reconcileFacts({
            ...baseParams,
            facts: facts('User switched to Rust', 'User likes dark mode'),
            candidates: [candidate('c0', 'User uses Python'), candidate('c1', 'User likes dark mode')],
        });

        // Only the non-dup fact reached the model; dup counted as noop.
        expect(mocks.executeGatewayChat).toHaveBeenCalledTimes(1);
        expect(result.plan.updates).toEqual([{ id: 'c0', content: 'User uses Rust', importance: 0.7 }]);
        expect(result.plan.noops).toBe(1);
        expect(result.costUsd).toBe(0.0001);
    });

    it('fails open to ADD-all when the LLM throws', async () => {
        mocks.executeGatewayChat.mockRejectedValue(new Error('rate limited'));
        const result = await reconcileFacts({
            ...baseParams,
            facts: facts('brand new fact'),
            candidates: [candidate('c0', 'unrelated existing')],
        });
        expect(result.plan.fellBack).toBe(true);
        expect(result.plan.adds).toEqual([{ content: 'brand new fact', importance: 0.7 }]);
        expect(result.costUsd).toBe(0);
    });
});
