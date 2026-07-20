import { describe, expect, it, vi } from 'vitest';
import { buildQuotaExceededBody, checkMemoryQuota } from '../quota';

function mockSupabaseWithCount(count: number | null, error: unknown = null) {
    // checkMemoryQuota filters .eq('project_id').eq('status','active')
    return {
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    eq: vi.fn(async () => ({ count, error })),
                })),
            })),
        })),
    } as never;
}

describe('checkMemoryQuota', () => {
    it('allows writes below the free limit', async () => {
        const status = await checkMemoryQuota(mockSupabaseWithCount(999), 'proj_1', 'free');
        expect(status).toEqual({ allowed: true, used: 999, limit: 1000 });
    });

    it('blocks writes at the free limit', async () => {
        const status = await checkMemoryQuota(mockSupabaseWithCount(1000), 'proj_1', 'free');
        expect(status.allowed).toBe(false);
        expect(status.used).toBe(1000);
    });

    it('blocks writes above the limit', async () => {
        const status = await checkMemoryQuota(mockSupabaseWithCount(1001), 'proj_1', 'free');
        expect(status.allowed).toBe(false);
    });

    it('uses the pro limit for pro tier', async () => {
        const status = await checkMemoryQuota(mockSupabaseWithCount(99_999), 'proj_1', 'pro');
        expect(status).toEqual({ allowed: true, used: 99_999, limit: 100_000 });
    });

    it('never blocks enterprise (infinite quota, no count query)', async () => {
        const supabase = mockSupabaseWithCount(10_000_000);
        const status = await checkMemoryQuota(supabase, 'proj_1', 'enterprise');
        expect(status.allowed).toBe(true);
        expect((supabase as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
    });

    it('fails closed when the count query throws', async () => {
        const supabase = {
            from: vi.fn(() => {
                throw new Error('db down');
            }),
        } as never;
        const status = await checkMemoryQuota(supabase, 'proj_1', 'free');
        expect(status).toEqual({
            allowed: false,
            used: 0,
            limit: 1000,
            error: 'quota_check_failed',
        });
    });
});

describe('buildQuotaExceededBody', () => {
    it('matches the roadmap payload shape', () => {
        const body = buildQuotaExceededBody('proj_xxx', 'free', 1000, 1000);
        expect(body).toEqual({
            error: {
                code: 'memory_quota_exceeded',
                message: 'Project has reached its memory tier limit.',
                upgradeUrl: 'https://cencori.com/pricing?upgrade=memory&project=proj_xxx',
                tier: 'free',
                used: 1000,
                limit: 1000,
            },
        });
    });
});
