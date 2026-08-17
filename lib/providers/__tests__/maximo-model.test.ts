import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getModelsForProvider } from '../config';
import { ProviderRouter } from '../router';
import { resolveApiKeyModelAccess } from '@/lib/gateway/model-access';

describe('Maximo Atlas catalog', () => {
    it('advertises Atlas 1.2 and 1.1 and removes the preview model', () => {
        const modelIds = getModelsForProvider('maximo').map((model) => model.id);

        expect(modelIds).toContain('maximo-atlas-1.2');
        expect(modelIds).toContain('maximo-atlas-1.1');
        expect(modelIds).not.toContain('maximo-atlas-preview');
    });

    it('advertises the context window Maximo actually reports', () => {
        // Both Atlas versions report context_length 1_000_000 from
        // GET https://api.maximoai.co/v1/models. 1.1 sat at 262_000 here for a
        // release and a half, understating it by ~4x.
        for (const model of getModelsForProvider('maximo')) {
            expect(model.contextWindow).toBe(1_000_000);
        }
    });

    it('routes both Atlas versions to Maximo', () => {
        const router = new ProviderRouter();

        expect(router.detectProvider('maximo-atlas-1.2')).toBe('maximo');
        expect(router.detectProvider('maximo-atlas-1.1')).toBe('maximo');
        expect(() => router.detectProvider('maximo-atlas-preview')).toThrow(
            "Cannot determine a provider for model 'maximo-atlas-preview'",
        );
    });

    it('ships Atlas 1.2 generally available while 1.1 stays gated', () => {
        // The allowlist restriction is per model, not per line. A key with no
        // allowlist reaches 1.2 and is still refused 1.1.
        expect(resolveApiKeyModelAccess({
            provider: 'maximo',
            model: 'maximo-atlas-1.2',
        }).allowed).toBe(true);
        expect(resolveApiKeyModelAccess({
            provider: 'maximo',
            model: 'maximo-atlas-1.1',
        }).allowed).toBe(false);
    });

    it('prices Atlas 1.2 at the launch rate with the standard rate scheduled', () => {
        const migration = readFileSync(
            resolve(process.cwd(), 'supabase/migrations/20260817_120000_maximo_atlas_1_2.sql'),
            'utf8',
        );

        expect(migration).toContain("'maximo-atlas-1.2'");
        // Launch rate now, standard rate from the changeover — without the
        // next_* values an elapsed expiry fails closed instead of rolling over.
        expect(migration).toContain('0.00011000');
        expect(migration).toContain('0.00030000');
        expect(migration).toContain('2026-09-01T00:00:00Z');
        expect(migration).toContain('0.00055000');
        expect(migration).toContain('0.00150000');
    });

    it('deactivates preview pricing and activates Atlas 1.1 pricing', () => {
        const migration = readFileSync(
            resolve(process.cwd(), 'supabase/migrations/20260811_000000_maximo_atlas_1_1.sql'),
            'utf8',
        );

        expect(migration).toContain("model_name = 'maximo-atlas-preview'");
        expect(migration).toContain("'maximo-atlas-1.1'");
        expect(migration).toContain('is_active = false');
        expect(migration).toContain('is_active = true');
    });
});
