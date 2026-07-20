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
        let groupBy: '10min' | 'hour' | 'day' = 'day';

        switch (timeRange) {
            case '1h':
                startTime = new Date(now.getTime() - 60 * 60 * 1000);
                groupBy = '10min';
                break;
            case '24h':
                startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                groupBy = 'hour';
                break;
            case '7d':
                startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                groupBy = 'day';
                break;
            case '30d':
                startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                groupBy = 'day';
                break;
            case '90d':
                startTime = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                groupBy = 'day';
                break;
            default:
                startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                groupBy = 'day';
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

        const { data: requests, error } = await supabaseAdmin
            .from('ai_requests')
            .select('created_at, status, cost_usd, latency_ms, total_tokens')
            .eq('project_id', projectId)
            .in('api_key_id', apiKeyIds)
            .gte('created_at', startTime.toISOString())
            .order('created_at', { ascending: true });

        if (error) {
            console.error('[Trends API] Error:', error);
            return NextResponse.json({ error: 'Failed to fetch trends' }, { status: 500 });
        }

        const generateAllBuckets = () => {
            const buckets: Record<string, {
                timestamp: string;
                total: number;
                success: number;
                filtered: number;
                blocked_output: number;
                error: number;
                cost: number;
                tokens: number;
                avg_latency: number;
                latencies: number[];
            }> = {};

            const current = new Date(startTime);
            const end = new Date(now);

            if (groupBy === '10min') {
                while (current <= end) {
                    const minutes = Math.floor(current.getMinutes() / 10) * 10;
                    const key = `${String(current.getHours()).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
                    buckets[key] = {
                        timestamp: key,
                        total: 0, success: 0, filtered: 0, blocked_output: 0, error: 0, cost: 0, tokens: 0, avg_latency: 0, latencies: []
                    };
                    current.setMinutes(current.getMinutes() + 10);
                }
            } else if (groupBy === 'hour') {
                current.setMinutes(0, 0, 0);
                while (current <= end) {
                    const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')} ${String(current.getHours()).padStart(2, '0')}:00`;
                    buckets[key] = {
                        timestamp: key,
                        total: 0, success: 0, filtered: 0, blocked_output: 0, error: 0, cost: 0, tokens: 0, avg_latency: 0, latencies: []
                    };
                    current.setHours(current.getHours() + 1);
                }
            } else {
                current.setHours(0, 0, 0, 0);
                while (current <= end) {
                    const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
                    buckets[key] = {
                        timestamp: key,
                        total: 0, success: 0, filtered: 0, blocked_output: 0, error: 0, cost: 0, tokens: 0, avg_latency: 0, latencies: []
                    };
                    current.setDate(current.getDate() + 1);
                }
            }

            return buckets;
        };

        const trendData = generateAllBuckets();

        requests?.forEach(req => {
            const date = new Date(req.created_at);
            let key: string;

            if (groupBy === '10min') {
                const minutes = Math.floor(date.getMinutes() / 10) * 10;
                key = `${String(date.getHours()).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
            } else if (groupBy === 'hour') {
                key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
            } else {
                key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            }

            if (!trendData[key]) {
                trendData[key] = {
                    timestamp: key,
                    total: 0, success: 0, filtered: 0, blocked_output: 0, error: 0, cost: 0, tokens: 0, avg_latency: 0, latencies: []
                };
            }

            trendData[key].total++;
            if (req.status === 'success' || req.status === 'success_fallback') trendData[key].success++;
            if (req.status === 'filtered') trendData[key].filtered++;
            if (req.status === 'blocked_output') trendData[key].blocked_output++;
            if (req.status === 'error') trendData[key].error++;

            trendData[key].cost += req.cost_usd || 0;
            trendData[key].tokens += req.total_tokens || 0;
            if (req.latency_ms) {
                trendData[key].latencies.push(req.latency_ms);
            }
        });

        const { data: incidents } = await supabaseAdmin
            .from('security_incidents')
            .select('created_at, incident_type, action_taken')
            .eq('project_id', projectId)
            .gte('created_at', startTime.toISOString());

        incidents?.forEach(incident => {
            const date = new Date(incident.created_at);
            let key: string;

            if (groupBy === '10min') {
                const minutes = Math.floor(date.getMinutes() / 10) * 10;
                key = `${String(date.getHours()).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
            } else if (groupBy === 'hour') {
                key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
            } else {
                key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            }

            if (trendData[key]) {
                trendData[key].total++;
                if (incident.action_taken === 'blocked' || incident.incident_type === 'data_rule_block') {
                    trendData[key].blocked_output++;
                } else {
                    trendData[key].filtered++;
                }
            }
        });

        const trends = Object.values(trendData)
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
            .map(data => {
                const sortedLatencies = [...data.latencies].sort((a, b) => a - b);
                const latencyPercentile = (percentile: number) => {
                    if (sortedLatencies.length === 0) return null;
                    const index = Math.ceil((percentile / 100) * sortedLatencies.length) - 1;
                    return Math.round(sortedLatencies[Math.max(0, index)]);
                };

                return {
                    timestamp: data.timestamp,
                    total: data.total,
                    success: data.success,
                    filtered: data.filtered,
                    blocked_output: data.blocked_output,
                    error: data.error,
                    success_rate: data.total > 0 ? Math.round((data.success / data.total) * 100) : 0,
                    cost: Math.round(data.cost * 1000000) / 1000000,
                    tokens: data.tokens,
                    avg_latency: data.latencies.length > 0
                        ? Math.round(data.latencies.reduce((a, b) => a + b, 0) / data.latencies.length)
                        : 0,
                    latency_samples: data.latencies.length,
                    latency_p50: latencyPercentile(50),
                    latency_p75: latencyPercentile(75),
                    latency_p90: latencyPercentile(90),
                    latency_p95: latencyPercentile(95),
                    latency_p99: latencyPercentile(99),
                };
            });

        return NextResponse.json({ trends, group_by: groupBy });

    } catch (error) {
        console.error('[Trends API] Unexpected error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
