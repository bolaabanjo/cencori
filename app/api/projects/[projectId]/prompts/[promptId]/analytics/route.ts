import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { requireTierFeatureForProject } from '@/lib/require-tier-feature';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string; promptId: string }> }
) {
    const { projectId, promptId } = await params;
    const projectAccess = await requireProjectAccess(projectId);
    if (!projectAccess.ok) return projectAccess.response;
    const url = new URL(req.url);
    const range = url.searchParams.get('range') || '7d';
    const supabase = createAdminClient();

    const gate = await requireTierFeatureForProject(projectId, 'promptRegistry');
    if (gate) return gate;

    const rangeMs: Record<string, number> = {
        '1h': 3600000,
        '24h': 86400000,
        '7d': 604800000,
        '30d': 2592000000,
    };

    const since = new Date(Date.now() - (rangeMs[range] || rangeMs['7d'])).toISOString();

    const { data: usage } = await supabase
        .from('prompt_usage_log')
        .select('model, version_id, latency_ms, created_at')
        .eq('project_id', projectId)
        .eq('prompt_id', promptId)
        .gte('created_at', since);

    const events = usage || [];
    const totalUsage = events.length;

    // By model
    const modelCounts: Record<string, number> = {};
    for (const e of events) {
        modelCounts[e.model] = (modelCounts[e.model] || 0) + 1;
    }

    // By day
    const dayCounts: Record<string, number> = {};
    for (const e of events) {
        const day = e.created_at.slice(0, 10);
        dayCounts[day] = (dayCounts[day] || 0) + 1;
    }

    const usageByDay = Object.entries(dayCounts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count }));

    // By version
    const versionCounts: Record<string, number> = {};
    for (const e of events) {
        versionCounts[e.version_id] = (versionCounts[e.version_id] || 0) + 1;
    }

    // Average latency
    const latencies = events.filter(e => e.latency_ms).map(e => e.latency_ms);
    const avgLatency = latencies.length > 0
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : 0;

    return NextResponse.json({
        total_usage: totalUsage,
        avg_latency_ms: avgLatency,
        by_model: Object.entries(modelCounts).map(([model, count]) => ({ model, count })).sort((a, b) => b.count - a.count),
        by_day: usageByDay,
        by_version: Object.entries(versionCounts).map(([versionId, count]) => ({ version_id: versionId, count })),
    });
}
