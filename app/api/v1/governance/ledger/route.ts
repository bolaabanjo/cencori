/**
 * Governance audit ledger feed (PRD M0.1).
 *   GET /api/v1/governance/ledger?event_type=&limit=   (audit.read)
 * Recent immutable decision records for the org (newest first).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireGovernanceAuth } from '@/lib/governance/require-governance';

export async function GET(req: NextRequest) {
    const auth = await requireGovernanceAuth(req, 'audit.read');
    if (!auth.ok) return auth.response;

    const eventType = req.nextUrl.searchParams.get('event_type');
    const limit = Math.min(200, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '50', 10)));

    let query = auth.supabase
        .from('governance_audit_ledger')
        .select('seq, ts, event_type, decision, model, rationale, actor_type, actor_ip, payload')
        .eq('org_id', auth.orgId)
        .order('seq', { ascending: false })
        .limit(limit);
    if (eventType) query = query.eq('event_type', eventType);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
}
