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
import { listSessionMemories } from './session-store';
import {
    DEFAULT_RETRIEVAL_THRESHOLD,
    toMemoryId,
    type MemoryDirective,
    type RetrievedMemory,
} from './types';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;
export type MemoryEmbeddingUsage = Omit<MemoryEmbeddingResult, 'embeddings'>;

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

        const { data, error } = await supabase.rpc('match_gateway_memories', {
            p_org_id: organizationId,
            p_project_id: projectId,
            p_scope: directive.scope,
            p_scope_key: directive.scopeKey,
            p_query_embedding: JSON.stringify(embeddingResult.embeddings[0]),
            p_threshold: effectiveThreshold,
            p_limit: directive.topK,
            p_namespace: directive.namespace,
        });

        if (error || !data) {
            if (error) console.warn('[Memory] Retrieval RPC failed:', error.message);
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
    } catch (error) {
        console.warn('[Memory] Retrieval failed (fail-open):', error);
        return [];
    }
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
