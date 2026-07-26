/**
 * Eval harness runner. Drives the REAL memory write + retrieval paths against a
 * throwaway eval project, so the scorecard reflects production behaviour, not a
 * mock. Requires a seeded org/project and a working embedding key.
 *
 * Two modes per invocation so a change can be measured, not asserted:
 *   reconcile=false → the blind-insert baseline (pre-Layer-1)
 *   reconcile=true  → the reconciled store
 * Run both and diff the scorecards; that diff is the evidence a layer helped.
 */

import type { createAdminClient } from '@/lib/supabaseAdmin';
import type { SubscriptionTier } from '@/lib/entitlements';
import { getProjectMemorySettings } from '../settings';
import { rememberExchange } from '../writeback';
import { retrieveMemories } from '../retrieval';
import type { MemoryDirective } from '../types';
import { BENCHMARK } from './dataset';
import { computeScorecard, gradeQuestion } from './scorecard';
import {
    buildAnswerUserMessage,
    computeJudgedScorecard,
    gradeAnswer,
    type JudgedResult,
    type JudgedScorecard,
} from './judge';
import type { EvalScenario, EvalQuestion, QuestionResult, Scorecard } from './types';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export interface RunEvalConfig {
    supabase: SupabaseAdmin;
    organizationId: string;
    projectId: string;
    tier: SubscriptionTier;
    /** Run reconciliation (true) or the blind-insert baseline (false). */
    reconcile: boolean;
    /** Restrict to specific scenario ids (default: all scenarios). */
    scenarioIds?: string[];
    /** Scenario set to run (default: the homegrown BENCHMARK). Pass loaded
     *  LoCoMo/LongMemEval scenarios here for the public-benchmark runs. */
    scenarios?: EvalScenario[];
    topK?: number;
}

/** Resolve the scenario set for a run (custom set or the homegrown benchmark). */
function selectScenarios(config: RunEvalConfig): EvalScenario[] {
    const source = config.scenarios ?? BENCHMARK;
    return config.scenarioIds ? source.filter(s => config.scenarioIds!.includes(s.id)) : source;
}

/** Delete any prior eval memories for a scenario user so re-runs are clean. */
async function resetScenarioMemory(
    supabase: SupabaseAdmin,
    organizationId: string,
    projectId: string,
    userId: string
): Promise<void> {
    await supabase
        .from('gateway_memories')
        .delete()
        .eq('organization_id', organizationId)
        .eq('project_id', projectId)
        .eq('scope', 'user')
        .eq('scope_key', userId);
}

function userDirective(scopeKey: string, topK: number, asOf: string | null = null): MemoryDirective {
    return {
        scope: 'user',
        scopeKey,
        retrieve: true,
        write: false,
        topK,
        threshold: 0.7,
        thresholdExplicit: false, // use the provider-calibrated default
        namespace: null,
        extract: null,
        asOf,
        mode: 'inject',
    };
}

/** Reset + replay a scenario's transcript through the real write path. */
async function buildScenarioMemory(config: RunEvalConfig, scenario: EvalScenario): Promise<void> {
    const { supabase, organizationId, projectId, tier, reconcile } = config;
    const topK = config.topK ?? 6;
    await resetScenarioMemory(supabase, organizationId, projectId, scenario.userId);
    const settings = await getProjectMemorySettings(supabase, projectId);
    const writeDirective = userDirective(scenario.userId, topK);
    for (const turn of scenario.transcript) {
        await rememberExchange({
            supabase, organizationId, projectId, tier,
            directive: writeDirective, settings,
            userText: turn.user, assistantText: turn.assistant, reconcile,
        });
    }
}

/** Recall for one question (honoring its optional as-of), returning the contents. */
async function recallForQuestion(config: RunEvalConfig, scenario: EvalScenario, question: EvalQuestion): Promise<string[]> {
    const recalled = await retrieveMemories({
        supabase: config.supabase,
        organizationId: config.organizationId,
        projectId: config.projectId,
        directive: userDirective(scenario.userId, config.topK ?? 6, question.asOf ?? null),
        queryText: question.query,
    });
    return recalled.map(m => m.content);
}

async function runScenario(config: RunEvalConfig, scenario: EvalScenario): Promise<QuestionResult[]> {
    await buildScenarioMemory(config, scenario);
    const results: QuestionResult[] = [];
    for (const question of scenario.questions) {
        const recalled = await recallForQuestion(config, scenario, question);
        results.push(gradeQuestion(question, recalled));
    }
    return results;
}

export interface EvalRun {
    label: string;
    scorecard: Scorecard;
    results: QuestionResult[];
}

/** Run the benchmark end-to-end and return the scorecard. */
export async function runEval(config: RunEvalConfig): Promise<EvalRun> {
    const scenarios = selectScenarios(config);

    const results: QuestionResult[] = [];
    for (const scenario of scenarios) {
        results.push(...(await runScenario(config, scenario)));
    }

    return {
        label: config.reconcile ? 'reconcile=on' : 'baseline (blind insert)',
        scorecard: computeScorecard(results),
        results,
    };
}

// ── Judged eval (LoCoMo / LongMemEval style) ────────────────────────────────
/**
 * Answer a question from recalled memory contents → the generated answer string.
 * Injected so the runner is model-agnostic (real = callMemoryLlm / gateway,
 * tests = a mock). Prompt built via judge.buildAnswerUserMessage.
 */
export type AnswerFn = (query: string, recalled: string[]) => Promise<string>;
/** Grade a generated answer against gold → correct? Injected (real = LLM judge). */
export type JudgeFn = (query: string, gold: string, generated: string) => Promise<boolean>;

export interface JudgedEvalRun {
    label: string;
    scorecard: JudgedScorecard;
    results: JudgedResult[];
}

/**
 * Judged run: recall → answer with the model → judge the answer against gold.
 * Only questions with a `goldAnswer` are scored. This is the metric comparable
 * to Mem0/Zep's published LoCoMo/LongMemEval numbers.
 */
export async function runJudgedEval(
    config: RunEvalConfig,
    answer: AnswerFn,
    judge: JudgeFn
): Promise<JudgedEvalRun> {
    const scenarios = selectScenarios(config);

    const results: JudgedResult[] = [];
    for (const scenario of scenarios) {
        await buildScenarioMemory(config, scenario);
        for (const question of scenario.questions) {
            if (!question.goldAnswer) continue;
            const recalled = await recallForQuestion(config, scenario, question);
            const generated = await answer(question.query, recalled);
            const correct = await judge(question.query, question.goldAnswer, generated);
            results.push(gradeAnswer(question, generated, correct));
        }
    }

    return {
        label: config.reconcile ? 'reconcile=on (judged)' : 'baseline (judged)',
        scorecard: computeJudgedScorecard(results),
        results,
    };
}

/** Re-export so a CLI can build the answer prompt consistently. */
export { buildAnswerUserMessage };
