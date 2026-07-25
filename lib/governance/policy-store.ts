/**
 * Policy storage + lifecycle (PRD M1). Drafts are created freely; ACTIVATION is
 * gated by the maker-checker change-request flow (PRD M0.4) — proposer and
 * approver must differ. The engine reads the active set via listActivePolicies.
 */

import type { createAdminClient } from '@/lib/supabaseAdmin';
import type { Policy } from '@/lib/governance/policy-types';
import { createGovernanceChangeRequest } from '@/lib/governance/rbac';
import { deliverAuditEntry } from '@/lib/governance/delivery';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

/** A policy body without the row-owned name/version/status. */
export type PolicySpec = Omit<Policy, 'name' | 'version' | 'status'>;

export async function createPolicyDraft(
    supabase: SupabaseAdmin,
    p: { orgId: string; name: string; spec: PolicySpec; createdBy: string; actorIp?: string | null },
): Promise<{ id: string; version: number }> {
    const { data, error } = await supabase.rpc('create_governance_policy_draft', {
        p_org_id: p.orgId, p_name: p.name, p_spec: p.spec as unknown, p_created_by: p.createdBy,
    });
    if (error) throw new Error(`Failed to create policy draft: ${error.message}`);
    const row = (Array.isArray(data) ? data[0] : data) as { id: string; version: number };

    await deliverAuditEntry(supabase, {
        orgId: p.orgId,
        eventType: 'governance.policy.drafted',
        actorId: p.createdBy,
        actorType: 'user',
        actorIp: p.actorIp ?? null,
        dedupeKey: `policy:${row.id}:drafted`,
        payload: { policy_id: row.id, name: p.name, version: row.version, controls: p.spec.controls ?? [] },
    });
    return { id: row.id, version: Number(row.version) };
}

/** The active policy set for an org — what the engine evaluates. */
export async function listActivePolicies(
    supabase: SupabaseAdmin,
    orgId: string,
): Promise<Policy[]> {
    const { data, error } = await supabase
        .from('governance_policies')
        .select('name, version, spec')
        .eq('org_id', orgId)
        .eq('status', 'active');
    if (error) throw new Error(`Failed to load active policies: ${error.message}`);

    return (data ?? []).map((r) => {
        const spec = (r as { spec: PolicySpec }).spec ?? { rules: [] };
        return {
            name: (r as { name: string }).name,
            version: Number((r as { version: number }).version),
            status: 'active' as const,
            ...spec,
        };
    });
}

/**
 * Propose activating a policy (maker). Creates a maker-checker change request;
 * a different user with policy.approve must approve it before activatePolicy runs.
 */
export async function requestPolicyActivation(
    supabase: SupabaseAdmin,
    p: { orgId: string; policyId: string; requestedBy: string; actorIp?: string | null },
): Promise<string> {
    return createGovernanceChangeRequest(supabase, {
        orgId: p.orgId,
        actionType: 'policy.activate',
        payload: { policy_id: p.policyId },
        requestedBy: p.requestedBy,
        actorIp: p.actorIp,
    });
}

/**
 * Apply an approved activation (checker step, after resolveGovernanceChangeRequest
 * approved it). Atomically retires the prior active version and activates this one.
 */
export async function activatePolicy(
    supabase: SupabaseAdmin,
    p: { orgId: string; policyId: string; approvedBy: string; actorIp?: string | null },
): Promise<void> {
    const { error } = await supabase.rpc('activate_governance_policy', {
        p_org_id: p.orgId, p_policy_id: p.policyId, p_approved_by: p.approvedBy,
    });
    if (error) throw new Error(`Failed to activate policy: ${error.message}`);

    await deliverAuditEntry(supabase, {
        orgId: p.orgId,
        eventType: 'governance.policy.activated',
        actorId: p.approvedBy,
        actorType: 'user',
        actorIp: p.actorIp ?? null,
        decision: 'allow',
        dedupeKey: `policy:${p.policyId}:activated`,
        payload: { policy_id: p.policyId },
    });
}
