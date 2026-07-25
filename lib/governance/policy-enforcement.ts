/**
 * Policy enforcement on the gateway hot path (PRD M1.2).
 *
 * Loads an org's active policies (cached), evaluates them against the request
 * context, records any firing to the immutable ledger, and returns an inline
 * decision. This is where policy-as-code becomes enforcement-in-path — the moat.
 *
 * v1 hard-stops on block / require_approval; redact / tokenize / route /
 * rate_limit decisions are recorded now and applied in the next increment.
 * Fail-open on a policy LOAD error so a governance outage can't take the gateway
 * down (the error is surfaced, never silently swallowed).
 */

import crypto from 'crypto';
import type { createAdminClient } from '@/lib/supabaseAdmin';
import { evaluatePolicies } from '@/lib/governance/policy-engine';
import type { EvalContext, PolicyAction, FiredRule, PolicyDirection, Policy } from '@/lib/governance/policy-types';
import { listActivePolicies } from '@/lib/governance/policy-store';
import { deliverAuditEntry } from '@/lib/governance/delivery';
import { checkCustomRateLimit } from '@/lib/rate-limit';
import { classifyContent, policiesNeedModelSignals } from '@/lib/governance/guardrail-classifier';
import type { SubscriptionTier } from '@/lib/entitlements';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

const POLICY_CACHE_TTL_MS = 30_000;
const policyCache = new Map<string, { policies: Policy[]; expiresAt: number }>();

/** Call after any policy write so the hot path picks up the change promptly. */
export function invalidatePolicyCache(orgId?: string): void {
    if (orgId) policyCache.delete(orgId);
    else policyCache.clear();
}

async function getActivePoliciesCached(supabase: SupabaseAdmin, orgId: string): Promise<Policy[]> {
    const hit = policyCache.get(orgId);
    if (hit && hit.expiresAt > Date.now()) return hit.policies;
    const policies = await listActivePolicies(supabase, orgId);
    policyCache.set(orgId, { policies, expiresAt: Date.now() + POLICY_CACHE_TTL_MS });
    return policies;
}

export interface PolicyRedaction {
    pattern: string;
    strategy: 'mask' | 'tokenize';
}

export interface PolicyEnforcement {
    decision: PolicyAction;
    fired: FiredRule[];
    rationale: string;
    /** Present when the decision hard-stops the request (block / require_approval / rate limit). */
    block?: { status: number; code: string; message: string; reasons: string[] };
    /** redact/tokenize directives from fired rules that carry a `params.pattern`. */
    redactions: PolicyRedaction[];
    /** route directive from a fired `route` rule (applied by the caller). */
    route?: { region?: string; provider?: string; model?: string };
}

/**
 * Apply redact/tokenize directives to text. `mask` replaces matches with
 * [REDACTED]; `tokenize` swaps in a reversible placeholder recorded in tokenMap
 * (so a downstream deTokenize can restore it). Bad patterns are skipped.
 */
export function applyPolicyRedactions(
    text: string,
    redactions: PolicyRedaction[],
    existingMap?: Map<string, string>,
): { text: string; tokenMap: Map<string, string> } {
    let out = text;
    const map = existingMap ?? new Map<string, string>();
    let counter = map.size;
    for (const r of redactions) {
        let re: RegExp;
        try { re = new RegExp(r.pattern, 'gi'); } catch { continue; }
        out = out.replace(re, (match) => {
            if (r.strategy === 'tokenize') {
                const placeholder = `__CENCORI_POLICY_${counter++}__`;
                map.set(placeholder, match);
                return placeholder;
            }
            return '[REDACTED]';
        });
    }
    return { text: out, tokenMap: map };
}

function redactionsFromFired(fired: FiredRule[]): PolicyRedaction[] {
    const out: PolicyRedaction[] = [];
    for (const f of fired) {
        if (f.action !== 'redact' && f.action !== 'tokenize') continue;
        const pattern = f.params?.pattern;
        if (typeof pattern === 'string' && pattern.length > 0) {
            out.push({ pattern, strategy: f.action === 'tokenize' ? 'tokenize' : 'mask' });
        }
    }
    return out;
}

export async function enforcePolicies(
    supabase: SupabaseAdmin,
    params: {
        orgId: string;
        direction: PolicyDirection;
        projectId?: string | null;
        model?: string | null;
        environment?: string | null;
        region?: string | null;
        content?: string;
        amount?: number;
        signals?: Record<string, unknown>;
        apiKeyId?: string | null;
        actorIp?: string | null;
        tier?: SubscriptionTier;
    },
): Promise<PolicyEnforcement> {
    let policies: Policy[];
    try {
        policies = await getActivePoliciesCached(supabase, params.orgId);
    } catch (err) {
        console.error('[Governance] Policy load failed (fail-open):', err);
        return { decision: 'allow', fired: [], rationale: 'policy load failed — fail-open', redactions: [] };
    }
    if (policies.length === 0) {
        return { decision: 'allow', fired: [], rationale: 'no active policies', redactions: [] };
    }

    // Model-based guardrails: when a policy references a model signal, classify
    // the content with the managed model and merge accurate signals in (the
    // classifier wins over any regex-derived signal on overlap). Gated + cached.
    let signals = params.signals;
    if (params.content && policiesNeedModelSignals(policies)) {
        const modelSignals = await classifyContent(supabase, {
            orgId: params.orgId,
            projectId: params.projectId ?? '',
            tier: params.tier ?? 'free',
            text: params.content,
        });
        signals = { ...params.signals, ...modelSignals };
    }

    const ctx: EvalContext = {
        direction: params.direction,
        projectId: params.projectId ?? undefined,
        model: params.model ?? undefined,
        environment: params.environment ?? undefined,
        region: params.region ?? undefined,
        content: params.content,
        amount: params.amount,
        signals,
    };
    const result = evaluatePolicies(policies, ctx);

    if (result.firedRules.length > 0) {
        // A fresh dedupe key per evaluation makes deliverAuditEntry's retries
        // idempotent without collapsing distinct decisions.
        await deliverAuditEntry(supabase, {
            orgId: params.orgId,
            eventType: 'policy.decision',
            projectId: params.projectId ?? null,
            actorType: 'api',
            actorIp: params.actorIp ?? null,
            model: params.model ?? null,
            decision: result.decision,
            rationale: result.rationale,
            policiesFired: result.firedRules,
            dedupeKey: `policy:${crypto.randomUUID()}`,
            payload: {
                direction: params.direction,
                controls: Array.from(new Set(result.firedRules.flatMap(f => f.controls ?? []))),
            },
        });
    }

    const hardStop = result.decision === 'block' || result.decision === 'require_approval';
    if (hardStop) {
        return {
            decision: result.decision,
            fired: result.firedRules,
            rationale: result.rationale,
            redactions: [],
            block: {
                status: 403,
                code: result.decision === 'require_approval' ? 'policy_requires_approval' : 'policy_violation',
                message:
                    result.decision === 'require_approval'
                        ? `This request requires approval under a governance policy: ${result.rationale}`
                        : `Blocked by governance policy: ${result.rationale}`,
                reasons: result.firedRules.map(f => `${f.policy}/${f.rule}`),
            },
        };
    }

    // rate_limit: enforce each fired rate_limit rule against the sliding window.
    for (const f of result.firedRules) {
        if (f.action !== 'rate_limit') continue;
        const limit = Number(f.params?.limit);
        if (!Number.isFinite(limit) || limit <= 0) continue;
        const windowSeconds = Number(f.params?.windowSeconds) || 60;
        const { allowed } = await checkCustomRateLimit(`${params.orgId}:${f.policy}:${f.rule}`, limit, windowSeconds);
        if (!allowed) {
            return {
                decision: result.decision,
                fired: result.firedRules,
                rationale: result.rationale,
                redactions: [],
                block: {
                    status: 429,
                    code: 'policy_rate_limited',
                    message: `Rate limit exceeded under governance policy "${f.policy}"`,
                    reasons: [`${f.policy}/${f.rule}`],
                },
            };
        }
    }

    // route: honor the first fired route rule's directive (caller applies it).
    const routeRule = result.firedRules.find(f => f.action === 'route');
    const route = routeRule
        ? {
            region: typeof routeRule.params?.region === 'string' ? routeRule.params.region : undefined,
            provider: typeof routeRule.params?.provider === 'string' ? routeRule.params.provider : undefined,
            model: typeof routeRule.params?.model === 'string' ? routeRule.params.model : undefined,
        }
        : undefined;

    return {
        decision: result.decision,
        fired: result.firedRules,
        rationale: result.rationale,
        redactions: redactionsFromFired(result.firedRules),
        ...(route ? { route } : {}),
    };
}
