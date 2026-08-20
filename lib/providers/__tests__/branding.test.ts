import { describe, expect, it } from 'vitest';
import { SUPPORTED_PROVIDERS } from '../config';
import {
    CENCORI_PROVIDER_DISPLAY_NAME,
    CENCORI_PROVIDER_LABEL,
    publicFailureMessage,
    publicProviderDisplayName,
    publicProviderLabel,
} from '../branding';
import { RateLimitError, ServiceUnavailableError } from '../errors';
import { mapProviderErrorToHttpResponse } from '@/lib/gateway-reliability';

const FREE_MODEL = 'nvidia/nemotron-nano-12b-v2-vl:free';
const FREE_PROVIDER = 'openrouter';

describe('public provider identity', () => {
    it('names Cencori as the provider of every free-tier model', () => {
        const free = SUPPORTED_PROVIDERS.flatMap(p =>
            p.models.filter(m => m.free).map(m => [p.id, m.id] as const)
        );
        expect(free.length).toBeGreaterThan(0);
        for (const [providerId, modelId] of free) {
            expect(publicProviderLabel(providerId, modelId), modelId).toBe(CENCORI_PROVIDER_LABEL);
        }
    });

    it('leaves paid models attributed to their real vendor', () => {
        expect(publicProviderLabel('openai', 'gpt-5')).toBe('openai');
        expect(publicProviderLabel('anthropic', 'claude-opus-5')).toBe('anthropic');
        // The paid twin of a free listing must not inherit the branding.
        expect(publicProviderLabel('groq', 'openai/gpt-oss-20b')).toBe('groq');
    });

    it('reports cencori on an error for a free model', () => {
        const failure = mapProviderErrorToHttpResponse(
            new RateLimitError(FREE_PROVIDER), undefined, FREE_MODEL
        );
        expect(failure.provider).toBe(CENCORI_PROVIDER_LABEL);
        expect(failure.status).toBe(429);
        expect(JSON.stringify(failure)).not.toContain(FREE_PROVIDER);
    });

    it('still reports the real provider on an error for a paid model', () => {
        const failure = mapProviderErrorToHttpResponse(
            new ServiceUnavailableError('anthropic'), undefined, 'claude-opus-5'
        );
        expect(failure.provider).toBe('anthropic');
    });

    it('scrubs the failover aggregate for a free model but keeps it for paid', () => {
        const aggregate =
            'All providers exhausted. Primary (openrouter): [openrouter] 429. '
            + 'Fallback attempts: [anthropic: credit balance is too low]';

        const scrubbed = publicFailureMessage(aggregate, FREE_PROVIDER, FREE_MODEL);
        expect(scrubbed).not.toContain('openrouter');
        expect(scrubbed).not.toContain('anthropic');
        expect(scrubbed).not.toContain('credit balance');

        expect(publicFailureMessage(aggregate, 'openai', 'gpt-5')).toBe(aggregate);
    });

    it('shows Cencori as the display name for every free model, and never a vendor', () => {
        // The console catalog and playground both build their provider column
        // from these two helpers. A vendor name surfacing here is the leak the
        // /v1/models branding was meant to close.
        for (const provider of SUPPORTED_PROVIDERS) {
            for (const model of provider.models) {
                if (!model.free) continue;
                expect(
                    publicProviderDisplayName(provider.id, provider.name, model.id),
                    `${provider.id}/${model.id}`
                ).toBe(CENCORI_PROVIDER_DISPLAY_NAME);
            }
        }
    });

    it('keeps a provider visible for its paid models even when some are free', () => {
        // Groq and OpenRouter each serve both tiers. Branding the free half must
        // not evict them from the catalog's provider filter.
        const stillListed = SUPPORTED_PROVIDERS.filter(p =>
            p.models.some(m => publicProviderLabel(p.id, m.id) === p.id)
        ).map(p => p.id);
        expect(stillListed).toContain('openrouter');
        expect(stillListed).toContain('groq');
    });

    it('does not advertise a free model under a name that leaks its origin', () => {
        const vendors = ['openrouter', 'open router', 'via openrouter'];
        for (const provider of SUPPORTED_PROVIDERS) {
            for (const model of provider.models) {
                if (!model.free) continue;
                const text = `${model.name} ${model.description ?? ''}`.toLowerCase();
                for (const vendor of vendors) {
                    expect(text, `${model.id} name/description`).not.toContain(vendor);
                }
            }
        }
    });
});
