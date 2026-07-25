/**
 * List governance change requests (PRD M0.4).
 *   GET /api/v1/governance/change-requests?status=pending   (audit.read)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireGovernanceAuth } from '@/lib/governance/require-governance';

export async function GET(req: NextRequest) {
    const auth = await requireGovernanceAuth(req, 'audit.read');
    if (!auth.ok) return auth.response;

    const status = req.nextUrl.searchParams.get('status') || 'pending';
    const { data, error } = await auth.supabase
        .from('governance_change_requests')
        .select('id, action_type, payload, status, requested_by, requested_at, approved_by, resolved_at, reason')
        .eq('org_id', auth.orgId)
        .eq('status', status)
        .order('requested_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
}
