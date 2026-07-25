/**
 * Reliable, provably-complete delivery of governance ledger entries (PRD M0.2).
 *
 * Delivery guarantee: an entry lands in the ledger OR in the dead-letter table —
 * it is NEVER silently lost. Retries and redrives are idempotent (the append
 * dedupes on dedupe_key), so at-least-once delivery cannot double-count the
 * chain. Callers run this inside waitUntil() so it survives past the response.
 */

import type { createAdminClient } from '@/lib/supabaseAdmin';
import { appendGovernanceAuditEntry, type GovernanceAuditInput } from '@/lib/governance/audit-ledger';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 40;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Append with in-process retry; on exhaustion, capture the event in the
 * dead-letter table so a cron worker can redrive it. Never throws.
 */
export async function deliverAuditEntry(
    supabase: SupabaseAdmin,
    input: GovernanceAuditInput,
): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            await appendGovernanceAuditEntry(supabase, input);
            return;
        } catch (err) {
            lastError = err;
            if (attempt < MAX_ATTEMPTS) {
                await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
            }
        }
    }
    await deadLetter(supabase, input, lastError);
}

async function deadLetter(
    supabase: SupabaseAdmin,
    input: GovernanceAuditInput,
    error: unknown,
): Promise<void> {
    try {
        const { error: dlError } = await supabase.from('governance_ledger_deadletter').insert({
            org_id: input.orgId,
            dedupe_key: input.dedupeKey ?? null,
            event: input as unknown,
            attempts: MAX_ATTEMPTS,
            last_error: error instanceof Error ? error.message : String(error),
            status: 'pending',
        });
        if (dlError) {
            // Last resort — the append AND the dead-letter both failed.
            console.error('[Governance] Dead-letter insert failed; event at risk:', dlError.message, input.dedupeKey);
        }
    } catch (err) {
        console.error('[Governance] Dead-letter insert threw; event at risk:', err);
    }
}

export interface RedriveResult {
    processed: number;
    delivered: number;
    stillPending: number;
}

/**
 * Redrive pending dead-lettered entries into the ledger (idempotent — the
 * append dedupes). Called by the governance redrive cron. Marks each delivered
 * row so it isn't reprocessed.
 */
export async function redriveGovernanceDeadletter(
    supabase: SupabaseAdmin,
    limit = 200,
): Promise<RedriveResult> {
    const { data: rows, error } = await supabase
        .from('governance_ledger_deadletter')
        .select('id, event')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(limit);

    if (error) {
        console.error('[Governance] Redrive read failed:', error.message);
        return { processed: 0, delivered: 0, stillPending: 0 };
    }

    let delivered = 0;
    let stillPending = 0;
    for (const row of rows ?? []) {
        try {
            await appendGovernanceAuditEntry(supabase, (row as { event: GovernanceAuditInput }).event);
            await supabase
                .from('governance_ledger_deadletter')
                .update({ status: 'delivered', delivered_at: new Date().toISOString() })
                .eq('id', (row as { id: string }).id);
            delivered++;
        } catch (err) {
            stillPending++;
            await supabase
                .from('governance_ledger_deadletter')
                .update({ last_error: err instanceof Error ? err.message : String(err) })
                .eq('id', (row as { id: string }).id);
        }
    }

    return { processed: rows?.length ?? 0, delivered, stillPending };
}
