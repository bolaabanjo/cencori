import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { requireTierFeatureForProject } from '@/lib/require-tier-feature';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const { projectId } = await params;
    const supabase = await createServerClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id, organization_id, organizations!inner(owner_id)')
        .eq('id', projectId)
        .single();

    if (projectError || !project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const gate = await requireTierFeatureForProject(projectId, 'securityIncidents');
    if (gate) return gate;

    const requestedRange = req.nextUrl.searchParams.get('range');
    const periodDays = requestedRange === '7d' ? 7 : requestedRange === '90d' ? 90 : 30;
    const period = `${periodDays}d` as '7d' | '30d' | '90d';
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: incidents } = await supabase
        .from('security_incidents')
        .select('severity, incident_type, reviewed, action_taken, blocked_at, created_at')
        .eq('project_id', projectId)
        .gte('created_at', periodStart);

    const severityBreakdown = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
    };

    incidents?.forEach((incident) => {
        const severity = incident.severity as keyof typeof severityBreakdown;
        if (severity in severityBreakdown) severityBreakdown[severity]++;
    });

    const isBlocked = (incident: { action_taken: string | null; blocked_at: string | null }) =>
        incident.action_taken === 'blocked' || Boolean(incident.blocked_at);

    const blocked24h = incidents?.filter((incident) =>
        isBlocked(incident) && incident.created_at >= last24h
    ).length || 0;

    const blockedPeriod = incidents?.filter(isBlocked).length || 0;

    const { count: pendingReviews } = await supabase
        .from('security_incidents')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('reviewed', false);

    const { count: totalRequestsPeriod } = await supabase
        .from('ai_requests')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .gte('created_at', periodStart);

    const totalIncidentsPeriod = incidents?.length || 0;
    const threatScore = totalIncidentsPeriod > 0
        ? Math.min(100, Math.round(
            ((severityBreakdown.critical * 4) +
                (severityBreakdown.high * 3) +
                (severityBreakdown.medium * 2) +
                (severityBreakdown.low * 1)) / totalIncidentsPeriod * 10
        ))
        : 0;

    const typeBreakdown: Record<string, number> = {};
    incidents?.forEach((incident) => {
        typeBreakdown[incident.incident_type] = (typeBreakdown[incident.incident_type] || 0) + 1;
    });

    const severityWeights = { critical: 4, high: 3, medium: 2, low: 1 } as const;
    const trendData: {
        date: string;
        riskScore: number;
        blocked: number;
        signals: number;
        needsReview: number;
    }[] = [];

    for (let i = periodDays - 1; i >= 0; i--) {
        const dayStart = new Date(now);
        dayStart.setUTCDate(dayStart.getUTCDate() - i);
        dayStart.setUTCHours(0, 0, 0, 0);

        const dayEnd = new Date(dayStart);
        dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

        const dayIncidents = incidents?.filter((incident) => {
            const createdAt = new Date(incident.created_at).getTime();
            return createdAt >= dayStart.getTime() && createdAt < dayEnd.getTime();
        }) || [];

        const dailySeverityTotal = dayIncidents.reduce((total, incident) => {
            const severity = incident.severity as keyof typeof severityWeights;
            return total + (severityWeights[severity] || 0);
        }, 0);

        trendData.push({
            date: dayStart.toISOString().split('T')[0],
            riskScore: dayIncidents.length
                ? Math.min(100, Math.round((dailySeverityTotal / dayIncidents.length) * 10))
                : 0,
            blocked: dayIncidents.filter(isBlocked).length,
            signals: dayIncidents.length,
            needsReview: dayIncidents.filter((incident) => !incident.reviewed).length,
        });
    }

    return NextResponse.json({
        stats: {
            period,
            threatScore,
            blocked24h,
            blockedPeriod,
            pendingReviews: pendingReviews || 0,
            blockedRate: totalRequestsPeriod && blockedPeriod
                ? ((blockedPeriod / totalRequestsPeriod) * 100).toFixed(2)
                : '0.00',
            severityBreakdown,
            typeBreakdown,
            trendData,
            totalIncidentsPeriod,
        }
    });
}
