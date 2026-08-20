/**
 * Vision capability guard.
 *
 * A model tagged `vision` in the catalog is advertised as accepting images, but
 * image requests don't go down the normal chat pipeline — `/v1/chat/completions`
 * hands them to the vision layer, which resolves the model against its own
 * registry and throws `Unknown vision model` for anything it doesn't know.
 *
 * So a `vision` tag with no vision-layer entry is a promise the gateway breaks
 * at request time. Maximo Atlas was exactly that until the OpenAI-compatible
 * vision path landed. This test connects the two lists so the next one fails CI
 * instead of failing a customer.
 */

import { describe, expect, it } from 'vitest';
import { SUPPORTED_PROVIDERS } from '@/lib/providers/config';
import { listVisionModels, VISION_PROVIDER_LIMITS, OPENAI_COMPATIBLE_VISION_PROVIDERS } from '../analyze';
import { upgradeModelForVision } from '@/lib/gateway/chat-vision-router';

/**
 * Catalog entries tagged `vision` that the vision layer cannot serve, with the
 * reason each is tolerated. Do not add to this to make a build pass — register
 * the model in VISION_MODELS instead, or drop the tag.
 */
const KNOWN_UNROUTABLE: Record<string, string> = {
    // Tagged vision before the OpenAI-compatible vision path existed. Cerebras
    // is on the OpenAI wire format so the mechanism would cover it, but the
    // account is unfunded — every model returns 402 payment_required as of
    // 2026-08-20 — so image support still cannot be verified against the live
    // model, and an unverified capability claim is the bug this file exists to
    // catch. Register it once the account is funded and an image round-trips.
    'cerebras:gemma-4-31b': 'image support unverified — account unfunded (402)',
};

function visionTaggedCatalogModels(): Array<{ key: string; id: string }> {
    const tagged: Array<{ key: string; id: string }> = [];
    for (const provider of SUPPORTED_PROVIDERS) {
        for (const model of provider.models) {
            const types = Array.isArray(model.type) ? model.type : [model.type];
            if (types.includes('vision')) {
                tagged.push({ key: `${provider.id}:${model.id}`, id: model.id });
            }
        }
    }
    return tagged;
}

describe('vision capability coverage', () => {
    it('routes every vision-tagged catalog model, or documents why not', () => {
        const routable = new Set(listVisionModels().map((model) => model.id));

        const unroutable = visionTaggedCatalogModels()
            .filter(({ id }) => !routable.has(id))
            .map(({ key }) => key)
            .filter((key) => !(key in KNOWN_UNROUTABLE));

        expect(unroutable).toEqual([]);
    });

    it('registers both Atlas models against the Maximo provider', () => {
        const byId = new Map(listVisionModels().map((model) => [model.id, model.provider]));

        expect(byId.get('maximo-atlas-1.2')).toBe('maximo');
        expect(byId.get('maximo-atlas-1.1')).toBe('maximo');
    });

    it('declares image limits for every OpenAI-compatible vision provider', () => {
        // VISION_PROVIDER_LIMITS drives validateImageForProvider. A provider
        // missing from it would throw on the first image it was handed.
        for (const provider of OPENAI_COMPATIBLE_VISION_PROVIDERS) {
            const limits = VISION_PROVIDER_LIMITS[provider];
            expect(limits.formats.length).toBeGreaterThan(0);
            expect(limits.maxBytes).toBeGreaterThan(0);
        }
    });

    it('does not "upgrade" Atlas to another provider on an image request', () => {
        // Before this was in VISION_CAPABLE_PATTERNS, Atlas fell through to the
        // unknown-provider branch. It survived by accident; now it's explicit.
        for (const model of ['maximo-atlas-1.2', 'maximo-atlas-1.1']) {
            expect(upgradeModelForVision(model)).toEqual({ model, upgraded: false });
        }
    });
});
