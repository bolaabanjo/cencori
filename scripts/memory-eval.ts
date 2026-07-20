/**
 * Memory eval harness CLI — Phase 3, Layer 0.
 *
 * Runs the benchmark twice (blind-insert baseline vs reconcile=on) against a
 * dedicated eval project and prints both scorecards plus the diff. That diff is
 * the evidence a memory layer actually improved recall/hygiene.
 *
 * Usage:
 *   EVAL_ORG_ID=... EVAL_PROJECT_ID=... npx tsx scripts/memory-eval.ts
 *   npx tsx scripts/memory-eval.ts --reconcile-only        # skip the baseline
 *
 * Requires: the eval project's org owns a working embedding path (managed
 * Gemini key), and the 20260718 reconciliation migration is applied.
 */

import fs from 'fs';
import path from 'path';

// Load .env.local before importing anything that reads env (repo convention).
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const [key, ...values] = line.split('=');
        if (key && values.length > 0) {
            process.env[key.trim()] = values.join('=').trim().replace(/^["']|["']$/g, '');
        }
    }
}

async function main() {
    const organizationId = process.env.EVAL_ORG_ID;
    const projectId = process.env.EVAL_PROJECT_ID;
    const tier = (process.env.EVAL_TIER || 'pro') as 'free' | 'pro' | 'enterprise';
    const reconcileOnly = process.argv.includes('--reconcile-only');

    if (!organizationId || !projectId) {
        console.error(
            'Missing config. Set EVAL_ORG_ID and EVAL_PROJECT_ID to a dedicated eval project.\n' +
            'The project must exist and its org must have a working memory embedding path.'
        );
        process.exit(1);
    }

    const { createAdminClient } = await import('../lib/supabaseAdmin');
    const { runEval } = await import('../lib/memory/eval/runner');
    const { formatScorecard } = await import('../lib/memory/eval/scorecard');

    const supabase = createAdminClient();
    const base = { supabase, organizationId, projectId, tier } as const;

    const runs = [];
    if (!reconcileOnly) {
        console.log('\nRunning baseline (blind insert)…');
        runs.push(await runEval({ ...base, reconcile: false }));
    }
    console.log('Running reconcile=on…\n');
    runs.push(await runEval({ ...base, reconcile: true }));

    for (const run of runs) {
        console.log(formatScorecard(run.label, run.scorecard) + '\n');
    }

    if (runs.length === 2) {
        const [baseline, treated] = runs;
        const d = (a: number, b: number) => {
            const delta = (b - a) * 100;
            return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}pp`;
        };
        console.log('── Diff (reconcile − baseline) ──');
        console.log(`  recall:                   ${d(baseline.scorecard.recall, treated.scorecard.recall)}`);
        console.log(`  precision:                ${d(baseline.scorecard.precision, treated.scorecard.precision)}`);
        console.log(
            `  contradiction resolution: ${d(baseline.scorecard.contradictionResolutionRate, treated.scorecard.contradictionResolutionRate)}`
        );
        console.log(`  leaks:                    ${treated.scorecard.leakCount - baseline.scorecard.leakCount}`);
    }

    // Non-zero exit if the reconciled run leaks a secret — a hard failure.
    const treated = runs[runs.length - 1];
    if (treated.scorecard.leakCount > 0) {
        console.error('\n⚠️  Reconciled run leaked a secret — failing.');
        process.exit(2);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
