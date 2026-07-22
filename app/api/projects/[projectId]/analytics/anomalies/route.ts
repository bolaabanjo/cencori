import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { requireTierFeatureForProject } from '@/lib/require-tier-feature';

function mean(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export interface AnomalyAlert {
    id: string;
    alert_type: 'cost_spike' | 'latency_spike' | 'error_rate_spike' | 'request_volume_spike' | 'request_volume_drop';
    severity: 'info' | 'warning' | 'critical';
    message: string;
    metric_name: string;
    current_value: number;
    baseline_value: number;
    deviation_percent: number;
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const supabaseAdmin = createAdminClient();
    const { projectId } = await params;
    const projectAccess = await requireProjectAccess(projectId);
    if (!projectAccess.ok) return projectAccess.response;

    try {
        const { data: project, error: projectError } = await supabaseAdmin
            .from('projects')
            .select('id')
            .eq('id', projectId)
            .single();

        if (projectError || !project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        const gate = await requireTierFeatureForProject(projectId, 'advancedAnalytics');
        if (gate) return gate;

        const searchParams = req.nextUrl.searchParams;
        const environment = searchParams.get('environment') || 'production';
        const detectionHours = Math.max(1, parseInt(searchParams.get('detection_hours') || '1', 10));
        const baselineDays = Math.max(3, parseInt(searchParams.get('baseline_days') || '14', 10));

        const now = new Date();
        const detectionStart = new Date(now.getTime() - detectionHours * 60 * 60 * 1000);
        const baselineStart = new Date(now.getTime() - baselineDays * 24 * 60 * 60 * 1000);

        // Resolve API keys for this project/environment
        const { data: allApiKeys } = await supabaseAdmin
            .from('api_keys')
            .select('id, key_prefix, environment')
            .eq('project_id', projectId)
            .is('revoked_at', null);

        const apiKeys = (allApiKeys || []).filter(key => {
            if (key.environment) {
                return environment === 'production'
                    ? key.environment === 'production'
                    : key.environment === 'test';
            }
            const isTest = key.key_prefix?.includes('_test') || key.key_prefix?.includes('test_');
            return environment === 'production' ? !isTest : isTest;
        });

        const apiKeyIds = apiKeys.map(k => k.id);

        const emptyResponse = (insufficientData: boolean, sampleCount = 0) => NextResponse.json({
            alerts: [],
            summary: { total: 0, critical: 0, warning: 0, info: 0, has_spike: false },
            baseline: { window_hours: detectionHours, baseline_days: baselineDays, sample_count: sampleCount, computed_at: now.toISOString() },
            insufficient_data: insufficientData,
        });

        if (apiKeyIds.length === 0) return emptyResponse(true);

        // Fetch all requests across the full window (minimal columns)
        const { data: requests, error } = await supabaseAdmin
            .from('ai_requests')
            .select('created_at, cost_usd, latency_ms, status')
            .eq('project_id', projectId)
            .in('api_key_id', apiKeyIds)
            .gte('created_at', baselineStart.toISOString())
            .order('created_at', { ascending: true });

        if (error) {
            console.error('[Anomalies API] DB error:', error);
            return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
        }

        const allRequests = requests || [];
        const detectionRequests = allRequests.filter(r => new Date(r.created_at) >= detectionStart);
        const baselineRequests = allRequests.filter(r => new Date(r.created_at) < detectionStart);

        // Bucket baseline into hourly slices
        const baselineBuckets = new Map<string, {
            cost: number; latencies: number[]; errors: number; total: number;
        }>();

        for (const r of baselineRequests) {
            const d = new Date(r.created_at);
            const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
            if (!baselineBuckets.has(key)) {
                baselineBuckets.set(key, { cost: 0, latencies: [], errors: 0, total: 0 });
            }
            const b = baselineBuckets.get(key)!;
            b.total++;
            b.cost += r.cost_usd || 0;
            if (r.latency_ms) b.latencies.push(r.latency_ms);
            if (r.status === 'error' || r.status === 'filtered' || r.status === 'blocked_output') b.errors++;
        }

        const activeBuckets = [...baselineBuckets.values()].filter(b => b.total > 0);
        const sampleCount = activeBuckets.length;

        // Require at least 7 active hours for a meaningful baseline
        if (sampleCount < 7) return emptyResponse(true, sampleCount);

        // Baseline series per metric
        const baselineCosts = activeBuckets.map(b => b.cost);
        const baselineLatencies = activeBuckets
            .filter(b => b.latencies.length > 0)
            .map(b => mean(b.latencies));
        const baselineErrorRates = activeBuckets.map(b => b.total > 0 ? b.errors / b.total : 0);
        const baselineVolumes = activeBuckets.map(b => b.total);

        // Current window values
        const currentCost = detectionRequests.reduce((s, r) => s + (r.cost_usd || 0), 0);
        const currentLatencyArr = detectionRequests.map(r => r.latency_ms).filter(Boolean) as number[];
        const currentLatency = mean(currentLatencyArr);
        const currentErrors = detectionRequests.filter(r =>
            r.status === 'error' || r.status === 'filtered' || r.status === 'blocked_output'
        ).length;
        const currentErrorRate = detectionRequests.length > 0 ? currentErrors / detectionRequests.length : 0;
        const currentVolume = detectionRequests.length;

        const alerts: AnomalyAlert[] = [];
        let counter = 0;

        const baselineMeanCost = mean(baselineCosts);
        const baselineMeanLatency = mean(baselineLatencies);
        const baselineMeanErrorRate = mean(baselineErrorRates);
        const baselineMeanVolume = mean(baselineVolumes);

        // 1. Cost spike
        if (baselineMeanCost > 0 && currentCost > 0.005) {
            const dev = ((currentCost - baselineMeanCost) / baselineMeanCost) * 100;
            if (dev >= 100) {
                alerts.push({
                    id: `cost_spike-${++counter}`,
                    alert_type: 'cost_spike',
                    severity: dev >= 300 ? 'critical' : 'warning',
                    message: `Hourly cost is ${Math.round(dev)}% above baseline ($${currentCost.toFixed(4)} vs. avg $${baselineMeanCost.toFixed(4)})`,
                    metric_name: 'Hourly cost',
                    current_value: currentCost,
                    baseline_value: baselineMeanCost,
                    deviation_percent: Math.round(dev * 10) / 10,
                });
            }
        }

        // 2. Latency spike
        if (baselineLatencies.length >= 3 && currentLatencyArr.length >= 3 && currentLatency > 300) {
            const dev = ((currentLatency - baselineMeanLatency) / baselineMeanLatency) * 100;
            if (dev >= 60) {
                alerts.push({
                    id: `latency_spike-${++counter}`,
                    alert_type: 'latency_spike',
                    severity: dev >= 150 ? 'critical' : 'warning',
                    message: `Response latency is ${Math.round(dev)}% above baseline (${Math.round(currentLatency)}ms vs. avg ${Math.round(baselineMeanLatency)}ms)`,
                    metric_name: 'Response latency',
                    current_value: currentLatency,
                    baseline_value: baselineMeanLatency,
                    deviation_percent: Math.round(dev * 10) / 10,
                });
            }
        }

        // 3. Error rate spike
        if (currentVolume >= 5 && currentErrorRate >= 0.15) {
            if (baselineMeanErrorRate > 0) {
                const dev = ((currentErrorRate - baselineMeanErrorRate) / baselineMeanErrorRate) * 100;
                if (dev >= 100) {
                    alerts.push({
                        id: `error_rate_spike-${++counter}`,
                        alert_type: 'error_rate_spike',
                        severity: currentErrorRate >= 0.30 ? 'critical' : 'warning',
                        message: `Error rate is ${Math.round(currentErrorRate * 100)}% — ${Math.round(dev)}% above baseline (avg ${Math.round(baselineMeanErrorRate * 100)}%)`,
                        metric_name: 'Error rate',
                        current_value: currentErrorRate,
                        baseline_value: baselineMeanErrorRate,
                        deviation_percent: Math.round(dev * 10) / 10,
                    });
                }
            } else {
                alerts.push({
                    id: `error_rate_spike-${++counter}`,
                    alert_type: 'error_rate_spike',
                    severity: currentErrorRate >= 0.30 ? 'critical' : 'warning',
                    message: `Error rate is ${Math.round(currentErrorRate * 100)}% — unusually high for this project`,
                    metric_name: 'Error rate',
                    current_value: currentErrorRate,
                    baseline_value: 0,
                    deviation_percent: 100,
                });
            }
        }

        // 4. Volume spike
        if (baselineMeanVolume > 0 && currentVolume > 10) {
            const dev = ((currentVolume - baselineMeanVolume) / baselineMeanVolume) * 100;
            if (dev >= 200) {
                alerts.push({
                    id: `request_volume_spike-${++counter}`,
                    alert_type: 'request_volume_spike',
                    severity: dev >= 500 ? 'critical' : 'warning',
                    message: `Request volume is ${Math.round(dev)}% above baseline (${currentVolume} vs. avg ${Math.round(baselineMeanVolume)}/hour)`,
                    metric_name: 'Request volume',
                    current_value: currentVolume,
                    baseline_value: baselineMeanVolume,
                    deviation_percent: Math.round(dev * 10) / 10,
                });
            }
        }

        // 5. Volume drop
        if (baselineMeanVolume >= 5 && currentVolume < baselineMeanVolume * 0.2) {
            const dropPct = Math.round((1 - currentVolume / baselineMeanVolume) * 100);
            alerts.push({
                id: `request_volume_drop-${++counter}`,
                alert_type: 'request_volume_drop',
                severity: currentVolume === 0 ? 'warning' : 'info',
                message: currentVolume === 0
                    ? `No requests in the last ${detectionHours}h — expected ~${Math.round(baselineMeanVolume)}/hour based on history`
                    : `Request volume dropped ${dropPct}% below baseline (${currentVolume} vs. avg ${Math.round(baselineMeanVolume)}/hour)`,
                metric_name: 'Request volume',
                current_value: currentVolume,
                baseline_value: baselineMeanVolume,
                deviation_percent: -dropPct,
            });
        }

        // Sort: critical → warning → info
        const order = { critical: 0, warning: 1, info: 2 };
        alerts.sort((a, b) => order[a.severity] - order[b.severity]);

        const summary = {
            total: alerts.length,
            critical: alerts.filter(a => a.severity === 'critical').length,
            warning: alerts.filter(a => a.severity === 'warning').length,
            info: alerts.filter(a => a.severity === 'info').length,
            has_spike: alerts.some(a => a.alert_type !== 'request_volume_drop'),
        };

        return NextResponse.json({
            alerts,
            summary,
            baseline: {
                window_hours: detectionHours,
                baseline_days: baselineDays,
                sample_count: sampleCount,
                computed_at: now.toISOString(),
            },
            insufficient_data: false,
        });

    } catch (error) {
        console.error('[Anomalies API] Unexpected error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
