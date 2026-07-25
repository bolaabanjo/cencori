/**
 * Policy-as-code schema (PRD M1 / Appendix A).
 *
 * Deliberately bounded (not a Turing-complete language like Rego): a policy is
 * metadata + match + rules(condition → action) + defaults + control mappings.
 * Banks want auditable, not clever. The condition language is a small, typed
 * set of predicates evaluated against a request context.
 */

export type PolicyAction =
    | 'allow'
    | 'block'
    | 'redact'
    | 'tokenize'
    | 'route'
    | 'require_approval'
    | 'rate_limit';

export type PolicyDirection = 'input' | 'output';
export type PolicySeverity = 'low' | 'medium' | 'high' | 'critical';
export type PolicyStatus = 'draft' | 'pending_review' | 'active' | 'retired';

/** One typed predicate over a context field. Exactly one comparator applies. */
export interface Predicate {
    /** Dot-path into the eval context: content | amount | model | environment |
     *  data_classification | user.region | signals.<name> */
    field: string;
    equals?: string | number | boolean;
    gte?: number;
    gt?: number;
    lte?: number;
    lt?: number;
    /** true → field must be present (non-null); false → must be absent. */
    present?: boolean;
    /** case-insensitive regex against a string field. */
    matches?: string;
    in?: Array<string | number>;
}

export interface PolicyRule {
    name: string;
    /** Restrict this rule to the input or output phase (omit = both). */
    direction?: PolicyDirection;
    /** `all` predicates must pass (AND); `any` requires one (OR). Both may be set. */
    when: { all?: Predicate[]; any?: Predicate[] };
    action: PolicyAction;
    params?: Record<string, unknown>;
    severity?: PolicySeverity;
}

export interface PolicyMatch {
    projects?: string[];          // '*' or specific ids
    models?: string[];            // '*' or specific
    environments?: string[];
    dataClassification?: string[];
}

/** The declarative policy document (stored as `spec` on governance_policies). */
export interface Policy {
    name: string;
    version: number;
    status: PolicyStatus;
    /** Regulatory controls this policy satisfies (feeds evidence packs). */
    controls?: string[];
    match?: PolicyMatch;
    rules: PolicyRule[];
    defaults?: { onNoMatch?: 'allow' | 'block' };
}

/** Request context the engine evaluates against. */
export interface EvalContext {
    direction: PolicyDirection;
    projectId?: string;
    model?: string;
    environment?: string;
    dataClassification?: string;
    region?: string;
    content?: string;
    amount?: number;
    /** Model/guardrail signals, e.g. { jailbreak_score: 0.9, 'pii.account_number': true }. */
    signals?: Record<string, unknown>;
}

export interface FiredRule {
    policy: string;
    version: number;
    rule: string;
    action: PolicyAction;
    severity?: PolicySeverity;
    params?: Record<string, unknown>;
    controls?: string[];
}

export interface PolicyDecision {
    /** The single most-restrictive action across all fired rules (or the default). */
    decision: PolicyAction;
    firedRules: FiredRule[];
    rationale: string;
    /** True if at least one active policy's `match` applied to this context. */
    matchedPolicies: boolean;
}
