import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/rate-limit', () => ({
    checkCustomRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 100, reset: 0 }),
}));

import { enforcePolicies, invalidatePolicyCache, applyPolicyRedactions } from '../policy-enforcement';
import { checkCustomRateLimit } from '@/lib/rate-limit';

/** Mock supabase: active-policy read via from().select().eq().eq(); ledger via rpc(). */
function mockSupabase(policies: unknown[], rpc = vi.fn().mockResolvedValue({ data: [{ id: 'e', seq: 1, entry_hash: 'h', prev_hash: 'p' }], error: null })) {
    const eq2 = vi.fn().mockResolvedValue({ data: policies, error: null });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    return { from: vi.fn().mockReturnValue({ select }), rpc } as never;
}

const blockJailbreak = {
    name: 'jb', version: 1, spec: {
        controls: ['ISO-42001:A.8'],
        rules: [{ name: 'block-jailbreak', direction: 'input', when: { all: [{ field: 'signals.jailbreak_score', gte: 0.8 }] }, action: 'block', severity: 'high' }],
    },
};

beforeEach(() => invalidatePolicyCache());

describe('enforcePolicies', () => {
    it('allows when the org has no active policies', async () => {
        const res = await enforcePolicies(mockSupabase([]), { orgId: 'o1', direction: 'input', signals: { jailbreak_score: 0.99 } });
        expect(res.decision).toBe('allow');
        expect(res.block).toBeUndefined();
    });

    it('blocks inline when a policy fires, and records the decision to the ledger', async () => {
        const rpc = vi.fn().mockResolvedValue({ data: [{ id: 'e', seq: 1, entry_hash: 'h', prev_hash: 'p' }], error: null });
        const res = await enforcePolicies(mockSupabase([blockJailbreak], rpc), {
            orgId: 'o1', direction: 'input', model: 'gpt', signals: { jailbreak_score: 0.9 }, apiKeyId: 'k1',
        });
        expect(res.decision).toBe('block');
        expect(res.block).toMatchObject({ status: 403, code: 'policy_violation' });
        expect(res.block!.reasons).toEqual(['jb/block-jailbreak']);

        const append = rpc.mock.calls.find(c => c[0] === 'append_governance_audit_entry');
        expect(append).toBeTruthy();
        expect((append![1] as { p_event_type: string }).p_event_type).toBe('policy.decision');
        expect((append![1] as { p_decision: string }).p_decision).toBe('block');
        expect((append![1] as { p_payload: { controls: string[] } }).p_payload.controls).toEqual(['ISO-42001:A.8']);
    });

    it('does not block, and writes NO ledger entry, when no rule fires', async () => {
        const rpc = vi.fn().mockResolvedValue({ data: [{ id: 'e' }], error: null });
        const res = await enforcePolicies(mockSupabase([blockJailbreak], rpc), {
            orgId: 'o2', direction: 'input', signals: { jailbreak_score: 0.1 },
        });
        expect(res.decision).toBe('allow');
        expect(rpc.mock.calls.some(c => c[0] === 'append_governance_audit_entry')).toBe(false);
    });

    it('surfaces require_approval as a hard-stop with its own code', async () => {
        const policy = { name: 'aml', version: 1, spec: { rules: [
            { name: 'hitl', direction: 'input', when: { any: [{ field: 'amount', gt: 5_000_000 }] }, action: 'require_approval' },
        ] } };
        const res = await enforcePolicies(mockSupabase([policy]), { orgId: 'o3', direction: 'input', amount: 9_000_000 });
        expect(res.decision).toBe('require_approval');
        expect(res.block).toMatchObject({ code: 'policy_requires_approval' });
    });

    it('fails open (allow) if policy loading throws', async () => {
        const badSupabase = { from: () => { throw new Error('db down'); }, rpc: vi.fn() } as never;
        const res = await enforcePolicies(badSupabase, { orgId: 'o4', direction: 'input' });
        expect(res.decision).toBe('allow');
        expect(res.rationale).toMatch(/fail-open/);
    });

    it('returns redact directives (no hard-stop) for a redact rule with a pattern', async () => {
        const policy = { name: 'r', version: 1, spec: { rules: [
            { name: 'mask-phone', direction: 'input', when: { all: [{ field: 'content', matches: '\\d{3}-\\d{3}-\\d{4}' }] }, action: 'redact', params: { pattern: '\\d{3}-\\d{3}-\\d{4}' } },
        ] } };
        const res = await enforcePolicies(mockSupabase([policy]), { orgId: 'o5', direction: 'input', content: 'ring 555-123-4567' });
        expect(res.decision).toBe('redact');
        expect(res.block).toBeUndefined();
        expect(res.redactions).toEqual([{ pattern: '\\d{3}-\\d{3}-\\d{4}', strategy: 'mask' }]);
    });
});

describe('applyPolicyRedactions', () => {
    it('masks matches with [REDACTED]', () => {
        const { text } = applyPolicyRedactions('call 555-123-4567 now', [{ pattern: '\\d{3}-\\d{3}-\\d{4}', strategy: 'mask' }]);
        expect(text).toBe('call [REDACTED] now');
    });
    it('tokenizes reversibly (placeholder + recoverable map)', () => {
        const { text, tokenMap } = applyPolicyRedactions('acct 12345678', [{ pattern: '\\d{8}', strategy: 'tokenize' }]);
        expect(text).toMatch(/__CENCORI_POLICY_0__/);
        expect([...tokenMap.values()]).toContain('12345678');
    });
    it('skips an invalid regex without throwing', () => {
        expect(applyPolicyRedactions('hi', [{ pattern: '(', strategy: 'mask' }]).text).toBe('hi');
    });
});

describe('enforcePolicies — route & rate_limit', () => {
    it('returns a route directive (region) from a route rule', async () => {
        const policy = { name: 'res', version: 1, spec: { rules: [
            { name: 'eu', when: { all: [{ field: 'user.region', equals: 'EU' }] }, action: 'route', params: { region: 'eu-west' } },
        ] } };
        const res = await enforcePolicies(mockSupabase([policy]), { orgId: 'o6', direction: 'input', region: 'EU' });
        expect(res.decision).toBe('route');
        expect(res.route).toEqual({ region: 'eu-west', provider: undefined, model: undefined });
    });

    it('returns a route directive that overrides the model', async () => {
        const policy = { name: 'downgrade', version: 1, spec: { rules: [
            { name: 'cheap-for-pii', when: { all: [{ field: 'signals.pii', present: true }] }, action: 'route', params: { model: 'gemini-2.5-flash', provider: 'google' } },
        ] } };
        const res = await enforcePolicies(mockSupabase([policy]), { orgId: 'o9', direction: 'input', signals: { pii: true } });
        expect(res.route).toEqual({ region: undefined, provider: 'google', model: 'gemini-2.5-flash' });
    });

    it('hard-stops with 429 when a rate_limit rule exceeds its window', async () => {
        vi.mocked(checkCustomRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, reset: 0 });
        const policy = { name: 'rl', version: 1, spec: { rules: [
            { name: 'cap', when: { all: [{ field: 'model', present: true }] }, action: 'rate_limit', params: { limit: 10 } },
        ] } };
        const res = await enforcePolicies(mockSupabase([policy]), { orgId: 'o7', direction: 'input', model: 'gpt' });
        expect(res.block).toMatchObject({ status: 429, code: 'policy_rate_limited' });
        expect(checkCustomRateLimit).toHaveBeenCalledWith('o7:rl:cap', 10, 60);
    });

    it('allows through when the rate_limit rule is within its window', async () => {
        vi.mocked(checkCustomRateLimit).mockResolvedValueOnce({ allowed: true, remaining: 5, reset: 0 });
        const policy = { name: 'rl', version: 1, spec: { rules: [
            { name: 'cap', when: { all: [{ field: 'model', present: true }] }, action: 'rate_limit', params: { limit: 10 } },
        ] } };
        const res = await enforcePolicies(mockSupabase([policy]), { orgId: 'o8', direction: 'input', model: 'gpt' });
        expect(res.block).toBeUndefined();
        expect(res.decision).toBe('rate_limit');
    });
});
