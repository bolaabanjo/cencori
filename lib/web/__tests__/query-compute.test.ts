/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import { requestOwnedQueryEmbedding } from '@/lib/web/query-compute';

describe('owned query compute', () => {
    it('returns a completed worker embedding and deletes the transient job', async () => {
        const embedding = Array.from({ length: 384 }, () => 0.1);
        const store = {
            createEmbeddingJob: vi.fn().mockResolvedValue({ id: 'job_1' }),
            getEmbeddingJob: vi.fn().mockResolvedValue({ status: 'completed', embedding }),
            deleteEmbeddingJob: vi.fn().mockResolvedValue(undefined),
        } as never;
        await expect(requestOwnedQueryEmbedding(store, 'project', 'query', 500)).resolves.toEqual(embedding);
        expect((store as { deleteEmbeddingJob: ReturnType<typeof vi.fn> }).deleteEmbeddingJob).toHaveBeenCalledWith('job_1', 'project');
    });

    it('degrades safely while the production migration rolls out', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const store = { createEmbeddingJob: vi.fn().mockRejectedValue(new Error('missing table')) } as never;
        await expect(requestOwnedQueryEmbedding(store, 'project', 'query')).resolves.toBeNull();
    });
});
