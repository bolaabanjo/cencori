/**
 * Session HITL governance records (PRD M0.3 — sessions wiring).
 *
 * Turn completions/failures already reach the ledger via logGatewayRequest.
 * This captures the governance-critical human-in-the-loop trail that would
 * otherwise be missing or mislabeled:
 *   - a tool call paused for approval        → require_approval
 *   - a human/caller approved the action     → allow
 *   - a human/caller rejected the action     → block
 * All immutable, attributable, and time-stamped — exactly what a bank needs to
 * prove an autonomous agent was under human oversight. Delivered reliably via
 * deliverAuditEntry (retry + dead-letter); never throws.
 */

import type { createAdminClient } from '@/lib/supabaseAdmin';
import { deliverAuditEntry } from '@/lib/governance/delivery';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export async function recordSessionApprovalRequested(
    supabase: SupabaseAdmin,
    p: {
        orgId: string;
        projectId?: string | null;
        sessionId: string;
        turnNumber: number;
        tool?: string | null;
        actionIds?: string[];
        model?: string | null;
    },
): Promise<void> {
    await deliverAuditEntry(supabase, {
        orgId: p.orgId,
        eventType: 'session.approval.requested',
        projectId: p.projectId ?? null,
        actorType: 'system',
        decision: 'require_approval',
        model: p.model ?? null,
        rationale: p.tool ? `Human approval required for tool "${p.tool}"` : 'Human approval required',
        dedupeKey: `${p.sessionId}:${p.turnNumber}:approval_requested`,
        payload: {
            session_id: p.sessionId,
            turn_number: p.turnNumber,
            tool: p.tool ?? null,
            action_ids: p.actionIds ?? [],
        },
    });
}

export async function recordSessionApprovalResolved(
    supabase: SupabaseAdmin,
    p: {
        orgId: string;
        projectId?: string | null;
        sessionId: string;
        actionId: string;
        resolution: 'approved' | 'rejected';
        tool?: string | null;
        apiKeyId?: string | null;
        actorIp?: string | null;
    },
): Promise<void> {
    const approved = p.resolution === 'approved';
    await deliverAuditEntry(supabase, {
        orgId: p.orgId,
        eventType: approved ? 'session.action.approved' : 'session.action.rejected',
        projectId: p.projectId ?? null,
        actorType: 'api',
        actorIp: p.actorIp ?? null,
        decision: approved ? 'allow' : 'block',
        rationale: approved ? null : `Action "${p.tool ?? p.actionId}" rejected by approver`,
        dedupeKey: `${p.sessionId}:${p.actionId}:${p.resolution}`,
        payload: {
            session_id: p.sessionId,
            action_id: p.actionId,
            tool: p.tool ?? null,
            api_key_id: p.apiKeyId ?? null,
            resolution: p.resolution,
        },
    });
}
