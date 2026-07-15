import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { triggerAnomalyWebhook } from '@/lib/webhooks/trigger';
import { createWebhookEvent, signPayload } from '@/lib/webhooks/deliver';
import { safeOutboundFetch } from '@/lib/security/outbound-url';

function mean(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

interface AnomalyAlert {
    alert_type: string;
    severity: 'info' | 'warning' | 'critical';
    message: string;
    metric_name: string;
    current_value: number;
    baseline_value: number;
    deviation_percent: number;
}

async function detectAnomalies(
    supabase: ReturnType<typeof createAdminClient>,
    projectId: string
): Promise<AnomalyAlert[]> {
    const now = new Date();
    const detectionStart = new Date(now.getTime() - 60 * 60 * 1000);      // last 1h
    const baselineStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000); // last 14d

    const { data: allApiKeys } = await supabase
        .from('api_keys')
        .select('id, key_prefix, environment')
        .eq('project_id', projectId)
        .is('revoked_at', null);

    const apiKeyIds = (allApiKeys || [])
        .filter(k => {
            if (k.environment) return k.environment === 'production';
            return !(k.key_prefix?.includes('_test') || k.key_prefix?.includes('test_'));
        })
        .map(k => k.id);

    if (apiKeyIds.length === 0) return [];

    const { data: requests } = await supabase
        .from('ai_requests')
        .select('created_at, cost_usd, latency_ms, status')
        .eq('project_id', projectId)
        .in('api_key_id', apiKeyIds)
        .gte('created_at', baselineStart.toISOString())
        .order('created_at', { ascending: true });

    if (!requests || requests.length === 0) return [];

    const detectionRequests = requests.filter(r => new Date(r.created_at) >= detectionStart);
    const baselineRequests = requests.filter(r => new Date(r.created_at) < detectionStart);

    const buckets = new Map<string, { cost: number; latencies: number[]; errors: number; total: number }>();
    for (const r of baselineRequests) {
        const d = new Date(r.created_at);
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
        if (!buckets.has(key)) buckets.set(key, { cost: 0, latencies: [], errors: 0, total: 0 });
        const b = buckets.get(key)!;
        b.total++;
        b.cost += r.cost_usd || 0;
        if (r.latency_ms) b.latencies.push(r.latency_ms);
        if (r.status === 'error' || r.status === 'filtered' || r.status === 'blocked_output') b.errors++;
    }

    const active = [...buckets.values()].filter(b => b.total > 0);
    if (active.length < 7) return [];

    const baselineCosts = active.map(b => b.cost);
    const baselineLatencies = active.filter(b => b.latencies.length > 0).map(b => mean(b.latencies));
    const baselineErrorRates = active.map(b => b.total > 0 ? b.errors / b.total : 0);
    const baselineVolumes = active.map(b => b.total);

    const currentCost = detectionRequests.reduce((s, r) => s + (r.cost_usd || 0), 0);
    const currentLatArr = detectionRequests.map(r => r.latency_ms).filter(Boolean) as number[];
    const currentLatency = mean(currentLatArr);
    const currentErrors = detectionRequests.filter(r =>
        r.status === 'error' || r.status === 'filtered' || r.status === 'blocked_output'
    ).length;
    const currentErrorRate = detectionRequests.length > 0 ? currentErrors / detectionRequests.length : 0;
    const currentVolume = detectionRequests.length;

    const bmc = mean(baselineCosts);
    const bml = mean(baselineLatencies);
    const bmer = mean(baselineErrorRates);
    const bmv = mean(baselineVolumes);

    const alerts: AnomalyAlert[] = [];

    if (bmc > 0 && currentCost > 0.005) {
        const dev = ((currentCost - bmc) / bmc) * 100;
        if (dev >= 100) alerts.push({
            alert_type: 'cost_spike',
            severity: dev >= 300 ? 'critical' : 'warning',
            message: `Hourly cost is ${Math.round(dev)}% above baseline ($${currentCost.toFixed(4)} vs. avg $${bmc.toFixed(4)})`,
            metric_name: 'Hourly cost',
            current_value: currentCost,
            baseline_value: bmc,
            deviation_percent: Math.round(dev * 10) / 10,
        });
    }

    if (baselineLatencies.length >= 3 && currentLatArr.length >= 3 && currentLatency > 300) {
        const dev = ((currentLatency - bml) / bml) * 100;
        if (dev >= 60) alerts.push({
            alert_type: 'latency_spike',
            severity: dev >= 150 ? 'critical' : 'warning',
            message: `Response latency is ${Math.round(dev)}% above baseline (${Math.round(currentLatency)}ms vs. avg ${Math.round(bml)}ms)`,
            metric_name: 'Response latency',
            current_value: currentLatency,
            baseline_value: bml,
            deviation_percent: Math.round(dev * 10) / 10,
        });
    }

    if (currentVolume >= 5 && currentErrorRate >= 0.15) {
        if (bmer > 0) {
            const dev = ((currentErrorRate - bmer) / bmer) * 100;
            if (dev >= 100) alerts.push({
                alert_type: 'error_rate_spike',
                severity: currentErrorRate >= 0.30 ? 'critical' : 'warning',
                message: `Error rate is ${Math.round(currentErrorRate * 100)}% — ${Math.round(dev)}% above baseline`,
                metric_name: 'Error rate',
                current_value: currentErrorRate,
                baseline_value: bmer,
                deviation_percent: Math.round(dev * 10) / 10,
            });
        } else {
            alerts.push({
                alert_type: 'error_rate_spike',
                severity: currentErrorRate >= 0.30 ? 'critical' : 'warning',
                message: `Error rate is ${Math.round(currentErrorRate * 100)}% — unusually high`,
                metric_name: 'Error rate',
                current_value: currentErrorRate,
                baseline_value: 0,
                deviation_percent: 100,
            });
        }
    }

    if (bmv > 0 && currentVolume > 10) {
        const dev = ((currentVolume - bmv) / bmv) * 100;
        if (dev >= 200) alerts.push({
            alert_type: 'request_volume_spike',
            severity: dev >= 500 ? 'critical' : 'warning',
            message: `Request volume is ${Math.round(dev)}% above baseline (${currentVolume} vs. avg ${Math.round(bmv)}/hour)`,
            metric_name: 'Request volume',
            current_value: currentVolume,
            baseline_value: bmv,
            deviation_percent: Math.round(dev * 10) / 10,
        });
    }

    return alerts.sort((a, b) => ({ critical: 0, warning: 1, info: 2 }[a.severity] - { critical: 0, warning: 1, info: 2 }[b.severity]));
}

async function run(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');

    if (!cronSecret) {
        return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const detectedAt = new Date().toISOString();
    let checked = 0, fired = 0;

    try {
        // Projects with a configured alert_webhook_url in security_settings
        const { data: settingsRows } = await supabase
            .from('security_settings')
            .select('project_id, alert_webhook_url, alert_on_critical, alert_on_high, alert_on_medium, alert_on_low')
            .not('alert_webhook_url', 'is', null);

        // Projects with active webhooks subscribed to anomaly.detected
        const { data: webhookRows } = await supabase
            .from('webhooks')
            .select('project_id')
            .eq('is_active', true)
            .contains('events', ['anomaly.detected']);

        // Union project IDs
        const projectIds = new Set<string>([
            ...((settingsRows || []).map(r => r.project_id)),
            ...((webhookRows || []).map(r => r.project_id)),
        ]);

        const settingsByProject = new Map(
            (settingsRows || []).map(r => [r.project_id, r])
        );

        for (const projectId of projectIds) {
            checked++;
            const alerts = await detectAnomalies(supabase, projectId);
            if (alerts.length === 0) continue;

            const summary = {
                total: alerts.length,
                critical: alerts.filter(a => a.severity === 'critical').length,
                warning: alerts.filter(a => a.severity === 'warning').length,
            };

            // 1. Fire to webhooks table (anomaly.detected subscribers)
            await triggerAnomalyWebhook(projectId, {
                alerts,
                summary,
                environment: 'production',
                detected_at: detectedAt,
            });

            // 2. Fire to security_settings alert_webhook_url if configured
            const settings = settingsByProject.get(projectId);
            if (settings?.alert_webhook_url) {
                const filteredAlerts = alerts.filter(a => {
                    if (a.severity === 'critical') return settings.alert_on_critical;
                    if (a.severity === 'warning') return settings.alert_on_high;
                    return settings.alert_on_medium;
                });

                if (filteredAlerts.length > 0) {
                    const payload = createWebhookEvent('anomaly.detected', projectId, {
                        alerts: filteredAlerts,
                        summary: {
                            total: filteredAlerts.length,
                            critical: filteredAlerts.filter(a => a.severity === 'critical').length,
                            warning: filteredAlerts.filter(a => a.severity === 'warning').length,
                        },
                        environment: 'production',
                        detected_at: detectedAt,
                    });

                    const secret = process.env.CRON_SECRET || 'default';
                    try {
                        await safeOutboundFetch(settings.alert_webhook_url, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-Webhook-Signature': signPayload(payload, secret),
                                'X-Webhook-Event': 'anomaly.detected',
                                'X-Webhook-Timestamp': detectedAt,
                            },
                            body: JSON.stringify(payload),
                            signal: AbortSignal.timeout(10000),
                        }, { maxRedirects: 0 });
                    } catch {
                        // best-effort delivery
                    }
                }
            }

            fired++;
        }

        console.log(`[Cron/anomaly-alerts] Checked ${checked} projects, fired alerts for ${fired}`);
        return NextResponse.json({ success: true, checked, fired, timestamp: detectedAt });

    } catch (error) {
        console.error('[Cron/anomaly-alerts] Error:', error);
        return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
    }
}

export const GET = run;
export const POST = run;
