import process from 'node:process';
import { parseArgs } from 'node:util';
import { config as loadEnvironment } from 'dotenv';
import evaluation from '../config/web-search-eval.json';
import { scoreSearchEvaluationCase, summarizeSearchEvaluations } from '../lib/web/evaluation';

loadEnvironment({ path: ['.env.web.local', '.env.local', '.env'], quiet: true });

async function main(): Promise<void> {
    const { values } = parseArgs({ options: {
        project: { type: 'string', default: '00000000-0000-0000-0000-000000000000' },
        limit: { type: 'string', default: String(evaluation.limit) },
        'minimum-mrr': { type: 'string' },
    } });
    const limit = Number(values.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('--limit must be between 1 and 50');
    const [{ searchWebIndex }, { createWorkerWebDataStore }] = await Promise.all([
        import('../lib/web/index'), import('./web-runtime'),
    ]);
    const store = createWorkerWebDataStore();
    try {
        const results = [];
        for (const testCase of evaluation.cases) {
            const started = performance.now();
            const matches = await searchWebIndex(store, values.project!, testCase.query, { limit, language: 'en' });
            const result = scoreSearchEvaluationCase(testCase, matches.map(match => match.canonicalUrl), performance.now() - started);
            results.push(result);
            process.stdout.write(`${JSON.stringify({ event: 'eval_case', ...result })}\n`);
        }
        const summary = summarizeSearchEvaluations(results);
        process.stdout.write(`${JSON.stringify({ event: 'eval_summary', ...summary }, null, 2)}\n`);
        const minimumMrr = values['minimum-mrr'] === undefined ? null : Number(values['minimum-mrr']);
        if (minimumMrr !== null && (!Number.isFinite(minimumMrr) || summary.mrr < minimumMrr)) process.exitCode = 2;
    } finally { await store.close(); }
}

main().catch(error => {
    process.stderr.write(`${JSON.stringify({ event: 'fatal', message: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 1;
});
