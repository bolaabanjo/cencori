/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { scoreSearchEvaluationCase, summarizeSearchEvaluations } from '@/lib/web/evaluation';

describe('search quality evaluation', () => {
    it('computes reciprocal rank, recall, and nDCG', () => {
        const result = scoreSearchEvaluationCase({ id: 'q1', query: 'query', expectedDomains: ['docs.example.com'] }, [
            'https://other.example/a', 'https://docs.example.com/right',
        ], 42);
        expect(result.reciprocalRank).toBe(0.5);
        expect(result.recallAtK).toBe(1);
        expect(result.ndcgAtK).toBeCloseTo(1 / Math.log2(3));
    });

    it('summarizes a suite and reports p95 latency', () => {
        const summary = summarizeSearchEvaluations([
            { id: 'a', query: 'a', reciprocalRank: 1, recallAtK: 1, ndcgAtK: 1, latencyMs: 10, returnedDomains: ['a.com'] },
            { id: 'b', query: 'b', reciprocalRank: 0, recallAtK: 0, ndcgAtK: 0, latencyMs: 100, returnedDomains: ['b.com'] },
        ]);
        expect(summary.mrr).toBe(0.5);
        expect(summary.p95LatencyMs).toBe(100);
        expect(summary.uniqueDomains).toBe(2);
    });
});
