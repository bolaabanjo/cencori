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

    // Centair ships under a codename while the partner lab stays anonymous;
    // MODEL_ALIASES rewrites it to the id their endpoint actually serves.
    // Everything else in the free tier must pass through unchanged.
    const ALIASED_FREE_MODELS = new Set(['centaur']);

    // B.AI models are branded under deepseek/zai but routed through bai
    // (MODEL_PROVIDER_OVERRIDES in router.ts). Their catalog entries under
    // deepseek/zai are for UI branding; the free check must accept bai routing.
    const BAI_ROUTED_MODELS = new Set(['deepseek-v4-flash', 'deepseek-v4-flash-vision-exp', 'glm-5.3-flash']);

    it('routes every advertised free model to the provider that serves it', () => {
        expect(freeModels.length).toBeGreaterThan(0);
        for (const [providerId, modelId] of freeModels) {
            if (BAI_ROUTED_MODELS.has(modelId) && (providerId === 'deepseek' || providerId === 'zai')) {
                expect(router.detectProvider(modelId), `detectProvider(${modelId})`).toBe('bai');
            } else {
                expect(router.detectProvider(modelId), `detectProvider(${modelId})`).toBe(providerId);
            }
            if (ALIASED_FREE_MODELS.has(modelId)) continue;
            expect(
                router.normalizeModelName(modelId, providerId),
                `normalizeModelName(${modelId}) must reach the provider unchanged`
            ).toBe(modelId);
            expect(isExplicitlyFree(providerId, modelId), `${modelId} must bypass pricing`).toBe(true);
        }
    });

    it('rewrites the centaur codename to its upstream id and keeps both free', () => {
        expect(router.detectProvider('centaur')).toBe('centaur');
        expect(router.normalizeModelName('centaur', 'centaur')).toBe('julian-origin');
        expect(isExplicitlyFree('centaur', 'centaur')).toBe(true);
        expect(isExplicitlyFree('centaur', 'julian-origin')).toBe(true);
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
