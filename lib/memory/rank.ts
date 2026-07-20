/**
 * Memory reranking — Phase 3, Layer 2.
 *
 * Pure cosine top-K has two failure modes: it over-returns
 * semantically-near-but-irrelevant facts, and it ignores everything except
 * similarity — recency, importance, and how often a memory has actually proven
 * useful. This reranks a wider candidate pool by a composite score, then drops
 * near-duplicates for diversity, and returns the final top-K.
 *
 * Deterministic and dependency-free — the whole ranker is unit-tested offline,
 * with no model or DB calls. Retrieval embeds the query (one call) and fetches
 * the pool; everything here is math on what came back.
 */

export interface RankableMemory {
    id: string;
    content: string;
    /** Cosine similarity to the query, ~0–1. */
    similarity: number;
    /** Stored importance, 0–1. */
    importance: number;
    /** How many times this memory has previously survived retrieval. */
    accessCount: number;
    createdAt: string | null;
    /**
     * When the memory was last retrieved/used. Recency keys on this (falling
     * back to createdAt) so a fact that keeps proving useful stays "fresh" —
     * reinforcement slows decay. Null = never used since creation.
     */
    lastAccessedAt?: string | null;
    namespace: string | null;
}

export interface RankedMemory extends RankableMemory {
    /** Composite score in [0,1] the final ordering was based on. */
    rankScore: number;
}

export interface RankWeights {
    similarity: number;
    recency: number;
    importance: number;
    reinforcement: number;
}

/**
 * Similarity dominates — it's the relevance signal — with recency, importance,
 * and reinforcement as tie-breakers that lift the *right* near-matches. Weights
 * sum to 1 so the composite stays in [0,1]. Tunable via the eval harness.
 */
export const DEFAULT_RANK_WEIGHTS: RankWeights = {
    similarity: 0.6,
    recency: 0.15,
    importance: 0.15,
    reinforcement: 0.1,
};

export interface RankOptions {
    topK: number;
    now?: number;
    weights?: RankWeights;
    /** Half-life (days) for the recency decay. A fact this old scores 0.5 on recency. */
    recencyHalfLifeDays?: number;
    /** Drop a candidate if its token-Jaccard with a higher-ranked kept one exceeds this. */
    diversityThreshold?: number;
}

const DEFAULT_HALF_LIFE_DAYS = 30;
const DEFAULT_DIVERSITY_THRESHOLD = 0.8;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Exponential recency decay: 1.0 when fresh, 0.5 at one half-life, →0 when old. */
export function recencyScore(createdAt: string | null, now: number, halfLifeDays: number): number {
    if (!createdAt) return 0.5; // unknown age → neutral, don't reward or punish
    const created = Date.parse(createdAt);
    if (Number.isNaN(created)) return 0.5;
    const ageDays = Math.max(0, (now - created) / DAY_MS);
    return Math.pow(0.5, ageDays / halfLifeDays);
}

/** Saturating reinforcement: 0 unused, 0.5 at 1 hit, →1 as it keeps proving useful. */
export function reinforcementScore(accessCount: number): number {
    const n = Math.max(0, accessCount || 0);
    return 1 - 1 / (1 + n);
}

/** Lowercase alphanumeric token set. */
function tokenSet(text: string): Set<string> {
    return new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
}

/** Jaccard overlap of two token sets, 0–1. */
export function jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 1;
    let intersection = 0;
    for (const t of a) if (b.has(t)) intersection++;
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
}

function composite(m: RankableMemory, opts: Required<Pick<RankOptions, 'weights' | 'recencyHalfLifeDays'>>, now: number): number {
    const w = opts.weights;
    const sim = Math.max(0, Math.min(1, m.similarity));
    // Recency keys on last USE (fallback creation) — reinforcement slows decay.
    const rec = recencyScore(m.lastAccessedAt ?? m.createdAt, now, opts.recencyHalfLifeDays);
    const imp = Math.max(0, Math.min(1, m.importance));
    const reinf = reinforcementScore(m.accessCount);
    return w.similarity * sim + w.recency * rec + w.importance * imp + w.reinforcement * reinf;
}

/**
 * Rerank a candidate pool and return the final top-K. Stable: ties break by the
 * pool's incoming order (which is cosine-sorted from the RPC).
 */
export function rankMemories(pool: RankableMemory[], options: RankOptions): RankedMemory[] {
    const now = options.now ?? Date.now();
    const weights = options.weights ?? DEFAULT_RANK_WEIGHTS;
    const halfLife = options.recencyHalfLifeDays ?? DEFAULT_HALF_LIFE_DAYS;
    const diversityThreshold = options.diversityThreshold ?? DEFAULT_DIVERSITY_THRESHOLD;

    // Score keeping the incoming index for a stable, cosine-order tie-break.
    const scored = pool.map((m, i) => ({
        memory: { ...m, rankScore: composite(m, { weights, recencyHalfLifeDays: halfLife }, now) } as RankedMemory,
        i,
    }));

    scored.sort((a, b) =>
        b.memory.rankScore !== a.memory.rankScore ? b.memory.rankScore - a.memory.rankScore : a.i - b.i
    );

    // Diversity pass (MMR-lite): keep a candidate unless it near-duplicates an
    // already-kept, higher-ranked one. Layer 1 dedups at write time, so this
    // mainly guards against paraphrase drift.
    const kept: RankedMemory[] = [];
    const keptTokens: Set<string>[] = [];
    for (const { memory } of scored) {
        if (kept.length >= options.topK) break;
        const tokens = tokenSet(memory.content);
        if (keptTokens.some(kt => jaccard(tokens, kt) > diversityThreshold)) continue;
        kept.push(memory);
        keptTokens.push(tokens);
    }

    return kept;
}
