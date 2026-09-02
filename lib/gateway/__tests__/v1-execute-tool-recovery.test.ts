/**
 * @vitest-environment node
 *
 * Tool calls written as text on /v1/chat/completions.
 *
 * This endpoint fully supports tools, and had no recovery at all: a model that wrote its call as
 * markup instead of emitting a structured one had the syntax pass straight through to the caller
 * and made no call. The fix on /v1/responses did not reach here, which is why it looked fixed —
 * Basecode uses the other door.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockExecuteGatewayChat = vi.fn();
const mockStreamGatewayChat = vi.fn();
const mockResolveGatewayProvider = vi.fn();

vi.mock('@/lib/gateway/chat-executor', () => ({
    executeGatewayChat: (...args: unknown[]) => mockExecuteGatewayChat(...args),
    streamGatewayChat: (...args: unknown[]) => mockStreamGatewayChat(...args),
}));

vi.mock('@/lib/gateway/providers-setup', () => ({
    resolveGatewayProvider: (...args: unknown[]) => mockResolveGatewayProvider(...args),
}));

vi.mock('@/lib/gateway/output-guard', () => ({
    runGatewayOutputGuard: vi.fn().mockResolvedValue({ ok: true }),
}));

import { runV1ProviderExecution } from '@/lib/gateway/v1-execute';
import { createMockGatewayContext, toUnifiedMessages } from '@/lib/gateway/__tests__/fixtures';
import type { SecurityCheckResult } from '@/lib/safety/multi-layer-check';

const inputSecurity: SecurityCheckResult = {
    safe: true,
    reasons: [],
    layer: 'input',
    riskScore: 0,
    confidence: 1,
};

const MARKUP =
    '<tool_call><function=read_file><parameter=path>a.ts</parameter></function></tool_call>';

const readFile = {
    type: 'function' as const,
    function: { name: 'read_file', description: 'read', parameters: {} },
};

function baseParams(overrides: Record<string, unknown> = {}) {
    return {
        supabase: {} as never,
        gatewayCtx: createMockGatewayContext(),
        model: 'gpt-4o',
        messages: toUnifiedMessages([{ role: 'user', content: 'Hello' }]),
        inputText: 'Hello',
        inputSecurity,
        stream: false,
        tools: [readFile],
        endUserId: null,
        endUserQuota: null,
        recordEndUserUsage: vi.fn(),
        logSuccess: vi.fn(),
        incrementUsage: vi.fn(),
        ...overrides,
    } as never;
}

beforeEach(() => {
    vi.clearAllMocks();
    mockResolveGatewayProvider.mockResolvedValue({
        providerName: 'openai',
        model: 'gpt-4o',
        provider: {
            countTokens: vi.fn(async () => 4),
            getPricing: vi.fn(async () => ({
                inputPer1KTokens: 0.001,
                outputPer1KTokens: 0.002,
                cencoriMarkupPercentage: 10,
            })),
        },
        router: { hasProvider: () => true, getProvider: () => ({}) },
    });
});

function completion(content: string) {
    return {
        content,
        toolCalls: undefined,
        actualModel: 'gpt-4o',
        actualProvider: 'openai',
        usedFallback: false,
        finishReason: 'stop',
        usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
        cost: { providerCostUsd: 0.001, cencoriChargeUsd: 0.0011, markupPercentage: 10 },
    };
}

describe('a call written as text, not streamed', () => {
    it('becomes a real call and the markup is not returned', async () => {
        mockExecuteGatewayChat.mockResolvedValue(completion(`Reading it.\n${MARKUP}`));

        const result = await runV1ProviderExecution(baseParams());
        if (!result.ok) throw new Error('expected ok');

        const body = (await result.response.json()) as {
            choices: Array<{
                message: { content: string; tool_calls?: Array<{ function: { name: string; arguments: string } }> };
                finish_reason: string;
            }>;
        };
        const message = body.choices[0]?.message;
        expect(message?.content).toBe('Reading it.');
        expect(message?.content).not.toContain('<tool_call>');
        expect(message?.tool_calls?.[0]?.function).toEqual({
            name: 'read_file',
            arguments: '{"path":"a.ts"}',
        });
        // A turn that calls a tool is not a turn that stopped.
        expect(body.choices[0]?.finish_reason).toBe('tool_calls');
    });

    it('leaves markup naming a tool the request never offered as text', async () => {
        const other = '<tool_call><function=delete_everything></function></tool_call>';
        mockExecuteGatewayChat.mockResolvedValue(completion(other));

        const result = await runV1ProviderExecution(baseParams());
        if (!result.ok) throw new Error('expected ok');

        const body = (await result.response.json()) as {
            choices: Array<{ message: { content: string; tool_calls?: unknown[] } }>;
        };
        expect(body.choices[0]?.message.content).toBe(other);
        expect(body.choices[0]?.message.tool_calls).toBeUndefined();
    });
});

describe('a call written as text, streamed', () => {
    it('never streams the markup, and emits the call at the end', async () => {
        mockStreamGatewayChat.mockImplementation(() =>
            (async function* () {
                // Split mid-tag, the way it comes off the wire.
                yield { delta: 'Reading it.<tool', actualModel: 'gpt-4o', actualProvider: 'openai', usedFallback: false, billingMode: 'standard', originalProvider: 'openai', originalModel: 'gpt-4o' };
                yield { delta: MARKUP.slice('<tool'.length), actualModel: 'gpt-4o', actualProvider: 'openai', usedFallback: false, billingMode: 'standard', originalProvider: 'openai', originalModel: 'gpt-4o' };
                yield { delta: '', finishReason: 'stop', actualModel: 'gpt-4o', actualProvider: 'openai', usedFallback: false, billingMode: 'standard', originalProvider: 'openai', originalModel: 'gpt-4o', usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 } };
            })()
        );

        const result = await runV1ProviderExecution(baseParams({ stream: true }));
        if (!result.ok) throw new Error('expected ok');

        const reader = (result.response as Response).body!.getReader();
        let wire = '';
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            wire += new TextDecoder().decode(value);
        }

        expect(wire).not.toContain('<tool_call>');
        expect(wire).not.toContain('<function=');
        expect(wire).toContain('read_file');
        expect(wire).toContain('Reading it.');
        // The stream must not close on `stop`, or a client treats the call as a final answer.
        expect(wire).toContain('"finish_reason":"tool_calls"');
    });
});
