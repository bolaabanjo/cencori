/**
 * @vitest-environment node
 *
 * Layer 2 reranking. The ranker is the retrieval-quality lever, so its math
 * must be deterministic and its knobs must actually move ordering.
 */
import { describe, expect, it } from 'vitest';

import {
    rankMemories,
    recencyScore,
    reinforcementScore,
    jaccard,
    DEFAULT_RANK_WEIGHTS,
    type RankableMemory,
} from '../rank';

const NOW = Date.parse('2026-07-19T00:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

const mem = (over: Partial<RankableMemory> & { id: string; content: string }): RankableMemory => ({
    similarity: 0.7,
    importance: 0.5,
    accessCount: 0,
    createdAt: daysAgo(0),
    namespace: null,
    ...over,
});

describe('recencyScore', () => {
    it('is 1 when fresh, 0.5 at one half-life, lower when older', () => {
        expect(recencyScore(daysAgo(0), NOW, 30)).toBeCloseTo(1);
        expect(recencyScore(daysAgo(30), NOW, 30)).toBeCloseTo(0.5);
        expect(recencyScore(daysAgo(60), NOW, 30)).toBeCloseTo(0.25);
    });
    it('is neutral (0.5) for unknown/invalid dates', () => {
        expect(recencyScore(null, NOW, 30)).toBe(0.5);
        expect(recencyScore('not-a-date', NOW, 30)).toBe(0.5);
    });
});

describe('reinforcementScore', () => {
    it('saturates from 0 toward 1 as access count grows', () => {
        expect(reinforcementScore(0)).toBe(0);
        expect(reinforcementScore(1)).toBeCloseTo(0.5);
        expect(reinforcementScore(9)).toBeCloseTo(0.9);
        expect(reinforcementScore(-5)).toBe(0); // clamps negatives
    });
});

describe('jaccard', () => {
    it('measures token overlap', () => {
        const a = new Set(['user', 'likes', 'dark', 'mode']);
        const b = new Set(['user', 'likes', 'dark', 'theme']);
        expect(jaccard(a, b)).toBeCloseTo(3 / 5);
        expect(jaccard(new Set(['x']), new Set(['y']))).toBe(0);
    });
});

describe('rankMemories', () => {
    it('similarity dominates ordering', () => {
        const ranked = rankMemories(
            [mem({ id: 'a', content: 'alpha', similarity: 0.4 }), mem({ id: 'b', content: 'beta', similarity: 0.9 })],
            { topK: 2, now: NOW }
        );
        expect(ranked.map(m => m.id)).toEqual(['b', 'a']);
    });

    it('recency breaks near-ties in similarity', () => {
        const ranked = rankMemories(
            [
                mem({ id: 'old', content: 'old fact', similarity: 0.8, createdAt: daysAgo(120) }),
                mem({ id: 'new', content: 'new fact', similarity: 0.8, createdAt: daysAgo(0) }),
            ],
            { topK: 2, now: NOW }
        );
        expect(ranked[0].id).toBe('new');
    });

    it('recent USE keeps an old memory fresh (recency keys on last access, not creation)', () => {
        const ranked = rankMemories(
            [
                // created long ago but used yesterday
                mem({ id: 'used', content: 'used recently', similarity: 0.8, createdAt: daysAgo(300), lastAccessedAt: daysAgo(1) }),
                // created long ago and never touched
                mem({ id: 'stale', content: 'never touched', similarity: 0.8, createdAt: daysAgo(300), lastAccessedAt: null }),
            ],
            { topK: 2, now: NOW }
        );
        expect(ranked[0].id).toBe('used');
    });

    it('reinforcement lifts a repeatedly-useful memory over a cold equal', () => {
        const ranked = rankMemories(
            [
                mem({ id: 'cold', content: 'cold one', similarity: 0.8, accessCount: 0 }),
                mem({ id: 'proven', content: 'proven two', similarity: 0.8, accessCount: 20 }),
            ],
            { topK: 2, now: NOW }
        );
        expect(ranked[0].id).toBe('proven');
    });

    it('truncates to topK', () => {
        const pool = Array.from({ length: 10 }, (_, i) =>
            mem({ id: `m${i}`, content: `fact number ${i}`, similarity: 0.5 + i * 0.01 })
        );
        expect(rankMemories(pool, { topK: 3, now: NOW })).toHaveLength(3);
    });

    it('drops near-duplicate content for diversity', () => {
        const ranked = rankMemories(
            [
                mem({ id: 'a', content: 'user prefers dark mode everywhere', similarity: 0.9 }),
                mem({ id: 'b', content: 'user prefers dark mode everywhere', similarity: 0.88 }), // dup
                mem({ id: 'c', content: 'user is building Ledgerkit', similarity: 0.6 }),
            ],
            { topK: 3, now: NOW }
        );
        const ids = ranked.map(m => m.id);
        expect(ids).toContain('a');
        expect(ids).toContain('c');
        expect(ids).not.toContain('b'); // near-dup of a, dropped
    });

    it('is deterministic and stable on exact ties (incoming/cosine order wins)', () => {
        const pool = [
            mem({ id: 'first', content: 'tie one', similarity: 0.7, importance: 0.5, createdAt: daysAgo(0) }),
            mem({ id: 'second', content: 'tie two', similarity: 0.7, importance: 0.5, createdAt: daysAgo(0) }),
        ];
        const a = rankMemories(pool, { topK: 2, now: NOW });
        const b = rankMemories(pool, { topK: 2, now: NOW });
        expect(a.map(m => m.id)).toEqual(['first', 'second']);
        expect(a.map(m => m.id)).toEqual(b.map(m => m.id));
    });

    it('weights sum to 1 so composite scores stay in [0,1]', () => {
        const total = Object.values(DEFAULT_RANK_WEIGHTS).reduce((s, w) => s + w, 0);
        expect(total).toBeCloseTo(1);
        const ranked = rankMemories([mem({ id: 'a', content: 'x', similarity: 1, importance: 1, accessCount: 1000 })], {
            topK: 1,
            now: NOW,
        });
        expect(ranked[0].rankScore).toBeGreaterThan(0);
        expect(ranked[0].rankScore).toBeLessThanOrEqual(1);
    });
});
