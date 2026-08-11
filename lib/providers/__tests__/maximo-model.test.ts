import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getModelsForProvider } from '../config';
import { ProviderRouter } from '../router';

describe('Maximo Atlas catalog', () => {
    it('advertises Atlas 1.1 and removes the preview model', () => {
        const modelIds = getModelsForProvider('maximo').map((model) => model.id);

        expect(modelIds).toContain('maximo-atlas-1.1');
        expect(modelIds).not.toContain('maximo-atlas-preview');
    });

    it('routes Atlas 1.1 to Maximo', () => {
        const router = new ProviderRouter();

        expect(router.detectProvider('maximo-atlas-1.1')).toBe('maximo');
        expect(() => router.detectProvider('maximo-atlas-preview')).toThrow(
            "Cannot determine a provider for model 'maximo-atlas-preview'",
        );
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
