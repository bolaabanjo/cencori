import process from 'node:process';
import { parseArgs } from 'node:util';
import { config as loadEnvironment } from 'dotenv';
import corpus from '../config/web-corpus.json';

loadEnvironment({ path: ['.env.web.local', '.env.local', '.env'], quiet: true });

async function main(): Promise<void> {
    const { values } = parseArgs({ options: {
        only: { type: 'string', multiple: true },
        'dry-run': { type: 'boolean', default: false },
    } });
    const selected = values.only?.length
        ? corpus.sources.filter(source => values.only!.includes(source.key))
        : corpus.sources;
    if (selected.length === 0) throw new Error('No configured corpus sources matched --only');
    if (values['dry-run']) {
        process.stdout.write(`${JSON.stringify({ event: 'corpus_plan', sources: selected }, null, 2)}\n`);
        return;
    }
    const [{ createPublicCrawlJob }, { createWorkerWebDataStore }] = await Promise.all([
        import('../lib/web/frontier'),
        import('./web-runtime'),
    ]);
    const store = createWorkerWebDataStore();
    try {
        for (const source of selected) {
            const job = await createPublicCrawlJob(store, {
                seeds: [source.seed], maxPages: source.maxPages, maxFrontier: source.maxFrontier,
                maxDepth: source.maxDepth, maxAttempts: 3, sameOrigin: true,
                metadata: {
                    type: 'curated_corpus', source: source.key, vertical: source.vertical,
                    pathPrefixes: source.pathPrefixes, languages: source.languages,
                    authorityScore: source.authorityScore, corpusVersion: corpus.version,
                },
            });
            process.stdout.write(`${JSON.stringify({ event: 'corpus_job_created', source: source.key, jobId: job.id })}\n`);
        }
    } finally { await store.close(); }
}

main().catch(error => {
    process.stderr.write(`${JSON.stringify({ event: 'fatal', message: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 1;
});
