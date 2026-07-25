/**
 * Governance signed-checkpoint cron (PRD M0.3).
 *
 * Creates a signed checkpoint for every org whose chain has grown past its last
 * checkpoint. Idempotent (checkpoints are unique per (org, seq)). Schedule this
 * periodically so the chain is continuously anchored with signatures — the more
 * frequent the checkpoints, the tighter the non-repudiation window.
 *
 * GET /api/cron/governance-checkpoint   (Authorization: Bearer $CRON_SECRET)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { createSignedGovernanceCheckpoint } from '@/lib/governance/checkpoint';

async function run(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');

    if (!cronSecret) {
        console.error('[Cron] Missing CRON_SECRET - refusing to run governance checkpoint');
        return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
        console.error('[Cron] Unauthorized governance checkpoint attempt');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const supabase = createAdminClient();
        const { data: orgs, error } = await supabase.rpc('orgs_needing_governance_checkpoint', {
            p_limit: 500,
        });
        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        let created = 0;
        let signed = 0;
        for (const row of (orgs ?? []) as Array<{ org_id: string }>) {
            try {
                const result = await createSignedGovernanceCheckpoint(supabase, row.org_id);
                if (result) {
                    created++;
                    if (result.signed) signed++;
                }
            } catch (err) {
                console.error('[Cron] Checkpoint failed for org', row.org_id, err);
            }
        }

        return NextResponse.json({
            success: true,
            orgs: (orgs ?? []).length,
            created,
            signed,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        console.error('[Cron] Governance checkpoint failed:', message);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    return run(req);
}

export async function POST(req: NextRequest) {
    return run(req);
}
