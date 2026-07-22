import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { requireTierFeatureForProject } from '@/lib/require-tier-feature';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const { projectId } = await params;
    const projectAccess = await requireProjectAccess(projectId);
    if (!projectAccess.ok) return projectAccess.response;
    const url = new URL(req.url);
    const range = url.searchParams.get('range') || '7d';
    const environment = url.searchParams.get('environment') || 'production';

    const rangeMap: Record<string, number> = {
        '1h': 3600000,
        '24h': 86400000,
        '7d': 604800000,
        '30d': 2592000000,
    };

    const sinceMs = rangeMap[range] || rangeMap['7d'];
    const since = new Date(Date.now() - sinceMs).toISOString();
    const bucketMs = sinceMs <= 86400000 ? 3600000 : 86400000;

    const supabase = createAdminClient();

    const gate = await requireTierFeatureForProject(projectId, 'semanticCache');
    if (gate) return gate;

    // Get aggregated counts by event type using RPC
    const { data: counts } = await supabase.rpc('get_cache_event_counts', {
        p_project_id: projectId,
        p_since: since,
        p_environment: environment,
    });

    const eventCounts = counts?.[0] || { hit_exact: 0, hit_semantic: 0, miss: 0 };
    const exactHits = Number(eventCounts.hit_exact) || 0;
    const semanticHits = Number(eventCounts.hit_semantic) || 0;
    const misses = Number(eventCounts.miss) || 0;
    const totalLookups = exactHits + semanticHits + misses;
    const hitRate = totalLookups > 0 ? (exactHits + semanticHits) / totalLookups : 0;

    // Get aggregated tokens/cost saved
    const { data: savings } = await supabase.rpc('get_cache_savings', {
        p_project_id: projectId,
        p_since: since,
        p_environment: environment,
    });

    const totalTokensSaved = Number(savings?.[0]?.total_tokens) || 0;
    const totalCostSaved = parseFloat(String(savings?.[0]?.total_cost)) || 0;

    // Get hit rate over time using time_bucket
    const { data: timeBuckets } = await supabase.rpc('get_cache_time_buckets', {
        p_project_id: projectId,
        p_since: since,
        p_environment: environment,
        p_bucket_seconds: Math.floor(bucketMs / 1000),
    });

    const hitRateOverTime = (timeBuckets || []).map((b: { bucket: string; hits: bigint; total: bigint }) => ({
        timestamp: b.bucket,
        hitRate: Number(b.total) > 0 ? Number(b.hits) / Number(b.total) : 0,
        lookups: Number(b.total),
    }));

    // Top cached prompts
    const { data: topEntries } = await supabase
        .from('prompt_cache_entries')
        .select('id, prompt_text, model, hit_count, cost_saved_usd, last_hit_at')
        .eq('project_id', projectId)
        .eq('environment', environment)
        .gt('expires_at', new Date().toISOString())
        .order('hit_count', { ascending: false })
        .limit(10);

    const topCachedPrompts = (topEntries || []).map(e => ({
        id: e.id,
        promptPreview: e.prompt_text.slice(0, 120),
        model: e.model,
        hitCount: e.hit_count,
        costSaved: parseFloat(String(e.cost_saved_usd)) || 0,
        lastHitAt: e.last_hit_at,
    }));

    // Active entries count
    const { count: activeEntries } = await supabase
        .from('prompt_cache_entries')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('environment', environment)
        .gt('expires_at', new Date().toISOString());

    return NextResponse.json({
        hitRate,
        totalLookups,
        exactHits,
        semanticHits,
        misses,
        totalTokensSaved,
        totalCostSaved,
        activeEntries: activeEntries || 0,
        hitRateOverTime,
        topCachedPrompts,
    });
}
