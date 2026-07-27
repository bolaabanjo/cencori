/**
 * Judged scoring — LoCoMo / LongMemEval style.
 *
 * The substring scorer (scorecard.ts) asks "did retrieval return the right
 * fact?" — cheap and deterministic, good for fast iteration. The published
 * benchmarks instead score the FINAL ANSWER: recall memories → have a model
 * answer the question from them → an LLM judge grades the answer against a gold
 * answer. This module is the pure core of that path (prompts + verdict parse +
 * aggregation); the model + judge calls are injected by the runner so this stays
 * unit-testable with no LLM.
 *
 * To compare apples-to-apples with Mem0/Zep, mirror their protocol: same
 * answering model and the same judge model where possible.
 */

import type { EvalCategory, EvalQuestion } from './types';

// ── Answer generation ────────────────────────────────────────────────────────
export const ANSWER_SYSTEM_PROMPT = `You answer a question about a user using ONLY the memory facts provided. If the facts do not contain the answer, reply exactly "I don't know." Do not guess or use outside knowledge. Answer in one short sentence.`;

export function buildAnswerUserMessage(query: string, recalled: string[]): string {
    const facts = recalled.length ? recalled.map(c => `- ${c}`).join('\n') : '(no relevant memories)';
    return `Memory facts about the user:\n${facts}\n\nQuestion: ${query}`;
}

// ── Judge ────────────────────────────────────────────────────────────────────
export const JUDGE_SYSTEM_PROMPT = `You grade whether a GENERATED answer to a question about a user matches the CORRECT answer.

Rules:
- Correct if the generated answer conveys the same essential information as the correct answer; exact wording may differ.
- When the correct answer is a refusal ("I don't know" / not mentioned), the generated answer is correct ONLY if it also declines to answer, and INCORRECT if it invents a value.
- When the correct answer is a specific value, the generated answer is INCORRECT if it gives a different or stale value, or declines.

Respond with ONLY JSON: {"correct": true} or {"correct": false}.`;

export function buildJudgeUserMessage(query: string, gold: string, generated: string): string {
    return `Question: ${query}\nCorrect answer: ${gold}\nGenerated answer: ${generated}\n\nIs the generated answer correct?`;
}

/**
 * Parse the judge's verdict. Prefers {"correct": bool}; falls back to plain
 * CORRECT/INCORRECT or yes/no. Defaults to false (unproven = not correct).
 */
export function parseJudgeVerdict(raw: string): boolean {
    if (!raw) return false;
    const text = raw.trim();

    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0]) as { correct?: unknown };
            if (typeof parsed.correct === 'boolean') return parsed.correct;
        } catch {
            /* fall through to text heuristics */
        }
    }

    const lower = text.toLowerCase();
    if (/\bincorrect\b|\bfalse\b|\bno\b/.test(lower)) return false;
    if (/\bcorrect\b|\btrue\b|\byes\b/.test(lower)) return true;
    return false;
}

// ── Aggregation ──────────────────────────────────────────────────────────────
export interface JudgedResult {
    questionId: string;
    category: EvalCategory;
    generatedAnswer: string;
    correct: boolean;
}

export interface JudgedScorecard {
    total: number;
    /** Overall answer accuracy (LoCoMo/LongMemEval headline metric). */
    accuracy: number;
    byCategory: Record<EvalCategory, { total: number; accuracy: number }>;
}

const CATEGORIES: EvalCategory[] = ['recall', 'contradiction', 'temporal', 'multi', 'irrelevant', 'leak'];

/** Grade one answer against its gold. Exported for the runner. */
export function gradeAnswer(question: EvalQuestion, generatedAnswer: string, correct: boolean): JudgedResult {
    return { questionId: question.id, category: question.category, generatedAnswer, correct };
}

export function computeJudgedScorecard(results: JudgedResult[]): JudgedScorecard {
    const safeDiv = (n: number, d: number) => (d === 0 ? 1 : n / d);
    const byCategory = {} as JudgedScorecard['byCategory'];
    for (const cat of CATEGORIES) {
        const rows = results.filter(r => r.category === cat);
        byCategory[cat] = { total: rows.length, accuracy: safeDiv(rows.filter(r => r.correct).length, rows.length) };
    }
    return {
        total: results.length,
        accuracy: safeDiv(results.filter(r => r.correct).length, results.length),
        byCategory,
    };
}

export function formatJudgedScorecard(label: string, card: JudgedScorecard): string {
    const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
    const lines = [`── Judged eval: ${label} ──`, `  questions:  ${card.total}`, `  accuracy:   ${pct(card.accuracy)}`, `  by ability:`];
    for (const [cat, s] of Object.entries(card.byCategory)) {
        if (s.total === 0) continue;
        lines.push(`    ${cat.padEnd(14)} n=${s.total}  accuracy=${pct(s.accuracy)}`);
    }
    return lines.join('\n');
}
