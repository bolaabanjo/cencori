import { describe, it, expect, vi } from 'vitest';
import { recordSessionApprovalRequested, recordSessionApprovalResolved } from '../record-session';

const okRpc = () => vi.fn().mockResolvedValue({
    data: [{ id: 'e', seq: 1, entry_hash: 'h', prev_hash: 'p' }], error: null,
});

describe('recordSessionApprovalRequested', () => {
    it('records a require_approval decision with the tool + action ids', async () => {
        const rpc = okRpc();
        await recordSessionApprovalRequested({ rpc } as never, {
            orgId: 'o1', projectId: 'p1', sessionId: 's1', turnNumber: 4,
            tool: 'transfer_funds', actionIds: ['a1', 'a2'], model: 'gpt',
        });
        const args = rpc.mock.calls[0][1];
        expect(args.p_event_type).toBe('session.approval.requested');
        expect(args.p_decision).toBe('require_approval');
        expect(args.p_dedupe_key).toBe('s1:4:approval_requested');
        expect(args.p_payload.tool).toBe('transfer_funds');
        expect(args.p_payload.action_ids).toEqual(['a1', 'a2']);
    });
});

describe('recordSessionApprovalResolved', () => {
    it('records an approval as an allow with attribution', async () => {
        const rpc = okRpc();
        await recordSessionApprovalResolved({ rpc } as never, {
            orgId: 'o1', projectId: 'p1', sessionId: 's1', actionId: 'a1',
            resolution: 'approved', tool: 'transfer_funds', apiKeyId: 'k1', actorIp: '1.2.3.4',
        });
        const args = rpc.mock.calls[0][1];
        expect(args.p_event_type).toBe('session.action.approved');
        expect(args.p_decision).toBe('allow');
        expect(args.p_dedupe_key).toBe('s1:a1:approved');
        expect(args.p_actor_ip).toBe('1.2.3.4');
        expect(args.p_payload.api_key_id).toBe('k1');
    });

    it('records a rejection as a block with a rationale', async () => {
        const rpc = okRpc();
        await recordSessionApprovalResolved({ rpc } as never, {
            orgId: 'o1', sessionId: 's1', actionId: 'a1', resolution: 'rejected', tool: 'transfer_funds',
        });
        const args = rpc.mock.calls[0][1];
        expect(args.p_event_type).toBe('session.action.rejected');
        expect(args.p_decision).toBe('block');
        expect(args.p_dedupe_key).toBe('s1:a1:rejected');
        expect(args.p_rationale).toMatch(/rejected by approver/);
    });
});
