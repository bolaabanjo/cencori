import { describe, it, expect, vi } from 'vitest';
import { mapStatusToDecision, recordGatewayGovernanceDecision } from '../record-decision';
import type { GatewayContext, LogRequestParams } from '@/lib/gateway-middleware';

describe('mapStatusToDecision', () => {
    it('maps gateway statuses to governance decisions', () => {
        expect(mapStatusToDecision('success')).toEqual({ eventType: 'request.decision', decision: 'allow' });
        expect(mapStatusToDecision('success_fallback')).toEqual({ eventType: 'request.decision', decision: 'allow' });
        expect(mapStatusToDecision('blocked')).toEqual({ eventType: 'request.decision', decision: 'block' });
        expect(mapStatusToDecision('blocked_output')).toEqual({ eventType: 'request.decision', decision: 'block' });
        expect(mapStatusToDecision('filtered')).toEqual({ eventType: 'request.decision', decision: 'redact' });
        expect(mapStatusToDecision('rate_limited')).toEqual({ eventType: 'request.decision', decision: 'rate_limit' });
        expect(mapStatusToDecision('error')).toEqual({ eventType: 'request.error', decision: null });
    });
});

function makeCtx(rpc: ReturnType<typeof vi.fn>): GatewayContext {
    return {
        supabase: { rpc } as unknown,
        organizationId: 'org-1',
        projectId: 'proj-1',
        apiKeyId: 'key-1',
        environment: 'production',
        requestId: 'req-1',
        clientIp: '1.2.3.4',
        startTime: Date.now(),
    } as unknown as GatewayContext;
}

function makeParams(over: Partial<LogRequestParams> = {}): LogRequestParams {
    return {
        endpoint: '/v1/chat/completions',
        model: 'gemini-3.5-flash',
        provider: 'google',
        status: 'success',
        requestPayload: { messages: [{ role: 'user', content: 'hi' }] },
        responsePayload: { text: 'hello' },
        ...over,
    };
}

describe('recordGatewayGovernanceDecision', () => {
    it('appends a decision entry with the mapped decision + content hashes', async () => {
        const rpc = vi.fn().mockResolvedValue({
            data: [{ id: 'e1', seq: 1, entry_hash: 'h1', prev_hash: '0'.repeat(64) }],
            error: null,
        });
        await recordGatewayGovernanceDecision(makeCtx(rpc), makeParams({ status: 'blocked', errorMessage: 'jailbreak' }));

        expect(rpc).toHaveBeenCalledTimes(1);
        const [fn, args] = rpc.mock.calls[0];
        expect(fn).toBe('append_governance_audit_entry');
        expect(args.p_org_id).toBe('org-1');
        expect(args.p_event_type).toBe('request.decision');
        expect(args.p_decision).toBe('block');
        expect(args.p_rationale).toBe('jailbreak');
        expect(args.p_request_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(args.p_response_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(args.p_payload.status).toBe('blocked');
        expect(args.p_payload.request_id).toBe('req-1');
        expect(args.p_dedupe_key).toBe('req-1:blocked'); // idempotency key = requestId:status
    });

    it('passes null hashes when payloads are absent', async () => {
        const rpc = vi.fn().mockResolvedValue({ data: [{ id: 'e', seq: 1, entry_hash: 'h', prev_hash: 'p' }], error: null });
        await recordGatewayGovernanceDecision(
            makeCtx(rpc),
            makeParams({ requestPayload: undefined, responsePayload: undefined }),
        );
        const args = rpc.mock.calls[0][1];
        expect(args.p_request_hash).toBeNull();
        expect(args.p_response_hash).toBeNull();
        expect(args.p_decision).toBe('allow');
    });

    it('never throws when the ledger append fails (best-effort)', async () => {
        const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'db down' } });
        await expect(
            recordGatewayGovernanceDecision(makeCtx(rpc), makeParams()),
        ).resolves.toBeUndefined();
    });

    it('skips when organizationId is missing', async () => {
        const rpc = vi.fn();
        const ctx = makeCtx(rpc);
        (ctx as { organizationId: string }).organizationId = '';
        await recordGatewayGovernanceDecision(ctx, makeParams());
        expect(rpc).not.toHaveBeenCalled();
    });
});
