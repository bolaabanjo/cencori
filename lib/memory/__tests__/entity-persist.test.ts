/**
 * @vitest-environment node
 *
 * Layer 5 persistence orchestration: resolve extracted entities into the graph —
 * create new nodes, merge known ones (adding aliases), and write edges. The pure
 * resolution/traversal are covered elsewhere; this checks the DB orchestration.
 */
import { describe, expect, it, vi } from 'vitest';

import { persistEntityGraph } from '../entity-persist';
import type { EntityExtraction } from '../entities';
import { normalizeEntityKey } from '../entities';

interface ExistingRow {
    id: string;
    name: string;
    entity_type: string;
    canonical_key: string;
    aliases: string[];
}

function makeSupabase(existing: ExistingRow[]) {
    const inserted: Array<{ name: string; type: string }> = [];
    const updated: Array<{ id: string; aliases: string[] }> = [];
    const edges: Array<{ src: string; dst: string; relation: string }> = [];
    let counter = 0;

    const from = (table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.order = () => chain;
        chain.limit = () => chain;
        // Awaiting the select-load chain yields the existing entities.
        chain.then = (resolve: (v: unknown) => void) =>
            resolve({ data: table === 'memory_entities' ? existing : [], error: null });
        chain.insert = (row: Record<string, unknown>) => {
            const id = `new-${++counter}`;
            inserted.push({ name: row.name as string, type: row.entity_type as string });
            existing.push({
                id,
                name: row.name as string,
                entity_type: row.entity_type as string,
                canonical_key: row.canonical_key as string,
                aliases: [],
            });
            return { select: () => ({ single: async () => ({ data: { id }, error: null }) }) };
        };
        chain.update = (obj: Record<string, unknown>) => {
            const rec = { id: '', aliases: (obj.aliases as string[]) ?? [] };
            return {
                eq: (_c: string, id: string) => {
                    if (!rec.id) rec.id = id;
                    updated.push(rec);
                    return { eq: async () => ({ error: null }) };
                },
            };
        };
        chain.upsert = async (row: Record<string, unknown>) => {
            edges.push({ src: row.src_entity_id as string, dst: row.dst_entity_id as string, relation: row.relation as string });
            return { error: null };
        };
        return chain;
    };

    return { supabase: { from } as never, inserted, updated, edges };
}

const ctx = { organizationId: 'org_1', projectId: 'proj_1', scope: 'user', scopeKey: 'user_1', namespace: null };

describe('persistEntityGraph', () => {
    it('creates new entities and writes edges for a fresh scope', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { supabase, inserted, edges } = makeSupabase([]);
        const extraction: EntityExtraction = {
            entities: [
                { name: 'Sarah', type: 'person' },
                { name: 'Marcus', type: 'person' },
            ],
            relations: [{ source: 'Sarah', relation: 'reports_to', target: 'Marcus' }],
        };

        const res = await persistEntityGraph({ supabase, ...ctx, extraction });

        expect(res.entitiesCreated).toBe(2);
        expect(res.edgesCreated).toBe(1);
        expect(inserted.map((e) => e.name).sort()).toEqual(['Marcus', 'Sarah']);
        expect(edges[0].relation).toBe('reports_to');
    });

    it('merges an entity into an existing one and adds the alias (no new insert)', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const existing: ExistingRow[] = [
            { id: 'e-sarah', name: 'Sarah Lee', entity_type: 'person', canonical_key: normalizeEntityKey('Sarah Lee', 'person'), aliases: [] },
        ];
        const { supabase, inserted, updated } = makeSupabase(existing);
        const extraction: EntityExtraction = {
            entities: [{ name: 'Sarah', type: 'person' }], // fuzzy → Sarah Lee
            relations: [],
        };

        const res = await persistEntityGraph({ supabase, ...ctx, extraction });

        expect(res.entitiesMerged).toBe(1);
        expect(res.entitiesCreated).toBe(0);
        expect(inserted).toHaveLength(0);
        expect(updated[0]).toMatchObject({ id: 'e-sarah', aliases: ['Sarah'] });
    });

    it('is a no-op for an empty extraction', async () => {
        const { supabase } = makeSupabase([]);
        const res = await persistEntityGraph({
            supabase, ...ctx,
            extraction: { entities: [], relations: [] },
        });
        expect(res).toEqual({ entitiesCreated: 0, entitiesMerged: 0, edgesCreated: 0 });
    });
});
