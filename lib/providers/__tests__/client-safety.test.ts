import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Client-bundle safety.
 *
 * `lib/supabaseAdmin.ts` throws at module evaluation when the service-role key
 * is absent, which it always is in a browser. So any module a "use client"
 * component imports must not reach it — transitively included. Branding broke
 * exactly this way: branding.ts -> pricing.ts -> supabaseAdmin.ts crashed
 * /ai/models on hydration while server rendering still succeeded, so the page
 * looked correct in fetched HTML and failed in the browser.
 */

const ROOT = resolve(__dirname, '../../..');

/** Modules that are server-only because they throw or read secrets at import. */
const SERVER_ONLY = ['@/lib/supabaseAdmin', 'lib/supabaseAdmin'];

/** Entry points that ship to the browser and must stay clean. */
const CLIENT_ENTRIES = [
    'components/models/ModelCatalog.tsx',
    'components/dashboard/playground/PlaygroundChat.tsx',
];

function readIfExists(path: string): string | null {
    try { return readFileSync(path, 'utf8'); } catch { return null; }
}

function resolveImport(spec: string, fromFile: string): string | null {
    let base: string;
    if (spec.startsWith('@/')) base = resolve(ROOT, spec.slice(2));
    else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
    else return null; // package import
    for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
        const candidate = base + ext;
        if (readIfExists(candidate) !== null) return candidate;
    }
    return null;
}

/** Walk the local import graph, returning the first path that reaches a server-only module. */
function findServerOnlyPath(entry: string): string[] | null {
    const seen = new Set<string>();
    const stack: Array<{ file: string; trail: string[] }> = [
        { file: resolve(ROOT, entry), trail: [entry] },
    ];

    while (stack.length > 0) {
        const { file, trail } = stack.pop()!;
        if (seen.has(file)) continue;
        seen.add(file);

        const source = readIfExists(file);
        if (source === null) continue;

        for (const match of source.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)) {
            const spec = match[1];
            if (SERVER_ONLY.includes(spec)) return [...trail, spec];
            const next = resolveImport(spec, file);
            if (next) stack.push({ file: next, trail: [...trail, spec] });
        }
    }
    return null;
}

describe('client bundle safety', () => {
    for (const entry of CLIENT_ENTRIES) {
        it(`${entry} does not import server-only modules`, () => {
            const offending = findServerOnlyPath(entry);
            expect(
                offending,
                offending ? `server-only import chain: ${offending.join(' -> ')}` : ''
            ).toBeNull();
        });
    }

    it('detects a server-only chain when one exists', () => {
        // Guards the walker itself: pricing.ts legitimately imports supabaseAdmin,
        // so a broken detector would silently pass every case above.
        expect(findServerOnlyPath('lib/providers/pricing.ts')).not.toBeNull();
    });

    it('keeps the free-model catalog importable from the browser', () => {
        expect(findServerOnlyPath('lib/providers/free-models.ts')).toBeNull();
        expect(findServerOnlyPath('lib/providers/branding.ts')).toBeNull();
    });
});
