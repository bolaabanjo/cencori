/**
 * Request activation of a policy (PRD M1 / M0.4 maker step).
 *   POST /api/v1/governance/policies/:policyId/activate   (policy.propose)
 * Opens a maker-checker change request; a DIFFERENT user with policy.approve
 * must approve it (via /api/v1/governance/change-requests/:id) before it goes live.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireGovernanceAuth } from '@/lib/governance/require-governance';
import { requestPolicyActivation } from '@/lib/governance/policy-store';

export async function POST(req: NextRequest, { params }: { params: Promise<{ policyId: string }> }) {
    const auth = await requireGovernanceAuth(req, 'policy.propose', { requirePaidControls: true });
    if (!auth.ok) return auth.response;

    const { policyId } = await params;
    const { data: policy } = await auth.supabase
        .from('governance_policies')
        .select('id, status')
        .eq('id', policyId)
        .eq('org_id', auth.orgId)
        .single();
    if (!policy) return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
    if (policy.status === 'active') return NextResponse.json({ error: 'Policy is already active' }, { status: 409 });

    try {
        const requestId = await requestPolicyActivation(auth.supabase, {
            orgId: auth.orgId, policyId, requestedBy: auth.userId, actorIp: auth.clientIp,
        });
        return NextResponse.json({ change_request_id: requestId, status: 'pending_approval' }, { status: 201 });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to request activation' }, { status: 500 });
    }
}
