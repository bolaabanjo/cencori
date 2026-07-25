import { describe, it, expect, vi } from 'vitest';
import {
    roleHasPermission,
    getGovernanceRole,
    requireGovernancePermission,
    createGovernanceChangeRequest,
    resolveGovernanceChangeRequest,
} from '../rbac';

describe('roleHasPermission', () => {
    it('owner and governance_admin have full access', () => {
        for (const p of ['policy.propose', 'policy.approve', 'key.reveal', 'killswitch.engage', 'role.assign', 'audit.read'] as const) {
            expect(roleHasPermission('owner', p)).toBe(true);
            expect(roleHasPermission('governance_admin', p)).toBe(true);
        }
    });
    it('enforces separation: developer proposes but cannot approve; risk_officer approves but cannot propose', () => {
        expect(roleHasPermission('developer', 'policy.propose')).toBe(true);
        expect(roleHasPermission('developer', 'policy.approve')).toBe(false);
        expect(roleHasPermission('risk_officer', 'policy.approve')).toBe(true);
        expect(roleHasPermission('risk_officer', 'policy.propose')).toBe(false);
    });
    it('auditor is read-only', () => {
        expect(roleHasPermission('auditor', 'audit.read')).toBe(true);
        expect(roleHasPermission('auditor', 'policy.propose')).toBe(false);
        expect(roleHasPermission('auditor', 'killswitch.engage')).toBe(false);
    });
});

function mockSupabase(cfg: { ownerId?: string; role?: string | null; rpc?: (fn: string, args: unknown) => Promise<unknown> }) {
    const builder = (result: unknown) => {
        const b: Record<string, unknown> = {};
        b.select = () => b; b.eq = () => b;
        b.single = () => Promise.resolve(result);
        b.maybeSingle = () => Promise.resolve(result);
        return b;
    };
    return {
        from: (table: string) => {
            if (table === 'organizations') return builder({ data: { owner_id: cfg.ownerId ?? null } });
            if (table === 'governance_role_assignments') return builder({ data: cfg.role ? { role: cfg.role } : null });
            return builder({ data: null });
        },
        rpc: cfg.rpc ? vi.fn(cfg.rpc) : vi.fn().mockResolvedValue({ data: null, error: null }),
    } as never;
}

describe('getGovernanceRole', () => {
    it('returns owner when the user owns the org', async () => {
        expect(await getGovernanceRole(mockSupabase({ ownerId: 'u1' }), 'o1', 'u1')).toBe('owner');
    });
    it('returns the assigned role otherwise', async () => {
        expect(await getGovernanceRole(mockSupabase({ ownerId: 'other', role: 'risk_officer' }), 'o1', 'u1')).toBe('risk_officer');
    });
    it('returns null when the user has no governance role', async () => {
        expect(await getGovernanceRole(mockSupabase({ ownerId: 'other', role: null }), 'o1', 'u1')).toBeNull();
    });
});

describe('requireGovernancePermission', () => {
    it('allows a permitted role', async () => {
        const res = await requireGovernancePermission(mockSupabase({ role: 'risk_officer' }), 'o1', 'u1', 'policy.approve');
        expect(res.ok).toBe(true);
    });
    it('denies with 403 when the role lacks the permission', async () => {
        const res = await requireGovernancePermission(mockSupabase({ role: 'developer' }), 'o1', 'u1', 'policy.approve');
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.response.status).toBe(403);
    });
});

describe('createGovernanceChangeRequest', () => {
    it('creates the request and writes a governance.change.requested ledger entry', async () => {
        const rpc = vi.fn((fn: string) => {
            if (fn === 'create_governance_change_request') return Promise.resolve({ data: 'req-1', error: null });
            return Promise.resolve({ data: [{ id: 'e', seq: 1, entry_hash: 'h', prev_hash: 'p' }], error: null });
        });
        const id = await createGovernanceChangeRequest({ rpc } as never, {
            orgId: 'o1', actionType: 'policy.activate', payload: { name: 'p' }, requestedBy: 'maker', actorIp: '1.2.3.4',
        });
        expect(id).toBe('req-1');
        const append = rpc.mock.calls.find(c => c[0] === 'append_governance_audit_entry');
        expect(append).toBeTruthy();
        expect((append![1] as { p_event_type: string }).p_event_type).toBe('governance.change.requested');
        expect((append![1] as { p_decision: string }).p_decision).toBe('require_approval');
    });
});

describe('resolveGovernanceChangeRequest', () => {
    it('approves and writes an approval ledger entry', async () => {
        const rpc = vi.fn((fn: string) => {
            if (fn === 'resolve_governance_change_request') return Promise.resolve({ data: [{ ok: true, status: 'approved', reason: null }], error: null });
            return Promise.resolve({ data: [{ id: 'e', seq: 2, entry_hash: 'h2', prev_hash: 'h1' }], error: null });
        });
        const res = await resolveGovernanceChangeRequest({ rpc } as never, {
            orgId: 'o1', requestId: 'req-1', actorId: 'checker', decision: 'approved',
        });
        expect(res).toEqual({ ok: true, decision: 'approved' });
        expect(rpc.mock.calls.some(c => c[0] === 'append_governance_audit_entry')).toBe(true);
    });

    it('blocks a self-approval (segregation of duties) and writes NO ledger entry', async () => {
        const rpc = vi.fn((fn: string) => {
            if (fn === 'resolve_governance_change_request') return Promise.resolve({ data: [{ ok: false, status: 'pending', reason: 'segregation_of_duties' }], error: null });
            return Promise.resolve({ data: [{ id: 'e' }], error: null });
        });
        const res = await resolveGovernanceChangeRequest({ rpc } as never, {
            orgId: 'o1', requestId: 'req-1', actorId: 'maker', decision: 'approved',
        });
        expect(res).toEqual({ ok: false, reason: 'segregation_of_duties', status: 'pending' });
        // the change did not happen → nothing should be appended to the ledger
        expect(rpc.mock.calls.some(c => c[0] === 'append_governance_audit_entry')).toBe(false);
    });
});
