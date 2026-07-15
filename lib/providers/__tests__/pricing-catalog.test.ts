import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_PROVIDERS } from '../config';
import { getPricingFromDB, hasStaticPricing } from '../pricing';

const migration = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260715_090000_reviewed_model_pricing.sql'),
    'utf8'
);

const activeRows = [...migration.matchAll(
    /\('([^']+)', '([^']+)',\s*[0-9.]+,\s*[0-9.]+,\s*[0-9.]+,\s*true,/g
)].map(match => ({ provider: match[1], model: match[2] }));

const serviceOnlyModels = new Set([
    'openai:text-embedding-3-small',
    'openai:text-embedding-3-large',
    'openai:text-embedding-ada-002',
    'openai:tts-1',
    'openai:tts-1-hd',
    'openai:whisper-1',
    'google:gemini-embedding-001',
]);

describe('reviewed managed pricing catalog', () => {
    it('contains no duplicate active provider/model rows', () => {
        const keys = activeRows.map(row => `${row.provider}:${row.model}`);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('maps every active chat row to an advertised provider catalog entry', () => {
        const catalog = new Set(SUPPORTED_PROVIDERS.flatMap(provider =>
            provider.models.map(model => `${provider.id}:${model.id}`)
        ));
        const missing = activeRows
            .map(row => `${row.provider}:${row.model}`)
            .filter(key => !catalog.has(key) && !serviceOnlyModels.has(key));

        expect(missing).toEqual([]);
    });

    it('keeps variable-price Groq Compound systems inactive', () => {
        const active = new Set(activeRows.map(row => `${row.provider}:${row.model}`));
        expect(active.has('groq:groq/compound')).toBe(false);
        expect(active.has('groq:groq/compound-mini')).toBe(false);
    });

    it('keeps every model tagged free on zero-price static pricing', async () => {
        const freeModels = SUPPORTED_PROVIDERS.flatMap(provider =>
            provider.models
                .filter(model => model.free)
                .map(model => [provider.id, model.id] as const)
        );

        expect(freeModels.length).toBeGreaterThan(0);
        for (const [provider, model] of freeModels) {
            expect(hasStaticPricing(provider, model)).toBe(true);
            await expect(getPricingFromDB(provider, model)).resolves.toEqual({
                inputPer1KTokens: 0,
                outputPer1KTokens: 0,
                cencoriMarkupPercentage: 0,
            });
        }
    });

    it('records provenance and an expiry for the Sonnet 5 promotion', () => {
        expect(migration).toContain('pricing_source_url');
        expect(migration).toContain('pricing_reviewed_at');
        expect(migration).toContain("'2026-09-01T00:00:00Z'");
    });
});
