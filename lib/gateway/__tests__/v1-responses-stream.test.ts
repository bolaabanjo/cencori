/**
 * @vitest-environment node
 *
 * Streaming contract for /v1/responses.
 *
 * This endpoint used to accumulate the whole answer and emit it as a single
 * `response.output_text.delta` after the provider finished, so a client's
 * time-to-first-token equalled full generation time — measured against the live
 * gateway, every model returned exactly one delta here while the same model
 * streamed 10–19 frames on /v1/chat/completions. These tests pin the incremental
 * release, and pin that it did not cost the output guard its veto.
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

vi.mock('@/lib/supabaseAdmin', () => ({ createAdminClient: vi.fn() }));

import { runGatewayOutputGuard } from '@/lib/gateway/output-guard';
import { runV1ResponsesExecution } from '@/lib/gateway/v1-responses-execute';
import { STREAM_GUARD_HOLDBACK_CHARS } from '@/lib/gateway/stream-guard';
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
    return {
        supabase: {} as never,
        gatewayCtx: createMockGatewayContext(),
        model: 'gpt-4o',
        body: { model: 'gpt-4o', input: 'Hello', stream: true },
        messages: toUnifiedMessages([{ role: 'user', content: 'Hello' }]),
        inputText: 'Hello',
        inputSecurity,
        endUserId: null,
        endUserQuota: null,
        tier: 'free' as const,
        recordEndUserUsage: vi.fn(),
        logSuccess: vi.fn(),
        incrementUsage: vi.fn(),
        ...overrides,
    } as never;
}

function chunk(overrides: Record<string, unknown> = {}) {
    return {
        actualProvider: 'openai',
        actualModel: 'gpt-4o',
        usedFallback: false,
        originalProvider: 'openai',
        originalModel: 'gpt-4o',
        billingMode: 'standard',
        delta: '',
        ...overrides,
    };
}

/** Feeds chunks on demand so a test can read the response before the stream finishes. */
function controllableStream() {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    mockStreamGatewayChat.mockImplementation(() =>
        (async function* () {
            // Comfortably past the holdback so a release is due.
            yield chunk({ delta: 'A'.repeat(STREAM_GUARD_HOLDBACK_CHARS + 40) });
            await gate;
            yield chunk({ delta: 'TAIL', finishReason: 'stop' });
        })()
    );
    return { finish: () => release?.() };
}

/** The wire shape is `event: <type>\ndata: <json>\n\n`, so the type is a line, not a JSON field. */
const DELTA_EVENT = /event: response\.output_text\.delta\ndata: (\{[^\n]*\})/g;

function deltasIn(text: string): string[] {
    return [...text.matchAll(new RegExp(DELTA_EVENT.source, 'g'))].map((m) => m[1]);
}

function joinedDeltaText(text: string): string {
    return deltasIn(text)
        .map((json) => (JSON.parse(json) as { delta?: string }).delta ?? '')
        .join('');
}

beforeEach(() => {
    vi.clearAllMocks();
    (runGatewayOutputGuard as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    mockResolveGatewayProvider.mockResolvedValue({
        providerName: 'openai',
        router: { hasProvider: () => true, getProvider: () => mockProvider },
        provider: mockProvider,
    });
});

describe('/v1/responses streaming', () => {
    it('releases text before the provider has finished', async () => {
        const { finish } = controllableStream();

        const result = await runV1ResponsesExecution(baseParams());
        if (!result.ok) throw new Error('expected ok');
        const reader = result.response.body!.getReader();

        // The decisive assertion: a delta is readable while the generator is still
        // parked, so the client is not waiting on the full answer.
        const first = new TextDecoder().decode((await reader.read()).value);
        expect(deltasIn(first).length).toBeGreaterThan(0);
        expect(first).toContain('AAAA');
        expect(first).not.toContain('TAIL');

        finish();
        while (!(await reader.read()).done) {
            // Drain so settlement completes.
        }
    });

    it('holds back the trailing boundary until completion', async () => {
        const { finish } = controllableStream();

        const result = await runV1ResponsesExecution(baseParams());
        if (!result.ok) throw new Error('expected ok');
        const reader = result.response.body!.getReader();
        const first = new TextDecoder().decode((await reader.read()).value);

        // The scanner needs a rolling suffix to inspect, so the last characters stay held.
        const released = joinedDeltaText(first);
        expect(released.length).toBeGreaterThan(0);
        expect(released.length).toBeLessThan(STREAM_GUARD_HOLDBACK_CHARS + 40);

        finish();
        let rest = '';
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            rest += new TextDecoder().decode(value);
        }
        // Everything owed arrives by the end, exactly once.
        expect(rest).toContain('TAIL');
    });

    it('sends each character exactly once across all deltas', async () => {
        mockStreamGatewayChat.mockImplementation(() =>
            (async function* () {
                yield chunk({ delta: 'B'.repeat(60) });
                yield chunk({ delta: 'C'.repeat(60) });
                yield chunk({ delta: '', finishReason: 'stop' });
            })()
        );

        const result = await runV1ResponsesExecution(baseParams());
        if (!result.ok) throw new Error('expected ok');
        const body = await new Response(result.response.body).text();

        expect(joinedDeltaText(body)).toBe('B'.repeat(60) + 'C'.repeat(60));
        expect(body).toContain('event: response.output_text.done');
    });

    /** The whole point of the holdback: incremental release must not cost the guard its veto. */
    it('stops releasing once the guard rejects the output', async () => {
        (runGatewayOutputGuard as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: false,
            status: 403,
            code: 'output_security_violation',
            message: 'Response blocked',
        });
        mockStreamGatewayChat.mockImplementation(() =>
            (async function* () {
                yield chunk({ delta: 'SECRET'.repeat(20) });
                yield chunk({ delta: '', finishReason: 'stop' });
            })()
        );

        const result = await runV1ResponsesExecution(baseParams());
        if (!result.ok) throw new Error('expected ok');
        const body = await new Response(result.response.body).text();

        expect(deltasIn(body)).toHaveLength(0);
        expect(body).not.toContain('SECRET');
        expect(body).toContain('output_security_violation');
    });

    it('marks the stream no-transform so an intermediary cannot re-buffer it', async () => {
        mockStreamGatewayChat.mockImplementation(() =>
            (async function* () {
                yield chunk({ delta: 'hi', finishReason: 'stop' });
            })()
        );

        const result = await runV1ResponsesExecution(baseParams());
        if (!result.ok) throw new Error('expected ok');

        expect(result.response.headers.get('X-Accel-Buffering')).toBe('no');
        expect(result.response.headers.get('Cache-Control')).toContain('no-transform');
        await new Response(result.response.body).text();
    });
});
