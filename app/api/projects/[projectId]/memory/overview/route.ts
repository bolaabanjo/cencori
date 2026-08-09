/**
 * GET /api/projects/:projectId/memory/overview — dashboard stats for the
 * project's gateway memory (the `memory` field / `/v1/memory/*` store), NOT the
 * legacy namespace RAG store that the sibling routes serve.
 *
 * Session-authenticated: requireProjectAccess is the access control, and every
 * query is filtered by the organization it returns.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { getMemoryQuota, type SubscriptionTier } from '@/lib/entitlements';
import { getCache, saveCache } from '@/lib/cache';
import { getProjectMemorySettings } from '@/lib/memory';

const STATS_WINDOW_DAYS = 14;
/**
 * Stats are aggregates over every memory in the project — distinct users, a
 * daily series, top users. On a large project that is real work, and the
 * numbers do not need to be current to the second. A short cache keeps a
 * dashboard refresh from re-counting a million rows.
 */
const STATS_CACHE_TTL_SECONDS = 60;

interface MemoryStats {
    activeCount: number;
    supersededCount: number;
    distinctUsers: number;
    distinctNamespaces: number;
    avgImportance: number;
    recalledTotal: number;
    neverRecalled: number;
    entityCount: number;
    edgeCount: number;
    mentionCount: number;
    daily: { date: string; count: number }[];
    topUsers: { scopeKey: string; count: number }[];
}

/**
 * Counts without the stats function — used when the migration hasn't been
 * applied yet. Loses the distinct/aggregate figures (they need SQL), but the
 * gauge still works rather than the page erroring out.
 */
async function fallbackStats(
    supabase: ReturnType<typeof createAdminClient>,
    organizationId: string,
    projectId: string
): Promise<MemoryStats> {
    const scoped = (table: string) =>
        supabase.from(table).select('id', { count: 'exact', head: true })
            .eq('organization_id', organizationId)
            .eq('project_id', projectId);

    const [active, superseded, entities, edges, mentions] = await Promise.all([
        scoped('gateway_memories').eq('status', 'active'),
        scoped('gateway_memories').eq('status', 'superseded'),
        scoped('memory_entities'),
        scoped('memory_entity_edges'),
        scoped('memory_entity_mentions'),
    ]);

    return {
        activeCount: active.count ?? 0,
        supersededCount: superseded.count ?? 0,
        distinctUsers: 0,
        distinctNamespaces: 0,
        avgImportance: 0,
        recalledTotal: 0,
        neverRecalled: 0,
        entityCount: entities.count ?? 0,
        edgeCount: edges.count ?? 0,
        mentionCount: mentions.count ?? 0,
        daily: [],
        topUsers: [],
    };
}

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const { projectId } = await params;
    const access = await requireProjectAccess(projectId);
    if (!access.ok) return access.response;

    const supabase = createAdminClient();

    try {
        const { data: org } = await supabase
            .from('organizations')
            .select('subscription_tier')
            .eq('id', access.organizationId)
            .single();
        const tier = (org?.subscription_tier || 'free') as SubscriptionTier;

        const cacheKey = `memory:stats:${projectId}:${STATS_WINDOW_DAYS}`;
        const cached = await getCache(cacheKey);
        let stats: MemoryStats | null = cached
            // Upstash deserializes JSON for us on read; older entries may still
            // arrive as a string.
            ? (typeof cached === 'string' ? JSON.parse(cached) : cached) as MemoryStats
            : null;

        if (!stats) {
            const { data: rpcStats, error: rpcError } = await supabase.rpc('memory_project_stats', {
                p_org_id: access.organizationId,
                p_project_id: projectId,
                p_days: STATS_WINDOW_DAYS,
            });

            if (rpcError) {
                console.warn('[Memory] Stats RPC unavailable, falling back to counts:', rpcError.message);
            }

            stats = rpcError || !rpcStats
                ? await fallbackStats(supabase, access.organizationId, projectId)
                : (rpcStats as MemoryStats);

            await saveCache(cacheKey, stats, STATS_CACHE_TTL_SECONDS);
        }

        const settings = await getProjectMemorySettings(supabase, projectId);
        const limit = getMemoryQuota(tier);
        const isUnlimited = !Number.isFinite(limit);

        return NextResponse.json({
            quota: {
                used: stats.activeCount,
                limit: isUnlimited ? null : limit,
                // Superseded history doesn't count against the tier limit — the
                // metering unit is what's active.
                percent: isUnlimited ? 0 : Math.min(100, Math.round((stats.activeCount / limit) * 100)),
                tier,
            },
            memories: {
                active: stats.activeCount,
                superseded: stats.supersededCount,
                users: stats.distinctUsers,
                namespaces: stats.distinctNamespaces,
                avgImportance: Number(stats.avgImportance ?? 0),
                recalls: Number(stats.recalledTotal ?? 0),
                neverRecalled: stats.neverRecalled,
            },
            graph: {
                entities: stats.entityCount,
                edges: stats.edgeCount,
                mentions: stats.mentionCount,
            },
            daily: stats.daily ?? [],
            topUsers: stats.topUsers ?? [],
            settings,
        });
    } catch (error) {
        console.error('[Memory] Overview error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
