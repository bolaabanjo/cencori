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

import { executeGatewayChat } from '@/lib/gateway/chat-executor';
import { getMemoryGoogleApiKey } from '@/lib/providers/google-env';
import type { createAdminClient } from '@/lib/supabaseAdmin';
import type { SubscriptionTier } from '@/lib/entitlements';
import {
    resolveEntity,
    normalizeName,
    type EntityExtraction,
    type ExistingEntity,
} from './entities';
import { parseEntityExtraction } from './entities';
import { ensureGoogleMemoryModel } from './types';

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
    const model = ensureGoogleMemoryModel(params.model);
    try {
        const response = await executeGatewayChat({
            supabase: params.supabase,
            projectId: params.projectId,
            organizationId: params.organizationId,
            tier: params.tier,
            requestId: params.requestId,
            googleApiKeyOverride: getMemoryGoogleApiKey() ?? undefined,
            googleOnly: true,
            request: {
                model,
                temperature: 0,
                maxTokens: 800,
                messages: [
                    { role: 'system', content: ENTITY_EXTRACTION_PROMPT },
                    {
                        role: 'user',
                        content: `USER:\n${params.userText.slice(0, 8000)}\n\nASSISTANT:\n${params.assistantText.slice(0, 8000)}`,
                    },
                ],
            },
        });
        return {
            extraction: parseEntityExtraction(response.content ?? ''),
            costUsd: response.cost?.cencoriChargeUsd ?? 0,
            model: response.actualModel ?? model,
        };
    } catch (error) {
        console.warn('[Memory] Entity extraction failed:', error);
        return { extraction: { entities: [], relations: [] }, costUsd: 0, model };
    }
}

export interface PersistEntityGraphResult {
    entitiesCreated: number;
    entitiesMerged: number;
    edgesCreated: number;
}

/**
 * Resolve + persist an extraction into memory_entities / memory_entity_edges.
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
    sourceMemoryId?: string | null;
}): Promise<PersistEntityGraphResult> {
    const { supabase, organizationId, projectId, scope, scopeKey, namespace, extraction } = params;
    const result: PersistEntityGraphResult = { entitiesCreated: 0, entitiesMerged: 0, edgesCreated: 0 };

    if (extraction.entities.length === 0 && extraction.relations.length === 0) return result;

    // Load the existing entity set for this scope once; resolve in memory.
    const { data: existingRows, error: loadErr } = await supabase
        .from('memory_entities')
        .select('id, name, entity_type, canonical_key, aliases')
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
        if (cached) return cached;

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
            result.entitiesMerged++;
            nameToId.set(norm, decision.entityId);
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
        result.entitiesCreated++;
        const newEntity: ExistingEntity = { id: ins.id, name, entityType: type, canonicalKey: decision.canonicalKey, aliases: [] };
        existing.push(newEntity);
        nameToId.set(norm, ins.id);
        return ins.id;
    };

    // Entities first, so relations can reference them.
    for (const ent of extraction.entities) {
        await upsertEntity(ent.name, ent.type);
    }

    // Edges. Ensure both endpoints exist (create as generic entity if the model
    // named a relation endpoint it didn't list). Skip self-edges.
    for (const rel of extraction.relations) {
        const srcId = await upsertEntity(rel.source, 'entity');
        const dstId = await upsertEntity(rel.target, 'entity');
        if (!srcId || !dstId || srcId === dstId) continue;

        const { error: edgeErr } = await supabase
            .from('memory_entity_edges')
            .upsert(
                {
                    organization_id: organizationId,
                    project_id: projectId,
                    scope,
                    scope_key: scopeKey,
                    namespace,
                    src_entity_id: srcId,
                    dst_entity_id: dstId,
                    relation: rel.relation,
                    source_memory_id: params.sourceMemoryId ?? null,
                },
                { onConflict: 'organization_id,project_id,scope,scope_key,namespace,src_entity_id,relation,dst_entity_id', ignoreDuplicates: true }
            );
        if (edgeErr) {
            console.warn('[Memory] Edge upsert failed:', edgeErr.message);
            continue;
        }
        result.edgesCreated++;
    }

    return result;
}
