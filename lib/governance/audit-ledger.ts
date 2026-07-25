/**
 * Governance Audit Ledger (PRD M0.1) — client for the immutable, hash-chained,
 * append-only audit ledger. Every governance-relevant event is appended as a
 * link in a per-org hash chain (see 20260724_000000_governance_audit_ledger.sql).
 *
 * Never pass raw prompt/response content here — hash it first with hashContent()
 * and pass request_hash / response_hash. The ledger stores hashes, not content.
 */

import crypto from 'crypto';
import type { createAdminClient } from '@/lib/supabaseAdmin';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

/** prev_hash of the first entry in every org's chain. */
export const GENESIS_HASH = '0'.repeat(64);

/**
 * DB entry-hash construction (for the fast-follow independent TS verifier):
 *   entry_hash = sha256_hex( UTF8( prev_hash + chr(0x1E) + canonical ) )
 * where `canonical` = the row fields joined by chr(0x1E) in the order defined
 * in governance_ledger_canonical() (see the migration). sha256() is the
 * Postgres 14+ built-in over UTF-8 bytes — matches Node's crypto sha256/utf8.
 */
export const FIELD_SEP = '\x1e';

export type GovernanceDecision =
    | 'allow' | 'block' | 'redact' | 'tokenize' | 'route' | 'require_approval' | 'rate_limit';

export interface GovernanceAuditInput {
    /** Owning organization — the chain is per-org. Required. */
    orgId: string;
    /** e.g. 'request.decision', 'policy.activated', 'key.revealed', 'killswitch.engaged'. Required. */
    eventType: string;
    projectId?: string | null;
    actorId?: string | null;
    actorType?: 'user' | 'system' | 'api' | 'webhook';
    actorEmail?: string | null;
    actorIp?: string | null;
    model?: string | null;
    modelVersion?: string | null;
    decision?: GovernanceDecision | null;
    /** sha256 of the prompt — use hashContent(). Never the raw prompt. */
    requestHash?: string | null;
    /** sha256 of the completion — use hashContent(). Never the raw completion. */
    responseHash?: string | null;
    policiesFired?: unknown[];
    rationale?: string | null;
    confidence?: number | null;
    redactions?: unknown[];
    /** Structured event detail (metadata only — no raw sensitive content). */
    payload?: Record<string, unknown>;
    /**
     * Idempotency key. A retried or redriven append with the same (org, key)
     * is a no-op that returns the existing entry — so at-least-once delivery
     * never double-counts the chain. Typically `${requestId}:${status}`.
     */
    dedupeKey?: string | null;
}

export interface GovernanceAuditEntryRef {
    id: string;
    seq: number;
    entryHash: string;
    prevHash: string;
}

export interface ChainVerification {
    ok: boolean;
    entries: number;
    firstBadSeq: number | null;
    reason: string;
}

/** SHA-256 hex of content — store this in the ledger, never the raw content. */
export function hashContent(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Append one immutable, hash-chained entry. Atomic + race-safe: the RPC
 * serializes appends per-org, so the chain is always linear. Returns the new
 * entry's position + hash.
 */
export async function appendGovernanceAuditEntry(
    supabase: SupabaseAdmin,
    input: GovernanceAuditInput,
): Promise<GovernanceAuditEntryRef> {
    const { data, error } = await supabase.rpc('append_governance_audit_entry', {
        p_org_id: input.orgId,
        p_event_type: input.eventType,
        p_project_id: input.projectId ?? null,
        p_actor_id: input.actorId ?? null,
        p_actor_type: input.actorType ?? 'system',
        p_actor_email: input.actorEmail ?? null,
        p_actor_ip: input.actorIp ?? null,
        p_model: input.model ?? null,
        p_model_version: input.modelVersion ?? null,
        p_decision: input.decision ?? null,
        p_request_hash: input.requestHash ?? null,
        p_response_hash: input.responseHash ?? null,
        p_policies_fired: (input.policiesFired ?? []) as unknown,
        p_rationale: input.rationale ?? null,
        p_confidence: input.confidence ?? null,
        p_redactions: (input.redactions ?? []) as unknown,
        p_payload: (input.payload ?? {}) as unknown,
        p_dedupe_key: input.dedupeKey ?? null,
    });
    if (error) throw new Error(`Failed to append governance audit entry: ${error.message}`);
    const row = (Array.isArray(data) ? data[0] : data) as {
        id: string; seq: number | string; entry_hash: string; prev_hash: string;
    };
    return { id: row.id, seq: Number(row.seq), entryHash: row.entry_hash, prevHash: row.prev_hash };
}

/**
 * Authoritative (DB-side) verification: recomputes every entry_hash and checks
 * linkage, sequence continuity, and checkpoint pinning. Auditors can run this
 * against a read replica to verify integrity without trusting the app layer.
 */
export async function verifyGovernanceAuditChain(
    supabase: SupabaseAdmin,
    orgId: string,
): Promise<ChainVerification> {
    const { data, error } = await supabase.rpc('verify_governance_audit_chain', { p_org_id: orgId });
    if (error) throw new Error(`Chain verification failed to run: ${error.message}`);
    const row = (Array.isArray(data) ? data[0] : data) as {
        ok: boolean; entries: number | string; first_bad_seq: number | string | null; reason: string;
    };
    return {
        ok: row.ok,
        entries: Number(row.entries),
        firstBadSeq: row.first_bad_seq == null ? null : Number(row.first_bad_seq),
        reason: row.reason,
    };
}

/** Anchor the current chain tail with a checkpoint (idempotent per (org, tail seq)). */
export async function createGovernanceCheckpoint(
    supabase: SupabaseAdmin,
    orgId: string,
): Promise<{ id: string; upToSeq: number; chainHash: string; entryCount: number }> {
    const { data, error } = await supabase.rpc('create_governance_checkpoint', { p_org_id: orgId });
    if (error) throw new Error(`Failed to create governance checkpoint: ${error.message}`);
    const row = (Array.isArray(data) ? data[0] : data) as {
        id: string; up_to_seq: number | string; chain_hash: string; entry_count: number | string;
    };
    return {
        id: row.id,
        upToSeq: Number(row.up_to_seq),
        chainHash: row.chain_hash,
        entryCount: Number(row.entry_count),
    };
}

// ── Independent structural verification (no DB trust required) ───────────────
// Given only the stored (seq, prev_hash, entry_hash) values + checkpoints, this
// detects deletion, truncation, reordering, and insertion by verifying
// sequence monotonicity, prev/entry-hash linkage, and checkpoint pinning — with
// zero reliance on the DB re-running its own verifier. (Reproducing the content
// hash from row fields in pure TS — matching Postgres jsonb canonicalization —
// is the fast-follow that closes full independent content verification.)

export interface LedgerRowLite { seq: number; prev_hash: string; entry_hash: string; }
export interface CheckpointLite { up_to_seq: number; chain_hash: string; }

export function verifyChainStructure(
    rows: LedgerRowLite[],
    checkpoints: CheckpointLite[] = [],
): ChainVerification {
    const ordered = [...rows].sort((a, b) => a.seq - b.seq);
    let expectedPrev = GENESIS_HASH;
    let expectedSeq = 1;

    for (const r of ordered) {
        if (r.seq !== expectedSeq) {
            return { ok: false, entries: ordered.length, firstBadSeq: r.seq,
                reason: `seq gap: expected ${expectedSeq}, got ${r.seq} (insertion/deletion)` };
        }
        if (r.prev_hash !== expectedPrev) {
            return { ok: false, entries: ordered.length, firstBadSeq: r.seq,
                reason: 'prev_hash mismatch (broken link / deletion)' };
        }
        expectedPrev = r.entry_hash;
        expectedSeq += 1;
    }

    const bySeq = new Map(ordered.map(r => [r.seq, r.entry_hash]));
    for (const c of checkpoints) {
        const h = bySeq.get(c.up_to_seq);
        if (h === undefined) {
            return { ok: false, entries: ordered.length, firstBadSeq: c.up_to_seq,
                reason: `checkpoint at seq ${c.up_to_seq} has no matching entry (truncation)` };
        }
        if (h !== c.chain_hash) {
            return { ok: false, entries: ordered.length, firstBadSeq: c.up_to_seq,
                reason: `checkpoint chain_hash mismatch at seq ${c.up_to_seq}` };
        }
    }

    return { ok: true, entries: ordered.length, firstBadSeq: null, reason: 'structure valid' };
}
