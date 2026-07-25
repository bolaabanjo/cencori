/**
 * Independent governance audit-ledger verifier (PRD M0.1).
 *
 * Runs BOTH checks against an org's chain:
 *   1. Authoritative DB verification (recomputes every entry_hash server-side).
 *   2. Independent structural verification in-process (seq/linkage/checkpoints)
 *      — no reliance on the DB re-running its own verifier.
 *
 * Intended for a bank's own auditor: point it at a read replica and verify
 * integrity without trusting the application layer. "Don't trust us — verify us."
 *
 *   npx tsx scripts/verify-audit-ledger.ts <organizationId>
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { verifyChainStructure, type LedgerRowLite, type CheckpointLite } from '../lib/governance/audit-ledger';
import { verifyCheckpointSignatures } from '../lib/governance/checkpoint';

dotenv.config({ path: '.env.local' });

async function main() {
    const orgId = process.argv[2];
    if (!orgId) {
        console.error('Usage: npx tsx scripts/verify-audit-ledger.ts <organizationId>');
        process.exit(2);
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // 1. Authoritative DB-side verification.
    const { data: dbResult, error: dbErr } = await supabase.rpc('verify_governance_audit_chain', {
        p_org_id: orgId,
    });
    if (dbErr) {
        console.error('❌ DB verification failed to run:', dbErr.message);
        process.exit(1);
    }
    const db = Array.isArray(dbResult) ? dbResult[0] : dbResult;

    // 2. Independent structural verification (fetch raw rows + checkpoints).
    const { data: rows, error: rowsErr } = await supabase
        .from('governance_audit_ledger')
        .select('seq, prev_hash, entry_hash')
        .eq('org_id', orgId)
        .order('seq', { ascending: true });
    if (rowsErr) {
        console.error('❌ Could not read ledger rows:', rowsErr.message);
        process.exit(1);
    }
    const { data: checkpoints, error: cpErr } = await supabase
        .from('governance_checkpoints')
        .select('up_to_seq, chain_hash')
        .eq('org_id', orgId);
    if (cpErr) {
        console.error('❌ Could not read checkpoints:', cpErr.message);
        process.exit(1);
    }

    const structural = verifyChainStructure(
        (rows ?? []) as LedgerRowLite[],
        (checkpoints ?? []) as CheckpointLite[],
    );

    // 3. Independent checkpoint signature verification (PRD M0.3).
    //    Uses GOVERNANCE_SIGNING_PUBLIC_KEY — no private key / Cencori trust needed.
    const sigs = await verifyCheckpointSignatures(supabase as never, orgId);

    console.log(`\n  Governance audit ledger — org ${orgId}\n`);
    console.log(`  [DB]         ${db.ok ? '✅' : '❌'} ${db.reason}  (entries: ${db.entries}${db.first_bad_seq != null ? `, first bad seq: ${db.first_bad_seq}` : ''})`);
    console.log(`  [structural] ${structural.ok ? '✅' : '❌'} ${structural.reason}  (entries: ${structural.entries}${structural.firstBadSeq != null ? `, first bad seq: ${structural.firstBadSeq}` : ''})`);
    console.log(`  [signatures] ${sigs.ok ? '✅' : '❌'} ${sigs.signed}/${sigs.total} checkpoints signed & valid${sigs.failures.length ? `; failures: ${sigs.failures.map(f => `seq ${f.upToSeq} (${f.reason})`).join(', ')}` : ''}`);
    console.log('');

    const ok = db.ok && structural.ok && sigs.ok;
    console.log(ok ? '  ✅ CHAIN VERIFIED — complete and untampered.\n' : '  ❌ CHAIN INTEGRITY FAILURE — investigate immediately.\n');
    process.exit(ok ? 0 : 1);
}

main().catch(err => {
    console.error('Verifier crashed:', err);
    process.exit(1);
});
