'use client';

import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, CheckCircle, Info, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AnomalyAlert } from '@/app/api/projects/[projectId]/analytics/anomalies/route';

interface AnomalyResponse {
    alerts: AnomalyAlert[];
    summary: {
        total: number;
        critical: number;
        warning: number;
        info: number;
        has_spike: boolean;
    };
    baseline: {
        window_hours: number;
        baseline_days: number;
        sample_count: number;
        computed_at: string;
    };
    insufficient_data: boolean;
}

interface AnomalyAlertsPanelProps {
    projectId: string;
    environment: 'production' | 'test';
    embedded?: boolean;
}

const ALERT_TYPE_ICONS: Record<AnomalyAlert['alert_type'], React.ReactNode> = {
    cost_spike: <TrendingUp className="h-3.5 w-3.5" />,
    latency_spike: <Activity className="h-3.5 w-3.5" />,
    error_rate_spike: <AlertTriangle className="h-3.5 w-3.5" />,
    request_volume_spike: <TrendingUp className="h-3.5 w-3.5" />,
    request_volume_drop: <TrendingDown className="h-3.5 w-3.5" />,
};

const ALERT_TYPE_LABELS: Record<AnomalyAlert['alert_type'], string> = {
    cost_spike: 'Cost spike',
    latency_spike: 'Latency spike',
    error_rate_spike: 'Error rate spike',
    request_volume_spike: 'Traffic spike',
    request_volume_drop: 'Traffic drop',
};

const SEVERITY_STYLES: Record<AnomalyAlert['severity'], string> = {
    critical: 'border-red-500/25 text-red-600 dark:text-red-400',
    warning: 'border-amber-500/30 text-amber-600 dark:text-amber-400',
    info: 'border-sky-500/25 text-sky-600 dark:text-sky-400',
};

function formatDeviationChip(deviation: number): string {
    if (deviation < 0) return `${Math.abs(deviation)}% drop`;
    return `+${Math.round(deviation)}%`;
}

function formatMetricValue(alert: AnomalyAlert, value: number): string {
    if (alert.alert_type === 'cost_spike') {
        return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;
    }
    if (alert.alert_type === 'latency_spike') {
        return value >= 1_000 ? `${(value / 1_000).toFixed(2)}s` : `${Math.round(value)}ms`;
    }
    if (alert.alert_type === 'error_rate_spike') {
        return `${(value * 100).toFixed(1)}%`;
    }
    return `${Math.round(value)} req/h`;
}

function SignalDatum({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="min-w-0 border-t border-border/25 px-3 py-2.5 sm:border-l sm:border-t-0">
            <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground/65">{label}</p>
            <p className={cn('mt-1 truncate text-[11px] font-medium tabular-nums', mono && 'font-mono')}>
                {value}
            </p>
        </div>
    );
}

export function AnomalyAlertsPanel({ projectId, environment, embedded = false }: AnomalyAlertsPanelProps) {
    const { data, isLoading, isError } = useQuery<AnomalyResponse>({
        queryKey: ['anomalies', projectId, environment],
        queryFn: async () => {
            const res = await fetch(
                `/api/projects/${projectId}/analytics/anomalies?environment=${environment}&detection_hours=1&baseline_days=14`
            );
            if (!res.ok) throw new Error('Failed to fetch anomaly data');
            return res.json();
        },
        staleTime: 60 * 1000,
        refetchInterval: 5 * 60 * 1000,
    });

    return (
        <section
            className={cn(
                'overflow-hidden bg-card lg:grid lg:grid-cols-[12rem_minmax(0,1fr)]',
                embedded ? 'border-b border-border/35' : 'rounded-lg border border-border/55'
            )}
            aria-labelledby="anomaly-detection-title"
        >
            <header className="flex items-center justify-between gap-4 border-b border-border/30 px-4 py-3 lg:block lg:border-b-0 lg:border-r">
                <div>
                    <h2 id="anomaly-detection-title" className="text-xs font-medium">Anomaly detection</h2>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">Last 1h against 14d</p>
                </div>
            </header>

            <div className="min-w-0">
                {isLoading && (
                    <div className="grid min-h-14 grid-cols-2 sm:grid-cols-4">
                        {[1, 2, 3, 4].map(item => (
                            <div key={item} className="flex items-center border-l border-border/25 px-3">
                                <Skeleton className="h-7 w-full" />
                            </div>
                        ))}
                    </div>
                )}

                {isError && (
                    <div className="flex min-h-16 items-center gap-2 px-4 text-xs text-muted-foreground">
                        <Info className="size-3.5 shrink-0" />
                        Could not load anomaly data.
                    </div>
                )}

                {data?.insufficient_data && (
                    <div className="grid min-h-14 sm:grid-cols-[minmax(10rem,1.4fr)_repeat(3,minmax(6rem,0.7fr))]">
                        <div className="flex items-center gap-2.5 px-3 py-2.5">
                            <Info className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                            <div className="min-w-0">
                                <p className="truncate text-xs font-medium">Building baseline</p>
                                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">Detection starts after 7 active hours</p>
                            </div>
                        </div>
                        <SignalDatum label="Collected" value={`${data.baseline.sample_count}h`} />
                        <SignalDatum label="Required" value="7h" />
                        <SignalDatum label="Window" value={`${data.baseline.baseline_days}d`} />
                    </div>
                )}

                {data && !data.insufficient_data && data.summary.total === 0 && (
                    <div className="grid min-h-14 sm:grid-cols-[minmax(10rem,1.4fr)_repeat(3,minmax(6rem,0.7fr))]">
                        <div className="flex items-center gap-2.5 px-3 py-2.5">
                            <CheckCircle className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                            <div className="min-w-0">
                                <p className="truncate text-xs font-medium">Operating normally</p>
                                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">No material deviation detected</p>
                            </div>
                        </div>
                        <SignalDatum label="Alerts" value="0" />
                        <SignalDatum label="Baseline" value={`${data.baseline.sample_count}h`} />
                        <SignalDatum label="Coverage" value={`${data.baseline.baseline_days}d`} />
                    </div>
                )}

                {data && !data.insufficient_data && data.alerts.length > 0 && (
                    <div className="divide-y divide-border/25">
                        {data.alerts.map(alert => (
                            <article
                                key={alert.id}
                                title={alert.message}
                                className="grid min-h-14 sm:grid-cols-[minmax(10rem,1.4fr)_repeat(4,minmax(6rem,0.7fr))]"
                            >
                                <div className="flex items-center gap-2.5 px-3 py-2.5">
                                    <span className={cn('shrink-0', SEVERITY_STYLES[alert.severity].split(' ').slice(1).join(' '))}>
                                        {ALERT_TYPE_ICONS[alert.alert_type]}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="truncate text-xs font-medium">{ALERT_TYPE_LABELS[alert.alert_type]}</p>
                                        <span className={cn(
                                            'mt-0.5 inline-flex rounded border px-1.5 py-0.5 text-[9px] font-medium capitalize leading-none',
                                            SEVERITY_STYLES[alert.severity]
                                        )}>
                                            {alert.severity}
                                        </span>
                                    </div>
                                </div>
                                <SignalDatum label="Observed" value={formatMetricValue(alert, alert.current_value)} />
                                <SignalDatum label="Expected" value={formatMetricValue(alert, alert.baseline_value)} />
                                <SignalDatum label="Change" value={formatDeviationChip(alert.deviation_percent)} />
                                <SignalDatum label="Evidence" value={`${data.baseline.sample_count} active hours`} />
                            </article>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}
