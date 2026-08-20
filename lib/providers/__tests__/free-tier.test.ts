import { describe, expect, it } from 'vitest';
import { SUPPORTED_PROVIDERS } from '../config';
import { isExplicitlyFree } from '../pricing';
import { ProviderRouter } from '../router';

/**
 * The free tier has broken twice by shipping ids the router mishandles rather
 * than ids the provider rejects: Groq's Llama models were decommissioned, and
 * Cerebras kept 402-ing while still advertised as free. Routing is the half no
 * other test covers — pricing-catalog.test.ts checks that a `free: true` model
 * costs zero, not that a request for it reaches the provider that serves it.
 */
describe('free model tier', () => {
    const router = new ProviderRouter();
    const freeModels = SUPPORTED_PROVIDERS.flatMap(provider =>
        provider.models.filter(model => model.free).map(model => [provider.id, model.id] as const)
    );

    it('routes every advertised free model to the provider that serves it', () => {
        expect(freeModels.length).toBeGreaterThan(0);
        for (const [providerId, modelId] of freeModels) {
            expect(router.detectProvider(modelId), `detectProvider(${modelId})`).toBe(providerId);
            expect(
                router.normalizeModelName(modelId, providerId),
                `normalizeModelName(${modelId}) must reach the provider unchanged`
            ).toBe(modelId);
            expect(isExplicitlyFree(providerId, modelId), `${modelId} must bypass pricing`).toBe(true);
        }
    });

    it('sends `:free` ids to OpenRouter rather than the vendor in their prefix', () => {
        // Without the `:free` rule these split on "/" and route by vendor
        // prefix: `nvidia` is not a registered provider at all, and
        // `openai/gpt-oss-20b:free` would bill the paid OpenAI account for a
        // model that is free on OpenRouter.
        expect(router.detectProvider('openai/gpt-oss-20b:free')).toBe('openrouter');
        expect(router.detectProvider('nvidia/nemotron-nano-9b-v2:free')).toBe('openrouter');
        expect(router.detectProvider('poolside/laguna-s-2.1:free')).toBe('openrouter');

        // The unsuffixed twin is a different, paid listing that Groq serves.
        expect(router.detectProvider('openai/gpt-oss-20b')).toBe('groq');
    });

    it('does not advertise the unfunded Cerebras account as free', () => {
        expect(isExplicitlyFree('cerebras', 'gpt-oss-120b')).toBe(false);
        expect(isExplicitlyFree('cerebras', 'zai-glm-4.7')).toBe(false);
    });
});
