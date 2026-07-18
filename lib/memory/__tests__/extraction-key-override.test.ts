/**
 * @vitest-environment node
 *
 * Extraction key isolation: managed Gemini extraction must run on the
 * memory-dedicated key (MEMORY_GEMINI_API_KEY) via googleApiKeyOverride so it
 * shares memory's isolated quota, not general chat's. When no memory Google key
 * resolves, the override is undefined and the executor resolves normally.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    executeGatewayChat: vi.fn(),
    getMemoryGoogleApiKey: vi.fn(),
}));

vi.mock('@/lib/gateway/chat-executor', () => ({
    executeGatewayChat: (...a: unknown[]) => mocks.executeGatewayChat(...a),
}));

vi.mock('@/lib/providers/google-env', () => ({
    getMemoryGoogleApiKey: (...a: unknown[]) => mocks.getMemoryGoogleApiKey(...a),
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

describe('extractFacts key isolation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.executeGatewayChat.mockResolvedValue({
            content: '[{"fact":"The user uses Rust","importance":0.7}]',
            actualModel: 'gemini-2.5-flash',
            cost: { cencoriChargeUsd: 0 },
        });
    });

    it('passes the memory-dedicated key as googleApiKeyOverride', async () => {
        mocks.getMemoryGoogleApiKey.mockReturnValue('memory-only-key');

        const res = await extractFacts(baseParams);

        expect(res.facts).toEqual([{ content: 'The user uses Rust', importance: 0.7 }]);
        expect(mocks.executeGatewayChat).toHaveBeenCalledTimes(1);
        const arg = mocks.executeGatewayChat.mock.calls[0][0] as { googleApiKeyOverride?: string };
        expect(arg.googleApiKeyOverride).toBe('memory-only-key');
    });

    it('passes undefined override when no memory Google key resolves', async () => {
        mocks.getMemoryGoogleApiKey.mockReturnValue(null);

        await extractFacts(baseParams);

        const arg = mocks.executeGatewayChat.mock.calls[0][0] as { googleApiKeyOverride?: string };
        expect(arg.googleApiKeyOverride).toBeUndefined();
    });
});
