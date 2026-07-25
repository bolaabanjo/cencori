/**
 * Policy-as-code evaluation engine (PRD M1 / Appendix A).
 *
 * Pure and deterministic: given the active policies + a request context, return
 * the single most-restrictive decision, which rules fired, and a human-readable
 * rationale (explainability). No I/O — the caller supplies signals and persists
 * the decision to the immutable ledger. Conflict resolution is
 * most-restrictive-wins so a permissive rule can never override a block.
 */

import type {
    Policy,
    PolicyRule,
    Predicate,
    EvalContext,
    PolicyAction,
    PolicyDecision,
    FiredRule,
} from '@/lib/governance/policy-types';

/** Restrictiveness ranking (higher = more restrictive). block always wins. */
const ACTION_SEVERITY: Record<PolicyAction, number> = {
    block: 6,
    require_approval: 5,
    tokenize: 4,
    redact: 4,
    route: 3,
    rate_limit: 2,
    allow: 1,
};

function resolveField(ctx: EvalContext, field: string): unknown {
    switch (field) {
        case 'content': return ctx.content;
        case 'amount': return ctx.amount;
        case 'model': return ctx.model;
        case 'environment': return ctx.environment;
        case 'data_classification': return ctx.dataClassification;
        case 'user.region':
        case 'region': return ctx.region;
        default:
            if (field.startsWith('signals.')) return ctx.signals?.[field.slice('signals.'.length)];
            return undefined;
    }
}

function toNumber(v: unknown): number {
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '') return Number(v);
    return NaN;
}

export function evaluatePredicate(ctx: EvalContext, p: Predicate): boolean {
    const v = resolveField(ctx, p.field);

    if (p.present !== undefined) {
        const isPresent = v !== undefined && v !== null;
        return p.present ? isPresent : !isPresent;
    }
    if (p.equals !== undefined) return v === p.equals;
    if (p.in !== undefined) return p.in.includes(v as string | number);
    if (p.matches !== undefined) {
        if (typeof v !== 'string') return false;
        try { return new RegExp(p.matches, 'i').test(v); } catch { return false; }
    }
    const n = toNumber(v);
    if (p.gte !== undefined) return Number.isFinite(n) && n >= p.gte;
    if (p.gt !== undefined) return Number.isFinite(n) && n > p.gt;
    if (p.lte !== undefined) return Number.isFinite(n) && n <= p.lte;
    if (p.lt !== undefined) return Number.isFinite(n) && n < p.lt;
    return false;
}

function ruleFires(ctx: EvalContext, rule: PolicyRule): boolean {
    if (rule.direction && rule.direction !== ctx.direction) return false;
    const all = rule.when?.all ?? [];
    const any = rule.when?.any ?? [];
    if (all.length === 0 && any.length === 0) return false; // empty condition never fires (fail-safe)
    if (all.length > 0 && !all.every(p => evaluatePredicate(ctx, p))) return false;
    if (any.length > 0 && !any.some(p => evaluatePredicate(ctx, p))) return false;
    return true;
}

function policyApplies(ctx: EvalContext, policy: Policy): boolean {
    const m = policy.match;
    if (!m) return true;
    if (m.environments && ctx.environment && !m.environments.includes(ctx.environment)) return false;
    if (m.projects && !m.projects.includes('*') && ctx.projectId && !m.projects.includes(ctx.projectId)) return false;
    if (m.models && !m.models.includes('*') && ctx.model && !m.models.includes(ctx.model)) return false;
    if (m.dataClassification && ctx.dataClassification && !m.dataClassification.includes(ctx.dataClassification)) return false;
    return true;
}

function buildRationale(decision: PolicyAction, fired: FiredRule[], defaultDeny: boolean): string {
    if (fired.length === 0) {
        return defaultDeny
            ? 'No rule matched; deny-by-default policy in effect → block'
            : 'No policy rule matched → allow';
    }
    const winner = fired
        .filter(f => f.action === decision)
        .sort((a, b) => (b.severity ? 1 : 0) - (a.severity ? 1 : 0))[0];
    const others = fired.length - 1;
    return `${decision} by policy "${winner.policy}" v${winner.version} rule "${winner.rule}"`
        + (winner.severity ? ` (${winner.severity})` : '')
        + (others > 0 ? ` — +${others} other rule(s) fired` : '');
}

export function evaluatePolicies(policies: Policy[], ctx: EvalContext): PolicyDecision {
    const fired: FiredRule[] = [];
    let matchedPolicies = false;
    let defaultDeny = false;

    for (const policy of policies) {
        if (policy.status !== 'active') continue;
        if (!policyApplies(ctx, policy)) continue;
        matchedPolicies = true;
        if (policy.defaults?.onNoMatch === 'block') defaultDeny = true;

        for (const rule of policy.rules ?? []) {
            if (ruleFires(ctx, rule)) {
                fired.push({
                    policy: policy.name,
                    version: policy.version,
                    rule: rule.name,
                    action: rule.action,
                    severity: rule.severity,
                    params: rule.params,
                    controls: policy.controls,
                });
            }
        }
    }

    let decision: PolicyAction;
    if (fired.length > 0) {
        decision = fired.reduce<PolicyAction>(
            (acc, f) => (ACTION_SEVERITY[f.action] > ACTION_SEVERITY[acc] ? f.action : acc),
            'allow',
        );
    } else {
        decision = defaultDeny ? 'block' : 'allow';
    }

    return { decision, firedRules: fired, rationale: buildRationale(decision, fired, defaultDeny), matchedPolicies };
}
