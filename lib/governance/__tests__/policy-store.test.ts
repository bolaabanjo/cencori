import { describe, it, expect, vi } from 'vitest';
import { createPolicyDraft, listActivePolicies, requestPolicyActivation, activatePolicy } from '../policy-store';

const appendOk = { data: [{ id: 'e', seq: 1, entry_hash: 'h', prev_hash: 'p' }], error: null };

describe('createPolicyDraft', () => {
    it('creates a draft and writes a governance.policy.drafted ledger entry', async () => {
        const rpc = vi.fn((fn: string) => {
            if (fn === 'create_governance_policy_draft') return Promise.resolve({ data: [{ id: 'pol-1', version: 3 }], error: null });
            return Promise.resolve(appendOk);
        });
        const res = await createPolicyDraft({ rpc } as never, {
            orgId: 'o1', name: 'aml', spec: { rules: [], controls: ['SR-11-7'] }, createdBy: 'dev1',
        });
        expect(res).toEqual({ id: 'pol-1', version: 3 });
        const append = rpc.mock.calls.find(c => c[0] === 'append_governance_audit_entry');
        expect((append![1] as { p_event_type: string }).p_event_type).toBe('governance.policy.drafted');
    });
});

describe('listActivePolicies', () => {
    it('maps rows into evaluatable Policy objects (row owns name/version/status)', async () => {
        const order = { data: [{ name: 'aml', version: 2, spec: { rules: [{ name: 'r', when: { all: [] }, action: 'block' }], controls: ['ISO-42001'] } }], error: null };
        const eq2 = vi.fn().mockResolvedValue(order);
        const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
        const select = vi.fn().mockReturnValue({ eq: eq1 });
        const supabase = { from: vi.fn().mockReturnValue({ select }) } as never;

        const policies = await listActivePolicies(supabase, 'o1');
        expect(policies).toHaveLength(1);
        expect(policies[0]).toMatchObject({ name: 'aml', version: 2, status: 'active', controls: ['ISO-42001'] });
        expect(policies[0].rules[0].action).toBe('block');
    });
});

describe('requestPolicyActivation (maker)', () => {
    it('opens a policy.activate maker-checker change request', async () => {
        const rpc = vi.fn((fn: string) => {
            if (fn === 'create_governance_change_request') return Promise.resolve({ data: 'req-9', error: null });
            return Promise.resolve(appendOk);
        });
        const id = await requestPolicyActivation({ rpc } as never, { orgId: 'o1', policyId: 'pol-1', requestedBy: 'dev1' });
        expect(id).toBe('req-9');
        const call = rpc.mock.calls.find(c => c[0] === 'create_governance_change_request');
        expect((call![1] as { p_action_type: string }).p_action_type).toBe('policy.activate');
    });
});

describe('activatePolicy (apply)', () => {
    it('activates and records governance.policy.activated', async () => {
        const rpc = vi.fn((fn: string) => {
            if (fn === 'activate_governance_policy') return Promise.resolve({ data: true, error: null });
            return Promise.resolve(appendOk);
        });
        await activatePolicy({ rpc } as never, { orgId: 'o1', policyId: 'pol-1', approvedBy: 'risk1' });
        const append = rpc.mock.calls.find(c => c[0] === 'append_governance_audit_entry');
        expect((append![1] as { p_event_type: string }).p_event_type).toBe('governance.policy.activated');
        expect((append![1] as { p_decision: string }).p_decision).toBe('allow');
    });
});
