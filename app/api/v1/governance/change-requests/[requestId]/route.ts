/**
 * Resolve a governance change request (PRD M0.4 / M1 checker step).
 *   POST /api/v1/governance/change-requests/:requestId   (policy.approve)
 *   body: { decision: 'approved' | 'rejected', reason?: string }
 *
 * Segregation of duties is enforced in the DB — approving your own request
 * returns 403. On an approved policy.activate request, the policy is activated
 * atomically as part of this call.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireGovernanceAuth } from '@/lib/governance/require-governance';
import { resolveGovernanceChangeRequest } from '@/lib/governance/rbac';
import { activatePolicy } from '@/lib/governance/policy-store';
import { invalidatePolicyCache } from '@/lib/governance/policy-enforcement';

export async function POST(req: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
    const auth = await requireGovernanceAuth(req, 'policy.approve', { requirePaidControls: true });
    if (!auth.ok) return auth.response;

    const { requestId } = await params;
    let body: { decision?: unknown; reason?: unknown };
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
    if (body.decision !== 'approved' && body.decision !== 'rejected') {
        return NextResponse.json({ error: "decision must be 'approved' or 'rejected'" }, { status: 400 });
    }
    const decision = body.decision;
    const reason = typeof body.reason === 'string' ? body.reason : null;

    const { data: request } = await auth.supabase
        .from('governance_change_requests')
        .select('action_type, payload, org_id')
        .eq('id', requestId)
        .single();
    if (!request || request.org_id !== auth.orgId) {
        return NextResponse.json({ error: 'Change request not found' }, { status: 404 });
    }

    const result = await resolveGovernanceChangeRequest(auth.supabase, {
        orgId: auth.orgId, requestId, actorId: auth.userId, decision, reason, actorIp: auth.clientIp,
    });
    if (!result.ok) {
        if (result.reason === 'segregation_of_duties') {
            return NextResponse.json(
                { error: 'Segregation of duties: the approver must differ from the requester', code: 'segregation_of_duties' },
                { status: 403 },
            );
        }
        return NextResponse.json({ error: 'Could not resolve request', code: result.reason, status: result.status }, { status: 409 });
    }

    // Apply side-effects of an approval.
    let applied = false;
    if (decision === 'approved' && request.action_type === 'policy.activate') {
        const policyId = (request.payload as { policy_id?: string } | null)?.policy_id;
        if (policyId) {
            await activatePolicy(auth.supabase, { orgId: auth.orgId, policyId, approvedBy: auth.userId, actorIp: auth.clientIp });
            invalidatePolicyCache(auth.orgId); // hot path picks up the newly-active policy
            applied = true;
        }
    }

    return NextResponse.json({ id: requestId, decision, applied });
}
