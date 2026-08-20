/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
    ALL_MODELS_GRANT,
    applyResponseBillingMode,
    calculateGatewayCharge,
    isFullySponsoredApiKey,
    resolveApiKeyModelAccess,
} from '@/lib/gateway/model-access';

const atlas = 'maximo:maximo-atlas-1.1';

describe('API-key model access and sponsorship', () => {
    it('keeps ordinary models available to ordinary keys', () => {
        expect(resolveApiKeyModelAccess({
            allowedModels: null,
            sponsoredModels: null,
            provider: 'openai',
            model: 'gpt-5',
        })).toEqual({ allowed: true, billingMode: 'standard' });
    });

    it('denies restricted Atlas access without an explicit key grant', () => {
        expect(resolveApiKeyModelAccess({
            allowedModels: null,
            sponsoredModels: null,
            provider: 'maximo',
            model: 'maximo-atlas-1.1',
        })).toEqual({ allowed: false, billingMode: 'standard' });
    });

    it('does not treat sponsorship metadata as an access grant', () => {
        expect(resolveApiKeyModelAccess({
            allowedModels: null,
            sponsoredModels: [atlas],
            provider: 'maximo',
            model: 'maximo-atlas-1.1',
        })).toEqual({ allowed: false, billingMode: 'standard' });
    });

    it('gives the locked Basecode key sponsored Atlas-only access', () => {
        const access = { allowedModels: [atlas], sponsoredModels: [atlas] };

        expect(resolveApiKeyModelAccess({
            ...access,
            provider: 'maximo',
            model: 'maximo-atlas-1.1',
        })).toEqual({ allowed: true, billingMode: 'sponsored' });
        expect(resolveApiKeyModelAccess({
            ...access,
            provider: 'openai',
            model: 'gpt-5',
        }).allowed).toBe(false);
        expect(isFullySponsoredApiKey(access.allowedModels, access.sponsoredModels)).toBe(true);
    });

    it('lets a scoped key reach the free catalog without widening its paid access', () => {
        const access = { allowedModels: [atlas], sponsoredModels: [atlas] };

        expect(resolveApiKeyModelAccess({
            ...access,
            provider: 'openrouter',
            model: 'poolside/laguna-s-2.1:free',
        })).toEqual({ allowed: true, billingMode: 'standard' });
        expect(resolveApiKeyModelAccess({
            ...access,
            provider: 'groq',
            model: 'groq/compound',
        }).allowed).toBe(true);
        expect(resolveApiKeyModelAccess({
            ...access,
            provider: 'anthropic',
            model: 'claude-opus-5',
        }).allowed).toBe(false);
    });

    it('keeps an empty allowlist fully closed, free models included', () => {
        const access = { allowedModels: [], sponsoredModels: null };

        expect(resolveApiKeyModelAccess({
            ...access,
            provider: 'openrouter',
            model: 'poolside/laguna-s-2.1:free',
        }).allowed).toBe(false);
        expect(resolveApiKeyModelAccess({
            ...access,
            provider: 'maximo',
            model: 'maximo-atlas-1.1',
        }).allowed).toBe(false);
    });

    it('lets a first-party product key reach every model without sponsoring every model', () => {
        const access = {
            allowedModels: [ALL_MODELS_GRANT],
            sponsoredModels: [atlas],
        };

        expect(resolveApiKeyModelAccess({
            ...access,
            provider: 'maximo',
            model: 'maximo-atlas-1.1',
        })).toEqual({ allowed: true, billingMode: 'sponsored' });
        expect(resolveApiKeyModelAccess({
            ...access,
            provider: 'anthropic',
            model: 'claude-opus-5',
        })).toEqual({ allowed: true, billingMode: 'standard' });
        expect(resolveApiKeyModelAccess({
            ...access,
            provider: 'cerebras',
            model: 'gpt-oss-120b',
        })).toEqual({ allowed: true, billingMode: 'standard' });
        expect(isFullySponsoredApiKey(
            access.allowedModels,
            access.sponsoredModels,
        )).toBe(false);
    });

    it('tracks provider cost while charging the sponsored key zero', () => {
        const charge = calculateGatewayCharge(0.75, {
            inputPer1KTokens: 0.0002,
            outputPer1KTokens: 0.001,
            cencoriMarkupPercentage: 50,
        }, 'sponsored');
        expect(charge).toEqual({ cencoriChargeUsd: 0, markupPercentage: 0 });

        const response = applyResponseBillingMode({
            content: 'ok',
            model: 'maximo-atlas-1.1',
            provider: 'maximo',
            usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
            cost: { providerCostUsd: 0.75, cencoriChargeUsd: 1.125, markupPercentage: 50 },
            latencyMs: 10,
        }, 'sponsored');
        expect(response.cost).toEqual({
            providerCostUsd: 0.75,
            cencoriChargeUsd: 0,
            markupPercentage: 0,
        });
    });
});
