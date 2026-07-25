import { describe, it, expect, vi } from 'vitest';
import { deliverAuditEntry, redriveGovernanceDeadletter } from '../delivery';
import type { GovernanceAuditInput } from '../audit-ledger';

const input: GovernanceAuditInput = {
    orgId: 'o1',
    eventType: 'request.decision',
    decision: 'allow',
    dedupeKey: 'r1:success',
};

const okRpc = () => vi.fn().mockResolvedValue({
    data: [{ id: 'e', seq: 1, entry_hash: 'h', prev_hash: 'p' }], error: null,
});
const failRpc = () => vi.fn().mockResolvedValue({ data: null, error: { message: 'db down' } });

describe('deliverAuditEntry', () => {
    it('delivers on first success without dead-lettering', async () => {
        const rpc = okRpc();
        const from = vi.fn();
        await deliverAuditEntry({ rpc, from } as never, input);
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(from).not.toHaveBeenCalled();
    });

    it('retries up to MAX_ATTEMPTS, then dead-letters (never loses the event)', async () => {
        const rpc = failRpc();
        const insert = vi.fn().mockResolvedValue({ error: null });
        const from = vi.fn().mockReturnValue({ insert });
        await deliverAuditEntry({ rpc, from } as never, input);
        expect(rpc).toHaveBeenCalledTimes(3);
        expect(from).toHaveBeenCalledWith('governance_ledger_deadletter');
        expect(insert).toHaveBeenCalledTimes(1);
        expect(insert.mock.calls[0][0].dedupe_key).toBe('r1:success');
        expect(insert.mock.calls[0][0].status).toBe('pending');
    });

    it('never throws even if the dead-letter insert itself fails', async () => {
        const rpc = failRpc();
        const from = vi.fn().mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: { message: 'nope' } }) });
        await expect(deliverAuditEntry({ rpc, from } as never, input)).resolves.toBeUndefined();
    });
});

describe('redriveGovernanceDeadletter', () => {
    it('redrives pending entries into the ledger and marks them delivered', async () => {
        const rpc = okRpc();
        const updateEq = vi.fn().mockResolvedValue({ error: null });
        const update = vi.fn().mockReturnValue({ eq: updateEq });
        const limit = vi.fn().mockResolvedValue({ data: [{ id: 'd1', event: input }], error: null });
        const order = vi.fn().mockReturnValue({ limit });
        const eq = vi.fn().mockReturnValue({ order });
        const select = vi.fn().mockReturnValue({ eq });
        const from = vi.fn().mockReturnValue({ select, update });

        const res = await redriveGovernanceDeadletter({ rpc, from } as never, 10);

        expect(res).toEqual({ processed: 1, delivered: 1, stillPending: 0 });
        expect(rpc).toHaveBeenCalledWith('append_governance_audit_entry', expect.anything());
        expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'delivered' }));
    });

    it('counts entries that still fail as stillPending (stays in dead-letter)', async () => {
        const rpc = failRpc();
        const updateEq = vi.fn().mockResolvedValue({ error: null });
        const update = vi.fn().mockReturnValue({ eq: updateEq });
        const limit = vi.fn().mockResolvedValue({ data: [{ id: 'd1', event: input }], error: null });
        const order = vi.fn().mockReturnValue({ limit });
        const eq = vi.fn().mockReturnValue({ order });
        const select = vi.fn().mockReturnValue({ eq });
        const from = vi.fn().mockReturnValue({ select, update });

        const res = await redriveGovernanceDeadletter({ rpc, from } as never, 10);
        expect(res).toEqual({ processed: 1, delivered: 0, stillPending: 1 });
        expect(update).toHaveBeenCalledWith(expect.objectContaining({ last_error: expect.any(String) }));
    });
});
