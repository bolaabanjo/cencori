/**
 * @vitest-environment node
 *
 * Writeback observability: a post-response writeback that throws (e.g. the
 * embedding/extraction provider rate-limited) must NOT vanish silently. It has
 * to emit an error record to the gateway request log so the failure is visible,
 * and it must never turn into an unhandled rejection inside waitUntil().
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    extractFacts: vi.fn(),
    logGatewayRequest: vi.fn(),
    incrementUsage: vi.fn(),
}));

vi.mock('../extraction', () => ({
    extractFacts: (...a: unknown[]) => mocks.extractFacts(...a),
}));

vi.mock('@/lib/gateway-middleware', () => ({
    logGatewayRequest: (...a: unknown[]) => mocks.logGatewayRequest(...a),
    incrementUsage: (...a: unknown[]) => mocks.incrementUsage(...a),
}));

import { runChatMemoryWriteback } from '../writeback';

const gatewayCtx = {
    projectId: 'proj_1',
    organizationId: 'org_1',
    tier: 'free',
    requestId: 'req_1',
} as never;

const directive = {
    scope: 'user',
    scopeKey: 'user_1',
    namespace: null,
    retrieve: true,
    write: true,
    topK: 5,
    threshold: 0.7,
    thresholdExplicit: false,
    extract: null,
} as never;

const settings = { enabled: true, sessionTtlSeconds: 3600 } as never;

const call = () =>
    runChatMemoryWriteback({
        supabase: {} as never,
        gatewayCtx,
        directive,
        settings,
        userText: 'hi',
        assistantText: 'hello',
    });

describe('runChatMemoryWriteback observability', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        mocks.logGatewayRequest.mockResolvedValue(null);
    });

    it('logs an error record when the writeback throws (no silent vanish)', async () => {
        mocks.extractFacts.mockRejectedValue(new Error('google rate limit exceeded'));

        await call();

        expect(mocks.logGatewayRequest).toHaveBeenCalledTimes(1);
        const params = mocks.logGatewayRequest.mock.calls[0][1] as {
            endpoint: string;
            status: string;
            errorMessage?: string;
        };
        expect(params.endpoint).toBe('memory/writeback');
        expect(params.status).toBe('error');
        expect(params.errorMessage).toContain('rate limit');
    });

    it('does not reject even if the failure logger itself throws', async () => {
        mocks.extractFacts.mockRejectedValue(new Error('boom'));
        mocks.logGatewayRequest.mockRejectedValue(new Error('log db down'));

        await expect(call()).resolves.toBeUndefined();
    });

    it('does not log a failure record on the happy path (no extracted facts)', async () => {
        mocks.extractFacts.mockResolvedValue({ facts: [], costUsd: 0, model: 'gemini-2.5-flash' });

        await call();

        expect(mocks.logGatewayRequest).not.toHaveBeenCalled();
    });
});
