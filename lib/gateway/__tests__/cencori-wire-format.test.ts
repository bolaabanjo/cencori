/**
 * @vitest-environment node
 *
 * Shape-pinning tests for the 'cencori' wire format in runV1ProviderExecution
 * — the legacy /api/ai/chat contract every deployed SDK parses. If any of
 * these fail, a published SDK breaks.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

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
import { runGatewayOutputGuard } from '@/lib/gateway/output-guard';
import { createMockGatewayContext, toUnifiedMessages } from '@/lib/gateway/__tests__/fixtures';
import type { SecurityCheckResult } from '@/lib/safety/multi-layer-check';

const inputSecurity: SecurityCheckResult = {
    safe: true,
    reasons: [],
    layer: 'input',
    riskScore: 0,
    confidence: 1,
};

const mockProvider = {
    countTokens: vi.fn(async (text: string) => Math.ceil(text.length / 4)),
    getPricing: vi.fn(async () => ({
        inputPer1KTokens: 0.001,
        outputPer1KTokens: 0.002,
        cencoriMarkupPercentage: 10,
    })),
};

function baseParams(overrides: Record<string, unknown> = {}) {
    const messages = toUnifiedMessages([{ role: 'user', content: 'Hello' }]);
    const gatewayCtx = createMockGatewayContext();
    return {
        supabase: {} as never,
        gatewayCtx,
        model: 'gpt-4o',
        messages,
        inputText: 'Hello',
        inputSecurity,
        stream: false,
        endUserId: null,
        endUserQuota: null,
        recordEndUserUsage: vi.fn(),
        logSuccess: vi.fn(),
        incrementUsage: vi.fn(),
        wireFormat: 'cencori' as const,
        ...overrides,
    };
}

function chatResult(overrides: Record<string, unknown> = {}) {
    return {
        content: 'Hello there!',
        model: 'gpt-4o',
        provider: 'openai',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        cost: { providerCostUsd: 0.001, cencoriChargeUsd: 0.0011, markupPercentage: 10 },
        latencyMs: 100,
        finishReason: 'stop' as const,
        actualProvider: 'openai',
        actualModel: 'gpt-4o',
        usedFallback: false,
        originalProvider: 'openai',
        originalModel: 'gpt-4o',
        ...overrides,
    };
}

async function readSSE(response: Response): Promise<{ chunks: unknown[]; sawDone: boolean; raw: string }> {
    const raw = await response.text();
    const chunks: unknown[] = [];
    let sawDone = false;
    for (const line of raw.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6);
        if (payload === '[DONE]') {
            sawDone = true;
            continue;
        }
        chunks.push(JSON.parse(payload));
    }
    return { chunks, sawDone, raw };
}

describe('cencori wire format — non-stream superset', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (runGatewayOutputGuard as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
        mockResolveGatewayProvider.mockResolvedValue({
            providerName: 'openai',
            model: 'gpt-4o',
            provider: mockProvider,
            router: {},
        });
    });

    it('includes every field the SDKs read (superset contract)', async () => {
        mockExecuteGatewayChat.mockResolvedValue(chatResult());

        const result = await runV1ProviderExecution(baseParams());
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const body = (await result.response.json()) as Record<string, unknown>;

        // OpenAI base — JS/Python/Rust read choices[0]
        expect(body.object).toBe('chat.completion');
        const choice = (body.choices as Array<Record<string, unknown>>)[0];
        expect((choice.message as Record<string, unknown>).content).toBe('Hello there!');
        expect(choice.finish_reason).toBe('stop');

        // Legacy extras — PHP reads ONLY top-level content; Python/PHP/Rust
        // read cost_usd + provider; toolCalls must be null (not absent).
        expect(body.content).toBe('Hello there!');
        expect(body.provider).toBe('openai');
        expect(body.model).toBe('gpt-4o');
        expect(body.cost_usd).toBe(0.0011);
        expect(body.finish_reason).toBe('stop');
        expect(body.toolCalls).toBeNull();
        expect((body.usage as Record<string, unknown>).total_tokens).toBe(15);
    });

    it('carries both toolCalls spellings when tools fire', async () => {
        const tc = { id: 'call_1', type: 'function', function: { name: 'f', arguments: '{}' } };
        mockExecuteGatewayChat.mockResolvedValue(chatResult({ toolCalls: [tc], finishReason: 'tool_calls' }));

        const result = await runV1ProviderExecution(baseParams());
        if (!result.ok) throw new Error('expected ok');
        const body = (await result.response.json()) as Record<string, unknown>;

        expect(body.toolCalls).toEqual([tc]);      // camel: Python/PHP/Rust
        expect(body.tool_calls).toEqual([tc]);     // snake: Vercel provider
        const choice = (body.choices as Array<Record<string, unknown>>)[0];
        expect((choice.message as Record<string, unknown>).tool_calls).toEqual([tc]);
    });

    it('adds fallback trio when failover fired', async () => {
        mockExecuteGatewayChat.mockResolvedValue(chatResult({
            usedFallback: true,
            originalProvider: 'anthropic',
            originalModel: 'claude-sonnet-4',
        }));

        const result = await runV1ProviderExecution(baseParams());
        if (!result.ok) throw new Error('expected ok');
        const body = (await result.response.json()) as Record<string, unknown>;
        expect(body.fallback_used).toBe(true);
        expect(body.original_provider).toBe('anthropic');
        expect(body.original_model).toBe('claude-sonnet-4');
    });

    it('enforceMaxTokens slices oversized non-stream content', async () => {
        mockExecuteGatewayChat.mockResolvedValue(chatResult({ content: 'x'.repeat(4000) }));

        const result = await runV1ProviderExecution(
            baseParams({ enforceMaxTokens: true, maxTokens: 10 })
        );
        if (!result.ok) throw new Error('expected ok');
        const body = (await result.response.json()) as Record<string, unknown>;
        expect((body.content as string).length).toBe(40); // maxTokens * 4
    });

    it('openai mode is unchanged: no legacy extras', async () => {
        mockExecuteGatewayChat.mockResolvedValue(chatResult());

        const result = await runV1ProviderExecution(baseParams({ wireFormat: undefined }));
        if (!result.ok) throw new Error('expected ok');
        const body = (await result.response.json()) as Record<string, unknown>;
        expect(body.content).toBeUndefined();
        expect(body.cost_usd).toBeUndefined();
        expect(body.provider).toBeUndefined();
        expect(body.toolCalls).toBeUndefined();
    });
});

describe('cencori wire format — stream', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (runGatewayOutputGuard as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
        mockResolveGatewayProvider.mockResolvedValue({
            providerName: 'openai',
            model: 'gpt-4o',
            provider: mockProvider,
            router: {},
        });
    });

    function streamChunks(chunks: Array<Record<string, unknown>>) {
        mockStreamGatewayChat.mockReturnValue(
            (async function* () {
                for (const c of chunks) {
                    yield {
                        actualProvider: 'openai',
                        actualModel: 'gpt-4o',
                        usedFallback: false,
                        originalProvider: 'openai',
                        originalModel: 'gpt-4o',
                        ...c,
                    };
                }
            })()
        );
    }

    it('guards short content, then emits metrics and [DONE]', async () => {
        streamChunks([
            { delta: 'Hel' },
            { delta: 'lo' },
            { delta: '', finishReason: 'stop' },
        ]);

        const result = await runV1ProviderExecution(baseParams({ stream: true }));
        if (!result.ok) throw new Error('expected ok');

        expect(result.response.headers.get('Content-Type')).toBe('text/event-stream');
        expect(result.response.headers.get('Cache-Control')).toBe('no-cache, no-transform');
        expect(result.response.headers.get('Connection')).toBe('keep-alive');
        expect(result.response.headers.get('X-Accel-Buffering')).toBe('no');

        const { chunks, sawDone } = await readSSE(result.response);
        expect(sawDone).toBe(true);

        const c = chunks as Array<Record<string, unknown>>;
        // Content chunks: delta is a STRING (legacy), not {content}
        expect(c[0].delta).toBe('Hello');
        expect(c.some((chunk) => chunk.finish_reason === 'stop')).toBe(true);
        // NEW terminal metrics chunk (playground reads these)
        const metrics = c.find((chunk) => chunk.usage !== undefined)!;
        expect(metrics.usage).toBeDefined();
        expect((metrics.usage as Record<string, unknown>).total_tokens).toBeGreaterThan(0);
        expect(typeof metrics.cost_usd).toBe('number');
    });

    it('progressively emits approved text while retaining a guarded tail', async () => {
        streamChunks([
            { delta: 'A'.repeat(400) },
            { delta: 'B'.repeat(100) },
            { delta: '', finishReason: 'stop' },
        ]);

        const result = await runV1ProviderExecution(baseParams({ stream: true }));
        if (!result.ok) throw new Error('expected ok');
        const { chunks, sawDone } = await readSSE(result.response);
        const c = chunks as Array<Record<string, unknown>>;
        const contentChunks = c.filter((chunk) => typeof chunk.delta === 'string' && chunk.delta);

        expect(sawDone).toBe(true);
        expect(contentChunks.length).toBeGreaterThan(1);
        expect(contentChunks.map((chunk) => chunk.delta).join('')).toBe(
            'A'.repeat(400) + 'B'.repeat(100)
        );
        expect(runGatewayOutputGuard).toHaveBeenCalledTimes(3);
    });

    it('progressively emits OpenAI-compatible content chunks', async () => {
        streamChunks([
            { delta: 'A'.repeat(400) },
            { delta: '', finishReason: 'stop' },
        ]);

        const result = await runV1ProviderExecution(
            baseParams({ stream: true, wireFormat: undefined })
        );
        if (!result.ok) throw new Error('expected ok');
        const { chunks, sawDone } = await readSSE(result.response);
        const c = chunks as Array<{
            choices?: Array<{
                delta?: { content?: string };
                finish_reason?: string | null;
            }>;
        }>;
        const contentChunks = c
            .map((chunk) => chunk.choices?.[0]?.delta?.content)
            .filter((content): content is string => Boolean(content));

        expect(sawDone).toBe(true);
        expect(contentChunks.length).toBeGreaterThan(1);
        expect(contentChunks.join('')).toBe('A'.repeat(400));
        expect(c.some((chunk) => chunk.choices?.[0]?.finish_reason === 'stop')).toBe(true);
    });

    it('adds fallback metadata on the first content chunk only', async () => {
        streamChunks([
            { delta: 'A', usedFallback: true, originalProvider: 'anthropic', originalModel: 'claude-sonnet-4' },
            { delta: 'B', usedFallback: true, originalProvider: 'anthropic', originalModel: 'claude-sonnet-4' },
            { delta: '', finishReason: 'stop', usedFallback: true },
        ]);

        const result = await runV1ProviderExecution(baseParams({ stream: true }));
        if (!result.ok) throw new Error('expected ok');
        const { chunks } = await readSSE(result.response);
        const c = chunks as Array<Record<string, unknown>>;

        expect(c[0].fallback_used).toBe(true);
        expect(c[0].original_provider).toBe('anthropic');
        expect(c[0].original_model).toBe('claude-sonnet-4');
        expect(c.slice(1).every((chunk) => chunk.fallback_used === undefined)).toBe(true);
    });

    it('emits both tool-call spellings in stream chunks', async () => {
        const tc = { id: 'call_1', type: 'function', function: { name: 'f', arguments: '{}' } };
        streamChunks([
            { delta: '', toolCalls: [tc] },
            { delta: '', finishReason: 'tool_calls', toolCalls: undefined },
        ]);

        const result = await runV1ProviderExecution(baseParams({ stream: true }));
        if (!result.ok) throw new Error('expected ok');
        const { chunks } = await readSSE(result.response);
        const c = chunks as Array<Record<string, unknown>>;

        expect(c[0].tool_calls).toEqual([tc]);  // snake: Vercel/TanStack
        expect(c[0].toolCalls).toEqual([tc]);   // camel: Python/PHP/Rust
    });

    it('cuts off with finish_reason "length" when enforceMaxTokens trips', async () => {
        streamChunks([
            { delta: 'x'.repeat(100) },
            { delta: 'y'.repeat(100) },
            { delta: '', finishReason: 'stop' },
        ]);

        const result = await runV1ProviderExecution(
            baseParams({ stream: true, enforceMaxTokens: true, maxTokens: 25 })
        );
        if (!result.ok) throw new Error('expected ok');
        const { chunks, sawDone } = await readSSE(result.response);
        const c = chunks as Array<Record<string, unknown>>;

        expect(sawDone).toBe(true);
        const lengthChunk = c.find((ch) => ch.finish_reason === 'length');
        expect(lengthChunk).toBeDefined();
        // Stream terminated early: no 'stop' chunk after the cutoff
        expect(c.some((ch) => ch.finish_reason === 'stop')).toBe(false);
    });

    it('mid-stream output block emits {error} and closes WITHOUT [DONE]', async () => {
        (runGatewayOutputGuard as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
                ok: false,
                status: 403,
                code: 'output_security_violation',
                message: 'Response blocked',
                reasons: ['pii_leak'],
            });
        streamChunks([
            { delta: 'fine' },
            { delta: 'SENSITIVE' },
            { delta: '', finishReason: 'stop' },
        ]);

        const result = await runV1ProviderExecution(baseParams({ stream: true }));
        if (!result.ok) throw new Error('expected ok');
        const { chunks, sawDone } = await readSSE(result.response);
        const c = chunks as Array<Record<string, unknown>>;

        expect(sawDone).toBe(false); // legacy: no [DONE] after error
        expect(c.some((ch) => ch.error === 'Response blocked')).toBe(true);
    });

    it('does not release sensitive content split across provider chunks', async () => {
        (runGatewayOutputGuard as ReturnType<typeof vi.fn>).mockImplementation(
            async ({ outputText }: { outputText: string }) =>
                outputText.includes('123-45-6789')
                    ? {
                        ok: false,
                        status: 403,
                        code: 'output_security_violation',
                        message: 'Response blocked',
                        reasons: ['pii_leak'],
                    }
                    : { ok: true }
        );
        streamChunks([
            { delta: 'S'.repeat(400) },
            { delta: '123-' },
            { delta: '45-6789' },
            { delta: '', finishReason: 'stop' },
        ]);

        const result = await runV1ProviderExecution(baseParams({ stream: true }));
        if (!result.ok) throw new Error('expected ok');
        const { chunks, sawDone, raw } = await readSSE(result.response);
        const c = chunks as Array<Record<string, unknown>>;

        expect(sawDone).toBe(false);
        expect(raw).not.toContain('123-45-6789');
        expect(c.some((chunk) => chunk.error === 'Response blocked')).toBe(true);
        expect(c.filter((chunk) => typeof chunk.delta === 'string' && chunk.delta)
            .map((chunk) => chunk.delta).join('')).toBe('S'.repeat(144));
    });

    it('openai mode still emits [DONE] after an output block (unchanged)', async () => {
        (runGatewayOutputGuard as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: false,
            status: 403,
            code: 'output_security_violation',
            message: 'Response blocked',
        });
        streamChunks([{ delta: 'bad' }]);

        const result = await runV1ProviderExecution(
            baseParams({ stream: true, wireFormat: undefined })
        );
        if (!result.ok) throw new Error('expected ok');
        const { sawDone } = await readSSE(result.response);
        expect(sawDone).toBe(true);
    });
});
