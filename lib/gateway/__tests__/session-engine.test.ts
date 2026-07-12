import { describe, it, expect, vi } from 'vitest';
import { NextResponse } from 'next/server';

// Mock modules that trigger the supabase chain import
vi.mock('@/lib/gateway/chat-executor', () => ({
    streamGatewayChat: vi.fn(),
}));
vi.mock('@/lib/gateway/providers-setup', () => ({
    resolveGatewayProvider: vi.fn(),
}));
vi.mock('@/lib/gateway/v1-responses-tools', () => ({
    preProcessBuiltInTools: vi.fn(),
}));

import {
    expireStaleSessions,
    maybeCreateCheckpoint,
    buildOutput,
    resumeSessionTurn,
    executeSessionTurn,
} from '../session-engine';

import * as chatExecutor from '@/lib/gateway/chat-executor';
import * as providersSetup from '@/lib/gateway/providers-setup';
import * as responsesTools from '@/lib/gateway/v1-responses-tools';

const mockStreamGatewayChat = vi.mocked(chatExecutor.streamGatewayChat);
const mockResolveGatewayProvider = vi.mocked(providersSetup.resolveGatewayProvider);
const mockPreProcessBuiltInTools = vi.mocked(responsesTools.preProcessBuiltInTools);

function makeProvider() {
    return {
        countTokens: vi.fn().mockResolvedValue(10),
        getPricing: vi.fn().mockResolvedValue({ inputPer1KTokens: 0.01, outputPer1KTokens: 0.03, cencoriMarkupPercentage: 50 }),
    };
}

function makeStreamChunks(chunks: Array<Record<string, unknown>>) {
    return async function* () {
        for (const c of chunks) yield c;
    };
}

function makeGateways() {
    return {
        supabase: {
            from: vi.fn(() => ({
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                in: vi.fn().mockReturnThis(),
                insert: vi.fn().mockResolvedValue({ error: null }),
                order: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
                lt: vi.fn().mockReturnThis(),
                update: vi.fn().mockReturnThis(),
                rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
            })),
            rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
        },
        gatewayCtx: {
            projectId: 'proj_1',
            apiKeyId: 'key_1',
            organizationId: 'org_1',
            requestId: 'req_1',
            environment: 'test',
            tier: 'free',
            clientIp: '127.0.0.1',
            countryCode: 'US',
            endUserBillingEnabled: false,
        },
        logSuccess: vi.fn(),
        incrementUsage: vi.fn(),
    };
}

describe('executeSessionTurn', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockResolveGatewayProvider.mockResolvedValue({
            model: 'gpt-4o',
            actualModel: 'gpt-4o',
            actualProvider: 'openai',
            customProviderTag: undefined,
            provider: makeProvider(),
        });
        mockPreProcessBuiltInTools.mockResolvedValue({ systemContext: '', toolOutputs: [] });
    });

    it('should complete a turn with text output and emit SSE events', async () => {
        mockStreamGatewayChat.mockImplementation(makeStreamChunks([
            { delta: 'Hello ', actualModel: 'gpt-4o', actualProvider: 'openai' },
            { delta: 'world', actualModel: 'gpt-4o', actualProvider: 'openai' },
            { finishReason: 'stop', actualModel: 'gpt-4o', actualProvider: 'openai' },
        ]));

        const { supabase, gatewayCtx, logSuccess, incrementUsage } = makeGateways();
        const result = await executeSessionTurn({
            supabase: supabase as never,
            gatewayCtx: gatewayCtx as never,
            sessionId: 'sid_1',
            turnNumber: 1,
            model: 'gpt-4o',
            inputMessages: [{ role: 'user', content: 'hello' }],
            inputText: 'hello',
            pauseOnToolCalls: false,
            endUserId: null,
            tier: 'free' as never,
            logSuccess,
            incrementUsage,
        });

        expect(result.ok).toBe(true);
        const response = (result as { ok: true; response: NextResponse }).response;
        expect(response.status).toBe(200);

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let allData = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            allData += decoder.decode(value, { stream: true });
        }

        expect(allData).toContain('event: turn.started');
        expect(allData).toContain('event: output_text.delta');
        expect(allData).toContain('event: turn.completed');
        expect(allData).toContain('"delta":"Hello "');
        expect(allData).toContain('"delta":"world"');
        expect(allData).not.toContain('turn.paused');
        expect(allData).not.toContain('turn.failed');
    });

    it('should pause on tool calls when pauseOnToolCalls is true', async () => {
        mockStreamGatewayChat.mockImplementation(makeStreamChunks([
            { delta: 'Let me check', actualModel: 'gpt-4o', actualProvider: 'openai' },
            {
                toolCalls: [{ id: 'tc_1', function: { name: 'get_weather', arguments: '{"city":"NYC"}' } }],
                finishReason: 'tool_calls',
                actualModel: 'gpt-4o', actualProvider: 'openai',
            },
        ]));

        const { supabase, gatewayCtx, logSuccess, incrementUsage } = makeGateways();
        const result = await executeSessionTurn({
            supabase: supabase as never,
            gatewayCtx: gatewayCtx as never,
            sessionId: 'sid_1',
            turnNumber: 1,
            model: 'gpt-4o',
            inputMessages: [{ role: 'user', content: 'weather?' }],
            inputText: 'weather?',
            pauseOnToolCalls: true,
            endUserId: null,
            tier: 'free' as never,
            logSuccess,
            incrementUsage,
            tools: [{ type: 'function' as const, function: { name: 'get_weather', description: '', parameters: {} } }],
        });

        expect(result.ok).toBe(true);
        const reader = ((result as { ok: true; response: NextResponse }).response.body!).getReader();
        const decoder = new TextDecoder();
        let allData = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            allData += decoder.decode(value, { stream: true });
        }

        expect(allData).toContain('event: turn.paused');
        expect(allData).toContain('"tool":"get_weather"');
        expect(allData).not.toContain('event: turn.completed');
    });

    it('should pause only on tools with needsApproval when set', async () => {
        mockStreamGatewayChat.mockImplementation(makeStreamChunks([
            { delta: 'Checking...', actualModel: 'gpt-4o', actualProvider: 'openai' },
            {
                toolCalls: [
                    { id: 'tc_1', function: { name: 'get_weather', arguments: '{"city":"NYC"}' } },
                    { id: 'tc_2', function: { name: 'send_email', arguments: '{"to":"a@b.com"}' } },
                ],
                finishReason: 'tool_calls',
                actualModel: 'gpt-4o', actualProvider: 'openai',
            },
        ]));

        const { supabase, gatewayCtx, logSuccess, incrementUsage } = makeGateways();
        const result = await executeSessionTurn({
            supabase: supabase as never,
            gatewayCtx: gatewayCtx as never,
            sessionId: 'sid_1',
            turnNumber: 1,
            model: 'gpt-4o',
            inputMessages: [{ role: 'user', content: 'check weather and email' }],
            inputText: 'check weather and email',
            pauseOnToolCalls: true,
            endUserId: null,
            tier: 'free' as never,
            logSuccess,
            incrementUsage,
            tools: [
                { type: 'function' as const, function: { name: 'get_weather', description: '', parameters: {} } },
                { type: 'function' as const, function: { name: 'send_email', description: '', parameters: {} }, needsApproval: true },
            ],
        });

        expect(result.ok).toBe(true);
        const reader = ((result as { ok: true; response: NextResponse }).response.body!).getReader();
        const decoder = new TextDecoder();
        let allData = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            allData += decoder.decode(value, { stream: true });
        }

        // Should pause because send_email has needsApproval and was called
        expect(allData).toContain('event: turn.paused');
        expect(allData).toContain('"tool":"get_weather"'); // first tool in callValues
    });

    it('should NOT pause when no tool has needsApproval and none were called', async () => {
        mockStreamGatewayChat.mockImplementation(makeStreamChunks([
            { delta: 'No tools needed', actualModel: 'gpt-4o', actualProvider: 'openai' },
            { finishReason: 'stop', actualModel: 'gpt-4o', actualProvider: 'openai' },
        ]));

        const { supabase, gatewayCtx, logSuccess, incrementUsage } = makeGateways();
        const result = await executeSessionTurn({
            supabase: supabase as never,
            gatewayCtx: gatewayCtx as never,
            sessionId: 'sid_1',
            turnNumber: 1,
            model: 'gpt-4o',
            inputMessages: [{ role: 'user', content: 'hi' }],
            inputText: 'hi',
            pauseOnToolCalls: true,
            endUserId: null,
            tier: 'free' as never,
            logSuccess,
            incrementUsage,
            tools: [
                { type: 'function' as const, function: { name: 'get_weather', description: '', parameters: {} }, needsApproval: true },
            ],
        });

        expect(result.ok).toBe(true);
        const reader = ((result as { ok: true; response: NextResponse }).response.body!).getReader();
        const decoder = new TextDecoder();
        let allData = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            allData += decoder.decode(value, { stream: true });
        }

        expect(allData).toContain('event: turn.completed');
        expect(allData).not.toContain('event: turn.paused');
    });

    it('should not pause on tools without needsApproval even when pauseOnToolCalls is true', async () => {
        mockStreamGatewayChat.mockImplementation(makeStreamChunks([
            { delta: 'Fetching...', actualModel: 'gpt-4o', actualProvider: 'openai' },
            {
                toolCalls: [{ id: 'tc_1', function: { name: 'get_weather', arguments: '{"city":"NYC"}' } }],
                finishReason: 'tool_calls',
                actualModel: 'gpt-4o', actualProvider: 'openai',
            },
        ]));

        const { supabase, gatewayCtx, logSuccess, incrementUsage } = makeGateways();
        const result = await executeSessionTurn({
            supabase: supabase as never,
            gatewayCtx: gatewayCtx as never,
            sessionId: 'sid_1',
            turnNumber: 1,
            model: 'gpt-4o',
            inputMessages: [{ role: 'user', content: 'weather?' }],
            inputText: 'weather?',
            pauseOnToolCalls: true,
            endUserId: null,
            tier: 'free' as never,
            logSuccess,
            incrementUsage,
            tools: [
                { type: 'function' as const, function: { name: 'run_sql', description: '', parameters: {} }, needsApproval: true },
                { type: 'function' as const, function: { name: 'get_weather', description: '', parameters: {} } },
            ],
        });

        expect(result.ok).toBe(true);
        const reader = ((result as { ok: true; response: NextResponse }).response.body!).getReader();
        const decoder = new TextDecoder();
        let allData = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            allData += decoder.decode(value, { stream: true });
        }

        // get_weather does NOT have needsApproval, so should NOT pause
        expect(allData).toContain('event: turn.completed');
        expect(allData).not.toContain('event: turn.paused');
    });

    it('should emit turn.failed on execution error', async () => {
        mockStreamGatewayChat.mockImplementation(async function* () {
            yield { delta: 'Hello ', actualModel: 'gpt-4o', actualProvider: 'openai' };
            throw new Error('Stream crashed');
        });

        const { supabase, gatewayCtx, logSuccess, incrementUsage } = makeGateways();
        const result = await executeSessionTurn({
            supabase: supabase as never,
            gatewayCtx: gatewayCtx as never,
            sessionId: 'sid_1',
            turnNumber: 1,
            model: 'gpt-4o',
            inputMessages: [{ role: 'user', content: 'hello' }],
            inputText: 'hello',
            pauseOnToolCalls: false,
            endUserId: null,
            tier: 'free' as never,
            logSuccess,
            incrementUsage,
        });

        expect(result.ok).toBe(true);

        const reader = ((result as { ok: true; response: NextResponse }).response.body!).getReader();
        const decoder = new TextDecoder();
        let allData = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            allData += decoder.decode(value, { stream: true });
        }

        expect(allData).toContain('event: turn.started');
        expect(allData).toContain('event: turn.failed');
        expect(allData).toContain('Stream crashed');
        expect(allData).not.toContain('event: turn.completed');
    });

    it('should return 500 when resolveGatewayProvider throws', async () => {
        mockResolveGatewayProvider.mockRejectedValue(new Error('No provider found'));

        const { supabase, gatewayCtx, logSuccess, incrementUsage } = makeGateways();
        const result = await executeSessionTurn({
            supabase: supabase as never,
            gatewayCtx: gatewayCtx as never,
            sessionId: 'sid_1',
            turnNumber: 1,
            model: 'gpt-4o',
            inputMessages: [{ role: 'user', content: 'hello' }],
            inputText: 'hello',
            pauseOnToolCalls: false,
            endUserId: null,
            tier: 'free' as never,
            logSuccess,
            incrementUsage,
        });

        expect(result.ok).toBe(false);
        expect((result as never as { status: number }).status).toBe(500);
        expect((result as never as { body: Record<string, unknown> }).body).toHaveProperty('error');
    });

    it('should not pause when pauseOnToolCalls is false regardless of needsApproval', async () => {
        mockStreamGatewayChat.mockImplementation(makeStreamChunks([
            { delta: 'Running...', actualModel: 'gpt-4o', actualProvider: 'openai' },
            {
                toolCalls: [{ id: 'tc_1', function: { name: 'send_email', arguments: '{"to":"a@b.com"}' } }],
                finishReason: 'tool_calls',
                actualModel: 'gpt-4o', actualProvider: 'openai',
            },
        ]));

        const { supabase, gatewayCtx, logSuccess, incrementUsage } = makeGateways();
        const result = await executeSessionTurn({
            supabase: supabase as never,
            gatewayCtx: gatewayCtx as never,
            sessionId: 'sid_1',
            turnNumber: 1,
            model: 'gpt-4o',
            inputMessages: [{ role: 'user', content: 'send email' }],
            inputText: 'send email',
            pauseOnToolCalls: false,
            endUserId: null,
            tier: 'free' as never,
            logSuccess,
            incrementUsage,
            tools: [
                { type: 'function' as const, function: { name: 'send_email', description: '', parameters: {} }, needsApproval: true },
            ],
        });

        expect(result.ok).toBe(true);
        const reader = ((result as { ok: true; response: NextResponse }).response.body!).getReader();
        const decoder = new TextDecoder();
        let allData = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            allData += decoder.decode(value, { stream: true });
        }

        expect(allData).toContain('event: turn.completed');
        expect(allData).not.toContain('event: turn.paused');
    });
});

describe('expireStaleSessions', () => {
    it('should call update with paused sessions past their expires_at', async () => {
        const mockUpdate = vi.fn().mockReturnThis();
        const mockEq = vi.fn().mockReturnThis();
        const mockLt = vi.fn().mockResolvedValue({ data: null, error: null });

        const supabase = {
            from: vi.fn(() => ({
                update: mockUpdate,
                eq: mockEq,
                lt: mockLt,
            })),
        };

        await expireStaleSessions(supabase as never);

        expect(supabase.from).toHaveBeenCalledWith('sessions');
        expect(mockUpdate).toHaveBeenCalledWith({ status: 'completed', expires_at: null });
        expect(mockEq).toHaveBeenCalledWith('status', 'paused');
        expect(mockLt).toHaveBeenCalledWith('expires_at', expect.any(String));
    });

    it('should handle DB errors gracefully', async () => {
        const supabase = {
            from: vi.fn(() => {
                throw new Error('DB connection failed');
            }),
        };

        await expect(expireStaleSessions(supabase as never)).resolves.toBeUndefined();
    });
});

describe('buildOutput', () => {
    it('should produce output array with text and tool calls', async () => {
        const result = buildOutput(
            'Hello world',
            [{ id: 'tc_1', name: 'get_weather', args: '{"city":"NYC"}' }],
            [{ id: 'builtin_1', type: 'web_search', status: 'completed', output: { results: [] } }],
        );

        expect(result).toHaveProperty('output');
        expect(Array.isArray(result.output)).toBe(true);
        expect(result.output).toHaveLength(3);

        const messages = result.output as Array<Record<string, unknown>>;
        const textMsg = messages.find(m => m.type === 'message');
        const funcCall = messages.find(m => m.type === 'function_call');
        const builtin = messages.find(m => m.type === 'web_search');

        expect(textMsg).toBeDefined();
        expect(textMsg).toHaveProperty('content');
        expect(funcCall?.name).toBe('get_weather');
        expect(builtin?.status).toBe('completed');
    });

    it('should handle empty text and no tool calls', async () => {
        const result = buildOutput('', [], []);

        expect(result).toHaveProperty('output');
        expect((result.output as Array<unknown>)).toHaveLength(0);
    });
});

describe('maybeCreateCheckpoint', () => {
    it('should skip when turnNumber is not a multiple of 50', async () => {
        const supabase = { from: vi.fn() };
        await maybeCreateCheckpoint(supabase as never, 'sid', 23, [], '');
        expect(supabase.from).not.toHaveBeenCalled();
    });

    it('should create checkpoint at turn 50', async () => {
        const mockInsert = vi.fn().mockResolvedValue({ error: null });
        const mockSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        const mockLimit = vi.fn().mockReturnValue({ single: mockSingle });
        const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
        const mockLt = vi.fn().mockReturnValue({ order: mockOrder });
        const mockEq2 = vi.fn().mockReturnValue({ lt: mockLt });
        const mockEq = vi.fn().mockReturnValue({ eq: mockEq2 });
        const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
        const supabase = {
            from: vi.fn((table: string) => {
                if (table === 'session_events') {
                    return {
                        select: mockSelect,
                        insert: mockInsert,
                    };
                }
                return {};
            }),
        };

        await maybeCreateCheckpoint(supabase as never, 'sid', 50, [{ role: 'user', content: 'hello' }], 'Hi there');

        expect(mockInsert).toHaveBeenCalled();
        const insertArg = mockInsert.mock.calls[0][0];
        expect(insertArg.event_type).toBe('turn.checkpoint');
        expect(insertArg.turn_number).toBe(50);
        expect(insertArg.payload.messages).toHaveLength(2);
        expect(insertArg.payload.messages[0]).toEqual({ role: 'user', content: 'hello' });
        expect(insertArg.payload.messages[1]).toEqual({ role: 'assistant', content: 'Hi there' });
    });

    it('should merge with previous checkpoint messages', async () => {
        const prevMessages = [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'What is the weather?' },
            { role: 'assistant', content: 'Let me check.' },
        ];

        const mockSingle = vi.fn().mockResolvedValue({
            data: { payload: { turn_number: 50, messages: prevMessages } },
            error: null,
        });
        const mockLimit = vi.fn().mockReturnValue({ single: mockSingle });
        const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
        const mockLt = vi.fn().mockReturnValue({ order: mockOrder });
        const mockEq2 = vi.fn().mockReturnValue({ lt: mockLt });
        const mockEq = vi.fn().mockReturnValue({ eq: mockEq2 });
        const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
        const mockInsert = vi.fn().mockResolvedValue({ error: null });
        const supabase = {
            from: vi.fn((table: string) => {
                if (table === 'session_events') {
                    return {
                        select: mockSelect,
                        insert: mockInsert,
                    };
                }
                return {};
            }),
        };

        await maybeCreateCheckpoint(
            supabase as never, 'sid', 100,
            [{ role: 'user', content: 'Thanks!' }],
            'You are welcome!',
        );

        expect(mockInsert).toHaveBeenCalled();
        const insertArg = mockInsert.mock.calls[0][0];
        expect(insertArg.payload.messages).toEqual([
            ...prevMessages,
            { role: 'user', content: 'Thanks!' },
            { role: 'assistant', content: 'You are welcome!' },
        ]);
    });

    it('should handle DB errors gracefully', async () => {
        const supabase = {
            from: vi.fn(() => {
                throw new Error('Insert failed');
            }),
        };

        await expect(maybeCreateCheckpoint(supabase as never, 'sid', 50, [], '')).resolves.toBeUndefined();
    });
});

describe('resumeSessionTurn validations', () => {
    it('should reject when no events exist for turn', async () => {
        const supabase = {
            from: vi.fn(() => ({
                select: () => ({
                    eq: () => ({
                        eq: () => ({
                            order: () => ({
                                data: null as Array<Record<string, unknown>> | null,
                                error: null,
                            }),
                        }),
                    }),
                }),
            })),
        };

        const result = await resumeSessionTurn({
            supabase: supabase as never,
            gatewayCtx: {} as never,
            sessionId: 'sid',
            turnNumber: 1,
            toolResults: [{ action_id: 'act_1', output: 'result' }],
            tier: 'free' as never,
            logSuccess: () => {},
            incrementUsage: () => {},
        });

        expect(result.ok).toBe(false);
        expect(result.status).toBe(400);
    });

    it('should reject when no started event exists', async () => {
        const supabase = {
            from: vi.fn(() => ({
                select: () => ({
                    eq: () => ({
                        eq: () => ({
                            order: () => ({
                                data: [
                                    { event_type: 'output_text.delta', payload: { delta: 'hello' }, sequence: 1 },
                                ],
                                error: null,
                            }),
                        }),
                    }),
                }),
            })),
        };

        const result = await resumeSessionTurn({
            supabase: supabase as never,
            gatewayCtx: {} as never,
            sessionId: 'sid',
            turnNumber: 1,
            toolResults: [{ action_id: 'act_1', output: 'result' }],
            tier: 'free' as never,
            logSuccess: () => {},
            incrementUsage: () => {},
        });

        expect(result.ok).toBe(false);
        expect(result.status).toBe(400);
    });

    it('should reject when no paused event exists', async () => {
        const supabase = {
            from: vi.fn(() => ({
                select: () => ({
                    eq: () => ({
                        eq: () => ({
                            order: () => ({
                                data: [
                                    { event_type: 'turn.started', payload: { model: 'gpt-4o', input_text: 'hello' }, sequence: 1 },
                                ],
                                error: null,
                            }),
                        }),
                    }),
                }),
            })),
        };

        const result = await resumeSessionTurn({
            supabase: supabase as never,
            gatewayCtx: {} as never,
            sessionId: 'sid',
            turnNumber: 1,
            toolResults: [{ action_id: 'act_1', output: 'result' }],
            tier: 'free' as never,
            logSuccess: () => {},
            incrementUsage: () => {},
        });

        expect(result.ok).toBe(false);
        expect(result.status).toBe(400);
    });
});
