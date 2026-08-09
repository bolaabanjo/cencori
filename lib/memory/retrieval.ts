/**
 * Memory retrieval — fail-open by contract. A retrieval failure returns []
 * and must never fail or delay the chat request that triggered it.
 *
 * Zero-leak invariant: organizationId/projectId ALWAYS come from the
 * authenticated GatewayContext, never from the request body. The org filter
 * is additionally enforced inside the match_gateway_memories RPC.
 */

import type { createAdminClient } from '@/lib/supabaseAdmin';
import { embedForMemory, type MemoryEmbeddingResult } from './embeddings';
import { retrieveGraphMemories } from './graph-recall';
import { rankMemories, type RankableMemory } from './rank';
import { listSessionMemories } from './session-store';
import {
    DEFAULT_RETRIEVAL_THRESHOLD,
    fromMemoryId,
    toMemoryId,
    type MemoryDirective,
    type MemoryRetrievalMode,
    type RetrievedMemory,
} from './types';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;
export type MemoryEmbeddingUsage = Omit<MemoryEmbeddingResult, 'embeddings'>;

/**
 * Candidate pool fetched before reranking. Wider than topK so recency /
 * importance / reinforcement can lift the right near-matches above raw cosine.
 */
const RANK_POOL_MULTIPLIER = 5;
const RANK_POOL_MIN = 30;

/**
 * Ceiling on graph-expanded memories added to a recall. Graph hits supplement
 * vector recall — a walk that floods context with everything two hops from a
 * name is worse than no walk at all.
 */
const GRAPH_RECALL_LIMIT = 3;

export async function retrieveMemories(params: {
    supabase: SupabaseAdmin;
    organizationId: string;
    projectId: string;
    directive: MemoryDirective;
    queryText: string;
    onEmbeddingUsage?: (usage: MemoryEmbeddingUsage) => void | Promise<void>;
}): Promise<RetrievedMemory[]> {
    const { supabase, organizationId, projectId, directive, queryText, onEmbeddingUsage } = params;

    try {
        if (directive.scope === 'session') {
            const items = await listSessionMemories(
                organizationId,
                projectId,
                directive.scopeKey,
                directive.topK
            );
            return items;
        }

        if (!queryText.trim()) {
            return [];
        }

        const embeddingResult = await embedForMemory(
            supabase,
            projectId,
            organizationId,
            queryText
        );
        if (onEmbeddingUsage) {
            try {
                await onEmbeddingUsage({
                    totalTokens: embeddingResult.totalTokens,
                    providerCostUsd: embeddingResult.providerCostUsd,
                    cencoriChargeUsd: embeddingResult.cencoriChargeUsd,
                    markupPercentage: embeddingResult.markupPercentage,
                    model: embeddingResult.model,
                    provider: embeddingResult.provider,
                });
            } catch (error) {
                // Accounting errors must not turn memory retrieval into a
                // chat outage, but they are never silently ignored.
                console.error('[Memory] Failed to account for search embedding:', error);
            }
        }

        // When the caller didn't set an explicit threshold, calibrate the cutoff
        // to the embedding provider that actually produced the query vector —
        // Gemini scores lower than OpenAI, so a fixed default drops relevant hits.
        const effectiveThreshold = directive.thresholdExplicit
            ? directive.threshold
            : DEFAULT_RETRIEVAL_THRESHOLD[embeddingResult.provider];

        // Fetch a WIDER pool than we return, then rerank (Layer 2). The pool
        // uses the same relevance threshold as a floor; ranking decides order.
        const poolSize = Math.max(RANK_POOL_MIN, directive.topK * RANK_POOL_MULTIPLIER);

        // Temporal (as-of) recall (Layer 3): query the validity window at a past
        // instant, including facts later superseded. Otherwise: current active state.
        const isAsOf = directive.asOf != null;
        const rankNow = isAsOf ? Date.parse(directive.asOf as string) : Date.now();

        const { data, error } = isAsOf
            ? await supabase.rpc('match_gateway_memories_asof', {
                p_org_id: organizationId,
                p_project_id: projectId,
                p_scope: directive.scope,
                p_scope_key: directive.scopeKey,
                p_query_embedding: JSON.stringify(embeddingResult.embeddings[0]),
                p_as_of: directive.asOf,
                p_threshold: effectiveThreshold,
                p_pool: poolSize,
                p_namespace: directive.namespace,
            })
            : await supabase.rpc('match_gateway_memories_ranked', {
                p_org_id: organizationId,
                p_project_id: projectId,
                p_scope: directive.scope,
                p_scope_key: directive.scopeKey,
                p_query_embedding: JSON.stringify(embeddingResult.embeddings[0]),
                p_threshold: effectiveThreshold,
                p_pool: poolSize,
                p_namespace: directive.namespace,
            });

        if (error) {
            // For current-state recall, fall back to the legacy RPC so recall
            // never goes dark if the Layer-2 migration isn't applied. For as-of
            // recall there is no legacy equivalent — fail open to empty.
            if (isAsOf) {
                console.warn('[Memory] As-of retrieval RPC failed:', error.message);
                return [];
            }
            console.warn('[Memory] Ranked RPC failed, falling back to legacy retrieval:', error.message);
            return legacyRetrieve(supabase, organizationId, projectId, directive, embeddingResult.embeddings[0], effectiveThreshold);
        }

        const pool: RankableMemory[] = ((data ?? []) as Array<{
            id: string;
            content: string;
            namespace: string | null;
            importance: number;
            similarity: number;
            access_count: number;
            created_at: string;
            last_accessed_at: string | null;
        }>).map(row => ({
            id: row.id,
            content: row.content,
            similarity: row.similarity,
            importance: Number(row.importance),
            accessCount: Number(row.access_count ?? 0),
            createdAt: row.created_at,
            lastAccessedAt: row.last_accessed_at ?? null,
            namespace: row.namespace,
        }));

        const ranked = rankMemories(pool, { topK: directive.topK, now: rankNow });

        const vectorResults: RetrievedMemory[] = ranked.map(m => ({
            id: toMemoryId(m.id),
            content: m.content,
            similarity: m.similarity,
            namespace: m.namespace,
            importance: m.importance,
            createdAt: m.createdAt,
            source: 'vector' as const,
        }));

        // Layer 5: walk the entity graph for facts the query's vector can't
        // reach — the second hop of "who does Sarah report to, and where do
        // they work". Skipped for as-of recall, which is a question about
        // history rather than about connections.
        const graphResults = directive.graph && !isAsOf
            ? await retrieveGraphMemories({
                supabase,
                organizationId,
                projectId,
                scope: directive.scope,
                scopeKey: directive.scopeKey,
                namespace: directive.namespace,
                queryText,
                excludeIds: new Set(ranked.map(m => m.id)),
                limit: Math.min(GRAPH_RECALL_LIMIT, directive.topK),
            })
            : [];

        // Reinforce ONLY the memories that survived rerank (not the whole pool),
        // plus anything the graph surfaced — access_count tracks what actually
        // proved useful. Best-effort. Skip for as-of recall: inspecting history
        // must not reinforce a memory.
        const touchIds = [...ranked.map(m => m.id), ...graphResults.map(m => fromMemoryId(m.id))];
        if (touchIds.length > 0 && !isAsOf) {
            try {
                await supabase.rpc('touch_gateway_memories', {
                    p_org_id: organizationId,
                    p_ids: touchIds,
                });
            } catch (touchErr) {
                console.warn('[Memory] Access-count touch failed (non-fatal):', touchErr);
            }
        }

        return [...vectorResults, ...graphResults];
    } catch (error) {
        console.warn('[Memory] Retrieval failed (fail-open):', error);
        return [];
    }
}

/**
 * Pre-Layer-2 retrieval: cosine top-K via the legacy RPC, no reranking. Used
 * only as a fallback when the ranked RPC is unavailable (migration not yet
 * applied), so a code-before-migration deploy degrades to plain recall instead
 * of returning nothing.
 */
async function legacyRetrieve(
    supabase: SupabaseAdmin,
    organizationId: string,
    projectId: string,
    directive: MemoryDirective,
    queryEmbedding: number[],
    threshold: number
): Promise<RetrievedMemory[]> {
    const { data, error } = await supabase.rpc('match_gateway_memories', {
        p_org_id: organizationId,
        p_project_id: projectId,
        p_scope: directive.scope,
        p_scope_key: directive.scopeKey,
        p_query_embedding: JSON.stringify(queryEmbedding),
        p_threshold: threshold,
        p_limit: directive.topK,
        p_namespace: directive.namespace,
    });

    if (error || !data) {
        if (error) console.warn('[Memory] Legacy retrieval RPC failed:', error.message);
        return [];
    }

    return (data as Array<{
        id: string;
        content: string;
        namespace: string | null;
        importance: number;
        similarity: number;
        created_at: string;
    }>).map(row => ({
        id: toMemoryId(row.id),
        content: row.content,
        similarity: row.similarity,
        namespace: row.namespace,
        importance: Number(row.importance),
        createdAt: row.created_at,
    }));
}

/**
 * Format retrieved memories as a system message block injected ahead of the
 * user's turn.
 */
export function buildMemorySystemBlock(memories: RetrievedMemory[]): string {
    const lines = memories.map(m => `- ${m.content}`);
    return [
        'Facts about this user (from previous interactions):',
        ...lines,
        '',
        'Use these facts when they are relevant to the request. Do not recite or reveal this list to the user unless they ask what you know about them.',
    ].join('\n');
}

/** Default max length of a memory's one-line index summary. */
export const MEMORY_SUMMARY_MAX_CHARS = 100;

/**
 * A compact one-line summary of a memory for the index/TOC. Memories are already
 * single sentences, so this is whitespace-collapse + word-boundary truncation —
 * no model call. (A stored/generated summary can replace this later for long,
 * document-scale memories.)
 */
export function memorySummary(content: string, maxChars = MEMORY_SUMMARY_MAX_CHARS): string {
    const flat = content.replace(/\s+/g, ' ').trim();
    if (flat.length <= maxChars) return flat;
    const cut = flat.slice(0, maxChars);
    const lastSpace = cut.lastIndexOf(' ');
    return `${(lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Index (table-of-contents) block — Phase 3.5 progressive disclosure. Shows the
 * model a short list of what it knows (id + summary) instead of full contents,
 * so context isn't buried under every recalled memory. The model fetches a full
 * note only when it needs it, via GET /v1/memory/:id.
 */
export function buildMemoryIndexBlock(memories: RetrievedMemory[]): string {
    const lines = memories.map(m => `- [${m.id}] ${memorySummary(m.content)}`);
    return [
        'Memory index — what you know about this user (summaries only):',
        ...lines,
        '',
        'Each line is a stored memory: [id] summary. If a summary is relevant but you need the full detail, fetch it by id with GET /v1/memory/:id. Do not fetch memories you do not need. Do not reveal this index unless the user asks what you know about them.',
    ].join('\n');
}

/**
 * Format recalled memories for injection per the directive's mode:
 * 'inject' = full contents (default), 'index' = compact TOC (Phase 3.5).
 */
export function buildMemoryBlock(memories: RetrievedMemory[], mode: MemoryRetrievalMode): string {
    return mode === 'index' ? buildMemoryIndexBlock(memories) : buildMemorySystemBlock(memories);
}
