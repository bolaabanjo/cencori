/**
 * Entity-graph extraction + persistence — Phase 3, Layer 5 write path.
 *
 * Extracts entities + relations from an exchange (LLM, managed Google-only) and
 * persists them into the memory graph with resolution: a merged entity gains an
 * alias and a mention, a new one is created, and relations become edges keyed by
 * (src, relation, dst). Same tenant boundary as gateway_memories.
 *
 * Never throws — extraction/persistence failures return zero counts. The LLM
 * extraction quality is validated with the funded key; the resolution +
 * persistence mechanics are unit-tested with mocks.
 */

import { callMemoryLlm } from './llm';
import type { createAdminClient } from '@/lib/supabaseAdmin';
import type { SubscriptionTier } from '@/lib/entitlements';
import {
    resolveEntity,
    normalizeName,
    matchEntityMentions,
    type EntityExtraction,
    type EntitySurfaceForms,
    type ExistingEntity,
} from './entities';
import { parseEntityExtraction } from './entities';
import { fromMemoryId, resolveMemoryModel, type MemoryDirective, type MemorySettings, type WrittenMemory } from './types';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export const ENTITY_EXTRACTION_PROMPT = `You extract entities and their relationships from a conversation exchange, for a knowledge graph about the user.

Entities are concrete nouns worth remembering: people, organizations, projects, products, places. Skip generic concepts and one-off mentions.
Relations describe how two entities connect: works_at, reports_to, building, founded, located_in, uses, owns, part_of, etc. Use a short snake_case verb.

Rules:
- Use the most complete canonical name you see for each entity (e.g. "John Smith", not "John").
- Only include a relation when both of its entities are in your entities list.
- Skip the user themselves unless they are clearly named.

Respond with ONLY JSON (no prose, no code fences):
{"entities": [{"name": "...", "type": "person|org|project|product|place"}], "relations": [{"source": "...", "relation": "...", "target": "..."}]}

If there is nothing worth extracting, respond with {"entities": [], "relations": []}.`;

export interface ExtractEntitiesResult {
    extraction: EntityExtraction;
    costUsd: number;
    model: string;
}

/** LLM entity/relation extraction from an exchange. Managed Google-only. */
export async function extractEntities(params: {
    supabase: SupabaseAdmin;
    projectId: string;
    organizationId: string;
    tier: SubscriptionTier;
    model?: string;
    userText: string;
    assistantText: string;
    requestId?: string;
}): Promise<ExtractEntitiesResult> {
    const preferModel = resolveMemoryModel(params.model);
    try {
        // Fan out across Cerebras → Groq → Gemini; first provider to answer wins.
        const response = await callMemoryLlm({
            supabase: params.supabase,
            projectId: params.projectId,
            organizationId: params.organizationId,
            tier: params.tier,
            requestId: params.requestId,
            preferModel,
            maxTokens: 800,
            messages: [
                { role: 'system', content: ENTITY_EXTRACTION_PROMPT },
                {
                    role: 'user',
                    content: `USER:\n${params.userText.slice(0, 8000)}\n\nASSISTANT:\n${params.assistantText.slice(0, 8000)}`,
                },
            ],
        });
        if (!response) {
            return { extraction: { entities: [], relations: [] }, costUsd: 0, model: preferModel };
        }
        return {
            extraction: parseEntityExtraction(response.content),
            costUsd: response.costUsd,
            model: response.model,
        };
    } catch (error) {
        console.warn('[Memory] Entity extraction failed:', error);
        return { extraction: { entities: [], relations: [] }, costUsd: 0, model: preferModel };
    }
}

export interface PersistEntityGraphResult {
    entitiesCreated: number;
    entitiesMerged: number;
    edgesCreated: number;
    /** entity ↔ memory links written (what makes graph-aware recall possible). */
    mentionsCreated: number;
}

/**
 * Resolve + persist an extraction into memory_entities / memory_entity_edges,
 * and link the entities to the memories written from the same exchange.
 * Org/project/scope always come from the caller's authenticated context.
 */
export async function persistEntityGraph(params: {
    supabase: SupabaseAdmin;
    organizationId: string;
    projectId: string;
    scope: string;
    scopeKey: string;
    namespace: string | null;
    extraction: EntityExtraction;
    /**
     * Memories written from the same exchange (raw uuids, post-redaction
     * content). Each is linked to the entities it names, so traversal can walk
     * from an entity back to what is known about it.
     */
    memories?: { id: string; content: string }[];
    sourceMemoryId?: string | null;
}): Promise<PersistEntityGraphResult> {
    const { supabase, organizationId, projectId, scope, scopeKey, namespace, extraction } = params;
    const result: PersistEntityGraphResult = {
        entitiesCreated: 0,
        entitiesMerged: 0,
        edgesCreated: 0,
        mentionsCreated: 0,
    };

    if (extraction.entities.length === 0 && extraction.relations.length === 0) return result;

    // Load the existing entity set for this scope once; resolve in memory.
    const { data: existingRows, error: loadErr } = await supabase
        .from('memory_entities')
        .select('id, name, entity_type, canonical_key, aliases, mention_count')
        .eq('organization_id', organizationId)
        .eq('project_id', projectId)
        .eq('scope', scope)
        .eq('scope_key', scopeKey);
    if (loadErr) {
        console.warn('[Memory] Entity load failed:', loadErr.message);
        return result;
    }

    const existing: ExistingEntity[] = (existingRows ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        entityType: r.entity_type,
        canonicalKey: r.canonical_key,
        aliases: (r.aliases as string[] | null) ?? [],
    }));
    const mentionCounts = new Map<string, number>(
        (existingRows ?? []).map((r) => [r.id as string, Number(r.mention_count ?? 1)])
    );
    // Entities this exchange touched — the only ones eligible for mention links.
    const touched = new Set<string>();
    // Of those, the ones this exchange created (the rest were re-observed).
    const created = new Set<string>();
    // Normalized surface form → entity id, for edge resolution.
    const nameToId = new Map<string, string>();
    for (const e of existing) {
        nameToId.set(normalizeName(e.name), e.id);
        for (const a of e.aliases) nameToId.set(normalizeName(a), e.id);
    }

    // Resolve/insert an entity, returning its id (or null on failure).
    const upsertEntity = async (name: string, type: string): Promise<string | null> => {
        const norm = normalizeName(name);
        const cached = nameToId.get(norm);
        if (cached) {
            touched.add(cached);
            return cached;
        }

        const decision = resolveEntity({ name, type }, existing);
        if (decision.action === 'merge') {
            if (decision.addAlias) {
                const target = existing.find((e) => e.id === decision.entityId);
                const aliases = target ? [...target.aliases, decision.addAlias] : [decision.addAlias];
                await supabase
                    .from('memory_entities')
                    .update({ aliases, updated_at: new Date().toISOString() })
                    .eq('id', decision.entityId)
                    .eq('organization_id', organizationId);
                if (target) target.aliases = aliases;
            }
            nameToId.set(norm, decision.entityId);
            touched.add(decision.entityId);
            return decision.entityId;
        }

        const { data: ins, error: insErr } = await supabase
            .from('memory_entities')
            .insert({
                organization_id: organizationId,
                project_id: projectId,
                scope,
                scope_key: scopeKey,
                namespace,
                canonical_key: decision.canonicalKey,
                name,
                entity_type: type,
                aliases: [],
            })
            .select('id')
            .single();
        if (insErr || !ins) {
            console.warn('[Memory] Entity insert failed:', insErr?.message);
            return null;
        }
        const newEntity: ExistingEntity = { id: ins.id, name, entityType: type, canonicalKey: decision.canonicalKey, aliases: [] };
        existing.push(newEntity);
        nameToId.set(norm, ins.id);
        mentionCounts.set(ins.id, 1);
        created.add(ins.id);
        touched.add(ins.id);
        return ins.id;
    };

    // Entities first, so relations can reference them.
    for (const ent of extraction.entities) {
        await upsertEntity(ent.name, ent.type);
    }

    // Resolve relation endpoints before writing edges — an endpoint the model
    // named but didn't list still has to exist as a node. Skip self-edges.
    const pendingEdges: { srcId: string; dstId: string; relation: string }[] = [];
    for (const rel of extraction.relations) {
        const srcId = await upsertEntity(rel.source, 'entity');
        const dstId = await upsertEntity(rel.target, 'entity');
        if (!srcId || !dstId || srcId === dstId) continue;
        pendingEdges.push({ srcId, dstId, relation: rel.relation });
    }

    // ── Entity accounting + salience ─────────────────────────────────────────
    // Counted once per entity, not once per surface form: an exchange naming
    // "Sarah Chen" twice is one observation of one entity. Re-observation bumps
    // mention_count — how often an entity comes up is how central it is.
    const reobserved = [...touched].filter((id) => !created.has(id));
    result.entitiesCreated = created.size;
    result.entitiesMerged = reobserved.length;

    for (const id of reobserved) {
        const { error: bumpErr } = await supabase
            .from('memory_entities')
            .update({
                mention_count: (mentionCounts.get(id) ?? 1) + 1,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .eq('organization_id', organizationId);
        if (bumpErr) console.warn('[Memory] Mention-count bump failed:', bumpErr.message);
    }

    // ── Mentions: link each written memory to the entities it names ──────────
    // memory_entity_edges.source_memory_id only covers facts that produced a
    // relation. Mentions cover every fact, which is what lets traversal answer
    // "what do I know about the entity I just walked to".
    const memories = params.memories ?? [];
    const mentionsByMemory = new Map<string, Set<string>>();
    if (memories.length > 0 && touched.size > 0) {
        const surfaces: EntitySurfaceForms[] = existing
            .filter((e) => touched.has(e.id))
            .map((e) => ({ id: e.id, name: e.name, aliases: e.aliases }));
        const mentions = matchEntityMentions(surfaces, memories);

        for (const m of mentions) {
            const set = mentionsByMemory.get(m.memoryId) ?? new Set<string>();
            set.add(m.entityId);
            mentionsByMemory.set(m.memoryId, set);
        }

        if (mentions.length > 0) {
            // ignoreDuplicates makes this ON CONFLICT DO NOTHING, so the
            // returned rows are exactly the links that are new.
            const { data: linked, error: mentionErr } = await supabase
                .from('memory_entity_mentions')
                .upsert(
                    mentions.map((m) => ({
                        organization_id: organizationId,
                        project_id: projectId,
                        entity_id: m.entityId,
                        memory_id: m.memoryId,
                        scope,
                        scope_key: scopeKey,
                        namespace,
                    })),
                    { onConflict: 'entity_id,memory_id', ignoreDuplicates: true }
                )
                .select('id');
            if (mentionErr) {
                console.warn('[Memory] Mention link failed:', mentionErr.message);
            } else {
                result.mentionsCreated = linked?.length ?? 0;
            }
        }
    }

    // ── Edges ────────────────────────────────────────────────────────────────
    for (const edge of pendingEdges) {
        // Provenance: prefer the memory that names both endpoints, so an edge
        // points at the fact it actually came from.
        let sourceMemoryId = params.sourceMemoryId ?? null;
        for (const [memoryId, entityIds] of mentionsByMemory) {
            if (entityIds.has(edge.srcId) && entityIds.has(edge.dstId)) {
                sourceMemoryId = memoryId;
                break;
            }
        }

        const { data: insertedEdge, error: edgeErr } = await supabase
            .from('memory_entity_edges')
            .upsert(
                {
                    organization_id: organizationId,
                    project_id: projectId,
                    scope,
                    scope_key: scopeKey,
                    namespace,
                    src_entity_id: edge.srcId,
                    dst_entity_id: edge.dstId,
                    relation: edge.relation,
                    source_memory_id: sourceMemoryId,
                },
                { onConflict: 'organization_id,project_id,scope,scope_key,namespace,src_entity_id,relation,dst_entity_id', ignoreDuplicates: true }
            )
            .select('id');
        if (edgeErr) {
            console.warn('[Memory] Edge upsert failed:', edgeErr.message);
            continue;
        }
        // Empty on a re-observed relation — count only genuinely new edges.
        result.edgesCreated += insertedEdge?.length ?? 0;
    }

    return result;
}

export interface EntityGraphWritebackResult extends PersistEntityGraphResult {
    costUsd: number;
    model: string;
}

const EMPTY_GRAPH_WRITEBACK: EntityGraphWritebackResult = {
    entitiesCreated: 0,
    entitiesMerged: 0,
    edgesCreated: 0,
    mentionsCreated: 0,
    costUsd: 0,
    model: '',
};

/**
 * The Layer-5 write path as the writeback pipeline uses it: extract entities
 * from the exchange, persist them, and link them to the memories just written.
 *
 * Runs after the facts have landed (it needs their ids) and never throws — a
 * graph failure must not cost the caller the facts themselves. Skipped for
 * session scope (Redis, no memory ids to link) and when the project has the
 * graph layer switched off.
 */
export async function runEntityGraphWriteback(params: {
    supabase: SupabaseAdmin;
    organizationId: string;
    projectId: string;
    tier: SubscriptionTier;
    settings: MemorySettings;
    directive: Pick<MemoryDirective, 'scope' | 'scopeKey' | 'namespace'>;
    userText: string;
    assistantText: string;
    /** Memories just written (mem_-prefixed ids, as returned by writeMemories). */
    written: WrittenMemory[];
    requestId?: string;
}): Promise<EntityGraphWritebackResult> {
    const { supabase, organizationId, projectId, tier, settings, directive, written } = params;

    if (!settings.graphEnabled) return EMPTY_GRAPH_WRITEBACK;
    if (directive.scope === 'session') return EMPTY_GRAPH_WRITEBACK;
    if (written.length === 0) return EMPTY_GRAPH_WRITEBACK;

    try {
        const { extraction, costUsd, model } = await extractEntities({
            supabase,
            projectId,
            organizationId,
            tier,
            model: settings.extractionModel,
            userText: params.userText,
            assistantText: params.assistantText,
            requestId: params.requestId,
        });

        if (extraction.entities.length === 0 && extraction.relations.length === 0) {
            return { ...EMPTY_GRAPH_WRITEBACK, costUsd, model };
        }

        const persisted = await persistEntityGraph({
            supabase,
            organizationId,
            projectId,
            scope: directive.scope,
            scopeKey: directive.scopeKey,
            namespace: directive.namespace,
            extraction,
            memories: written.map((m) => ({ id: fromMemoryId(m.id), content: m.content })),
        });

        return { ...persisted, costUsd, model };
    } catch (error) {
        console.warn('[Memory] Entity graph writeback failed (non-fatal):', error);
        return EMPTY_GRAPH_WRITEBACK;
    }
}
