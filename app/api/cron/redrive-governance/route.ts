/**
 * Governance dead-letter redrive (PRD M0.2).
 *
 * Redrives any governance ledger entries that failed to append (captured in
 * governance_ledger_deadletter) back into the immutable ledger. Idempotent —
 * the append dedupes on dedupe_key, so re-running is always safe. Schedule this
 * on a cron so the dead-letter is continuously drained and the log stays
 * provably complete.
 *
 * GET /api/cron/redrive-governance   (Authorization: Bearer $CRON_SECRET)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { redriveGovernanceDeadletter } from '@/lib/governance/delivery';

async function run(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');

    if (!cronSecret) {
        console.error('[Cron] Missing CRON_SECRET - refusing to run governance redrive');
        return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
        console.error('[Cron] Unauthorized governance redrive attempt');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await redriveGovernanceDeadletter(createAdminClient(), 200);
        return NextResponse.json({ success: true, ...result, timestamp: new Date().toISOString() });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        console.error('[Cron] Governance redrive failed:', message);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    return run(req);
}

export async function POST(req: NextRequest) {
    return run(req);
}
