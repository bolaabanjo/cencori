/**
 * Memory writeback — quota check → redact → embed → insert, plus the
 * post-chat orchestrator handed to waitUntil(). Runs after the response has
 * flushed; every failure here is logged, never raised.
 */

import type { GatewayContext } from '@/lib/gateway-middleware';
import { logGatewayRequest, incrementUsage } from '@/lib/gateway-middleware';
import type { createAdminClient } from '@/lib/supabaseAdmin';
import type { SubscriptionTier } from '@/lib/entitlements';
import { embedForMemory, MEMORY_EMBEDDING_MODEL } from './embeddings';
import { extractFacts } from './extraction';
import { checkMemoryQuota } from './quota';
import { redactFact } from './redact';
import { appendSessionMemories } from './session-store';
import {
    MEMORY_CONTENT_MAX_CHARS,
    toMemoryId,
    type ExtractedFact,
    type MemoryDirective,
    type MemorySettings,
    type WrittenMemory,
} from './types';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export interface WriteMemoriesParams {
    supabase: SupabaseAdmin;
    organizationId: string;
    projectId: string;
    tier: SubscriptionTier;
    scope: 'user' | 'workspace' | 'org';
    scopeKey: string;
    namespace: string | null;
    facts: ExtractedFact[];
    metadata?: Record<string, unknown>;
}

export interface WriteMemoriesResult {
    written: WrittenMemory[];
    quotaExceeded: boolean;
    embeddingCostUsd: number;
}

/**
 * Persist facts as user-scope memories. Redaction runs per fact; blocked
 * facts are dropped. Org/project always come from the caller's authenticated
 * context — never from user input.
 */
export async function writeMemories(params: WriteMemoriesParams): Promise<WriteMemoriesResult> {
    const { supabase, organizationId, projectId, tier, scope, scopeKey, namespace, facts, metadata } = params;

    if (facts.length === 0) {
        return { written: [], quotaExceeded: false, embeddingCostUsd: 0 };
    }

    const quota = await checkMemoryQuota(supabase, projectId, tier);
    if (!quota.allowed) {
        return { written: [], quotaExceeded: true, embeddingCostUsd: 0 };
    }

    // Redact before anything persists; drop blocked facts.
    const redacted: { content: string; importance: number; redactions: number }[] = [];
    for (const fact of facts) {
        const result = await redactFact(supabase, projectId, fact.content);
        if (result.blocked) continue;
        redacted.push({
            content: result.content.slice(0, MEMORY_CONTENT_MAX_CHARS),
            importance: fact.importance,
            redactions: result.redactions,
        });
    }

    if (redacted.length === 0) {
        return { written: [], quotaExceeded: false, embeddingCostUsd: 0 };
    }

    const embedding = await embedForMemory(
        supabase,
        projectId,
        organizationId,
        redacted.map(f => f.content)
    );

    const rows = redacted.map((fact, i) => ({
        organization_id: organizationId,
        project_id: projectId,
        scope,
        scope_key: scopeKey,
        namespace,
        content: fact.content,
        embedding: JSON.stringify(embedding.embeddings[i]),
        importance: fact.importance,
        metadata: {
            ...metadata,
            piiRedactions: fact.redactions,
        },
    }));

    const { data, error } = await supabase
        .from('gateway_memories')
        .insert(rows)
        .select('id, content, importance');

    if (error) {
        console.error('[Memory] Insert failed:', error.message);
        return { written: [], quotaExceeded: false, embeddingCostUsd: embedding.cencoriChargeUsd };
    }

    return {
        written: (data ?? []).map(row => ({
            id: toMemoryId(row.id),
            content: row.content,
            importance: Number(row.importance),
        })),
        quotaExceeded: false,
        embeddingCostUsd: embedding.cencoriChargeUsd,
    };
}

/**
 * Post-chat writeback orchestrator — the function handed to waitUntil().
 * Extracts facts from the exchange, then persists per the directive's scope.
 */
export async function runChatMemoryWriteback(params: {
    supabase: SupabaseAdmin;
    gatewayCtx: GatewayContext;
    directive: MemoryDirective;
    settings: MemorySettings;
    userText: string;
    assistantText: string;
}): Promise<void> {
    const { supabase, gatewayCtx, directive, settings, userText, assistantText } = params;
    const tier = gatewayCtx.tier as SubscriptionTier;

    try {
        const extraction = await extractFacts({
            supabase,
            projectId: gatewayCtx.projectId,
            organizationId: gatewayCtx.organizationId,
            tier,
            settings,
            extractOverride: directive.extract,
            userText,
            assistantText,
            requestId: gatewayCtx.requestId,
        });

        if (extraction.facts.length === 0) {
            return;
        }

        let writtenCount = 0;
        let quotaExceeded = false;
        let embeddingCostUsd = 0;

        if (directive.scope === 'session') {
            // Redact, then append to the Redis session list (no embeddings).
            const items: { content: string; importance: number }[] = [];
            for (const fact of extraction.facts) {
                const result = await redactFact(supabase, gatewayCtx.projectId, fact.content);
                if (result.blocked) continue;
                items.push({ content: result.content, importance: fact.importance });
            }
            await appendSessionMemories(
                gatewayCtx.organizationId,
                gatewayCtx.projectId,
                directive.scopeKey,
                items,
                settings.sessionTtlSeconds
            );
            writtenCount = items.length;
        } else {
            const result = await writeMemories({
                supabase,
                organizationId: gatewayCtx.organizationId,
                projectId: gatewayCtx.projectId,
                tier,
                scope: directive.scope,
                scopeKey: directive.scopeKey,
                namespace: directive.namespace,
                facts: extraction.facts,
                metadata: {
                    extractedFrom: 'chat',
                    modelUsed: extraction.model,
                    sourceRequestId: gatewayCtx.requestId,
                },
            });
            writtenCount = result.written.length;
            quotaExceeded = result.quotaExceeded;
            embeddingCostUsd = result.embeddingCostUsd;

            if (quotaExceeded) {
                // Response has already been sent — can't 429. Log it instead.
                console.warn(
                    `[Memory] Writeback dropped (quota exceeded) project=${gatewayCtx.projectId} request=${gatewayCtx.requestId}`
                );
            }
        }

        const totalCost = extraction.costUsd + embeddingCostUsd;
        await logGatewayRequest(gatewayCtx, {
            endpoint: 'memory/writeback',
            model: extraction.model,
            provider: 'openai',
            status: quotaExceeded ? 'error' : 'success',
            costUsd: totalCost,
            cencoriChargeUsd: totalCost,
            errorMessage: quotaExceeded ? 'memory_quota_exceeded' : undefined,
            metadata: {
                extracted: extraction.facts.length,
                written: writtenCount,
                scope: directive.scope,
                embedding_model: MEMORY_EMBEDDING_MODEL,
            },
        });

        if (totalCost > 0) {
            await incrementUsage(gatewayCtx, totalCost);
        }
    } catch (error) {
        // Post-response: nothing to surface, everything to log.
        console.error('[Memory] Writeback failed:', error);
    }
}
