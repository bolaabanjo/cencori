import crypto from 'node:crypto';
import os from 'node:os';
import process from 'node:process';
import { config as loadEnvironment } from 'dotenv';

loadEnvironment({ path: ['.env.web.local', '.env.local', '.env'], quiet: true });
process.env.CENCORI_WEB_SEMANTIC_ENABLED = 'true';

async function main(): Promise<void> {
    const [{ embedWebText, disposeWebEmbeddingPipeline }, { createWorkerWebDataStore }] = await Promise.all([
        import('../lib/web/embeddings'), import('./web-runtime'),
    ]);
    const store = createWorkerWebDataStore();
    const workerId = process.env.WEB_EMBEDDING_WORKER_ID || `embedding_${os.hostname()}_${process.pid}_${crypto.randomUUID().slice(0, 8)}`;
    let stopping = false;
    let idleMs = 75;
    const stop = () => { stopping = true; };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    try {
        while (!stopping) {
            const job = await store.claimEmbeddingJob(workerId, 30);
            if (!job) {
                await new Promise(resolve => setTimeout(resolve, idleMs));
                idleMs = Math.min(Math.ceil(idleMs * 1.5), 1_000);
                continue;
            }
            idleMs = 75;
            const id = String(job.id);
            try {
                const embedding = await embedWebText(String(job.query));
                if (!embedding) throw new Error('Semantic model is disabled');
                await store.completeEmbeddingJob(id, workerId, embedding, null);
                process.stdout.write(`${JSON.stringify({ event: 'embedding_job_completed', id, dimensions: embedding.length })}\n`);
            } catch (error) {
                await store.completeEmbeddingJob(id, workerId, null, error instanceof Error ? error.message : String(error));
                process.stderr.write(`${JSON.stringify({ event: 'embedding_job_failed', id, message: error instanceof Error ? error.message : String(error) })}\n`);
            }
        }
    } finally {
        await disposeWebEmbeddingPipeline();
        await store.close();
    }
}

main().catch(error => {
    process.stderr.write(`${JSON.stringify({ event: 'fatal', message: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 1;
});
