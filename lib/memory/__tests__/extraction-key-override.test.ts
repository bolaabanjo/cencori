/**
 * @vitest-environment node
 *
 * Memory key isolation: the generative fan-out must run on DEDICATED memory keys
 * (MEMORY_GEMINI/GROQ/CEREBRAS) so memory never competes with chat traffic for
 * the shared managed quota. Extraction routes through callMemoryLlm →
 * executeGatewayChat, which receives the per-provider memory keys.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    executeGatewayChat: vi.fn(),
    getMemoryProviderKey: vi.fn(),
}));

vi.mock('@/lib/gateway/chat-executor', () => ({
    executeGatewayChat: (...a: unknown[]) => mocks.executeGatewayChat(...a),
}));

vi.mock('@/lib/providers/google-env', () => ({
    getMemoryProviderKey: (...a: unknown[]) => mocks.getMemoryProviderKey(...a),
}));

import { extractFacts } from '../extraction';

const baseParams = {
    supabase: {} as never,
    projectId: 'proj_1',
    organizationId: 'org_1',
    tier: 'free' as never,
    settings: {
        extractionModel: 'gemini-2.5-flash',
        extractionPrompt: 'extract facts',
        minImportance: 0.3,
        maxMemoriesPerExchange: 10,
    } as never,
    extractOverride: null,
    userText: 'I use Rust',
    assistantText: 'Nice',
};

describe('extractFacts memory-key isolation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.executeGatewayChat.mockResolvedValue({
            content: '[{"fact":"The user uses Rust","importance":0.7}]',
            actualModel: 'gemini-2.5-flash',
            actualProvider: 'google',
            cost: { cencoriChargeUsd: 0 },
        });
    });

    it('passes the dedicated per-provider memory keys through to the executor', async () => {
        mocks.getMemoryProviderKey.mockImplementation((p: string) =>
            ({ google: 'mem-google', groq: 'mem-groq', cerebras: 'mem-cerebras' } as Record<string, string>)[p]
        );

        const res = await extractFacts(baseParams);

        expect(res.facts).toEqual([{ content: 'The user uses Rust', importance: 0.7 }]);
        const arg = mocks.executeGatewayChat.mock.calls[0][0] as { memoryProviderKeys?: Record<string, string> };
        expect(arg.memoryProviderKeys).toEqual({ google: 'mem-google', groq: 'mem-groq', cerebras: 'mem-cerebras' });
    });

    it('leaves keys undefined when no dedicated memory key is set (uses shared managed key)', async () => {
        mocks.getMemoryProviderKey.mockReturnValue(undefined);

        await extractFacts(baseParams);

        const arg = mocks.executeGatewayChat.mock.calls[0][0] as { memoryProviderKeys?: Record<string, string | undefined> };
        expect(arg.memoryProviderKeys).toEqual({ google: undefined, groq: undefined, cerebras: undefined });
    });
});
