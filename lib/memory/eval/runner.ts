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
import type { EvalScenario, QuestionResult, Scorecard } from './types';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export interface RunEvalConfig {
    supabase: SupabaseAdmin;
    organizationId: string;
    projectId: string;
    tier: SubscriptionTier;
    /** Run reconciliation (true) or the blind-insert baseline (false). */
    reconcile: boolean;
    /** Restrict to specific scenario ids (default: whole benchmark). */
    scenarioIds?: string[];
    topK?: number;
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

function userDirective(scopeKey: string, topK: number): MemoryDirective {
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
        asOf: null,
    };
}

async function runScenario(
    config: RunEvalConfig,
    scenario: EvalScenario
): Promise<QuestionResult[]> {
    const { supabase, organizationId, projectId, tier, reconcile } = config;
    const topK = config.topK ?? 6;

    await resetScenarioMemory(supabase, organizationId, projectId, scenario.userId);

    const settings = await getProjectMemorySettings(supabase, projectId);
    const writeDirective = userDirective(scenario.userId, topK);

    // Build memory by replaying the transcript through the real write path.
    for (const turn of scenario.transcript) {
        await rememberExchange({
            supabase,
            organizationId,
            projectId,
            tier,
            directive: writeDirective,
            settings,
            userText: turn.user,
            assistantText: turn.assistant,
            reconcile,
        });
    }

    // Probe with each question through the real retrieval path.
    const results: QuestionResult[] = [];
    for (const question of scenario.questions) {
        const recalled = await retrieveMemories({
            supabase,
            organizationId,
            projectId,
            directive: userDirective(scenario.userId, topK),
            queryText: question.query,
        });
        results.push(gradeQuestion(question, recalled.map(m => m.content)));
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
    const scenarios = config.scenarioIds
        ? BENCHMARK.filter(s => config.scenarioIds!.includes(s.id))
        : BENCHMARK;

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
