/**
 * Governance RBAC + segregation of duties (PRD M0.4).
 *
 * Least-privilege roles + a maker-checker change-request flow for sensitive
 * actions. The org owner is implicitly full-access. Segregation of duties
 * (approver != requester) is enforced in the DB (resolve_governance_change_request)
 * so it holds even if this layer has a bug. Every request/approval/rejection is
 * written to the immutable governance ledger.
 */

import { NextResponse } from 'next/server';
import type { createAdminClient } from '@/lib/supabaseAdmin';
import { deliverAuditEntry } from '@/lib/governance/delivery';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export type GovernanceRole = 'owner' | 'governance_admin' | 'risk_officer' | 'developer' | 'auditor';
export type GovernancePermission =
    | 'policy.propose'      // maker
    | 'policy.approve'      // checker
    | 'key.reveal'
    | 'killswitch.engage'
    | 'role.assign'
    | 'audit.read';

const ROLE_PERMISSIONS: Record<GovernanceRole, GovernancePermission[]> = {
    owner:            ['policy.propose', 'policy.approve', 'key.reveal', 'killswitch.engage', 'role.assign', 'audit.read'],
    governance_admin: ['policy.propose', 'policy.approve', 'key.reveal', 'killswitch.engage', 'role.assign', 'audit.read'],
    risk_officer:     ['policy.approve', 'killswitch.engage', 'audit.read'],
    developer:        ['policy.propose', 'audit.read'],
    auditor:          ['audit.read'],
};

export function roleHasPermission(role: GovernanceRole, permission: GovernancePermission): boolean {
    return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Resolve a user's governance role for an org (owner is implicit + wins). */
export async function getGovernanceRole(
    supabase: SupabaseAdmin,
    orgId: string,
    userId: string,
): Promise<GovernanceRole | null> {
    const { data: org } = await supabase
        .from('organizations').select('owner_id').eq('id', orgId).single();
    if (org?.owner_id === userId) return 'owner';

    const { data } = await supabase
        .from('governance_role_assignments')
        .select('role').eq('org_id', orgId).eq('user_id', userId).maybeSingle();
    return (data?.role as GovernanceRole | undefined) ?? null;
}

export type PermissionCheck =
    | { ok: true; role: GovernanceRole }
    | { ok: false; response: NextResponse };

export async function requireGovernancePermission(
    supabase: SupabaseAdmin,
    orgId: string,
    userId: string,
    permission: GovernancePermission,
): Promise<PermissionCheck> {
    const role = await getGovernanceRole(supabase, orgId, userId);
    if (!role || !roleHasPermission(role, permission)) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: 'Forbidden: missing governance permission', code: 'governance_permission_denied', permission },
                { status: 403 },
            ),
        };
    }
    return { ok: true, role };
}

/** Assign (or change) a user's governance role. Requires role.assign upstream. */
export async function assignGovernanceRole(
    supabase: SupabaseAdmin,
    p: { orgId: string; userId: string; role: Exclude<GovernanceRole, 'owner'>; grantedBy: string; actorIp?: string | null },
): Promise<void> {
    const { error } = await supabase
        .from('governance_role_assignments')
        .upsert(
            { org_id: p.orgId, user_id: p.userId, role: p.role, granted_by: p.grantedBy },
            { onConflict: 'org_id,user_id' },
        );
    if (error) throw new Error(`Failed to assign governance role: ${error.message}`);

    await deliverAuditEntry(supabase, {
        orgId: p.orgId,
        eventType: 'governance.role.assigned',
        actorId: p.grantedBy,
        actorType: 'user',
        actorIp: p.actorIp ?? null,
        dedupeKey: `role:${p.orgId}:${p.userId}:${p.role}:${Date.now()}`,
        payload: { target_user_id: p.userId, role: p.role },
    });
}

// ── Maker-checker change requests ────────────────────────────────────────────

/** Propose a sensitive change (maker). Returns the request id. */
export async function createGovernanceChangeRequest(
    supabase: SupabaseAdmin,
    p: {
        orgId: string;
        actionType: string;
        payload?: Record<string, unknown>;
        requestedBy: string;
        actorIp?: string | null;
    },
): Promise<string> {
    const { data, error } = await supabase.rpc('create_governance_change_request', {
        p_org_id: p.orgId,
        p_action_type: p.actionType,
        p_payload: (p.payload ?? {}) as unknown,
        p_requested_by: p.requestedBy,
    });
    if (error) throw new Error(`Failed to create change request: ${error.message}`);
    const requestId = (Array.isArray(data) ? data[0] : data) as string;

    await deliverAuditEntry(supabase, {
        orgId: p.orgId,
        eventType: 'governance.change.requested',
        actorId: p.requestedBy,
        actorType: 'user',
        actorIp: p.actorIp ?? null,
        decision: 'require_approval',
        dedupeKey: `chreq:${requestId}:requested`,
        payload: { request_id: requestId, action_type: p.actionType, ...(p.payload ?? {}) },
    });

    return requestId;
}

export type ResolveResult =
    | { ok: true; decision: 'approved' | 'rejected' }
    | { ok: false; reason: string; status: string | null };

/**
 * Approve or reject a change request (checker). Segregation of duties is
 * enforced in the DB — an approval by the requester returns
 * { ok: false, reason: 'segregation_of_duties' } and nothing changes.
 */
export async function resolveGovernanceChangeRequest(
    supabase: SupabaseAdmin,
    p: {
        orgId: string;
        requestId: string;
        actorId: string;
        decision: 'approved' | 'rejected';
        reason?: string | null;
        actorIp?: string | null;
    },
): Promise<ResolveResult> {
    const { data, error } = await supabase.rpc('resolve_governance_change_request', {
        p_id: p.requestId,
        p_actor: p.actorId,
        p_decision: p.decision,
        p_reason: p.reason ?? null,
    });
    if (error) throw new Error(`Failed to resolve change request: ${error.message}`);
    const row = (Array.isArray(data) ? data[0] : data) as { ok: boolean; status: string | null; reason: string | null };

    if (!row.ok) {
        return { ok: false, reason: row.reason ?? 'unresolved', status: row.status };
    }

    await deliverAuditEntry(supabase, {
        orgId: p.orgId,
        eventType: p.decision === 'approved' ? 'governance.change.approved' : 'governance.change.rejected',
        actorId: p.actorId,
        actorType: 'user',
        actorIp: p.actorIp ?? null,
        decision: p.decision === 'approved' ? 'allow' : 'block',
        rationale: p.reason ?? null,
        dedupeKey: `chreq:${p.requestId}:${p.decision}`,
        payload: { request_id: p.requestId },
    });

    return { ok: true, decision: p.decision };
}
