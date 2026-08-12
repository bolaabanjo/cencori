/**
 * @vitest-environment node
 *
 * Route integration tests: /api/v1/chat/completions vs /api/ai/chat parity.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { AuthenticationError } from '@/lib/providers/errors';
import type { GatewayContext } from '@/lib/gateway-middleware';
import {
    ALLOWED_USER_MESSAGE,
    CHAT_REQUEST_BODY,
    JAILBREAK_REQUEST_BODY,
    STREAM_REQUEST_BODY,
    createMockGatewayContext,
    createMockInputPipelineSuccess,
    createMockChatResponse,
    createQuotaExceededResult,
    createOpenAiCachePayload,
    createCencoriCachePayload,
    HARMFUL_AI_RESPONSE,
    toUnifiedMessages,
} from '@/lib/gateway/__tests__/fixtures';

const routeMocks = vi.hoisted(() => ({
    validateGatewayRequest: vi.fn(),
    runGatewayInputPipeline: vi.fn(),
    executeGatewayChat: vi.fn(),
    streamGatewayChat: vi.fn(),
    runV1ProviderExecution: vi.fn(),
    resolveGatewayProvider: vi.fn(),
    checkEndUserQuota: vi.fn(),
    recordEndUserUsage: vi.fn(),
    logGatewayRequest: vi.fn(),
    incrementUsage: vi.fn(),
    addGatewayHeaders: vi.fn((res: Response) => res),
    logApiGatewayRequest: vi.fn(),
    updateApiGatewayRequestPerformance: vi.fn(),
    getCachedCacheConfig: vi.fn(),
    getProjectCacheConfig: vi.fn(),
    lookupCache: vi.fn(),
    loadAgentKeyContext: vi.fn(),
    runGatewayOutputGuard: vi.fn(),
}));

vi.mock('@/lib/webhooks', () => ({
    triggerSecurityWebhook: vi.fn(),
    triggerFallbackWebhook: vi.fn(),
}));

vi.mock('@/lib/gateway-middleware', () => ({
    validateGatewayRequest: (...args: any[]) => (routeMocks.validateGatewayRequest as any)(...args),
    handleCorsPreFlight: vi.fn(),
    addGatewayHeaders: (...args: any[]) => (routeMocks.addGatewayHeaders as any)(...args),
    logGatewayRequest: (...args: any[]) => (routeMocks.logGatewayRequest as any)(...args),
    incrementUsage: (...args: any[]) => (routeMocks.incrementUsage as any)(...args),
}));

vi.mock('@/lib/gateway/input-guard', () => ({
    runGatewayInputPipeline: (...args: any[]) => routeMocks.runGatewayInputPipeline(...args),
}));

vi.mock('@/lib/gateway/chat-executor', () => ({
    executeGatewayChat: (...args: any[]) => routeMocks.executeGatewayChat(...args),
    streamGatewayChat: (...args: any[]) => routeMocks.streamGatewayChat(...args),
}));

vi.mock('@/lib/gateway/v1-execute', () => ({
    runV1ProviderExecution: (...args: any[]) => routeMocks.runV1ProviderExecution(...args),
}));

vi.mock('@/lib/gateway/providers-setup', () => ({
    resolveGatewayProvider: (...args: any[]) => routeMocks.resolveGatewayProvider(...args),
}));

vi.mock('@/lib/end-user-billing', () => ({
    checkEndUserQuota: (...args: any[]) => routeMocks.checkEndUserQuota(...args),
    recordEndUserUsage: (...args: any[]) => routeMocks.recordEndUserUsage(...args),
}));

vi.mock('@/lib/api-gateway-logs', () => ({
    extractGatewayCallerIdentity: vi.fn(() => ({})),
    logApiGatewayRequest: (...args: any[]) => routeMocks.logApiGatewayRequest(...args),
    updateApiGatewayRequestPerformance: (...args: any[]) => routeMocks.updateApiGatewayRequestPerformance(...args),
}));

vi.mock('@/lib/cache/prompt-cache', () => ({
    computeExactCacheKey: vi.fn(() => 'cache-key-contract'),
    getProjectCacheConfig: (...args: any[]) => routeMocks.getProjectCacheConfig(...args),
    lookupCache: (...args: any[]) => routeMocks.lookupCache(...args),
    storeInCache: vi.fn(),
    recordCacheHit: vi.fn(),
    logCacheEvent: vi.fn(),
}));

vi.mock('@/lib/config-cache', () => ({
    getCachedCacheConfig: (...args: any[]) => routeMocks.getCachedCacheConfig(...args),
    setCachedCacheConfig: vi.fn(),
    getCachedAgentConfig: vi.fn(),
    setCachedAgentConfig: vi.fn(),
}));

vi.mock('@/lib/gateway/agent-context', async (importOriginal) => {
    const actual = await importOriginal() as Record<string, unknown>;
    return {
        loadAgentKeyContext: (...args: any[]) => routeMocks.loadAgentKeyContext(...args),
        resolveAgentContext: actual.resolveAgentContext,
    };
});

vi.mock('@/lib/gateway/output-guard', () => ({
    runGatewayOutputGuard: (...args: any[]) => routeMocks.runGatewayOutputGuard(...args),
}));

vi.mock('@/lib/integrations/ragmetrics', () => ({
    evaluateWithRagMetrics: vi.fn(() => Promise.resolve()),
    extractRAGContext: vi.fn(() => ''),
}));

vi.mock('@/lib/budgets', () => ({
    checkAndSendBudgetAlerts: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/prompts/registry', () => ({
    resolvePrompt: vi.fn(),
    logPromptUsage: vi.fn(),
}));

vi.mock('@/lib/credits', () => ({
    deductCredits: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/supabaseAdmin', () => ({
    createAdminClient: vi.fn(() => ({
        from: vi.fn((table: string) => {
            if (table === 'api_keys') {
                return {
                    select: () => ({
                        eq: () => ({
                            single: async () => ({
                                data: { agent_id: null, key_type: 'secret' },
                                error: null,
                            }),
                        }),
                    }),
                };
            }
            if (table === 'organizations') {
                return {
                    select: () => ({
                        eq: () => ({
                            single: async () => ({
                                data: { monthly_requests_used: 0 },
                                error: null,
                            }),
                        }),
                    }),
                };
            }
            if (table === 'ai_requests') {
                return {
                    insert: () => ({
                        select: () => ({
                            single: async () => ({ data: { id: 'req-log-1' }, error: null }),
                        }),
                    }),
                };
            }
            if (table === 'credit_transactions') {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({ data: null, error: null }),
                                }),
                            }),
                        }),
                    }),
                };
            }
            return {
                select: () => ({
                    eq: () => ({
                        single: async () => ({ data: null, error: null }),
                    }),
                }),
                insert: async () => ({ error: null }),
            };
        }),
        rpc: vi.fn(async () => ({ error: null })),
    })),
}));

const defaultProvider = {
    countTokens: async () => 1,
    getPricing: async () => ({
        inputPer1KTokens: 0,
        outputPer1KTokens: 0,
        cencoriMarkupPercentage: 0,
    }),
};

const enabledCacheConfig = {
    cacheEnabled: true,
    exactMatchEnabled: true,
    semanticMatchEnabled: false,
    ttlSeconds: 3600,
    similarityThreshold: 0.92,
    maxEntries: 1000,
    excludedModels: [],
    maxCacheableTemperature: 1,
};

function defaultGatewayContext(): GatewayContext {
    return {
        supabase: {} as GatewayContext['supabase'],
        projectId: 'proj-contract-test',
        organizationId: 'org-contract-test',
        apiKeyId: 'key-contract-test',
        environment: 'production',
        keyType: 'secret',
        tier: 'pro',
        requestId: 'req-contract-test',
        startTime: Date.now(),
        clientIp: '127.0.0.1',
        countryCode: 'US',
        projectName: 'Contract Test',
        defaultModel: 'gpt-4o',
        defaultProvider: 'openai',
        endUserBillingEnabled: false,
        rateLimit: { status: 'ok', limit: 60, remaining: 59, reset: Date.now() + 60_000 },
    };
}

function resetRouteMocks() {
    vi.clearAllMocks();
    routeMocks.addGatewayHeaders.mockImplementation((res: Response) => res);
    routeMocks.logApiGatewayRequest.mockResolvedValue(undefined);
    routeMocks.updateApiGatewayRequestPerformance.mockResolvedValue(undefined);
    routeMocks.runGatewayOutputGuard.mockResolvedValue({ ok: true });
}

function setupDefaultRouteMocks(overrides?: { gatewayCtx?: GatewayContext }) {
    const gatewayCtx = overrides?.gatewayCtx ?? defaultGatewayContext();
    routeMocks.validateGatewayRequest.mockResolvedValue({ success: true, context: gatewayCtx });
    routeMocks.loadAgentKeyContext.mockResolvedValue({
        agentId: null,
        agentConfigModel: null,
        agentName: null,
    });
    routeMocks.checkEndUserQuota.mockResolvedValue({ allowed: true });
    routeMocks.getCachedCacheConfig.mockResolvedValue(null);
    routeMocks.getProjectCacheConfig.mockResolvedValue({
        cacheEnabled: false,
        exactMatchEnabled: true,
        semanticMatchEnabled: false,
        ttlSeconds: 3600,
        similarityThreshold: 0.92,
        maxEntries: 1000,
        excludedModels: [],
        maxCacheableTemperature: 0.5,
    });
    routeMocks.lookupCache.mockResolvedValue({ hit: false, hitType: null, response: null });
    routeMocks.resolveGatewayProvider.mockResolvedValue({
        router: {},
        providerName: 'openai',
        model: 'gpt-4o',
        provider: defaultProvider,
    });
    return gatewayCtx;
}

function buildGatewayRequest(url: string, body: object, apiKey = 'cenc_test_key'): NextRequest {
    return new NextRequest(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
}

async function parseRouteJson(res: Response) {
    return res.json() as Promise<Record<string, unknown>>;
}

describe('Gateway route parity (/v1/chat/completions vs /api/ai/chat)', () => {
    beforeEach(() => {
        resetRouteMocks();
        setupDefaultRouteMocks();
    });

    it('both return 403 when input pipeline blocks (security contract)', async () => {
        routeMocks.runGatewayInputPipeline.mockResolvedValue({
            ok: false,
            status: 403,
            code: 'security_violation',
            message: 'Security violation detected',
            assistantMessage:
                'I cannot provide that information as it may contain sensitive data or violates our safety policies.',
            reasons: ['jailbreak_pattern'],
        });

        const { POST: v1Post } = await import('@/app/api/v1/chat/completions/route');
        const { POST: aiPost } = await import('@/app/api/ai/chat/route');

        const [v1Res, aiRes] = await Promise.all([
            v1Post(buildGatewayRequest('http://localhost/api/v1/chat/completions', JAILBREAK_REQUEST_BODY)),
            aiPost(buildGatewayRequest('http://localhost/api/ai/chat', JAILBREAK_REQUEST_BODY)),
        ]);

        expect(v1Res.status).toBe(403);
        expect(aiRes.status).toBe(403);
        expect(routeMocks.runGatewayInputPipeline).toHaveBeenCalledTimes(2);
        expect(routeMocks.executeGatewayChat).not.toHaveBeenCalled();
        expect(routeMocks.runV1ProviderExecution).not.toHaveBeenCalled();
    });

    it('both return 403 for data_rule_block with matching status', async () => {
        routeMocks.runGatewayInputPipeline.mockResolvedValue({
            ok: false,
            status: 403,
            code: 'data_rule_block',
            message: 'Request blocked by data rule',
            matched_rules: ['block-secret'],
        });

        const { POST: v1Post } = await import('@/app/api/v1/chat/completions/route');
        const { POST: aiPost } = await import('@/app/api/ai/chat/route');
        const body = {
            model: 'gpt-4o',
            messages: [{ role: 'user', content: 'SECRET_TOKEN_123' }],
            stream: false,
        };

        const v1Res = await v1Post(buildGatewayRequest('http://localhost/api/v1/chat/completions', body));
        const aiRes = await aiPost(buildGatewayRequest('http://localhost/api/ai/chat', body));

        expect(v1Res.status).toBe(403);
        expect(aiRes.status).toBe(403);
    });

    it('both return 200 when pipeline allows and execution succeeds', async () => {
        const messages = toUnifiedMessages(CHAT_REQUEST_BODY.messages);
        routeMocks.runGatewayInputPipeline.mockResolvedValue(createMockInputPipelineSuccess(messages));
        const chatResult = createMockChatResponse();

        // Both doors run through the unified engine — fresh Response per
        // call (bodies are single-read).
        routeMocks.runV1ProviderExecution.mockImplementation(async () => ({
            ok: true,
            response: new Response(
                JSON.stringify({
                    id: 'chatcmpl-test',
                    object: 'chat.completion',
                    choices: [
                        {
                            index: 0,
                            message: { role: 'assistant', content: chatResult.content },
                            finish_reason: 'stop',
                        },
                    ],
                    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            ),
        }));

        const { POST: v1Post } = await import('@/app/api/v1/chat/completions/route');
        const { POST: aiPost } = await import('@/app/api/ai/chat/route');

        const v1Res = await v1Post(
            buildGatewayRequest('http://localhost/api/v1/chat/completions', CHAT_REQUEST_BODY)
        );
        const aiRes = await aiPost(buildGatewayRequest('http://localhost/api/ai/chat', CHAT_REQUEST_BODY));

        expect(v1Res.status).toBe(200);
        expect(aiRes.status).toBe(200);
        expect(routeMocks.runV1ProviderExecution).toHaveBeenCalledTimes(2);
        // The adapter delegates to the engine — no direct executor calls.
        expect(routeMocks.executeGatewayChat).not.toHaveBeenCalled();
    });

    it('passes the same user messages into runGatewayInputPipeline', async () => {
        const messages = toUnifiedMessages(CHAT_REQUEST_BODY.messages);
        routeMocks.runGatewayInputPipeline.mockResolvedValue(createMockInputPipelineSuccess(messages));
        routeMocks.runV1ProviderExecution.mockImplementation(async () => ({
            ok: true,
            response: Response.json({ choices: [{ message: { content: 'ok' } }] }),
        }));
        routeMocks.executeGatewayChat.mockResolvedValue(createMockChatResponse());

        const { POST: v1Post } = await import('@/app/api/v1/chat/completions/route');
        const { POST: aiPost } = await import('@/app/api/ai/chat/route');

        await v1Post(buildGatewayRequest('http://localhost/api/v1/chat/completions', CHAT_REQUEST_BODY));
        await aiPost(buildGatewayRequest('http://localhost/api/ai/chat', CHAT_REQUEST_BODY));

        const firstCall = routeMocks.runGatewayInputPipeline.mock.calls[0][0];
        const secondCall = routeMocks.runGatewayInputPipeline.mock.calls[1][0];
        expect(firstCall.messages).toEqual(secondCall.messages);
        expect(firstCall.messages[0].content).toBe(ALLOWED_USER_MESSAGE);
    });

    it('both return 401 when validateGatewayRequest fails', async () => {
        routeMocks.validateGatewayRequest.mockResolvedValue({
            success: false,
            response: new Response(JSON.stringify({ error: 'Invalid API key' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            }),
        });

        const { POST: v1Post } = await import('@/app/api/v1/chat/completions/route');
        const { POST: aiPost } = await import('@/app/api/ai/chat/route');

        const v1Res = await v1Post(
            buildGatewayRequest('http://localhost/api/v1/chat/completions', CHAT_REQUEST_BODY)
        );
        const aiRes = await aiPost(buildGatewayRequest('http://localhost/api/ai/chat', CHAT_REQUEST_BODY));

        expect(v1Res.status).toBe(401);
        expect(aiRes.status).toBe(401);
        expect(routeMocks.runGatewayInputPipeline).not.toHaveBeenCalled();
    });

    it('both return event-stream on stream: true', async () => {
        const messages = toUnifiedMessages(CHAT_REQUEST_BODY.messages);
        routeMocks.runGatewayInputPipeline.mockResolvedValue(createMockInputPipelineSuccess(messages));
        routeMocks.runV1ProviderExecution.mockImplementation(async () => ({
            ok: true,
            response: new Response('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n', {
                status: 200,
                headers: { 'Content-Type': 'text/event-stream' },
            }),
        }));

        const { POST: v1Post } = await import('@/app/api/v1/chat/completions/route');
        const { POST: aiPost } = await import('@/app/api/ai/chat/route');

        const v1Res = await v1Post(
            buildGatewayRequest('http://localhost/api/v1/chat/completions', STREAM_REQUEST_BODY)
        );
        const aiRes = await aiPost(buildGatewayRequest('http://localhost/api/ai/chat', STREAM_REQUEST_BODY));

        expect(v1Res.status).toBe(200);
        expect(aiRes.status).toBe(200);
        expect(v1Res.headers.get('content-type')).toContain('text/event-stream');
        expect(aiRes.headers.get('content-type')).toContain('text/event-stream');
        expect(routeMocks.runV1ProviderExecution).toHaveBeenCalledTimes(2);
        // Adapter passes the legacy wire format + server-side token enforcement.
        const aiCall = routeMocks.runV1ProviderExecution.mock.calls[1][0] as Record<string, unknown>;
        expect(aiCall.wireFormat).toBe('cencori');
        expect(aiCall.enforceMaxTokens).toBe(true);
        const v1Call = routeMocks.runV1ProviderExecution.mock.calls[0][0] as Record<string, unknown>;
        expect(v1Call.wireFormat).toBeUndefined();
    });

    it('both return 429 when end-user quota is exceeded', async () => {
        setupDefaultRouteMocks({
            gatewayCtx: createMockGatewayContext({ endUserBillingEnabled: true }),
        });
        routeMocks.checkEndUserQuota.mockResolvedValue(createQuotaExceededResult());

        const bodyWithUser = { ...CHAT_REQUEST_BODY, user: 'end-user-99', userId: 'end-user-99' };
        const { POST: v1Post } = await import('@/app/api/v1/chat/completions/route');
        const { POST: aiPost } = await import('@/app/api/ai/chat/route');

        const v1Res = await v1Post(
            buildGatewayRequest('http://localhost/api/v1/chat/completions', bodyWithUser)
        );
        const aiRes = await aiPost(buildGatewayRequest('http://localhost/api/ai/chat', bodyWithUser));

        expect(v1Res.status).toBe(429);
        expect(aiRes.status).toBe(429);
        expect(routeMocks.checkEndUserQuota).toHaveBeenCalledTimes(2);
        expect(routeMocks.runGatewayInputPipeline).not.toHaveBeenCalled();
    });

    it('v1 returns cached OpenAI payload without provider execution', async () => {
        routeMocks.getProjectCacheConfig.mockResolvedValue(enabledCacheConfig);
        routeMocks.getCachedCacheConfig.mockResolvedValue({ data: enabledCacheConfig });
        routeMocks.lookupCache.mockResolvedValue({
            hit: true,
            hitType: 'exact',
            response: createOpenAiCachePayload(),
            entryId: 'cache-entry-1',
            estimatedTokens: 10,
            estimatedCostUsd: 0,
        });

        const messages = toUnifiedMessages(CHAT_REQUEST_BODY.messages);
        routeMocks.runGatewayInputPipeline.mockResolvedValue(createMockInputPipelineSuccess(messages));

        const { POST: v1Post } = await import('@/app/api/v1/chat/completions/route');
        const v1Res = await v1Post(
            buildGatewayRequest('http://localhost/api/v1/chat/completions', CHAT_REQUEST_BODY)
        );

        expect(v1Res.status).toBe(200);
        expect(v1Res.headers.get('X-Cache')).toBe('HIT-EXACT');
        expect(routeMocks.runV1ProviderExecution).not.toHaveBeenCalled();
        const body = await parseRouteJson(v1Res);
        expect(body.object).toBe('chat.completion');
    });

    it('v1 replays exact cache hits as an immediate SSE stream', async () => {
        routeMocks.getCachedCacheConfig.mockResolvedValue({ data: enabledCacheConfig });
        routeMocks.lookupCache.mockResolvedValue({
            hit: true,
            hitType: 'exact',
            response: createOpenAiCachePayload(),
            entryId: 'cache-entry-stream',
            estimatedTokens: 10,
            estimatedCostUsd: 0,
        });
        const messages = toUnifiedMessages(STREAM_REQUEST_BODY.messages);
        routeMocks.runGatewayInputPipeline.mockResolvedValue(createMockInputPipelineSuccess(messages));

        const { POST: v1Post } = await import('@/app/api/v1/chat/completions/route');
        const response = await v1Post(
            buildGatewayRequest('http://localhost/api/v1/chat/completions', STREAM_REQUEST_BODY)
        );
        const raw = await response.text();

        expect(response.headers.get('Content-Type')).toContain('text/event-stream');
        expect(response.headers.get('X-Cache')).toBe('HIT-EXACT');
        expect(raw).toContain('chat.completion.chunk');
        expect(raw).toContain('data: [DONE]');
        expect(routeMocks.runV1ProviderExecution).not.toHaveBeenCalled();
        expect(routeMocks.lookupCache.mock.calls[0][0].config.semanticMatchEnabled).toBe(false);
    });

    it('ai returns cached response without executeGatewayChat', async () => {
        routeMocks.getProjectCacheConfig.mockResolvedValue(enabledCacheConfig);
        routeMocks.getCachedCacheConfig.mockResolvedValue({ data: enabledCacheConfig });
        routeMocks.lookupCache.mockResolvedValue({
            hit: true,
            hitType: 'exact',
            response: createCencoriCachePayload('Cached from prior turn.'),
            entryId: 'cache-entry-2',
        });

        const messages = toUnifiedMessages(CHAT_REQUEST_BODY.messages);
        routeMocks.runGatewayInputPipeline.mockResolvedValue(createMockInputPipelineSuccess(messages));

        const { POST: aiPost } = await import('@/app/api/ai/chat/route');
        const aiRes = await aiPost(buildGatewayRequest('http://localhost/api/ai/chat', CHAT_REQUEST_BODY));

        expect(aiRes.status).toBe(200);
        expect(routeMocks.executeGatewayChat).not.toHaveBeenCalled();
    });

    it('ai resolves provider with agent config model when request omits model', async () => {
        setupDefaultRouteMocks({
            gatewayCtx: createMockGatewayContext({ defaultModel: 'gpt-4o' }),
        });
        routeMocks.loadAgentKeyContext.mockResolvedValue({
            agentId: 'agent-1',
            agentConfigModel: 'claude-sonnet-4',
            agentName: 'Support Bot',
        });

        const messages = toUnifiedMessages([{ role: 'user', content: 'Hello agent' }]);
        routeMocks.runGatewayInputPipeline.mockResolvedValue(createMockInputPipelineSuccess(messages));
        routeMocks.runV1ProviderExecution.mockImplementation(async () => ({
            ok: true,
            response: Response.json({ choices: [{ message: { content: 'ok' } }] }),
        }));

        const { POST: aiPost } = await import('@/app/api/ai/chat/route');
        await aiPost(
            buildGatewayRequest('http://localhost/api/ai/chat', {
                messages: [{ role: 'user', content: 'Hello agent' }],
                stream: false,
            })
        );

        expect(routeMocks.runV1ProviderExecution).toHaveBeenCalledWith(
            expect.objectContaining({ model: 'claude-sonnet-4' })
        );
    });

    it('both return 403 when output guard blocks', async () => {
        const messages = toUnifiedMessages(CHAT_REQUEST_BODY.messages);
        routeMocks.runGatewayInputPipeline.mockResolvedValue(createMockInputPipelineSuccess(messages));
        routeMocks.runGatewayOutputGuard.mockResolvedValue({
            ok: false,
            status: 403,
            code: 'output_security_violation',
            message: 'Response blocked due to security content policy',
            reasons: ['pii_leak'],
        });
        routeMocks.executeGatewayChat.mockResolvedValue({
            ...createMockChatResponse(),
            content: HARMFUL_AI_RESPONSE,
        });
        routeMocks.runV1ProviderExecution.mockResolvedValue({
            ok: false,
            status: 403,
            body: {
                error: {
                    message: 'Response blocked due to security content policy',
                    type: 'invalid_request_error',
                    code: 'output_security_violation',
                },
                reasons: ['pii_leak'],
            },
        });

        const { POST: v1Post } = await import('@/app/api/v1/chat/completions/route');
        const { POST: aiPost } = await import('@/app/api/ai/chat/route');

        const v1Res = await v1Post(
            buildGatewayRequest('http://localhost/api/v1/chat/completions', CHAT_REQUEST_BODY)
        );
        const aiRes = await aiPost(buildGatewayRequest('http://localhost/api/ai/chat', CHAT_REQUEST_BODY));

        expect(v1Res.status).toBe(403);
        expect(aiRes.status).toBe(403);

        // v1 keeps the nested OpenAI error shape.
        const v1Body = await parseRouteJson(v1Res);
        expect((v1Body.error as Record<string, unknown>)?.code).toBe('output_security_violation');

        // The adapter maps to the legacy flat shape (pinned: SDKs read
        // errorData.error as a string).
        const aiBody = await parseRouteJson(aiRes);
        expect(aiBody.error).toBe('Security violation detected');
        expect(aiBody.message).toBe('Response blocked as it contains sensitive data.');
        expect(aiBody.reasons).toEqual(['pii_leak']);
    });

    it('ai maps provider auth failure to legacy flat 401', async () => {
        const messages = toUnifiedMessages(CHAT_REQUEST_BODY.messages);
        routeMocks.runGatewayInputPipeline.mockResolvedValue(createMockInputPipelineSuccess(messages));
        routeMocks.runV1ProviderExecution.mockResolvedValue({
            ok: false,
            status: 401,
            body: {
                error: {
                    message: 'Authentication failed. Check API key configuration.',
                    type: 'invalid_request_error',
                    code: 'provider_auth_error',
                },
            },
        });

        const { POST: aiPost } = await import('@/app/api/ai/chat/route');
        const aiRes = await aiPost(buildGatewayRequest('http://localhost/api/ai/chat', CHAT_REQUEST_BODY));

        expect(aiRes.status).toBe(401);
        const body = await parseRouteJson(aiRes);
        expect(body.error).toBe('provider_auth_error');
        expect(typeof body.message).toBe('string');
    });

    it('v1 returns 401 for provider auth failures (OpenAI-shaped body)', async () => {
        const messages = toUnifiedMessages(CHAT_REQUEST_BODY.messages);
        routeMocks.runGatewayInputPipeline.mockResolvedValue(createMockInputPipelineSuccess(messages));
        routeMocks.runV1ProviderExecution.mockResolvedValue({
            ok: false,
            status: 401,
            body: {
                error: {
                    message: 'Authentication failed. Check API key configuration.',
                    type: 'invalid_request_error',
                    code: 'provider_auth_error',
                },
            },
        });

        const { POST: v1Post } = await import('@/app/api/v1/chat/completions/route');
        const v1Res = await v1Post(
            buildGatewayRequest('http://localhost/api/v1/chat/completions', CHAT_REQUEST_BODY)
        );

        expect(v1Res.status).toBe(401);
        const body = await parseRouteJson(v1Res);
        expect((body.error as Record<string, unknown>)?.code).toBe('provider_auth_error');
    });

    it('v1 uses OpenAI nested error shape; ai uses flat error on security block', async () => {
        routeMocks.runGatewayInputPipeline.mockResolvedValue({
            ok: false,
            status: 403,
            code: 'security_violation',
            message: 'Security violation detected',
            assistantMessage: 'Blocked for safety.',
            reasons: ['jailbreak_pattern'],
        });

        const body = { model: 'gpt-4o', messages: [{ role: 'user', content: 'bad' }], stream: false };
        const { POST: v1Post } = await import('@/app/api/v1/chat/completions/route');
        const { POST: aiPost } = await import('@/app/api/ai/chat/route');

        const v1Json = await parseRouteJson(
            await v1Post(buildGatewayRequest('http://localhost/api/v1/chat/completions', body))
        );
        const aiJson = await parseRouteJson(
            await aiPost(buildGatewayRequest('http://localhost/api/ai/chat', body))
        );

        expect((v1Json.error as Record<string, unknown>)?.code).toBe('security_violation');
        expect(v1Json.message).toBe('Blocked for safety.');
        expect(aiJson.error).toBe('Security violation detected');
        expect(aiJson.message).toBe('Blocked for safety.');
    });
});
