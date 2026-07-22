import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { requireTierFeatureForProject } from '@/lib/require-tier-feature';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const supabaseAdmin = createAdminClient();
    const { projectId } = await params;
    const projectAccess = await requireProjectAccess(projectId);
    if (!projectAccess.ok) return projectAccess.response;

    const gate = await requireTierFeatureForProject(projectId, 'securityIncidents');
    if (gate) return gate;

    try {
        const searchParams = req.nextUrl.searchParams;
        const page = parseInt(searchParams.get('page') || '1');
        const perPage = parseInt(searchParams.get('per_page') || '50');
        const severity = searchParams.get('severity');
        const incidentType = searchParams.get('type');
        const reviewed = searchParams.get('reviewed');
        const timeRange = searchParams.get('time_range') || '7d';
        const environment = searchParams.get('environment') || 'production';

        let startTime: Date | null = null;
        const now = new Date();

        switch (timeRange) {
            case '1h':
                startTime = new Date(now.getTime() - 60 * 60 * 1000);
                break;
            case '24h':
                startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                break;
            case '7d':
                startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case '30d':
                startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case 'all':
                startTime = null;
                break;
        }

        const { data: apiKeys } = await supabaseAdmin
            .from('api_keys')
            .select('id')
            .eq('project_id', projectId)
            .eq('environment', environment)
            .is('revoked_at', null);

        const apiKeyIds = apiKeys?.map(k => k.id) || [];

        if (apiKeyIds.length === 0) {
            return NextResponse.json({
                incidents: [],
                summary: { critical: 0, high: 0, medium: 0, low: 0 },
                pagination: {
                    page,
                    per_page: perPage,
                    total: 0,
                    total_pages: 0,
                },
            });
        }

        let query = supabaseAdmin
            .from('security_incidents')
            .select('*', { count: 'exact' })
            .eq('project_id', projectId);

        if (severity && severity !== 'all') {
            query = query.eq('severity', severity);
        }

        if (incidentType && incidentType !== 'all') {
            query = query.eq('incident_type', incidentType);
        }

        if (reviewed === 'true') {
            query = query.eq('reviewed', true);
        } else if (reviewed === 'false') {
            query = query.eq('reviewed', false);
        }

        if (startTime) {
            query = query.gte('created_at', startTime.toISOString());
        }

        let statsQuery = supabaseAdmin
            .from('security_incidents')
            .select('severity')
            .eq('project_id', projectId);

        if (startTime) {
            statsQuery = statsQuery.gte('created_at', startTime.toISOString());
        }

        const { data: statsData } = await statsQuery;

        const summary = {
            critical: statsData?.filter(i => i.severity === 'critical').length || 0,
            high: statsData?.filter(i => i.severity === 'high').length || 0,
            medium: statsData?.filter(i => i.severity === 'medium').length || 0,
            low: statsData?.filter(i => i.severity === 'low').length || 0,
        };

        const offset = (page - 1) * perPage;
        query = query
            .order('created_at', { ascending: false })
            .range(offset, offset + perPage - 1);

        const { data: incidents, error, count } = await query;

        if (error) {
            console.error('[Security Incidents API] Error:', error);
            return NextResponse.json(
                { error: 'Failed to fetch security incidents' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            incidents: incidents || [],
            summary,
            pagination: {
                page,
                per_page: perPage,
                total: count || 0,
                total_pages: Math.ceil((count || 0) / perPage),
            },
        });

    } catch (error) {
        console.error('[Security Incidents API] Unexpected error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
