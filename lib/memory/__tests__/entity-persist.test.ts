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
    const edges: Array<{ src: string; dst: string; relation: string; sourceMemoryId: string | null }> = [];
    const mentions: Array<{ entityId: string; memoryId: string }> = [];
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
        // upsert(...).select('id') — returns the rows that were actually
        // inserted (ON CONFLICT DO NOTHING returns nothing for duplicates).
        chain.upsert = (payload: Record<string, unknown> | Record<string, unknown>[]) => {
            const rows: string[] = [];
            if (table === 'memory_entity_mentions') {
                for (const row of payload as Record<string, unknown>[]) {
                    const link = { entityId: row.entity_id as string, memoryId: row.memory_id as string };
                    const dup = mentions.some(m => m.entityId === link.entityId && m.memoryId === link.memoryId);
                    if (dup) continue;
                    mentions.push(link);
                    rows.push(`mention-${mentions.length}`);
                }
            } else {
                const row = payload as Record<string, unknown>;
                const edge = {
                    src: row.src_entity_id as string,
                    dst: row.dst_entity_id as string,
                    relation: row.relation as string,
                    sourceMemoryId: (row.source_memory_id as string | null) ?? null,
                };
                const dup = edges.some(e => e.src === edge.src && e.dst === edge.dst && e.relation === edge.relation);
                if (!dup) {
                    edges.push(edge);
                    rows.push(`edge-${edges.length}`);
                }
            }
            return { select: async () => ({ data: rows.map(id => ({ id })), error: null }) };
        };
        return chain;
    };

    return { supabase: { from } as never, inserted, updated, edges, mentions };
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

    it('links written memories to the entities they mention', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { supabase, mentions, edges } = makeSupabase([]);
        const extraction: EntityExtraction = {
            entities: [
                { name: 'Sarah Chen', type: 'person' },
                { name: 'Zap Corp', type: 'org' },
            ],
            relations: [{ source: 'Sarah Chen', relation: 'works_at', target: 'Zap Corp' }],
        };

        const res = await persistEntityGraph({
            supabase,
            ...ctx,
            extraction,
            memories: [
                { id: 'm1', content: 'Sarah Chen works at Zap Corp.' },
                { id: 'm2', content: 'Sarah Chen prefers async standups.' },
                { id: 'm3', content: 'Deploys go out on Fridays.' },
            ],
        });

        // m1 names both; m2 names only Sarah; m3 names nobody.
        expect(res.mentionsCreated).toBe(3);
        expect(mentions.map(m => m.memoryId).sort()).toEqual(['m1', 'm1', 'm2']);
        // The edge points at the fact that actually stated the relation.
        expect(edges).toHaveLength(1);
        expect(edges[0].sourceMemoryId).toBe('m1');
    });

    it('re-observing an exchange merges instead of duplicating, and bumps salience', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { supabase, inserted, edges, mentions, updated } = makeSupabase([]);
        const extraction: EntityExtraction = {
            entities: [{ name: 'Zap Corp', type: 'org' }, { name: 'Berlin', type: 'place' }],
            relations: [{ source: 'Zap Corp', relation: 'located_in', target: 'Berlin' }],
        };
        const memories = [{ id: 'm1', content: 'Zap Corp is based in Berlin.' }];

        const first = await persistEntityGraph({ supabase, ...ctx, extraction, memories });
        expect(first).toMatchObject({ entitiesCreated: 2, entitiesMerged: 0, edgesCreated: 1, mentionsCreated: 2 });

        const second = await persistEntityGraph({ supabase, ...ctx, extraction, memories });
        // Nothing new: same entities, same edge, same links.
        expect(second).toMatchObject({ entitiesCreated: 0, entitiesMerged: 2, edgesCreated: 0, mentionsCreated: 0 });
        expect(inserted).toHaveLength(2);
        expect(edges).toHaveLength(1);
        expect(mentions).toHaveLength(2);
        // Both entities were bumped — the fast path used to skip this entirely.
        expect(updated).toHaveLength(2);
    });

    it('writes no mention links when no memories are supplied', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { supabase, mentions } = makeSupabase([]);
        const res = await persistEntityGraph({
            supabase,
            ...ctx,
            extraction: { entities: [{ name: 'Zap Corp', type: 'org' }], relations: [] },
        });
        expect(mentions).toHaveLength(0);
        expect(res.mentionsCreated).toBe(0);
    });

    it('is a no-op for an empty extraction', async () => {
        const { supabase } = makeSupabase([]);
        const res = await persistEntityGraph({
            supabase, ...ctx,
            extraction: { entities: [], relations: [] },
        });
        expect(res).toEqual({ entitiesCreated: 0, entitiesMerged: 0, edgesCreated: 0, mentionsCreated: 0 });
    });
});
