/**
 * @vitest-environment node
 *
 * Route tests for /v1/memory/{write,search,[id],list}: auth failure,
 * kill switch, quota, happy paths, and org-scoped deletes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { createMockGatewayContext } from '@/lib/gateway/__tests__/fixtures';

const routeMocks = vi.hoisted(() => ({
    validateGatewayRequest: vi.fn(),
    logGatewayRequest: vi.fn(),
    incrementUsage: vi.fn(),
    addGatewayHeaders: vi.fn((res: Response) => res),
    getProjectMemorySettings: vi.fn(),
    checkMemoryQuota: vi.fn(),
    writeMemories: vi.fn(),
    retrieveMemories: vi.fn(),
    appendSessionMemories: vi.fn(),
    listSessionMemories: vi.fn(),
}));

vi.mock('@/lib/gateway-middleware', () => ({
    validateGatewayRequest: (...args: unknown[]) => routeMocks.validateGatewayRequest(...args),
    handleCorsPreFlight: vi.fn(),
    addGatewayHeaders: (...args: unknown[]) => (routeMocks.addGatewayHeaders as never as (...a: unknown[]) => unknown)(...args),
    logGatewayRequest: (...args: unknown[]) => routeMocks.logGatewayRequest(...args),
    incrementUsage: (...args: unknown[]) => routeMocks.incrementUsage(...args),
}));

vi.mock('@/lib/memory/settings', () => ({
    getProjectMemorySettings: (...args: unknown[]) => routeMocks.getProjectMemorySettings(...args),
}));

vi.mock('@/lib/memory/quota', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/lib/memory/quota')>();
    return {
        ...original,
        checkMemoryQuota: (...args: unknown[]) => routeMocks.checkMemoryQuota(...args),
    };
});

vi.mock('@/lib/memory/writeback', () => ({
    writeMemories: (...args: unknown[]) => routeMocks.writeMemories(...args),
    runChatMemoryWriteback: vi.fn(),
}));

vi.mock('@/lib/memory/retrieval', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/lib/memory/retrieval')>();
    return {
        ...original,
        retrieveMemories: (...args: unknown[]) => routeMocks.retrieveMemories(...args),
    };
});

vi.mock('@/lib/memory/session-store', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/lib/memory/session-store')>();
    return {
        ...original,
        appendSessionMemories: (...args: unknown[]) => routeMocks.appendSessionMemories(...args),
        listSessionMemories: (...args: unknown[]) => routeMocks.listSessionMemories(...args),
    };
});

import { POST as writePost } from '@/app/api/v1/memory/write/route';
import { POST as searchPost } from '@/app/api/v1/memory/search/route';
import { DELETE as idDelete } from '@/app/api/v1/memory/[id]/route';
import { GET as listGet } from '@/app/api/v1/memory/list/route';

const ENABLED_SETTINGS = {
    enabled: true,
    extractionModel: 'gpt-4o-mini',
    extractionPrompt: null,
    minImportance: 0.5,
    maxMemoriesPerExchange: 5,
    sessionTtlSeconds: 86400,
};

function jsonRequest(url: string, body: unknown): NextRequest {
    return new NextRequest(url, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('/v1/memory routes', () => {
    let ctx: ReturnType<typeof createMockGatewayContext>;

    beforeEach(() => {
        vi.clearAllMocks();
        ctx = createMockGatewayContext();
        routeMocks.validateGatewayRequest.mockResolvedValue({ success: true, context: ctx });
        routeMocks.getProjectMemorySettings.mockResolvedValue(ENABLED_SETTINGS);
        routeMocks.logGatewayRequest.mockResolvedValue(undefined);
        routeMocks.incrementUsage.mockResolvedValue(undefined);
    });

    describe('write', () => {
        it('rejects unauthenticated requests', async () => {
            routeMocks.validateGatewayRequest.mockResolvedValue({
                success: false,
                response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
            });

            const res = await writePost(
                jsonRequest('http://x/v1/memory/write', { userId: 'u1', content: 'fact' })
            );
            expect(res.status).toBe(401);
            expect(routeMocks.writeMemories).not.toHaveBeenCalled();
        });

        it('403s when the kill switch is off', async () => {
            routeMocks.getProjectMemorySettings.mockResolvedValue({
                ...ENABLED_SETTINGS,
                enabled: false,
            });

            const res = await writePost(
                jsonRequest('http://x/v1/memory/write', { userId: 'u1', content: 'fact' })
            );
            expect(res.status).toBe(403);
        });

        it('429s with the roadmap payload at quota', async () => {
            routeMocks.checkMemoryQuota.mockResolvedValue({ allowed: false, used: 1000, limit: 1000 });

            const res = await writePost(
                jsonRequest('http://x/v1/memory/write', { userId: 'u1', content: 'fact' })
            );
            expect(res.status).toBe(429);
            const body = await res.json();
            expect(body.error.code).toBe('memory_quota_exceeded');
            expect(body.error.used).toBe(1000);
        });

        it('writes a user-scope memory and returns post-redaction content', async () => {
            routeMocks.checkMemoryQuota.mockResolvedValue({ allowed: true, used: 10, limit: 1000 });
            routeMocks.writeMemories.mockResolvedValue({
                written: [{ id: 'mem_abc', content: 'SSN is [REDACTED]', importance: 0.5 }],
                quotaExceeded: false,
                embeddingCostUsd: 0.0001,
            });

            const res = await writePost(
                jsonRequest('http://x/v1/memory/write', { userId: 'u1', content: 'SSN is 123-45-6789' })
            );
            expect(res.status).toBe(201);
            const body = await res.json();
            expect(body.id).toBe('mem_abc');
            expect(body.content).toBe('SSN is [REDACTED]');

            // Org/project must come from ctx, not the body.
            const writeArgs = routeMocks.writeMemories.mock.calls[0][0] as Record<string, unknown>;
            expect(writeArgs.organizationId).toBe(ctx.organizationId);
            expect(writeArgs.projectId).toBe(ctx.projectId);
        });

        it('session scope bypasses quota and uses Redis', async () => {
            const res = await writePost(
                jsonRequest('http://x/v1/memory/write', {
                    sessionId: 'sess_1',
                    scope: 'session',
                    content: 'session fact',
                })
            );
            expect(res.status).toBe(201);
            expect(routeMocks.checkMemoryQuota).not.toHaveBeenCalled();
            expect(routeMocks.appendSessionMemories).toHaveBeenCalledWith(
                ctx.organizationId,
                ctx.projectId,
                'sess_1',
                [{ content: 'session fact', importance: 0.5 }],
                ENABLED_SETTINGS.sessionTtlSeconds
            );
        });

        it('400s on missing content or invalid directive', async () => {
            const noContent = await writePost(jsonRequest('http://x/v1/memory/write', { userId: 'u1' }));
            expect(noContent.status).toBe(400);

            const noUser = await writePost(jsonRequest('http://x/v1/memory/write', { content: 'x' }));
            expect(noUser.status).toBe(400);
        });
    });

    describe('search', () => {
        it('searches user scope and returns scored results', async () => {
            routeMocks.retrieveMemories.mockResolvedValue([
                {
                    id: 'mem_1',
                    content: 'Prefers dark mode',
                    similarity: 0.91,
                    namespace: null,
                    importance: 0.7,
                    createdAt: '2026-07-01T00:00:00Z',
                },
            ]);

            const res = await searchPost(
                jsonRequest('http://x/v1/memory/search', { userId: 'u1', query: 'ui preferences' })
            );
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.count).toBe(1);
            expect(body.results[0]).toMatchObject({ id: 'mem_1', score: 0.91 });

            const args = routeMocks.retrieveMemories.mock.calls[0][0] as Record<string, unknown>;
            expect(args.organizationId).toBe(ctx.organizationId);
            expect(args.projectId).toBe(ctx.projectId);
        });

        it('400s without a query for user scope', async () => {
            const res = await searchPost(jsonRequest('http://x/v1/memory/search', { userId: 'u1' }));
            expect(res.status).toBe(400);
        });
    });

    describe('delete by id', () => {
        it('deletes only within the caller org/project and audits the forget', async () => {
            const eqChain = {
                eq: vi.fn(),
                select: vi.fn(async () => ({ data: [{ id: 'uuid-1' }], error: null })),
            };
            eqChain.eq.mockReturnValue(eqChain);
            const deleteMock = vi.fn(() => eqChain);
            (ctx.supabase as unknown as Record<string, unknown>).from = vi.fn(() => ({
                delete: deleteMock,
            }));

            const req = new NextRequest('http://x/v1/memory/mem_uuid-1', { method: 'DELETE' });
            const res = await idDelete(req, { params: Promise.resolve({ id: 'mem_uuid-1' }) });

            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body).toEqual({ deleted: true, id: 'mem_uuid-1' });

            // id + org + project filters were all applied
            expect(eqChain.eq).toHaveBeenCalledWith('id', 'uuid-1');
            expect(eqChain.eq).toHaveBeenCalledWith('organization_id', ctx.organizationId);
            expect(eqChain.eq).toHaveBeenCalledWith('project_id', ctx.projectId);
            expect(routeMocks.logGatewayRequest).toHaveBeenCalledWith(
                ctx,
                expect.objectContaining({ endpoint: 'memory/forget' })
            );
        });

        it('404s for a memory outside the org', async () => {
            const eqChain = {
                eq: vi.fn(),
                select: vi.fn(async () => ({ data: [], error: null })),
            };
            eqChain.eq.mockReturnValue(eqChain);
            (ctx.supabase as unknown as Record<string, unknown>).from = vi.fn(() => ({
                delete: vi.fn(() => eqChain),
            }));

            const req = new NextRequest('http://x/v1/memory/mem_other-org', { method: 'DELETE' });
            const res = await idDelete(req, { params: Promise.resolve({ id: 'mem_other-org' }) });
            expect(res.status).toBe(404);
        });
    });

    describe('list', () => {
        it('lists session-scope memories from Redis', async () => {
            routeMocks.listSessionMemories.mockResolvedValue([
                {
                    id: 'mem_session',
                    content: 'recent fact',
                    similarity: 1,
                    namespace: null,
                    importance: 0.5,
                    createdAt: '2026-07-10T00:00:00Z',
                },
            ]);

            const req = new NextRequest('http://x/v1/memory/list?sessionId=sess_1&scope=session');
            const res = await listGet(req);
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.count).toBe(1);
            expect(routeMocks.listSessionMemories).toHaveBeenCalledWith(
                ctx.organizationId,
                ctx.projectId,
                'sess_1',
                50
            );
        });

        it('400s without a scope key', async () => {
            const req = new NextRequest('http://x/v1/memory/list');
            const res = await listGet(req);
            expect(res.status).toBe(400);
        });
    });
});
