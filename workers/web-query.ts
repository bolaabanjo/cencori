import process from 'node:process';
import { parseArgs } from 'node:util';
import { config as loadEnvironment } from 'dotenv';

loadEnvironment({ path: ['.env.web.local', '.env.local', '.env'], quiet: true });

async function main(): Promise<void> {
    const { values, positionals } = parseArgs({
        allowPositionals: true,
        options: {
            limit: { type: 'string', default: '10' },
            domain: { type: 'string' },
            freshness: { type: 'string' },
            project: { type: 'string', default: '00000000-0000-0000-0000-000000000000' },
            'owned-compute': { type: 'boolean', default: false },
        },
    });
    const query = positionals.join(' ').trim();
    if (!query) throw new Error('Provide a search query');
    const limit = Number(values.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('--limit must be an integer between 1 and 50');

    const [{ searchWebIndex }, { createWorkerWebDataStore }] = await Promise.all([
        import('../lib/web/index'),
        import('./web-runtime'),
    ]);
    const store = createWorkerWebDataStore();
    try {
        const queryEmbedding = values['owned-compute']
            ? await (await import('../lib/web/query-compute')).requestOwnedQueryEmbedding(store, values.project!, query)
            : undefined;
        const results = await searchWebIndex(store, values.project!, query, {
            limit,
            domain: values.domain,
            freshness: values.freshness,
            queryEmbedding,
        });
        process.stdout.write(`${JSON.stringify({
            query,
            semanticSource: values['owned-compute'] ? (queryEmbedding ? 'owned-compute' : 'local-fallback') : 'local',
            count: results.length,
            results,
        }, null, 2)}\n`);
    } finally {
        await store.close();
    }
}

main().catch(error => {
    process.stderr.write(`${JSON.stringify({
        event: 'fatal',
        message: error instanceof Error ? error.message : String(error),
    })}\n`);
    process.exitCode = 1;
});
