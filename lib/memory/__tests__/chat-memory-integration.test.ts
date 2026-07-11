/**
 * @vitest-environment node
 *
 * Chat-route memory integration: no memory field ⇒ no memory code paths;
 * retrieval injects a system block; cache is skipped when retrieve is
 * active; writeback is scheduled via onCompletion.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import {
    CHAT_REQUEST_BODY,
    createMockGatewayContext,
    createMockInputPipelineSuccess,
} from '@/lib/gateway/__tests__/fixtures';

const routeMocks = vi.hoisted(() => ({
    validateGatewayRequest: vi.fn(),
    runGatewayInputPipeline: vi.fn(),
    runV1ProviderExecution: vi.fn(),
    checkEndUserQuota: vi.fn(),
    logGatewayRequest: vi.fn(),
    incrementUsage: vi.fn(),
    addGatewayHeaders: vi.fn((res: Response) => res),
    logApiGatewayRequest: vi.fn(),
    getCachedCacheConfig: vi.fn(),
    lookupCache: vi.fn(),
    getProjectCacheConfig: vi.fn(),
    loadAgentKeyContext: vi.fn(),
    // memory
    getProjectMemorySettings: vi.fn(),
    retrieveMemories: vi.fn(),
    runChatMemoryWriteback: vi.fn(),
    waitUntil: vi.fn(),
}));

vi.mock('@vercel/functions', () => ({
    waitUntil: (...args: unknown[]) => routeMocks.waitUntil(...args),
}));

vi.mock('@/lib/gateway-middleware', () => ({
    validateGatewayRequest: (...args: unknown[]) => routeMocks.validateGatewayRequest(...args),
    handleCorsPreFlight: vi.fn(),
    addGatewayHeaders: (...args: unknown[]) => (routeMocks.addGatewayHeaders as never as (...a: unknown[]) => unknown)(...args),
    logGatewayRequest: (...args: unknown[]) => routeMocks.logGatewayRequest(...args),
    incrementUsage: (...args: unknown[]) => routeMocks.incrementUsage(...args),
}));

vi.mock('@/lib/gateway/input-guard', () => ({
    runGatewayInputPipeline: (...args: unknown[]) => routeMocks.runGatewayInputPipeline(...args),
}));

vi.mock('@/lib/gateway/v1-execute', () => ({
    runV1ProviderExecution: (...args: unknown[]) => routeMocks.runV1ProviderExecution(...args),
}));

vi.mock('@/lib/end-user-billing', () => ({
    checkEndUserQuota: (...args: unknown[]) => routeMocks.checkEndUserQuota(...args),
    recordEndUserUsage: vi.fn(),
}));

vi.mock('@/lib/api-gateway-logs', () => ({
    extractGatewayCallerIdentity: vi.fn(() => ({})),
    logApiGatewayRequest: (...args: unknown[]) => routeMocks.logApiGatewayRequest(...args),
}));

vi.mock('@/lib/cache/prompt-cache', () => ({
    computeExactCacheKey: vi.fn(() => 'cache-key'),
    getProjectCacheConfig: (...args: unknown[]) => routeMocks.getProjectCacheConfig(...args),
    lookupCache: (...args: unknown[]) => routeMocks.lookupCache(...args),
    storeInCache: vi.fn(),
    recordCacheHit: vi.fn(),
    logCacheEvent: vi.fn(),
}));

vi.mock('@/lib/config-cache', () => ({
    getCachedCacheConfig: (...args: unknown[]) => routeMocks.getCachedCacheConfig(...args),
    setCachedCacheConfig: vi.fn(),
    getCachedMemoryConfig: vi.fn(async () => null),
    setCachedMemoryConfig: vi.fn(),
}));

vi.mock('@/lib/gateway/agent-context', () => ({
    resolveAgentContext: vi.fn(async () => ({ errorCode: 'agent_not_found' })),
}));

vi.mock('@/lib/prompts/registry', () => ({
    resolvePrompt: vi.fn(),
    logPromptUsage: vi.fn(),
}));

vi.mock('@/lib/supabaseAdmin', () => ({
    createAdminClient: vi.fn(() => ({})),
}));

vi.mock('@/lib/memory/settings', () => ({
    getProjectMemorySettings: (...args: unknown[]) => routeMocks.getProjectMemorySettings(...args),
}));

vi.mock('@/lib/memory/retrieval', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/lib/memory/retrieval')>();
    return {
        ...original,
        retrieveMemories: (...args: unknown[]) => routeMocks.retrieveMemories(...args),
    };
});

vi.mock('@/lib/memory/writeback', () => ({
    runChatMemoryWriteback: (...args: unknown[]) => routeMocks.runChatMemoryWriteback(...args),
    writeMemories: vi.fn(),
}));

import { POST } from '@/app/api/v1/chat/completions/route';

const ENABLED_SETTINGS = {
    enabled: true,
    extractionModel: 'gpt-4o-mini',
    extractionPrompt: null,
    minImportance: 0.5,
    maxMemoriesPerExchange: 5,
    sessionTtlSeconds: 86400,
};

const OPENAI_RESPONSE = {
    id: 'chatcmpl-1',
    object: 'chat.completion',
    created: 1,
    model: 'gpt-4o',
    choices: [{ index: 0, message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};

function chatRequest(body: Record<string, unknown>): NextRequest {
    return new NextRequest('http://x/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json', CENCORI_API_KEY: 'csk_test' },
    });
}

describe('chat completions memory integration', () => {
    let ctx: ReturnType<typeof createMockGatewayContext>;

    beforeEach(() => {
        vi.clearAllMocks();
        ctx = createMockGatewayContext();
        routeMocks.validateGatewayRequest.mockResolvedValue({ success: true, context: ctx });
        routeMocks.runGatewayInputPipeline.mockImplementation(
            async (args: { messages: unknown[] }) => createMockInputPipelineSuccess(args.messages as never)
        );
        routeMocks.getProjectMemorySettings.mockResolvedValue(ENABLED_SETTINGS);
        routeMocks.retrieveMemories.mockResolvedValue([]);
        routeMocks.getCachedCacheConfig.mockResolvedValue(null);
        routeMocks.getProjectCacheConfig.mockResolvedValue({ cacheEnabled: false, excludedModels: [] });
        // Fresh response per call — NextResponse bodies are single-read.
        routeMocks.runV1ProviderExecution.mockImplementation(async () => ({
            ok: true,
            response: NextResponse.json(OPENAI_RESPONSE),
        }));
    });

    it('no memory field ⇒ memory modules never touched, no memory in response', async () => {
        const res = await POST(chatRequest({ ...CHAT_REQUEST_BODY }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.memory).toBeUndefined();
        expect(routeMocks.getProjectMemorySettings).not.toHaveBeenCalled();
        expect(routeMocks.retrieveMemories).not.toHaveBeenCalled();
        expect(routeMocks.waitUntil).not.toHaveBeenCalled();
    });

    it('invalid memory directive ⇒ 400', async () => {
        const res = await POST(chatRequest({ ...CHAT_REQUEST_BODY, memory: {} }));
        expect(res.status).toBe(400);
    });

    it('kill switch off ⇒ 403', async () => {
        routeMocks.getProjectMemorySettings.mockResolvedValue({ ...ENABLED_SETTINGS, enabled: false });
        const res = await POST(chatRequest({ ...CHAT_REQUEST_BODY, memory: { userId: 'u1' } }));
        expect(res.status).toBe(403);
    });

    it('retrieval injects a system block and response carries memory summary', async () => {
        routeMocks.retrieveMemories.mockResolvedValue([
            {
                id: 'mem_1',
                content: 'Prefers dark mode',
                similarity: 0.9,
                namespace: null,
                importance: 0.7,
                createdAt: '2026-07-01T00:00:00Z',
            },
        ]);

        const res = await POST(chatRequest({ ...CHAT_REQUEST_BODY, memory: { userId: 'u1' } }));
        expect(res.status).toBe(200);

        // Injected into the messages handed to the provider execution
        const execArgs = routeMocks.runV1ProviderExecution.mock.calls[0][0] as {
            messages: Array<{ role: string; content: string }>;
        };
        const memoryMsg = execArgs.messages.find(
            (m) => m.role === 'system' && m.content.includes('Prefers dark mode')
        );
        expect(memoryMsg).toBeTruthy();

        // Retrieval used ctx identifiers
        const retrieveArgs = routeMocks.retrieveMemories.mock.calls[0][0] as Record<string, unknown>;
        expect(retrieveArgs.organizationId).toBe(ctx.organizationId);
        expect(retrieveArgs.projectId).toBe(ctx.projectId);

        // Response summary
        const body = await res.json();
        expect(body.memory).toEqual({
            retrieved: [{ id: 'mem_1', score: 0.9, content: 'Prefers dark mode' }],
            written: [],
            write_status: 'pending',
        });
    });

    it('memory retrieve active ⇒ prompt cache is never consulted', async () => {
        routeMocks.getProjectCacheConfig.mockResolvedValue({
            cacheEnabled: true,
            excludedModels: [],
            maxCacheableTemperature: 1,
            ttlSeconds: 60,
        });

        await POST(chatRequest({ ...CHAT_REQUEST_BODY, memory: { userId: 'u1' } }));
        expect(routeMocks.lookupCache).not.toHaveBeenCalled();

        // Control: without memory the cache path runs
        routeMocks.lookupCache.mockResolvedValue({ hit: false });
        await POST(chatRequest({ ...CHAT_REQUEST_BODY }));
        expect(routeMocks.lookupCache).toHaveBeenCalled();
    });

    it('write enabled ⇒ writeback scheduled through onCompletion + waitUntil', async () => {
        routeMocks.runV1ProviderExecution.mockImplementation(
            async (args: { onCompletion?: (r: { fullText: string }) => void }) => {
                args.onCompletion?.({ fullText: 'Hello!' });
                return { ok: true, response: NextResponse.json(OPENAI_RESPONSE) };
            }
        );

        const res = await POST(chatRequest({ ...CHAT_REQUEST_BODY, memory: { userId: 'u1' } }));
        expect(res.status).toBe(200);
        expect(routeMocks.waitUntil).toHaveBeenCalledTimes(1);
        expect(routeMocks.runChatMemoryWriteback).toHaveBeenCalledWith(
            expect.objectContaining({
                gatewayCtx: ctx,
                assistantText: 'Hello!',
                settings: ENABLED_SETTINGS,
            })
        );
    });

    it('write: false ⇒ no writeback, write_status disabled', async () => {
        routeMocks.runV1ProviderExecution.mockImplementation(
            async (args: { onCompletion?: (r: { fullText: string }) => void }) => {
                args.onCompletion?.({ fullText: 'Hello!' });
                return { ok: true, response: NextResponse.json(OPENAI_RESPONSE) };
            }
        );

        const res = await POST(
            chatRequest({ ...CHAT_REQUEST_BODY, memory: { userId: 'u1', write: false } })
        );
        const body = await res.json();
        expect(body.memory.write_status).toBe('disabled');
        expect(routeMocks.waitUntil).not.toHaveBeenCalled();
    });
});
