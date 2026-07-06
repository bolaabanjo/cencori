import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { requireTierFeatureForProject } from '@/lib/require-tier-feature';

interface RouteParams {
    params: Promise<{ projectId: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
    const { projectId } = await params;
    const { searchParams } = new URL(request.url);
    const environment = searchParams.get('environment') || 'production';
    const timeRange = searchParams.get('time_range') || '7d';

    const supabase = createAdminClient();

    const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .single();

    if (projectError || !project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const gate = await requireTierFeatureForProject(projectId, 'analyticsDashboard');
    if (gate) return gate;

    const now = new Date();
    const startDate = new Date();

    switch (timeRange) {
        case '24h':
            startDate.setHours(now.getHours() - 24);
            break;
        case '7d':
            startDate.setDate(now.getDate() - 7);
            break;
        case '30d':
            startDate.setDate(now.getDate() - 30);
            break;
        case '90d':
            startDate.setDate(now.getDate() - 90);
            break;
        default:
            startDate.setDate(now.getDate() - 7);
    }

    try {
        const { count: totalRequests } = await supabase
            .from('ai_requests')
            .select('*', { count: 'exact', head: true })
            .eq('project_id', projectId)
            .eq('environment', environment)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', now.toISOString());

        const { data: fallbackRequests, count: fallbackCount } = await supabase
            .from('ai_requests')
            .select('request_payload, provider, model', { count: 'exact' })
            .eq('project_id', projectId)
            .eq('environment', environment)
            .eq('status', 'success_fallback')
            .gte('created_at', startDate.toISOString())
            .lte('created_at', now.toISOString());

        const fallbackRate = totalRequests && totalRequests > 0
            ? ((fallbackCount || 0) / totalRequests) * 100
            : 0;
        const byProvider: Record<string, { original: string; fallback: string; count: number }[]> = {};
        const reasonCounts: Record<string, number> = {};

        fallbackRequests?.forEach((req) => {
            const payload = req.request_payload as Record<string, unknown> | null;
            const originalProvider = (payload?.original_provider as string) || 'unknown';
            const originalModel = (payload?.original_model as string) || 'unknown';
            const fallbackProvider = req.provider || 'unknown';
            const fallbackModel = req.model || 'unknown';

            if (!byProvider[originalProvider]) {
                byProvider[originalProvider] = [];
            }

            const existingFlow = byProvider[originalProvider].find(
                f => f.original === originalModel && f.fallback === fallbackModel
            );

            if (existingFlow) {
                existingFlow.count++;
            } else {
                byProvider[originalProvider].push({
                    original: originalModel,
                    fallback: fallbackModel,
                    count: 1,
                });
            }

            const reason = (payload?.fallback_reason as string) || 'Provider unavailable';
            reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
        });
        const topReasons = Object.entries(reasonCounts)
            .map(([reason, count]) => ({ reason, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        return NextResponse.json({
            total_fallbacks: fallbackCount || 0,
            fallback_rate: fallbackRate,
            by_provider: byProvider,
            top_reasons: topReasons,
            time_range: timeRange,
            checked_at: now.toISOString(),
        });
    } catch (error) {
        console.error('[API] Error fetching failover stats:', error);
        return NextResponse.json(
            { error: 'Failed to fetch failover stats' },
            { status: 500 }
        );
    }
}
