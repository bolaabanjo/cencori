/**
 * Governance role assignments (PRD M0.4).
 *   POST /api/v1/governance/roles   (role.assign) — assign/change a user's role
 *   GET  /api/v1/governance/roles   (audit.read)  — list assignments
 *   body: { userId: string, role: 'governance_admin'|'risk_officer'|'developer'|'auditor' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireGovernanceAuth } from '@/lib/governance/require-governance';
import { assignGovernanceRole } from '@/lib/governance/rbac';

const ASSIGNABLE_ROLES = ['governance_admin', 'risk_officer', 'developer', 'auditor'] as const;

export async function POST(req: NextRequest) {
    const auth = await requireGovernanceAuth(req, 'role.assign', { requirePaidControls: true });
    if (!auth.ok) return auth.response;

    let body: { userId?: unknown; role?: unknown };
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

    if (typeof body.userId !== 'string' || !body.userId.trim()) {
        return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    if (!ASSIGNABLE_ROLES.includes(body.role as (typeof ASSIGNABLE_ROLES)[number])) {
        return NextResponse.json({ error: `role must be one of ${ASSIGNABLE_ROLES.join(', ')}` }, { status: 400 });
    }

    try {
        await assignGovernanceRole(auth.supabase, {
            orgId: auth.orgId,
            userId: body.userId,
            role: body.role as (typeof ASSIGNABLE_ROLES)[number],
            grantedBy: auth.userId,
            actorIp: auth.clientIp,
        });
        return NextResponse.json({ org_id: auth.orgId, user_id: body.userId, role: body.role });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to assign role' }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    const auth = await requireGovernanceAuth(req, 'audit.read');
    if (!auth.ok) return auth.response;

    const { data, error } = await auth.supabase
        .from('governance_role_assignments')
        .select('user_id, role, granted_by, created_at')
        .eq('org_id', auth.orgId)
        .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
}
