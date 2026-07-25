/**
 * Bridge: gateway request outcome → immutable governance decision record.
 *
 * Called from logGatewayRequest for every gateway request. Maps the request
 * status to a governance decision (allow/block/redact/rate_limit) and appends a
 * hash-chained entry to the governance audit ledger (PRD M0.1). Best-effort and
 * non-blocking: governance logging must NEVER break or delay a request.
 *
 * Only hashes of the request/response are stored — never raw content.
 * NOTE: reliability hardening (durable delivery via waitUntil/queue so the log
 * is provably complete) is PRD M0.2; this first wiring is fire-and-forget.
 */

import type { GatewayContext, LogRequestParams } from '@/lib/gateway-middleware';
import { hashContent, type GovernanceAuditInput, type GovernanceDecision } from '@/lib/governance/audit-ledger';
import { deliverAuditEntry } from '@/lib/governance/delivery';

export function mapStatusToDecision(
    status: LogRequestParams['status'],
): { eventType: string; decision: GovernanceDecision | null } {
    switch (status) {
        case 'success':
        case 'success_fallback':
            return { eventType: 'request.decision', decision: 'allow' };
        case 'blocked':
        case 'blocked_output':
            return { eventType: 'request.decision', decision: 'block' };
        case 'filtered':
            return { eventType: 'request.decision', decision: 'redact' };
        case 'rate_limited':
            return { eventType: 'request.decision', decision: 'rate_limit' };
        case 'error':
            return { eventType: 'request.error', decision: null };
        default:
            return { eventType: 'request.decision', decision: null };
    }
}

/** Pure mapping: gateway context + outcome → a governance ledger entry input. */
export function buildDecisionInput(
    context: GatewayContext,
    params: LogRequestParams,
): GovernanceAuditInput {
    const { eventType, decision } = mapStatusToDecision(params.status);
    return {
        orgId: context.organizationId,
        eventType,
        projectId: context.projectId,
        actorType: 'api',
        actorIp: context.clientIp || null,
        model: params.model || null,
        decision,
        requestHash: params.requestPayload ? hashContent(JSON.stringify(params.requestPayload)) : null,
        responseHash: params.responsePayload ? hashContent(JSON.stringify(params.responsePayload)) : null,
        rationale: params.errorMessage ?? null,
        // One decision per (request, outcome); makes retries/redrives idempotent.
        dedupeKey: `${context.requestId}:${params.status}`,
        payload: {
            endpoint: params.endpoint,
            provider: params.provider,
            status: params.status,
            environment: context.environment,
            request_id: context.requestId,
            api_key_id: context.apiKeyId,
            prompt_tokens: params.promptTokens ?? 0,
            completion_tokens: params.completionTokens ?? 0,
            cencori_charge_usd: params.cencoriChargeUsd ?? 0,
            end_user_id: params.endUserId ?? null,
            ...(params.fallbackProvider ? { fallback_provider: params.fallbackProvider } : {}),
            ...(params.fallbackModel ? { fallback_model: params.fallbackModel } : {}),
        },
    };
}

/**
 * Record a governance decision with reliable, provably-complete delivery
 * (retry + dead-letter). Never throws. Run inside waitUntil() so it survives
 * past the response.
 */
export async function recordGatewayGovernanceDecision(
    context: GatewayContext,
    params: LogRequestParams,
): Promise<void> {
    if (!context.organizationId) return;
    await deliverAuditEntry(context.supabase, buildDecisionInput(context, params));
}
