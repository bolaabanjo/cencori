import process from 'node:process';
import { parseArgs } from 'node:util';
import { config as loadEnvironment } from 'dotenv';

loadEnvironment({ path: ['.env.web.local', '.env.local', '.env'], quiet: true });

function optionalInteger(value: string | undefined, name: string, minimum: number, maximum: number): number | undefined {
    if (value === undefined) return undefined;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
        throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
    }
    return parsed;
}

async function main(): Promise<void> {
    const { values, positionals } = parseArgs({
        allowPositionals: true,
        options: {
            'max-pages': { type: 'string' },
            'max-frontier': { type: 'string' },
            'max-depth': { type: 'string' },
            'max-attempts': { type: 'string' },
            priority: { type: 'string' },
            'cross-origin': { type: 'boolean', default: false },
        },
    });
    if (positionals.length === 0) {
        throw new Error('Provide at least one seed URL');
    }

    const [{ createPublicCrawlJob }, { createWorkerWebDataStore }] = await Promise.all([
        import('../lib/web/frontier'),
        import('./web-runtime'),
    ]);
    const store = createWorkerWebDataStore();
    try {
        const job = await createPublicCrawlJob(store, {
            seeds: positionals,
            maxPages: optionalInteger(values['max-pages'], '--max-pages', 1, 1_000_000),
            maxFrontier: optionalInteger(values['max-frontier'], '--max-frontier', 1, 5_000_000),
            maxDepth: optionalInteger(values['max-depth'], '--max-depth', 0, 10),
            maxAttempts: optionalInteger(values['max-attempts'], '--max-attempts', 1, 10),
            priority: optionalInteger(values.priority, '--priority', -100, 100),
            sameOrigin: !values['cross-origin'],
            metadata: {
                type: 'operator_seed',
                source: 'web_seed_cli',
            },
        });
        process.stdout.write(`${JSON.stringify({ event: 'crawl_job_created', job }, null, 2)}\n`);
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
