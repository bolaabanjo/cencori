/**
 * Public-benchmark driver — runs Cencori Memory against LoCoMo or LongMemEval
 * with judged scoring (recall → answer → LLM-judge vs gold), the metric
 * comparable to Mem0/Zep's published numbers.
 *
 * The dataset is a large public JSON file (GitHub / HuggingFace) kept OUTSIDE
 * the repo — download it and pass its path.
 *
 * Usage:
 *   EVAL_ORG_ID=... EVAL_PROJECT_ID=... \
 *     npx tsx scripts/memory-benchmark.ts --type longmemeval --file ./longmemeval_s.json --limit 2
 *   npx tsx scripts/memory-benchmark.ts --type locomo --file ./locomo.json --limit 1
 *
 * Flags: --type <locomo|longmemeval>  --file <path>  [--limit N]  [--baseline]
 *        [--graph]  build + query the entity graph during the run (Layer 5)
 *
 * NOTE: a full run is thousands of LLM calls — start with --limit 1 to validate,
 * and expect free-tier throttling. Use paid quota for the full headline run.
 */

import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const [key, ...values] = line.split('=');
        if (key && values.length) process.env[key.trim()] = values.join('=').trim().replace(/^["']|["']$/g, '');
    }
}

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
    const type = arg('type');
    const file = arg('file');
    const limit = arg('limit') ? parseInt(arg('limit')!, 10) : undefined;
    const reconcile = !process.argv.includes('--baseline');
    // Layer 5 costs a second extraction call per turn, so it's opt-in: run the
    // benchmark twice (with and without) to price what the graph buys.
    const graph = process.argv.includes('--graph');
    const organizationId = process.env.EVAL_ORG_ID;
    const projectId = process.env.EVAL_PROJECT_ID;

    if (type !== 'locomo' && type !== 'longmemeval') {
        console.error('--type must be "locomo" or "longmemeval"'); process.exit(1);
    }
    if (!file || !fs.existsSync(file)) {
        console.error(`--file is required and must exist (got: ${file})`); process.exit(1);
    }
    if (!organizationId || !projectId) {
        console.error('Set EVAL_ORG_ID and EVAL_PROJECT_ID to a dedicated eval project.'); process.exit(1);
    }

    const { createAdminClient } = await import('../lib/supabaseAdmin');
    const { loadLoCoMo, loadLongMemEval } = await import('../lib/memory/eval/loaders');
    const { runJudgedEval } = await import('../lib/memory/eval/runner');
    const {
        formatJudgedScorecard, ANSWER_SYSTEM_PROMPT, buildAnswerUserMessage,
        JUDGE_SYSTEM_PROMPT, buildJudgeUserMessage, parseJudgeVerdict,
    } = await import('../lib/memory/eval/judge');
    const { callMemoryLlm } = await import('../lib/memory/llm');

    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    let scenarios = type === 'locomo' ? loadLoCoMo(raw) : loadLongMemEval(raw);
    if (limit != null) scenarios = scenarios.slice(0, limit);
    const nQ = scenarios.reduce((n, s) => n + s.questions.filter(q => q.goldAnswer).length, 0);
    console.log(`Loaded ${scenarios.length} ${type} scenarios (${nQ} judged questions).\n`);

    const supabase = createAdminClient();
    const cfg = { supabase, projectId, organizationId, tier: 'pro' as const };

    const answerFn = async (query: string, recalled: string[]) => {
        const r = await callMemoryLlm({ ...cfg, maxTokens: 120, messages: [
            { role: 'system' as const, content: ANSWER_SYSTEM_PROMPT },
            { role: 'user' as const, content: buildAnswerUserMessage(query, recalled) },
        ] });
        return r?.content?.trim() ?? '';
    };
    const judgeFn = async (query: string, gold: string, generated: string) => {
        const r = await callMemoryLlm({ ...cfg, maxTokens: 20, messages: [
            { role: 'system' as const, content: JUDGE_SYSTEM_PROMPT },
            { role: 'user' as const, content: buildJudgeUserMessage(query, gold, generated) },
        ] });
        return parseJudgeVerdict(r?.content ?? '');
    };

    const run = await runJudgedEval({ ...cfg, reconcile, graph, scenarios }, answerFn, judgeFn);
    console.log('\n' + formatJudgedScorecard(`${type} — ${run.label}${graph ? ' +graph' : ''}`, run.scorecard));
}

main().catch(err => { console.error(err); process.exit(1); });
