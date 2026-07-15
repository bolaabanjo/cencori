/**
 * Memory quota — metered by count of memories per project (10KB content cap
 * per memory enforced at the schema level). Reads always work at 100%;
 * only new writes are blocked.
 */

import type { createAdminClient } from '@/lib/supabaseAdmin';
import { getMemoryQuota, type SubscriptionTier } from '@/lib/entitlements';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export interface MemoryQuotaStatus {
    allowed: boolean;
    used: number;
    limit: number;
    error?: 'quota_check_failed';
}

export async function checkMemoryQuota(
    supabase: SupabaseAdmin,
    projectId: string,
    tier: SubscriptionTier
): Promise<MemoryQuotaStatus> {
    const limit = getMemoryQuota(tier);

    if (!Number.isFinite(limit)) {
        return { allowed: true, used: 0, limit };
    }

    try {
        const { count, error } = await supabase
            .from('gateway_memories')
            .select('id', { count: 'exact', head: true })
            .eq('project_id', projectId);

        if (error) throw error;

        const used = count ?? 0;
        return { allowed: used < limit, used, limit };
    } catch (error) {
        // Writes fail closed: an unavailable quota service must not allow
        // unbounded storage or silently bypass a customer's plan.
        console.error('[Memory] Quota check failed:', error);
        return { allowed: false, used: 0, limit, error: 'quota_check_failed' };
    }
}

export function buildQuotaCheckFailedBody() {
    return {
        error: {
            code: 'memory_quota_unavailable',
            message: 'Memory quota could not be verified. Retry shortly.',
        },
    };
}

/** Roadmap-specified 429 payload for memory_quota_exceeded. */
export function buildQuotaExceededBody(
    projectId: string,
    tier: SubscriptionTier,
    used: number,
    limit: number
) {
    return {
        error: {
            code: 'memory_quota_exceeded',
            message: 'Project has reached its memory tier limit.',
            upgradeUrl: `https://cencori.com/pricing?upgrade=memory&project=${projectId}`,
            tier,
            used,
            limit,
        },
    };
}
