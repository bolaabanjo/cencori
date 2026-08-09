/**
 * @vitest-environment node
 *
 * Layer 5 read path: the multi-hop walk vector search can't do. "Where does
 * Sarah work from?" matches the Sarah fact by similarity; the answer lives two
 * hops away, on a fact about a city whose text shares nothing with the query.
 */
import { describe, expect, it, vi } from 'vitest';

import { retrieveGraphMemories } from '../graph-recall';

const ENTITIES = [
    { id: 'e-sarah', name: 'Sarah Chen', aliases: ['Sarah'] },
    { id: 'e-zap', name: 'Zap Corp', aliases: [] },
    { id: 'e-berlin', name: 'Berlin', aliases: [] },
    { id: 'e-other', name: 'Ledgerkit', aliases: [] },
];

const EDGES = [
    { src_entity_id: 'e-sarah', dst_entity_id: 'e-zap', relation: 'works_at' },
    { src_entity_id: 'e-zap', dst_entity_id: 'e-berlin', relation: 'located_in' },
];

const MENTIONS = [
    { entity_id: 'e-sarah', memory_id: 'm-sarah' },
    { entity_id: 'e-zap', memory_id: 'm-zap' },
    { entity_id: 'e-berlin', memory_id: 'm-berlin' },
    { entity_id: 'e-other', memory_id: 'm-other' },
];

const MEMORIES = [
    { id: 'm-zap', content: 'Zap Corp runs a four-day week.', namespace: null, importance: 0.6, created_at: '2026-07-01T00:00:00Z' },
    { id: 'm-berlin', content: 'The office is in Berlin.', namespace: null, importance: 0.8, created_at: '2026-07-02T00:00:00Z' },
];

/** Chainable stub that answers each table with its fixture, recording `.in` filters. */
function makeSupabase(overrides: Record<string, unknown[]> = {}) {
    const tables: Record<string, unknown[]> = {
        memory_entities: ENTITIES,
        memory_entity_edges: EDGES,
        memory_entity_mentions: MENTIONS,
        gateway_memories: MEMORIES,
        ...overrides,
    };
    const inFilters: Record<string, string[]> = {};

    const from = (table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.limit = () => chain;
        chain.in = (_column: string, values: string[]) => {
            inFilters[table] = values;
            return chain;
        };
        chain.then = (resolve: (v: unknown) => void) => resolve({ data: tables[table] ?? [], error: null });
        return chain;
    };

    return { supabase: { from } as never, inFilters };
}

const base = {
    organizationId: 'org_1',
    projectId: 'proj_1',
    scope: 'user' as const,
    scopeKey: 'user_1',
    namespace: null,
};

describe('retrieveGraphMemories', () => {
    it('walks from a named entity to facts about connected ones', async () => {
        const { supabase, inFilters } = makeSupabase();

        const results = await retrieveGraphMemories({
            supabase,
            ...base,
            queryText: 'where does Sarah work from?',
            // The Sarah fact was already returned by vector search.
            excludeIds: new Set(['m-sarah']),
            limit: 5,
        });

        expect(results.map(r => r.id)).toEqual(['mem_m-zap', 'mem_m-berlin']);
        // Nearest hop first, and flagged as graph-reached rather than matched.
        expect(results[0]).toMatchObject({ hops: 1, source: 'graph', similarity: 0 });
        expect(results[1]).toMatchObject({ hops: 2, source: 'graph' });
        // The unconnected entity is never walked to.
        expect(inFilters.memory_entity_mentions).not.toContain('e-other');
    });

    it('returns nothing when the query names no known entity', async () => {
        const { supabase } = makeSupabase();
        const results = await retrieveGraphMemories({
            supabase,
            ...base,
            queryText: 'what is my deploy cadence?',
            excludeIds: new Set(),
            limit: 5,
        });
        expect(results).toEqual([]);
    });

    it('honors the limit, keeping the nearest hops', async () => {
        const { supabase } = makeSupabase();
        const results = await retrieveGraphMemories({
            supabase,
            ...base,
            queryText: 'Sarah',
            excludeIds: new Set(['m-sarah']),
            limit: 1,
        });
        expect(results.map(r => r.id)).toEqual(['mem_m-zap']);
    });

    it('stays inside the hop budget', async () => {
        const { supabase, inFilters } = makeSupabase();
        await retrieveGraphMemories({
            supabase,
            ...base,
            queryText: 'Sarah',
            excludeIds: new Set(),
            limit: 5,
            maxHops: 1,
        });
        // Berlin is two hops out — never reached, so never queried for.
        expect(inFilters.memory_entity_mentions).toEqual(['e-sarah', 'e-zap']);
    });

    it('fails open when the graph is empty', async () => {
        const { supabase } = makeSupabase({ memory_entities: [] });
        const results = await retrieveGraphMemories({
            supabase,
            ...base,
            queryText: 'Sarah',
            excludeIds: new Set(),
            limit: 5,
        });
        expect(results).toEqual([]);
    });

    it('fails open when a lookup errors', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const from = () => {
            const chain: Record<string, unknown> = {};
            chain.select = () => chain;
            chain.eq = () => chain;
            chain.limit = () => chain;
            chain.in = () => chain;
            chain.then = (resolve: (v: unknown) => void) =>
                resolve({ data: null, error: { message: 'relation does not exist' } });
            return chain;
        };

        const results = await retrieveGraphMemories({
            supabase: { from } as never,
            ...base,
            queryText: 'Sarah',
            excludeIds: new Set(),
            limit: 5,
        });
        expect(results).toEqual([]);
    });
});
