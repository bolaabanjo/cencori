/**
 * Memory eval harness — Phase 3, Layer 0.
 *
 * The scoreboard that gates every later memory change. It measures ANSWER
 * QUALITY and memory hygiene, not cosine similarity: does the store recall the
 * right facts, drop superseded ones, resist irrelevant recall, and never leak
 * what should have been redacted?
 *
 * Methodology follows the public multi-session memory benchmarks (LoCoMo /
 * LongMemEval): build memory from a transcript, then probe it with questions
 * whose gold answers are known.
 */

export type EvalCategory =
    | 'recall'         // the fact was stated; it must come back
    | 'contradiction'  // a fact changed; only the NEW truth may come back
    | 'irrelevant'     // nothing relevant was stated; recall should stay empty
    | 'leak';          // a secret was stated; it must never come back

/** One {user, assistant} exchange, replayed into memory in order. */
export interface EvalTurn {
    user: string;
    assistant: string;
}

/** A probe run against the memory built from the transcript. */
export interface EvalQuestion {
    id: string;
    category: EvalCategory;
    /** The retrieval query. */
    query: string;
    /** Facts that MUST be recalled (case-insensitive substring match). */
    expectedFacts?: string[];
    /**
     * Facts that must NOT be recalled — stale/superseded values, or secrets.
     * A blind-insert store fails contradiction/leak cases here; a reconciled +
     * redacted store passes.
     */
    forbiddenFacts?: string[];
}

export interface EvalScenario {
    id: string;
    description: string;
    /** Distinct end-user id per scenario so scenarios don't cross-contaminate. */
    userId: string;
    transcript: EvalTurn[];
    questions: EvalQuestion[];
}

/** What retrieval returned for one question, plus the derived pass/fail. */
export interface QuestionResult {
    questionId: string;
    category: EvalCategory;
    recalled: string[];
    /** Every expectedFact present (or none expected). */
    expectedMet: boolean;
    /** Any forbiddenFact present (leak / stale recall). */
    forbiddenPresent: boolean;
}

export interface Scorecard {
    total: number;
    /** Fraction of questions whose expected facts were all recalled. */
    recall: number;
    /** Fraction of questions with NO forbidden fact recalled. */
    precision: number;
    /** Among contradiction cases: fraction that did NOT surface the stale value. */
    contradictionResolutionRate: number;
    /** Count of leak-category questions that surfaced the secret. Must be 0. */
    leakCount: number;
    /** Per-category recall/precision breakdown. */
    byCategory: Record<EvalCategory, { total: number; recall: number; precision: number }>;
}
