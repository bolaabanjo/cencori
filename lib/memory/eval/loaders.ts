/**
 * Public benchmark loaders — LongMemEval & LoCoMo.
 *
 * Converts the two established long-term-memory benchmarks into our
 * `EvalScenario` shape so the *same* judged runner scores them apples-to-apples
 * with Mem0/Zep's published numbers. These are the datasets behind the "we beat
 * Mem0" headline; the homegrown benchmark (dataset.ts) is for fast free-tier
 * iteration.
 *
 * The datasets are large public files (GitHub / HuggingFace) that live OUTSIDE
 * the repo — a driver reads + JSON-parses the file and passes it here. Loaders
 * are defensive: malformed entries are skipped, never thrown.
 *
 * Loaded questions carry a `goldAnswer` and category only (no expected/forbidden
 * substrings) — they are meant for the JUDGED path (runJudgedEval), which scores
 * the final answer against gold, exactly as the source benchmarks do.
 */

import type { EvalCategory, EvalQuestion, EvalScenario, EvalTurn } from './types';

/** Pair a flat alternating dialogue into {user, assistant} turns. */
function pairTurns(turns: { text: string }[]): EvalTurn[] {
    const paired: EvalTurn[] = [];
    for (let i = 0; i < turns.length; i += 2) {
        paired.push({ user: turns[i]?.text ?? '', assistant: turns[i + 1]?.text ?? '' });
    }
    return paired;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

// ── LongMemEval ──────────────────────────────────────────────────────────────
// Instance shape:
//   { question_id, question_type, question, answer,
//     haystack_sessions: [ [ {role, content}, ... ], ... ] }
// Abstention questions have question_id ending in "_abs".

function longMemEvalCategory(questionType: string, questionId: string): EvalCategory {
    if (questionId.endsWith('_abs')) return 'irrelevant'; // abstention
    switch (questionType) {
        case 'temporal-reasoning': return 'temporal';
        case 'knowledge-update': return 'contradiction';
        case 'multi-session': return 'multi';
        default: return 'recall'; // single-session-user/assistant/preference
    }
}

interface LongMemEvalInstance {
    question_id?: unknown;
    question_type?: unknown;
    question?: unknown;
    answer?: unknown;
    haystack_sessions?: unknown;
}

export function loadLongMemEval(raw: unknown): EvalScenario[] {
    const instances = Array.isArray(raw) ? raw : [];
    const scenarios: EvalScenario[] = [];

    for (const inst of instances as LongMemEvalInstance[]) {
        if (!inst || typeof inst !== 'object') continue;
        const questionId = str(inst.question_id);
        const question = str(inst.question);
        if (!questionId || !question) continue;

        const sessions = Array.isArray(inst.haystack_sessions) ? inst.haystack_sessions : [];
        const turns: { text: string }[] = [];
        for (const session of sessions) {
            if (!Array.isArray(session)) continue;
            for (const msg of session) {
                const content = str((msg as { content?: unknown })?.content);
                if (content) turns.push({ text: content });
            }
        }

        const q: EvalQuestion = {
            id: questionId,
            category: longMemEvalCategory(str(inst.question_type), questionId),
            query: question,
            goldAnswer: str(inst.answer) || "I don't know.",
        };

        scenarios.push({
            id: `lme-${questionId}`,
            description: `LongMemEval ${str(inst.question_type) || 'question'}`,
            userId: `lme-${questionId}`,
            transcript: pairTurns(turns),
            questions: [q],
        });
    }
    return scenarios;
}

// ── LoCoMo ───────────────────────────────────────────────────────────────────
// Sample shape:
//   { sample_id,
//     conversation: { speaker_a, speaker_b, session_1: [{speaker,text,dia_id}], ... },
//     qa: [ { question, answer, evidence, category } ] }
// category: 1 multi-hop, 2 temporal, 3 open-domain, 4 single-hop, 5 adversarial.

function locomoCategory(category: unknown): EvalCategory {
    switch (Number(category)) {
        case 1: return 'multi';
        case 2: return 'temporal';
        case 5: return 'irrelevant'; // adversarial → unanswerable / abstention
        default: return 'recall';    // 3 open-domain, 4 single-hop
    }
}

interface LoCoMoSample {
    sample_id?: unknown;
    conversation?: Record<string, unknown>;
    qa?: unknown;
}

export function loadLoCoMo(raw: unknown): EvalScenario[] {
    const samples = Array.isArray(raw) ? raw : [];
    const scenarios: EvalScenario[] = [];

    for (const sample of samples as LoCoMoSample[]) {
        if (!sample || typeof sample !== 'object') continue;
        const sampleId = str(sample.sample_id) || `sample-${scenarios.length}`;
        const conversation = (sample.conversation ?? {}) as Record<string, unknown>;

        // Sessions are keys like session_1, session_2, ... in numeric order.
        const sessionKeys = Object.keys(conversation)
            .filter(k => /^session_\d+$/.test(k))
            .sort((a, b) => Number(a.split('_')[1]) - Number(b.split('_')[1]));

        const turns: { text: string }[] = [];
        for (const key of sessionKeys) {
            const session = conversation[key];
            if (!Array.isArray(session)) continue;
            for (const turn of session) {
                const text = str((turn as { text?: unknown })?.text);
                if (text) turns.push({ text });
            }
        }

        const qaList = Array.isArray(sample.qa) ? sample.qa : [];
        const questions: EvalQuestion[] = [];
        qaList.forEach((qa, i) => {
            if (!qa || typeof qa !== 'object') return;
            const question = str((qa as { question?: unknown }).question);
            if (!question) return;
            const answerRaw = (qa as { answer?: unknown }).answer;
            const category = locomoCategory((qa as { category?: unknown }).category);
            questions.push({
                id: `${sampleId}-q${i}`,
                category,
                query: question,
                // LoCoMo answers are sometimes non-string (numbers/lists); coerce.
                goldAnswer: answerRaw != null && answerRaw !== '' ? String(answerRaw) : "I don't know.",
            });
        });

        if (questions.length === 0) continue;

        scenarios.push({
            id: `locomo-${sampleId}`,
            description: `LoCoMo conversation ${sampleId}`,
            userId: `locomo-${sampleId}`,
            transcript: pairTurns(turns),
            questions,
        });
    }
    return scenarios;
}
