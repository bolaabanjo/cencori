import { describe, expect, it } from 'vitest';
import { ProviderRouter } from '../router';
import { getModelsForProvider } from '../config';

const router = new ProviderRouter();

function anthropicCatalogIds(): string[] {
    const models = getModelsForProvider('anthropic');
    if (models.length === 0) throw new Error('anthropic provider missing from catalog');
    return models.map((m) => m.id);
}

describe('Anthropic model IDs', () => {
    it('advertises only hyphenated IDs — Anthropic 404s the dotted form', () => {
        for (const id of anthropicCatalogIds()) {
            expect(id, `${id} uses a dotted version that Anthropic rejects`).not.toMatch(/\d\.\d/);
        }
    });

    it('routes every advertised model to the anthropic provider', () => {
        for (const id of anthropicCatalogIds()) {
            expect(router.detectProvider(id)).toBe('anthropic');
        }
    });

    it('leaves advertised IDs untouched by aliasing', () => {
        for (const id of anthropicCatalogIds()) {
            expect(router.normalizeModelName(id, 'anthropic')).toBe(id);
        }
    });

    it('rewrites the legacy dotted IDs we used to advertise', () => {
        // Existing projects still send these; a customer hit the 503 on the first.
        const legacy: Record<string, string> = {
            'claude-haiku-4.5': 'claude-haiku-4-5',
            'claude-sonnet-4.5': 'claude-sonnet-4-5',
            'claude-opus-4.5': 'claude-opus-4-5',
            'claude-sonnet-4.6': 'claude-sonnet-4-6',
            'claude-opus-4.6': 'claude-opus-4-6',
            'claude-opus-4.7': 'claude-opus-4-7',
            'claude-opus-4.8': 'claude-opus-4-8',
        };
        for (const [dotted, hyphenated] of Object.entries(legacy)) {
            expect(router.normalizeModelName(dotted, 'anthropic')).toBe(hyphenated);
        }
    });

    it('drops the models Anthropic has retired', () => {
        const retired = [
            'claude-opus-4',
            'claude-sonnet-4',
            'claude-3-7-sonnet',
            'claude-3-5-sonnet-20241022',
            'claude-3-5-haiku-20241022',
        ];
        const advertised = anthropicCatalogIds();
        for (const id of retired) {
            expect(advertised, `${id} is retired at Anthropic`).not.toContain(id);
        }
    });
});
