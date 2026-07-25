/**
 * Signed governance checkpoints (PRD M0.3 / Layer 3.2).
 *
 * A checkpoint pins the chain tail (up_to_seq, chain_hash, entry_count) and is
 * signed with an Ed25519 private key. Verification uses the public key alone —
 * so a bank's auditor can confirm the chain hasn't been rewritten WITHOUT
 * trusting Cencori (the "verify us, don't trust us" guarantee).
 *
 * Key handling: the private key comes from GOVERNANCE_SIGNING_PRIVATE_KEY (PEM)
 * today; moving it into a managed KMS later changes only signCheckpoint()'s
 * source of the key — the preimage and public-key verification are unchanged.
 * Generate a keypair with: npx tsx scripts/gen-governance-signing-key.ts
 */

import crypto from 'crypto';
import type { createAdminClient } from '@/lib/supabaseAdmin';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export const CHECKPOINT_ALGORITHM = 'ed25519';
export const GOVERNANCE_SIGNING_KEY_ID = process.env.GOVERNANCE_SIGNING_KEY_ID || 'gov-key-1';

export interface CheckpointTail {
    orgId: string;
    upToSeq: number;
    chainHash: string;
    entryCount: number;
}

/** Deterministic signing preimage. Field-separated by 0x1E (record separator). */
export function checkpointPreimage(t: CheckpointTail): string {
    return [t.orgId, t.upToSeq, t.chainHash, t.entryCount].join('\x1e');
}

/** Ed25519 sign (algorithm arg is null for Ed25519). Returns base64. */
export function signCheckpoint(preimage: string, privateKeyPem: string): string {
    const key = crypto.createPrivateKey(privateKeyPem);
    return crypto.sign(null, Buffer.from(preimage, 'utf8'), key).toString('base64');
}

/** Ed25519 verify. Returns false on any error (bad key, bad signature, tamper). */
export function verifyCheckpointSignature(
    preimage: string,
    signatureB64: string,
    publicKeyPem: string,
): boolean {
    try {
        return crypto.verify(
            null,
            Buffer.from(preimage, 'utf8'),
            crypto.createPublicKey(publicKeyPem),
            Buffer.from(signatureB64, 'base64'),
        );
    } catch {
        return false;
    }
}

function loadPrivateKeyPem(): string | null {
    return process.env.GOVERNANCE_SIGNING_PRIVATE_KEY || null;
}

export interface SignedCheckpointResult {
    id: string | null;
    upToSeq: number;
    chainHash: string;
    entryCount: number;
    signed: boolean;
}

/**
 * Create a signed checkpoint for an org: read tail → sign → persist. Returns
 * null if the org has no ledger entries. If no signing key is configured the
 * checkpoint is still created (unsigned) so the chain stays anchored.
 */
export async function createSignedGovernanceCheckpoint(
    supabase: SupabaseAdmin,
    orgId: string,
): Promise<SignedCheckpointResult | null> {
    const { data: tailData, error: tailErr } = await supabase.rpc('governance_checkpoint_tail', {
        p_org_id: orgId,
    });
    if (tailErr) throw new Error(`checkpoint tail failed: ${tailErr.message}`);
    const tail = Array.isArray(tailData) ? tailData[0] : tailData;
    if (!tail || tail.up_to_seq == null) return null;

    const t: CheckpointTail = {
        orgId,
        upToSeq: Number(tail.up_to_seq),
        chainHash: tail.chain_hash,
        entryCount: Number(tail.entry_count),
    };

    const privateKeyPem = loadPrivateKeyPem();
    const signature = privateKeyPem ? signCheckpoint(checkpointPreimage(t), privateKeyPem) : null;

    const { data, error } = await supabase.rpc('insert_signed_governance_checkpoint', {
        p_org_id: orgId,
        p_up_to_seq: t.upToSeq,
        p_chain_hash: t.chainHash,
        p_entry_count: t.entryCount,
        p_signature: signature,
        p_signing_key_id: signature ? GOVERNANCE_SIGNING_KEY_ID : null,
        p_algorithm: signature ? CHECKPOINT_ALGORITHM : null,
    });
    if (error) throw new Error(`checkpoint insert failed: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    return {
        id: row?.id ?? null,
        upToSeq: t.upToSeq,
        chainHash: t.chainHash,
        entryCount: t.entryCount,
        signed: !!signature,
    };
}

export interface CheckpointVerification {
    ok: boolean;
    total: number;
    signed: number;
    failures: Array<{ upToSeq: number; reason: string }>;
}

/**
 * Verify every signed checkpoint's signature for an org against the public key.
 * Unsigned checkpoints (created before signing was configured) are skipped, not
 * failed. This is what an auditor runs with the published public key.
 */
export async function verifyCheckpointSignatures(
    supabase: SupabaseAdmin,
    orgId: string,
    publicKeyPem?: string,
): Promise<CheckpointVerification> {
    const pub = publicKeyPem || process.env.GOVERNANCE_SIGNING_PUBLIC_KEY || undefined;

    const { data, error } = await supabase
        .from('governance_checkpoints')
        .select('up_to_seq, chain_hash, entry_count, signature')
        .eq('org_id', orgId)
        .order('up_to_seq', { ascending: true });
    if (error) throw new Error(`read checkpoints failed: ${error.message}`);

    const rows = (data ?? []) as Array<{
        up_to_seq: number | string; chain_hash: string; entry_count: number | string; signature: string | null;
    }>;
    const failures: Array<{ upToSeq: number; reason: string }> = [];
    let signed = 0;

    for (const r of rows) {
        if (!r.signature) continue; // unsigned — skip
        signed++;
        const upToSeq = Number(r.up_to_seq);
        if (!pub) {
            failures.push({ upToSeq, reason: 'no public key available to verify' });
            continue;
        }
        const preimage = checkpointPreimage({
            orgId, upToSeq, chainHash: r.chain_hash, entryCount: Number(r.entry_count),
        });
        if (!verifyCheckpointSignature(preimage, r.signature, pub)) {
            failures.push({ upToSeq, reason: 'signature invalid (chain rewritten or wrong key)' });
        }
    }

    return { ok: failures.length === 0, total: rows.length, signed, failures };
}
