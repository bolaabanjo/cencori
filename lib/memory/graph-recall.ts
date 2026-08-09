/**
 * Graph-aware recall — Phase 3, Layer 5 read path.
 *
 * Vector search answers "what do I know that resembles this question". It
 * cannot answer "who does Sarah report to, and where do they work" — that is a
 * walk across relations, and the fact at the far end of the walk may share no
 * words with the query at all.
 *
 * This is that walk:
 *   query text → seed entities it names → traverse N hops
 *               → mentions of the reachable entities → the facts about them.
 *
 * Two properties keep it safe to run on the hot path:
 *  - No model call. Seeds are resolved by matching stored entity names against
 *    the query (deterministic), not by an extraction round trip.
 *  - Fail-open, like all retrieval. Any failure returns [] and recall degrades
 *    to pure vector search rather than breaking the request.
 */

import type { createAdminClient } from '@/lib/supabaseAdmin';
import { findSeedEntities, type EntitySurfaceForms } from './entities';
import { traverseGraph, type GraphEdge } from './graph';
import { toMemoryId, type MemoryScope, type RetrievedMemory } from './types';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

/** Hops walked outward from a seed entity. Two covers "Sarah → Zap → Berlin". */
const DEFAULT_GRAPH_HOPS = 2;
/** Cap on entities pulled into the walk, nearest-first. */
const MAX_TRAVERSED_ENTITIES = 40;
/** Cap on entities loaded for seed matching — a scope's graph, not the org's. */
const MAX_SCOPE_ENTITIES = 500;

export interface GraphRecallParams {
    supabase: SupabaseAdmin;
    organizationId: string;
    projectId: string;
    scope: MemoryScope;
    scopeKey: string;
    namespace: string | null;
    queryText: string;
    /** Raw memory uuids already in the recall set — never returned twice. */
    excludeIds: Set<string>;
    /** Max memories to add. Graph hits supplement vector recall, not replace it. */
    limit: number;
    maxHops?: number;
}

/**
 * Memories reachable from the query's entities that vector search did not
 * already return. Ordered nearest-first (fewest hops), then by importance.
 */
export async function retrieveGraphMemories(params: GraphRecallParams): Promise<RetrievedMemory[]> {
    const {
        supabase, organizationId, projectId, scope, scopeKey,
        namespace, queryText, excludeIds, limit,
    } = params;

    if (limit <= 0 || !queryText.trim()) return [];

    try {
        // 1. The scope's entities, to resolve which ones the query names.
        let entityQuery = supabase
            .from('memory_entities')
            .select('id, name, aliases')
            .eq('organization_id', organizationId)
            .eq('project_id', projectId)
            .eq('scope', scope)
            .eq('scope_key', scopeKey)
            .limit(MAX_SCOPE_ENTITIES);
        if (namespace) entityQuery = entityQuery.eq('namespace', namespace);

        const { data: entityRows, error: entityErr } = await entityQuery;
        if (entityErr || !entityRows?.length) {
            if (entityErr) console.warn('[Memory] Graph entity load failed:', entityErr.message);
            return [];
        }

        const entities: EntitySurfaceForms[] = entityRows.map((e) => ({
            id: e.id as string,
            name: e.name as string,
            aliases: (e.aliases as string[] | null) ?? [],
        }));

        const seeds = findSeedEntities(queryText, entities);
        if (seeds.length === 0) return [];

        // 2. Walk outward. Undirected: "Sarah works_at Zap" should be reachable
        //    from a question about Zap as much as one about Sarah.
        let edgeQuery = supabase
            .from('memory_entity_edges')
            .select('src_entity_id, dst_entity_id, relation')
            .eq('organization_id', organizationId)
            .eq('project_id', projectId)
            .eq('scope', scope)
            .eq('scope_key', scopeKey);
        if (namespace) edgeQuery = edgeQuery.eq('namespace', namespace);

        const { data: edgeRows, error: edgeErr } = await edgeQuery;
        if (edgeErr) {
            console.warn('[Memory] Graph edge load failed:', edgeErr.message);
            return [];
        }

        const edges: GraphEdge[] = (edgeRows ?? []).map((e) => ({
            src: e.src_entity_id as string,
            dst: e.dst_entity_id as string,
            relation: e.relation as string,
        }));

        const hits = traverseGraph(seeds, edges, {
            maxHops: params.maxHops ?? DEFAULT_GRAPH_HOPS,
            undirected: true,
            limit: MAX_TRAVERSED_ENTITIES,
        });
        const hopsByEntity = new Map(hits.map((h) => [h.entityId, h.hops]));

        // 3. Facts about the reached entities.
        const { data: mentionRows, error: mentionErr } = await supabase
            .from('memory_entity_mentions')
            .select('entity_id, memory_id')
            .eq('organization_id', organizationId)
            .eq('project_id', projectId)
            .eq('scope', scope)
            .eq('scope_key', scopeKey)
            .in('entity_id', [...hopsByEntity.keys()]);
        if (mentionErr) {
            console.warn('[Memory] Graph mention load failed:', mentionErr.message);
            return [];
        }

        // A memory is as near as its nearest mentioned entity.
        const hopsByMemory = new Map<string, number>();
        for (const row of mentionRows ?? []) {
            const memoryId = row.memory_id as string;
            if (excludeIds.has(memoryId)) continue;
            const hops = hopsByEntity.get(row.entity_id as string);
            if (hops == null) continue; // entity outside the walk
            const known = hopsByMemory.get(memoryId);
            if (known == null || hops < known) hopsByMemory.set(memoryId, hops);
        }
        if (hopsByMemory.size === 0) return [];

        // 4. Load them. Active only — a superseded fact stays out of current
        //    recall whichever door it came through.
        const { data: memoryRows, error: memoryErr } = await supabase
            .from('gateway_memories')
            .select('id, content, namespace, importance, created_at')
            .eq('organization_id', organizationId)
            .eq('project_id', projectId)
            .eq('status', 'active')
            .in('id', [...hopsByMemory.keys()]);
        if (memoryErr || !memoryRows?.length) {
            if (memoryErr) console.warn('[Memory] Graph memory load failed:', memoryErr.message);
            return [];
        }

        return memoryRows
            .map((row) => ({
                id: toMemoryId(row.id as string),
                content: row.content as string,
                similarity: 0,
                namespace: (row.namespace as string | null) ?? null,
                importance: Number(row.importance),
                createdAt: (row.created_at as string | null) ?? null,
                source: 'graph' as const,
                hops: hopsByMemory.get(row.id as string) ?? 0,
            }))
            .sort((a, b) => (a.hops - b.hops) || (b.importance - a.importance))
            .slice(0, limit);
    } catch (error) {
        console.warn('[Memory] Graph recall failed (fail-open):', error);
        return [];
    }
}
