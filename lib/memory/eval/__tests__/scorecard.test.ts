/**
 * @vitest-environment node
 *
 * The scoreboard math itself must be trustworthy — if the metric lies, every
 * later "did this layer help?" decision is built on sand.
 */
import { describe, expect, it } from 'vitest';

import { factPresent, gradeQuestion, computeScorecard } from '../scorecard';
import type { EvalQuestion, QuestionResult } from '../types';

describe('factPresent', () => {
    it('matches case- and whitespace-insensitively', () => {
        expect(factPresent(['User uses  RUST now'], 'rust')).toBe(true);
        expect(factPresent(['User uses Python'], 'rust')).toBe(false);
        expect(factPresent([], 'rust')).toBe(false);
        expect(factPresent(['anything'], '   ')).toBe(false);
    });
});

describe('gradeQuestion', () => {
    const q = (over: Partial<EvalQuestion>): EvalQuestion => ({
        id: 'q', category: 'contradiction', query: 'q?', ...over,
    });

    it('passes when expected present and forbidden absent', () => {
        const r = gradeQuestion(q({ expectedFacts: ['Rust'], forbiddenFacts: ['Python'] }), ['User uses Rust']);
        expect(r.expectedMet).toBe(true);
        expect(r.forbiddenPresent).toBe(false);
    });

    it('flags a stale/leaked forbidden fact', () => {
        const r = gradeQuestion(
            q({ expectedFacts: ['Rust'], forbiddenFacts: ['Python'] }),
            ['User uses Rust', 'User uses Python'], // blind-insert store keeps both
        );
        expect(r.forbiddenPresent).toBe(true);
    });

    it('treats no-expected-facts as met (irrelevant/leak precision cases)', () => {
        const r = gradeQuestion(q({ category: 'irrelevant' }), []);
        expect(r.expectedMet).toBe(true);
        expect(r.forbiddenPresent).toBe(false);
    });
});

describe('computeScorecard', () => {
    const result = (over: Partial<QuestionResult>): QuestionResult => ({
        questionId: 'q', category: 'recall', recalled: [], expectedMet: true, forbiddenPresent: false, ...over,
    });

    it('aggregates recall, precision, contradiction resolution and leaks', () => {
        const results: QuestionResult[] = [
            result({ category: 'recall', expectedMet: true }),
            result({ category: 'recall', expectedMet: false }),
            result({ category: 'contradiction', expectedMet: true, forbiddenPresent: true }), // stale surfaced
            result({ category: 'contradiction', expectedMet: true, forbiddenPresent: false }),
            result({ category: 'leak', forbiddenPresent: true }), // leaked secret
        ];

        const card = computeScorecard(results);

        expect(card.total).toBe(5);
        expect(card.recall).toBeCloseTo(4 / 5); // 4 of 5 expectedMet
        expect(card.precision).toBeCloseTo(3 / 5); // 2 have forbidden present
        expect(card.contradictionResolutionRate).toBeCloseTo(1 / 2); // 1 of 2 resolved
        expect(card.leakCount).toBe(1);
        expect(card.byCategory.recall.total).toBe(2);
        expect(card.byCategory.contradiction.precision).toBeCloseTo(1 / 2);
    });

    it('is defined (=1) for empty category denominators, not NaN', () => {
        const card = computeScorecard([result({ category: 'recall', expectedMet: true })]);
        // no contradiction cases present → rate is 1, never NaN
        expect(card.contradictionResolutionRate).toBe(1);
        expect(card.leakCount).toBe(0);
    });
});
