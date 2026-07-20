/**
 * Memory reconciliation — Phase 3, Layer 1.
 *
 * The difference between "a vector store with a memory label" and actual memory.
 * Before persisting newly-extracted facts, we compare each against the
 * semantically-nearest existing memories and decide the minimal set of
 * operations: ADD (genuinely new), NOOP (already known), UPDATE (refines or
 * contradicts an existing fact → rewrite it in place), or DELETE (a fact was
 * retired with no replacement → supersede it).
 *
 * Without this, "I use Python" then "I moved to Rust" stores BOTH and injects
 * BOTH into the next turn. That is the exact Mem0 weakness this closes.
 *
 * Fail-open by contract: any failure (LLM error, unparseable plan) falls back
 * to plain ADD of every fact — i.e. the pre-Layer-1 blind-insert behaviour.
 * Reconciliation can improve memory; it can never lose a fact or block a write.
 */

import { createHash } from 'crypto';
import { executeGatewayChat } from '@/lib/gateway/chat-executor';
import { getMemoryGoogleApiKey } from '@/lib/providers/google-env';
import type { createAdminClient } from '@/lib/supabaseAdmin';
import type { SubscriptionTier } from '@/lib/entitlements';
import { ensureGoogleMemoryModel, type ExtractedFact } from './types';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

/** An existing active memory that a new fact might duplicate/contradict. */
export interface ReconcileCandidate {
    id: string;              // raw uuid
    content: string;
    importance: number;
    contentHash: string | null;
}

/** The resolved plan, addressed by raw uuid / fact content — ready to apply. */
export interface ReconcilePlan {
    /** Genuinely new facts to insert. */
    adds: { content: string; importance: number }[];
    /** Existing rows to rewrite in place (id preserved), re-embedded. */
    updates: { id: string; content: string; importance: number }[];
    /** Existing rows to supersede (status='superseded', valid_to=now). */
    deletes: string[];
    /** Count of facts judged already-known (no write). */
    noops: number;
    /** True when the LLM was skipped or failed and we fell back to all-ADD. */
    fellBack: boolean;
}

/** Normalize then hash content for a cheap exact-duplicate probe. */
export function hashContent(content: string): string {
    const normalized = content.trim().toLowerCase().replace(/\s+/g, ' ');
    return createHash('sha256').update(normalized).digest('hex');
}

const RECONCILE_SYSTEM_PROMPT = `You maintain a user's long-term memory so it stays consistent and non-redundant.

You are given EXISTING memories (each labelled E0, E1, ...) and NEW candidate facts (each labelled N0, N1, ...). For EACH new fact, choose exactly one action:

- ADD: the fact is genuinely new — no existing memory covers it.
- NOOP: an existing memory already states this — nothing to do.
- UPDATE: the fact refines, extends, or CONTRADICTS an existing memory. Provide the existing label and the full rewritten memory text that should replace it. For a contradiction, the rewrite is the NEW truth. For a refinement, merge both into one sentence.

Separately, you MAY retire an existing memory that a new fact makes false WITHOUT a replacement:
- DELETE: give the existing label; use this only when the fact says something is no longer true and there is nothing to store in its place.

Rules:
- Prefer UPDATE over ADD when a new fact conflicts with or refines an existing memory — never leave two contradictory memories.
- Each existing memory may be targeted by at most one UPDATE or DELETE.
- Keep rewritten text a single self-contained sentence, no more than 300 characters.

Respond with ONLY JSON (no prose, no code fences):
{"operations": [{"action": "ADD", "new": 0}, {"action": "UPDATE", "new": 1, "existing": 2, "content": "..."}, {"action": "NOOP", "new": 3}, {"action": "DELETE", "existing": 0}]}`;

/** Build the user message pairing existing memories with new facts. */
export function buildReconcileUserMessage(
    facts: ExtractedFact[],
    candidates: ReconcileCandidate[]
): string {
    const existing = candidates.length
        ? candidates.map((c, i) => `E${i}: ${c.content}`).join('\n')
        : '(none)';
    const incoming = facts.map((f, i) => `N${i}: ${f.content}`).join('\n');
    return `EXISTING memories:\n${existing}\n\nNEW candidate facts:\n${incoming}`;
}

interface RawOperation {
    action?: unknown;
    new?: unknown;
    existing?: unknown;
    content?: unknown;
}

/**
 * Defensive parse of the model's plan into a concrete, validated ReconcilePlan.
 * Any new fact the model fails to address defaults to ADD — a fact is never
 * silently dropped. Out-of-range indices are ignored. Exported for tests.
 */
export function parseReconcilePlan(
    raw: string,
    facts: ExtractedFact[],
    candidates: ReconcileCandidate[]
): ReconcilePlan {
    const fallback = (): ReconcilePlan => ({
        adds: facts.map(f => ({ content: f.content, importance: f.importance })),
        updates: [],
        deletes: [],
        noops: 0,
        fellBack: true,
    });

    let text = (raw ?? '').trim();
    if (!text) return fallback();

    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) text = fence[1].trim();
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) text = objMatch[0];

    let ops: RawOperation[];
    try {
        const parsed = JSON.parse(text) as { operations?: unknown };
        if (!parsed || !Array.isArray(parsed.operations)) return fallback();
        ops = parsed.operations as RawOperation[];
    } catch {
        return fallback();
    }

    const adds: ReconcilePlan['adds'] = [];
    const updates: ReconcilePlan['updates'] = [];
    const deletes: string[] = [];
    let noops = 0;

    const handledFacts = new Set<number>();
    const touchedExisting = new Set<number>(); // each existing targeted once

    const validNew = (v: unknown): v is number =>
        typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < facts.length;
    const validExisting = (v: unknown): v is number =>
        typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < candidates.length;

    for (const op of ops) {
        const action = typeof op.action === 'string' ? op.action.toUpperCase() : '';

        if (action === 'ADD' && validNew(op.new) && !handledFacts.has(op.new)) {
            handledFacts.add(op.new);
            adds.push({ content: facts[op.new].content, importance: facts[op.new].importance });
        } else if (action === 'NOOP' && validNew(op.new) && !handledFacts.has(op.new)) {
            handledFacts.add(op.new);
            noops++;
        } else if (
            action === 'UPDATE' &&
            validNew(op.new) &&
            validExisting(op.existing) &&
            !handledFacts.has(op.new) &&
            !touchedExisting.has(op.existing)
        ) {
            const content = typeof op.content === 'string' ? op.content.trim() : '';
            if (!content) {
                // UPDATE without replacement text is meaningless — treat as ADD.
                handledFacts.add(op.new);
                adds.push({ content: facts[op.new].content, importance: facts[op.new].importance });
                continue;
            }
            handledFacts.add(op.new);
            touchedExisting.add(op.existing);
            updates.push({
                id: candidates[op.existing].id,
                content,
                importance: Math.max(candidates[op.existing].importance, facts[op.new].importance),
            });
        } else if (
            action === 'DELETE' &&
            validExisting(op.existing) &&
            !touchedExisting.has(op.existing)
        ) {
            touchedExisting.add(op.existing);
            deletes.push(candidates[op.existing].id);
        }
    }

    // Any new fact the model never addressed → ADD it (never drop a fact).
    for (let i = 0; i < facts.length; i++) {
        if (!handledFacts.has(i)) {
            adds.push({ content: facts[i].content, importance: facts[i].importance });
        }
    }

    return { adds, updates, deletes, noops, fellBack: false };
}

export interface ReconcileParams {
    supabase: SupabaseAdmin;
    projectId: string;
    organizationId: string;
    tier: SubscriptionTier;
    model: string;
    facts: ExtractedFact[];
    candidates: ReconcileCandidate[];
    requestId?: string;
}

export interface ReconcileResult {
    plan: ReconcilePlan;
    costUsd: number;
}

/**
 * Decide ADD/UPDATE/DELETE/NOOP for a batch of new facts against the nearest
 * existing memories. Never throws — on any failure returns an all-ADD plan.
 */
export async function reconcileFacts(params: ReconcileParams): Promise<ReconcileResult> {
    const { supabase, projectId, organizationId, tier, model, facts, candidates, requestId } = params;

    const allAdd = (fellBack: boolean): ReconcileResult => ({
        plan: {
            adds: facts.map(f => ({ content: f.content, importance: f.importance })),
            updates: [],
            deletes: [],
            noops: 0,
            fellBack,
        },
        costUsd: 0,
    });

    // No existing memories → everything is new. Skip the LLM entirely.
    if (candidates.length === 0) {
        return allAdd(false);
    }

    // Exact-duplicate short-circuit: facts whose normalized hash already exists
    // are NOOPs and don't need the model. If that clears every fact, skip the call.
    const candidateHashes = new Set(candidates.map(c => c.contentHash).filter(Boolean) as string[]);
    const remaining: ExtractedFact[] = [];
    let exactNoops = 0;
    for (const fact of facts) {
        if (candidateHashes.has(hashContent(fact.content))) {
            exactNoops++;
        } else {
            remaining.push(fact);
        }
    }

    if (remaining.length === 0) {
        return { plan: { adds: [], updates: [], deletes: [], noops: exactNoops, fellBack: false }, costUsd: 0 };
    }

    try {
        const response = await executeGatewayChat({
            supabase,
            projectId,
            organizationId,
            tier,
            requestId,
            googleApiKeyOverride: getMemoryGoogleApiKey() ?? undefined,
            googleOnly: true,
            request: {
                model: ensureGoogleMemoryModel(model),
                temperature: 0,
                maxTokens: 800,
                messages: [
                    { role: 'system', content: RECONCILE_SYSTEM_PROMPT },
                    { role: 'user', content: buildReconcileUserMessage(remaining, candidates) },
                ],
            },
        });

        const plan = parseReconcilePlan(response.content ?? '', remaining, candidates);
        plan.noops += exactNoops;
        return { plan, costUsd: response.cost?.cencoriChargeUsd ?? 0 };
    } catch (error) {
        console.warn('[Memory] Reconciliation failed, falling back to ADD-all:', error);
        const plan = allAdd(true).plan;
        plan.noops = exactNoops;
        return { plan, costUsd: 0 };
    }
}
