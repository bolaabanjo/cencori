import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { featureGateResponse, getProjectTier } from '@/lib/require-tier-feature';
import { clampTimeRange, hasFeature } from '@/lib/entitlements';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const supabaseAdmin = createAdminClient();
    const { projectId } = await params;

    try {
        const { data: project, error: projectError } = await supabaseAdmin
            .from('projects')
            .select('id')
            .eq('id', projectId)
            .single();

        if (projectError || !project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        const tier = (await getProjectTier(projectId)) || 'free';
        if (!hasFeature(tier, 'analyticsDashboard')) {
            return featureGateResponse('analyticsDashboard');
        }

        const searchParams = req.nextUrl.searchParams;
        // History depth is tier-gated: free 7d, pro 30d, team 90d, enterprise all
        const timeRange = clampTimeRange(tier, searchParams.get('time_range') || '7d');
        const environment = searchParams.get('environment') || 'production';

        const now = new Date();
        let startTime: Date;

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
            case '90d':
                startTime = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                break;
            default:
                startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        }

        const apiKeysQuery = supabaseAdmin
            .from('api_keys')
            .select('id, key_prefix, environment')
            .eq('project_id', projectId)
            .is('revoked_at', null);

        const { data: allApiKeys } = await apiKeysQuery;

        const apiKeys = allApiKeys?.filter(key => {
            if (key.environment) {
                return environment === 'production'
                    ? key.environment === 'production'
                    : key.environment === 'test';
            } else {
                const isTestKey = key.key_prefix?.includes('_test') || key.key_prefix?.includes('test_');
                return environment === 'production' ? !isTestKey : isTestKey;
            }
        });

        const apiKeyIds = apiKeys?.map(k => k.id) || [];

        const { data: requests, error: reqError } = await supabaseAdmin
            .from('ai_requests')
            .select('*')
            .eq('project_id', projectId)
            .in('api_key_id', apiKeyIds)
            .gte('created_at', startTime.toISOString());

        if (reqError) {
            console.error('[Analytics API] Error fetching requests:', reqError);
            return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
        }

        const { data: incidents, error: incError } = await supabaseAdmin
            .from('security_incidents')
            .select('*')
            .eq('project_id', projectId)
            .gte('created_at', startTime.toISOString());

        if (incError) {
            console.error('[Analytics API] Error fetching incidents:', incError);
        }

        const totalRequests = requests?.length || 0;
        const successfulRequests = requests?.filter(
            r => r.status === 'success' || r.status === 'success_fallback'
        ).length || 0;
        const filteredRequests = requests?.filter(r => r.status === 'filtered').length || 0;
        const blockedOutputRequests = requests?.filter(r => r.status === 'blocked_output').length || 0;
        const errorRequests = requests?.filter(r => r.status === 'error').length || 0;

        const successRate = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0;

        const totalCost = requests?.reduce((sum, r) => sum + (r.cost_usd || 0), 0) || 0;
        const totalTokens = requests?.reduce((sum, r) => sum + (r.total_tokens || 0), 0) || 0;

        const latencies = requests?.map(r => r.latency_ms).filter(l => l != null) || [];
        const avgLatency = latencies.length > 0
            ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length
            : 0;

        const totalIncidents = incidents?.length || 0;
        const criticalIncidents = incidents?.filter(i => i.severity === 'critical').length || 0;

        const modelUsage: Record<string, number> = {};
        requests?.forEach(r => {
            modelUsage[r.model] = (modelUsage[r.model] || 0) + 1;
        });
        const incidentsBySeverity = {
            critical: incidents?.filter(i => i.severity === 'critical').length || 0,
            high: incidents?.filter(i => i.severity === 'high').length || 0,
            medium: incidents?.filter(i => i.severity === 'medium').length || 0,
            low: incidents?.filter(i => i.severity === 'low').length || 0,
        };

        const commonProviders = ['openai', 'anthropic', 'google', 'mistral', 'groq', 'cohere'];
        const costByProvider: Record<string, number> = {};
        commonProviders.forEach(p => costByProvider[p] = 0);
        requests?.forEach(r => {
            const provider = r.provider || 'unknown';
            costByProvider[provider] = (costByProvider[provider] || 0) + (r.cost_usd || 0);
        });

        const requestsByProvider: Record<string, number> = {};
        commonProviders.forEach(p => requestsByProvider[p] = 0);
        requests?.forEach(r => {
            const provider = r.provider || 'unknown';
            requestsByProvider[provider] = (requestsByProvider[provider] || 0) + 1;
        });

        const sortedLatencies = [...latencies].sort((a, b) => a - b);
        const percentile = (arr: number[], p: number) => {
            if (arr.length === 0) return 0;
            const index = Math.ceil((p / 100) * arr.length) - 1;
            return arr[Math.max(0, index)];
        };

        const latencyPercentiles = {
            p50: Math.round(percentile(sortedLatencies, 50)),
            p75: Math.round(percentile(sortedLatencies, 75)),
            p90: Math.round(percentile(sortedLatencies, 90)),
            p95: Math.round(percentile(sortedLatencies, 95)),
            p99: Math.round(percentile(sortedLatencies, 99)),
        };

        const requestsByCountry: Record<string, number> = {};
        requests?.forEach(r => {
            const country = r.country || r.geolocation?.country || 'Unknown';
            if (country && country !== 'Unknown') {
                requestsByCountry[country] = (requestsByCountry[country] || 0) + 1;
            }
        });

        return NextResponse.json({
            overview: {
                total_requests: totalRequests,
                successful_requests: successfulRequests,
                filtered_requests: filteredRequests,
                blocked_output_requests: blockedOutputRequests,
                error_requests: errorRequests,
                success_rate: Math.round(successRate * 10) / 10,    
                total_cost: totalCost,
                total_tokens: totalTokens,
                avg_latency: Math.round(avgLatency),
                total_incidents: totalIncidents,
                critical_incidents: criticalIncidents,
            },
            breakdown: {
                model_usage: modelUsage,
                incidents_by_severity: incidentsBySeverity,
                cost_by_provider: costByProvider,
                requests_by_provider: requestsByProvider,
                latency_percentiles: latencyPercentiles,
                requests_by_country: requestsByCountry,
            },
        });

    } catch (error) {
        console.error('[Analytics API] Unexpected error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
