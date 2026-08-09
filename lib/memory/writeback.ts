/**
 * Memory writeback — quota check → redact → embed → insert, plus the
 * post-chat orchestrator handed to waitUntil(). Runs after the response has
 * flushed; every failure here is logged, never raised.
 */

import type { GatewayContext } from '@/lib/gateway-middleware';
import { logGatewayRequest, incrementUsage } from '@/lib/gateway-middleware';
import type { createAdminClient } from '@/lib/supabaseAdmin';
import type { SubscriptionTier } from '@/lib/entitlements';
import { embedForMemory } from './embeddings';
import { runEntityGraphWriteback, type EntityGraphWritebackResult } from './entity-persist';
import { extractFacts } from './extraction';
import { checkMemoryQuota } from './quota';
import { redactFact } from './redact';
import { reconcileFacts, hashContent, type ReconcileCandidate, type ReconcilePlan } from './reconcile';
import { appendSessionMemories } from './session-store';
import {
    MEMORY_CONTENT_MAX_CHARS,
    toMemoryId,
    type ExtractedFact,
    type MemoryDirective,
    type MemorySettings,
    type WrittenMemory,
} from './types';

/** Default reconciliation model when a caller doesn't pass one. */
const DEFAULT_RECONCILE_MODEL = 'gemini-2.5-flash';
/** Nearest active memories fetched per new fact as reconciliation candidates. */
const RECONCILE_CANDIDATES_PER_FACT = 6;

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
    expiresAt?: string | null;
    /**
     * Run Layer-1 conflict resolution (ADD/UPDATE/DELETE/NOOP) before persisting.
     * Defaults to true. Set false for the eval-harness baseline (blind insert).
     */
    reconcile?: boolean;
    /** Model used for the reconciliation decision (defaults to gemini-2.5-flash). */
    reconcileModel?: string;
}

export interface WriteMemoriesResult {
    written: WrittenMemory[];
    quotaExceeded: boolean;
    embeddingCostUsd: number;
    embeddingModel?: string;
    embeddingProvider?: 'openai' | 'google';
    /** How reconciliation resolved the batch (absent when reconcile=false). */
    reconciliation?: { added: number; updated: number; superseded: number; noop: number; fellBack: boolean };
}

/**
 * Persist facts as user-scope memories. Redaction runs per fact; blocked
 * facts are dropped. Org/project always come from the caller's authenticated
 * context — never from user input.
 */
export async function writeMemories(params: WriteMemoriesParams): Promise<WriteMemoriesResult> {
    const { supabase, organizationId, projectId, tier, scope, scopeKey, namespace, facts, metadata, expiresAt } = params;

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

    // Embed the new facts once — reused both to find reconciliation candidates
    // and (for ADDs) as the stored vector.
    const embedding = await embedForMemory(
        supabase,
        projectId,
        organizationId,
        redacted.map(f => f.content)
    );
    const embeddingByContent = new Map<string, number[]>();
    redacted.forEach((f, i) => embeddingByContent.set(f.content, embedding.embeddings[i]));

    let totalCostUsd = embedding.cencoriChargeUsd;

    // ── Layer 1: reconcile against existing memories ─────────────────────────
    const reconcileEnabled = params.reconcile !== false;
    let plan: ReconcilePlan;

    if (reconcileEnabled) {
        const candidateMap = new Map<string, ReconcileCandidate>();
        for (let i = 0; i < redacted.length; i++) {
            const { data: cands, error: candErr } = await supabase.rpc('match_gateway_memories_for_write', {
                p_org_id: organizationId,
                p_project_id: projectId,
                p_scope: scope,
                p_scope_key: scopeKey,
                p_query_embedding: JSON.stringify(embedding.embeddings[i]),
                p_limit: RECONCILE_CANDIDATES_PER_FACT,
                p_namespace: namespace,
            });
            if (candErr) {
                // Candidate lookup failed → skip reconciliation, insert as-is.
                console.warn('[Memory] Candidate lookup failed, inserting without reconcile:', candErr.message);
                candidateMap.clear();
                break;
            }
            for (const row of (cands ?? []) as Array<{ id: string; content: string; importance: number; content_hash: string | null }>) {
                candidateMap.set(row.id, {
                    id: row.id,
                    content: row.content,
                    importance: Number(row.importance),
                    contentHash: row.content_hash,
                });
            }
        }

        const reconciled = await reconcileFacts({
            supabase,
            projectId,
            organizationId,
            tier,
            model: params.reconcileModel || DEFAULT_RECONCILE_MODEL,
            facts: redacted.map(f => ({ content: f.content, importance: f.importance })),
            candidates: [...candidateMap.values()],
        });
        plan = reconciled.plan;
        totalCostUsd += reconciled.costUsd;
    } else {
        plan = {
            adds: redacted.map(f => ({ content: f.content, importance: f.importance })),
            updates: [],
            deletes: [],
            noops: 0,
            fellBack: false,
        };
    }

    const redactionByContent = new Map(redacted.map(f => [f.content, f.redactions]));
    const written: WrittenMemory[] = [];

    // ── Apply DELETEs (supersede stale/contradicted facts) ───────────────────
    for (const oldId of plan.deletes) {
        const { error: supErr } = await supabase.rpc('supersede_gateway_memory', {
            p_org_id: organizationId,
            p_old_id: oldId,
            p_new_id: null,
        });
        if (supErr) console.warn('[Memory] Supersede failed:', supErr.message);
    }

    // ── Apply UPDATEs as supersede-old + insert-new (Layer 3) ────────────────
    // A refinement/contradiction inserts the new fact as a fresh active row and
    // marks the old one superseded (valid_to=now, superseded_by=new id) rather
    // than mutating in place — so "what was true before" stays queryable, and
    // active count stays flat (one out, one in).
    if (plan.updates.length > 0) {
        const updateEmbedding = await embedForMemory(
            supabase,
            projectId,
            organizationId,
            plan.updates.map(u => u.content)
        );
        totalCostUsd += updateEmbedding.cencoriChargeUsd;
        for (let i = 0; i < plan.updates.length; i++) {
            const u = plan.updates[i];
            const content = u.content.slice(0, MEMORY_CONTENT_MAX_CHARS);
            const { data: ins, error: insErr } = await supabase
                .from('gateway_memories')
                .insert({
                    organization_id: organizationId,
                    project_id: projectId,
                    scope,
                    scope_key: scopeKey,
                    namespace,
                    content,
                    content_hash: hashContent(content),
                    embedding: JSON.stringify(updateEmbedding.embeddings[i]),
                    importance: u.importance,
                    metadata: { ...metadata, supersedes: u.id, reconciled: 'update' },
                    expires_at: expiresAt ?? null,
                })
                .select('id, content, importance')
                .single();
            if (insErr || !ins) {
                console.warn('[Memory] Update-insert failed:', insErr?.message);
                continue;
            }
            // Retire the old fact, linking it to its replacement.
            const { error: supErr } = await supabase.rpc('supersede_gateway_memory', {
                p_org_id: organizationId,
                p_old_id: u.id,
                p_new_id: ins.id,
            });
            if (supErr) console.warn('[Memory] Supersede-on-update failed:', supErr.message);
            written.push({ id: toMemoryId(ins.id), content: ins.content, importance: Number(ins.importance) });
        }
    }

    // ── Apply ADDs (insert genuinely new facts) ──────────────────────────────
    if (plan.adds.length > 0) {
        const rows = plan.adds.map(fact => ({
            organization_id: organizationId,
            project_id: projectId,
            scope,
            scope_key: scopeKey,
            namespace,
            content: fact.content,
            content_hash: hashContent(fact.content),
            embedding: JSON.stringify(embeddingByContent.get(fact.content) ?? []),
            importance: fact.importance,
            metadata: {
                ...metadata,
                piiRedactions: redactionByContent.get(fact.content) ?? 0,
                embeddingProvider: embedding.provider,
                embeddingModel: embedding.model,
            },
            expires_at: expiresAt ?? null,
        }));

        const { data, error } = await supabase
            .from('gateway_memories')
            .insert(rows)
            .select('id, content, importance');

        if (error) {
            console.error('[Memory] Insert failed:', error.message);
            return {
                written,
                quotaExceeded: false,
                embeddingCostUsd: totalCostUsd,
                embeddingModel: embedding.model,
                embeddingProvider: embedding.provider,
                reconciliation: reconcileEnabled
                    ? { added: 0, updated: plan.updates.length, superseded: plan.deletes.length, noop: plan.noops, fellBack: plan.fellBack }
                    : undefined,
            };
        }

        for (const row of data ?? []) {
            written.push({ id: toMemoryId(row.id), content: row.content, importance: Number(row.importance) });
        }
    }

    return {
        written,
        quotaExceeded: false,
        embeddingCostUsd: totalCostUsd,
        embeddingModel: embedding.model,
        embeddingProvider: embedding.provider,
        reconciliation: reconcileEnabled
            ? {
                added: plan.adds.length,
                updated: plan.updates.length,
                superseded: plan.deletes.length,
                noop: plan.noops,
                fellBack: plan.fellBack,
            }
            : undefined,
    };
}

export interface RememberExchangeResult {
    written: WrittenMemory[];
    extracted: number;
    quotaExceeded: boolean;
    costUsd: number;
    model: string;
    /** Entity-graph outcome for the exchange (absent when the graph is off). */
    graph?: EntityGraphWritebackResult;
}

/**
 * Extract facts from a single {user, assistant} exchange and persist them per
 * the directive's scope — the synchronous, result-returning core behind the
 * `POST /v1/memory/remember` endpoint (the SDK's `memory.remember` helper).
 *
 * Unlike runChatMemoryWriteback this returns what it wrote and does NOT log or
 * bill — the caller (which has the request/response lifecycle) does that.
 */
export async function rememberExchange(params: {
    supabase: SupabaseAdmin;
    organizationId: string;
    projectId: string;
    tier: SubscriptionTier;
    directive: MemoryDirective;
    settings: MemorySettings;
    userText: string;
    assistantText: string;
    requestId?: string;
    /** Override Layer-1 reconciliation (default on). The eval harness sets false for its baseline run. */
    reconcile?: boolean;
    /**
     * Override Layer-5 entity-graph writeback (default on, subject to the
     * project setting). The eval harness sets false so a run measures the
     * semantic layers without paying for a second extraction call per turn.
     */
    graph?: boolean;
}): Promise<RememberExchangeResult> {
    const { supabase, organizationId, projectId, tier, directive, settings, userText, assistantText, requestId } = params;

    const extraction = await extractFacts({
        supabase,
        projectId,
        organizationId,
        tier,
        settings,
        extractOverride: directive.extract,
        userText,
        assistantText,
        requestId,
    });

    if (extraction.facts.length === 0) {
        return { written: [], extracted: 0, quotaExceeded: false, costUsd: extraction.costUsd, model: extraction.model };
    }

    if (directive.scope === 'session') {
        const items: { content: string; importance: number }[] = [];
        for (const fact of extraction.facts) {
            const result = await redactFact(supabase, projectId, fact.content);
            if (result.blocked) continue;
            items.push({ content: result.content, importance: fact.importance });
        }
        await appendSessionMemories(
            organizationId,
            projectId,
            directive.scopeKey,
            items,
            settings.sessionTtlSeconds
        );
        return {
            written: items.map(i => ({ id: 'mem_session', content: i.content, importance: i.importance })),
            extracted: extraction.facts.length,
            quotaExceeded: false,
            costUsd: extraction.costUsd,
            model: extraction.model,
        };
    }

    const result = await writeMemories({
        supabase,
        organizationId,
        projectId,
        tier,
        scope: directive.scope,
        scopeKey: directive.scopeKey,
        namespace: directive.namespace,
        facts: extraction.facts,
        reconcile: params.reconcile,
        reconcileModel: extraction.model,
        metadata: {
            extractedFrom: 'chat',
            modelUsed: extraction.model,
            sourceRequestId: requestId,
        },
    });

    // Layer 5: entities + relations for the same exchange, linked to the facts
    // just written. Runs after the write (it needs their ids) and never throws.
    const graph = params.graph === false
        ? undefined
        : await runEntityGraphWriteback({
            supabase,
            organizationId,
            projectId,
            tier,
            settings,
            directive,
            userText,
            assistantText,
            written: result.written,
            requestId,
        });

    return {
        written: result.written,
        extracted: extraction.facts.length,
        quotaExceeded: result.quotaExceeded,
        costUsd: extraction.costUsd + result.embeddingCostUsd + (graph?.costUsd ?? 0),
        model: extraction.model,
        graph,
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
        let embeddingModel: string | undefined;
        let embeddingProvider: 'openai' | 'google' | undefined;
        let reconciliation: WriteMemoriesResult['reconciliation'];
        let graph: EntityGraphWritebackResult | undefined;

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
                reconcileModel: extraction.model,
                metadata: {
                    extractedFrom: 'chat',
                    modelUsed: extraction.model,
                    sourceRequestId: gatewayCtx.requestId,
                },
            });
            writtenCount = result.written.length;
            quotaExceeded = result.quotaExceeded;
            embeddingCostUsd = result.embeddingCostUsd;
            embeddingModel = result.embeddingModel;
            embeddingProvider = result.embeddingProvider;
            reconciliation = result.reconciliation;

            if (quotaExceeded) {
                // Response has already been sent — can't 429. Log it instead.
                console.warn(
                    `[Memory] Writeback dropped (quota exceeded) project=${gatewayCtx.projectId} request=${gatewayCtx.requestId}`
                );
            }

            // Layer 5: entities + relations for the same exchange, linked to
            // the facts just written. Never throws; a graph failure costs the
            // walk, not the facts.
            graph = await runEntityGraphWriteback({
                supabase,
                organizationId: gatewayCtx.organizationId,
                projectId: gatewayCtx.projectId,
                tier,
                settings,
                directive,
                userText,
                assistantText,
                written: result.written,
                requestId: gatewayCtx.requestId,
            });
        }

        const totalCost = extraction.costUsd + embeddingCostUsd + (graph?.costUsd ?? 0);
        await logGatewayRequest(gatewayCtx, {
            endpoint: 'memory/writeback',
            model: extraction.model,
            // Managed extraction + embeddings run on Google; only BYOK embeddings
            // are OpenAI. Reflect what actually ran, not a hardcoded 'openai'.
            provider: embeddingProvider ?? 'google',
            status: quotaExceeded ? 'error' : 'success',
            costUsd: totalCost,
            cencoriChargeUsd: totalCost,
            errorMessage: quotaExceeded ? 'memory_quota_exceeded' : undefined,
            metadata: {
                extracted: extraction.facts.length,
                written: writtenCount,
                scope: directive.scope,
                embedding_model: embeddingModel,
                embedding_provider: embeddingProvider,
                ...(reconciliation
                    ? {
                        reconcile_added: reconciliation.added,
                        reconcile_updated: reconciliation.updated,
                        reconcile_superseded: reconciliation.superseded,
                        reconcile_noop: reconciliation.noop,
                        reconcile_fell_back: reconciliation.fellBack,
                    }
                    : {}),
                ...(graph
                    ? {
                        graph_entities_created: graph.entitiesCreated,
                        graph_entities_merged: graph.entitiesMerged,
                        graph_edges_created: graph.edgesCreated,
                        graph_mentions_created: graph.mentionsCreated,
                    }
                    : {}),
            },
        });

        if (totalCost > 0) {
            await incrementUsage(gatewayCtx, totalCost);
        }
    } catch (error) {
        // Post-response: nothing to surface to the caller, everything to log.
        // Without this record a writeback that throws (e.g. the embedding
        // provider rate-limited, extraction failed) would vanish silently — the
        // client sees write_status 'pending' forever and nothing ever lands.
        // Make the failure visible in the request log instead.
        const message = error instanceof Error ? error.message : 'memory writeback failed';
        console.error('[Memory] Writeback failed:', error);
        try {
            await logGatewayRequest(gatewayCtx, {
                endpoint: 'memory/writeback',
                model: 'memory-writeback',
                provider: 'google',
                status: 'error',
                errorMessage: message,
                metadata: { scope: directive.scope, stage: 'writeback_exception' },
            });
        } catch (logError) {
            // Never let the failure logger become a new unhandled rejection
            // inside waitUntil().
            console.error('[Memory] Failed to log writeback failure:', logError);
        }
    }
}
