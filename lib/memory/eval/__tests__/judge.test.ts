/**
 * @vitest-environment node
 *
 * LoCoMo/LongMemEval-style judged scoring. The judge verdict parse and the
 * accuracy aggregation must be trustworthy, and runJudgedEval must drive
 * recall → answer → judge in order.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    rememberExchange: vi.fn(),
    retrieveMemories: vi.fn(),
    getProjectMemorySettings: vi.fn(),
}));
vi.mock('../../writeback', () => ({ rememberExchange: (...a: unknown[]) => mocks.rememberExchange(...a) }));
vi.mock('../../retrieval', () => ({ retrieveMemories: (...a: unknown[]) => mocks.retrieveMemories(...a) }));
vi.mock('../../settings', () => ({ getProjectMemorySettings: (...a: unknown[]) => mocks.getProjectMemorySettings(...a) }));

import {
    parseJudgeVerdict,
    buildAnswerUserMessage,
    buildJudgeUserMessage,
    computeJudgedScorecard,
    type JudgedResult,
} from '../judge';
import { runJudgedEval } from '../runner';

describe('parseJudgeVerdict', () => {
    it('reads {"correct": bool}', () => {
        expect(parseJudgeVerdict('{"correct": true}')).toBe(true);
        expect(parseJudgeVerdict('{"correct": false}')).toBe(false);
        expect(parseJudgeVerdict('```json\n{"correct": true}\n```')).toBe(true);
    });
    it('falls back to CORRECT/INCORRECT / yes-no text', () => {
        expect(parseJudgeVerdict('INCORRECT — it gave the stale value')).toBe(false);
        expect(parseJudgeVerdict('Correct.')).toBe(true);
        expect(parseJudgeVerdict('no')).toBe(false);
    });
    it('defaults to false on garbage (unproven ≠ correct)', () => {
        expect(parseJudgeVerdict('')).toBe(false);
        expect(parseJudgeVerdict('the judge is unsure')).toBe(false);
    });
});

describe('prompt builders', () => {
    it('answer prompt lists facts, or marks none', () => {
        expect(buildAnswerUserMessage('lang?', ['Uses Rust'])).toContain('- Uses Rust');
        expect(buildAnswerUserMessage('lang?', [])).toContain('(no relevant memories)');
    });
    it('judge prompt carries question, gold, generated', () => {
        const m = buildJudgeUserMessage('lang?', 'Rust', 'Python');
        expect(m).toContain('Rust');
        expect(m).toContain('Python');
    });
});

describe('computeJudgedScorecard', () => {
    it('aggregates overall + per-ability accuracy', () => {
        const r: JudgedResult[] = [
            { questionId: 'a', category: 'recall', generatedAnswer: 'x', correct: true },
            { questionId: 'b', category: 'recall', generatedAnswer: 'y', correct: false },
            { questionId: 'c', category: 'contradiction', generatedAnswer: 'z', correct: true },
        ];
        const card = computeJudgedScorecard(r);
        expect(card.total).toBe(3);
        expect(card.accuracy).toBeCloseTo(2 / 3);
        expect(card.byCategory.recall.accuracy).toBeCloseTo(0.5);
        expect(card.byCategory.contradiction.accuracy).toBe(1);
    });
});

describe('runJudgedEval orchestration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.rememberExchange.mockResolvedValue({});
        mocks.getProjectMemorySettings.mockResolvedValue({});
        mocks.retrieveMemories.mockResolvedValue([{ content: 'The user uses Rust' }]);
    });

    it('recalls → answers → judges each gold question, and scores', async () => {
        const supabase = { from: () => ({ delete: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }) }) }) } as never;
        const answer = vi.fn(async () => 'Rust');
        const judge = vi.fn(async (_q: string, gold: string, gen: string) => gen.toLowerCase().includes(gold.toLowerCase()));

        const run = await runJudgedEval(
            { supabase, organizationId: 'org', projectId: 'proj', tier: 'pro', reconcile: true, scenarioIds: ['lang-switch'] },
            answer,
            judge,
        );

        // lang-switch has 2 gold questions (lang-current: Rust, lang-when: "last month").
        expect(run.scorecard.total).toBe(2);
        expect(answer).toHaveBeenCalledTimes(2);
        expect(judge).toHaveBeenCalledTimes(2);
        // 'Rust' answer matches the Rust gold, not the "last month" gold.
        expect(run.results.find(r => r.questionId === 'lang-current')?.correct).toBe(true);
        expect(run.results.find(r => r.questionId === 'lang-when')?.correct).toBe(false);
    });
});
