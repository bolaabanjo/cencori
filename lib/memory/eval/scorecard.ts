/**
 * Pure scoring for the memory eval harness. No I/O — given what retrieval
 * returned per question, derive pass/fail and aggregate a Scorecard. Kept pure
 * so the scoreboard logic itself is unit-tested and deterministic.
 */

import type {
    EvalCategory,
    EvalQuestion,
    QuestionResult,
    Scorecard,
} from './types';

/** Case-insensitive, whitespace-normalized substring test. */
export function factPresent(recalled: string[], fact: string): boolean {
    const needle = fact.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!needle) return false;
    return recalled.some(r => r.toLowerCase().replace(/\s+/g, ' ').includes(needle));
}

/** Grade a single question against what retrieval returned. */
export function gradeQuestion(question: EvalQuestion, recalled: string[]): QuestionResult {
    const expected = question.expectedFacts ?? [];
    const forbidden = question.forbiddenFacts ?? [];

    const expectedMet = expected.every(f => factPresent(recalled, f));
    const forbiddenPresent = forbidden.some(f => factPresent(recalled, f));

    return {
        questionId: question.id,
        category: question.category,
        recalled,
        expectedMet,
        forbiddenPresent,
    };
}

const CATEGORIES: EvalCategory[] = ['recall', 'contradiction', 'irrelevant', 'leak'];

/** Aggregate per-question results into the Scorecard. */
export function computeScorecard(results: QuestionResult[]): Scorecard {
    const total = results.length;
    const safeDiv = (n: number, d: number) => (d === 0 ? 1 : n / d);

    const recallHits = results.filter(r => r.expectedMet).length;
    const precisionHits = results.filter(r => !r.forbiddenPresent).length;

    const contradictionCases = results.filter(r => r.category === 'contradiction');
    const contradictionResolved = contradictionCases.filter(r => !r.forbiddenPresent).length;

    const leakCount = results.filter(r => r.category === 'leak' && r.forbiddenPresent).length;

    const byCategory = {} as Scorecard['byCategory'];
    for (const cat of CATEGORIES) {
        const rows = results.filter(r => r.category === cat);
        byCategory[cat] = {
            total: rows.length,
            recall: safeDiv(rows.filter(r => r.expectedMet).length, rows.length),
            precision: safeDiv(rows.filter(r => !r.forbiddenPresent).length, rows.length),
        };
    }

    return {
        total,
        recall: safeDiv(recallHits, total),
        precision: safeDiv(precisionHits, total),
        contradictionResolutionRate: safeDiv(contradictionResolved, contradictionCases.length),
        leakCount,
        byCategory,
    };
}

/** Human-readable scorecard for CLI output. */
export function formatScorecard(label: string, card: Scorecard): string {
    const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
    const lines = [
        `── Memory eval: ${label} ──`,
        `  questions:                ${card.total}`,
        `  recall:                   ${pct(card.recall)}`,
        `  precision:                ${pct(card.precision)}`,
        `  contradiction resolution: ${pct(card.contradictionResolutionRate)}`,
        `  leaks:                    ${card.leakCount}${card.leakCount > 0 ? '  ⚠️  FAIL' : '  ✓'}`,
        `  by category:`,
    ];
    for (const [cat, s] of Object.entries(card.byCategory)) {
        if (s.total === 0) continue;
        lines.push(`    ${cat.padEnd(14)} n=${s.total}  recall=${pct(s.recall)}  precision=${pct(s.precision)}`);
    }
    return lines.join('\n');
}
