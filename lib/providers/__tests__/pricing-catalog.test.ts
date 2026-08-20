import { readdirSync, readFileSync } from 'node:fs';
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

// TTS/STT rows bill per character or per minute, so their token columns are
// zero and they carry that note in the migration. The Voice routes pick these
// models per call, so the voice providers deliberately expose no `models` list
// in the chat catalog (see SUPPORTED_PROVIDERS). Derive them from the migration
// so shipping a new voice model does not require editing this test.
const unitPricedModels = new Set(
    [...migration.matchAll(
        /\('([^']+)', '([^']+)',[^\n]*token columns are intentionally zero/g
    )].map(match => `${match[1]}:${match[2]}`)
);

// A provider can decommission a model after we priced it. Later migrations
// retire those rows (is_active = false) rather than deleting them, so historical
// ai_requests rows still resolve the price that applied at the time. Collect
// every such retirement so a decommissioned model is not expected to still be
// advertised in the chat catalog.
const retiredModels = new Set(
    readdirSync(resolve(process.cwd(), 'supabase/migrations'))
        .filter(name => name.endsWith('.sql'))
        .flatMap(name => {
            const sql = readFileSync(
                resolve(process.cwd(), 'supabase/migrations', name),
                'utf8'
            );
            return [...sql.matchAll(
                /UPDATE\s+model_pricing\s+SET\s+is_active\s*=\s*false[\s\S]*?WHERE\s+provider\s*=\s*'([^']+)'[\s\S]*?model_name\s+IN\s*\(([^)]*)\)/gi
            )].flatMap(match => {
                const provider = match[1];
                return [...match[2].matchAll(/'([^']+)'/g)]
                    .map(model => `${provider}:${model[1]}`);
            });
        })
);

// Embeddings are served by the embeddings route rather than the chat catalog.
const serviceOnlyModels = new Set([
    'openai:text-embedding-3-small',
    'openai:text-embedding-3-large',
    'openai:text-embedding-ada-002',
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
            .filter(key => !catalog.has(key)
                && !serviceOnlyModels.has(key)
                && !unitPricedModels.has(key)
                && !retiredModels.has(key));

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
