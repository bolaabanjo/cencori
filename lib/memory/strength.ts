/**
 * Memory strength & decay — Phase 3, Layer 4.
 *
 * "A memory system becomes terrible the moment it remembers everything." This
 * is the forgetting model. Unlike the Layer-2 rank score (which is
 * query-*dependent* — how relevant is this memory to THIS query), strength is
 * query-*independent*: how much does this memory deserve to keep surfacing at
 * all, given its importance, how recently it was used, and how often it has
 * proven useful.
 *
 * Decay keys on last USE, not creation: a fact written a year ago but recalled
 * yesterday is strong; a fact written yesterday and never touched is not. Use
 * slows decay — that is reinforcement.
 *
 * IMPORTANT — no silent forgetting. Per the locked pricing decision, the product
 * never auto-deletes a user's memories to make room. This module computes
 * strength and *suggests* forgetting candidates; deletion is always explicit
 * (user- or policy-initiated). Nothing here mutates or removes rows.
 *
 * Pure and dependency-free — fully unit-tested offline, no model or DB calls.
 */

import { reinforcementScore } from './rank';

export interface StrengthInput {
    importance: number;
    accessCount: number;
    createdAt: string | null;
    /** When the memory was last retrieved/used. Null = never used since creation. */
    lastAccessedAt: string | null;
}

export interface StrengthWeights {
    importance: number;
    recencyOfUse: number;
    reinforcement: number;
}

/**
 * Importance leads (a stated preference matters regardless of age), with
 * recency-of-use and reinforcement as the decay/keep-alive signals. Sum to 1 so
 * strength stays in [0,1]. Tunable via the eval harness.
 */
export const DEFAULT_STRENGTH_WEIGHTS: StrengthWeights = {
    importance: 0.5,
    recencyOfUse: 0.3,
    reinforcement: 0.2,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STRENGTH_HALF_LIFE_DAYS = 45;

export type StrengthBand = 'strong' | 'weak' | 'stale';

export interface StrengthOptions {
    now?: number;
    weights?: StrengthWeights;
    /** Half-life (days) for the decay on time-since-last-use. */
    halfLifeDays?: number;
}

/** When the memory was last "touched" — used if available, else created. */
export function lastUsedAt(m: StrengthInput): string | null {
    return m.lastAccessedAt ?? m.createdAt;
}

/** Days since the memory was last used. Infinity when unknown/invalid. */
export function daysSinceUse(m: StrengthInput, now: number): number {
    const iso = lastUsedAt(m);
    if (!iso) return Infinity;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return Infinity;
    return Math.max(0, (now - t) / DAY_MS);
}

/** Exponential decay on time since last use: 1 fresh, 0.5 at one half-life. */
function useRecency(m: StrengthInput, now: number, halfLifeDays: number): number {
    const days = daysSinceUse(m, now);
    if (!Number.isFinite(days)) return 0; // never usable/timestamped → fully decayed
    return Math.pow(0.5, days / halfLifeDays);
}

/**
 * Query-independent durability score in [0,1]. High = important, recently used,
 * or frequently used. Low = trivial, untouched, and old.
 */
export function memoryStrength(m: StrengthInput, options: StrengthOptions = {}): number {
    const now = options.now ?? Date.now();
    const w = options.weights ?? DEFAULT_STRENGTH_WEIGHTS;
    const halfLife = options.halfLifeDays ?? DEFAULT_STRENGTH_HALF_LIFE_DAYS;

    const imp = Math.max(0, Math.min(1, m.importance));
    const recency = useRecency(m, now, halfLife);
    const reinf = reinforcementScore(m.accessCount);

    return w.importance * imp + w.recencyOfUse * recency + w.reinforcement * reinf;
}

const STRONG_FLOOR = 0.6;
const STALE_CEILING = 0.3;

/** Bucket a memory for UI / forgetting review. */
export function classifyStrength(m: StrengthInput, options: StrengthOptions = {}): StrengthBand {
    const s = memoryStrength(m, options);
    if (s >= STRONG_FLOOR) return 'strong';
    if (s < STALE_CEILING) return 'stale';
    return 'weak';
}

export interface ForgetSuggestionOptions extends StrengthOptions {
    /** Only suggest memories not used in at least this many days. */
    minIdleDays?: number;
    /** Only suggest memories whose strength is below this floor. */
    strengthFloor?: number;
    /** Cap the number of suggestions returned (weakest first). */
    limit?: number;
}

export interface ForgetSuggestion<T> {
    memory: T;
    strength: number;
    idleDays: number;
}

/**
 * Propose memories worth forgetting — stale, low-strength, and not used in a
 * while. Returns candidates ONLY; the caller decides whether to act. This never
 * deletes anything (no silent forgetting). Weakest candidates come first.
 */
export function suggestForForgetting<T extends StrengthInput>(
    memories: T[],
    options: ForgetSuggestionOptions = {}
): ForgetSuggestion<T>[] {
    const now = options.now ?? Date.now();
    const minIdleDays = options.minIdleDays ?? 60;
    const strengthFloor = options.strengthFloor ?? STALE_CEILING;

    const candidates = memories
        .map(memory => ({
            memory,
            strength: memoryStrength(memory, options),
            idleDays: daysSinceUse(memory, now),
        }))
        .filter(c => c.strength < strengthFloor && c.idleDays >= minIdleDays)
        .sort((a, b) => a.strength - b.strength);

    return options.limit != null ? candidates.slice(0, options.limit) : candidates;
}
