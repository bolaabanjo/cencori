/**
 * Governance ledger health (PRD M0.2).
 *   GET /api/v1/governance/health   (audit.read)
 * Returns chain validity + completeness (chain_ok, entries, pending_deadletter, complete).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireGovernanceAuth } from '@/lib/governance/require-governance';

export async function GET(req: NextRequest) {
    const auth = await requireGovernanceAuth(req, 'audit.read');
    if (!auth.ok) return auth.response;

    const { data, error } = await auth.supabase.rpc('governance_ledger_health', { p_org_id: auth.orgId });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const row = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({
        chain_ok: !!row?.chain_ok,
        entries: Number(row?.entries ?? 0),
        pending_deadletter: Number(row?.pending_deadletter ?? 0),
        complete: !!row?.complete,
    });
}
