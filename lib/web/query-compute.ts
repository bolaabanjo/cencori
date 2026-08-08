import type { WebDataStore } from './store';

const QUERY_MODEL = 'Xenova/all-MiniLM-L6-v2';

function validEmbedding(value: unknown): value is number[] {
    return Array.isArray(value) && value.length >= 32 && value.length <= 4_096
        && value.every(item => typeof item === 'number' && Number.isFinite(item));
}

export async function requestOwnedQueryEmbedding(
    store: WebDataStore,
    projectId: string,
    query: string,
    timeoutMs = 4_000,
): Promise<number[] | null> {
    if (process.env.CENCORI_WEB_QUERY_COMPUTE === 'false') return null;
    let job: Record<string, unknown>;
    try {
        job = await store.createEmbeddingJob(projectId, query, QUERY_MODEL);
    } catch (error) {
        // During a rolling migration the search endpoint remains available in
        // lexical mode until the embedding queue schema exists.
        console.warn('[cencori-web] owned query compute unavailable; searching without semantics', error);
        return null;
    }
    const id = String(job.id);
    const deadline = Date.now() + Math.min(Math.max(timeoutMs, 250), 8_000);
    while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 75));
        const current = await store.getEmbeddingJob(id, projectId);
        if (!current) return null;
        if (current.status === 'completed') {
            await store.deleteEmbeddingJob(id, projectId).catch(() => undefined);
            return validEmbedding(current.embedding) ? current.embedding : null;
        }
        if (current.status === 'failed') {
            await store.deleteEmbeddingJob(id, projectId).catch(() => undefined);
            return null;
        }
    }
    // A timed-out job is left for its one-minute expiry so a worker that has
    // already claimed it can finish without racing an API-side delete.
    return null;
}
