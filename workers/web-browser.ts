import crypto from 'node:crypto';
import os from 'node:os';
import process from 'node:process';
import { config as loadEnvironment } from 'dotenv';

loadEnvironment({ path: ['.env.web.local', '.env.local', '.env'], quiet: true });

async function main(): Promise<void> {
    const [{ executeBrowserExploration }, { createWorkerWebDataStore }] = await Promise.all([
        import('../lib/web/browser'), import('./web-runtime'),
    ]);
    const store = createWorkerWebDataStore();
    const workerId = process.env.WEB_BROWSER_WORKER_ID || `browser_${os.hostname()}_${process.pid}_${crypto.randomUUID().slice(0, 8)}`;
    let stopping = false;
    const runOnce = process.env.WEB_BROWSER_RUN_ONCE === 'true' || process.env.WEB_BROWSER_RUN_ONCE === '1';
    const stop = () => { stopping = true; };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    try {
        while (!stopping) {
            const job = await store.claimBrowserJob(workerId, 120);
            if (!job) {
                if (runOnce) break;
                await new Promise(resolve => setTimeout(resolve, 1_000));
                continue;
            }
            const id = String(job.id);
            try {
                const result = await executeBrowserExploration(String(job.url), {
                    ...(job.options as Record<string, unknown> || {}), actions: job.actions,
                });
                await store.completeBrowserJob({ id, workerId, status: 'completed', result, error: null, retry: false });
                process.stdout.write(`${JSON.stringify({ event: 'browser_job_completed', id })}\n`);
            } catch (error) {
                const attempts = Number(job.attempts) || 1;
                const message = error instanceof Error ? error.message : String(error);
                await store.completeBrowserJob({ id, workerId, status: 'failed', result: null, error: message, retry: attempts < 3 });
                process.stderr.write(`${JSON.stringify({ event: 'browser_job_failed', id, attempts, message })}\n`);
            }
            if (runOnce) break;
        }
    } finally { await store.close(); }
}

main().catch(error => {
    process.stderr.write(`${JSON.stringify({ event: 'fatal', message: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 1;
});
