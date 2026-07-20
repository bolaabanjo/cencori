'use client';

import { ArrowRight, CheckCircle, AlertTriangle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface FailoverMetricsProps {
    projectId: string;
    environment: 'production' | 'test';
    timeRange: string;
    className?: string;
}

interface FailoverStats {
    total_fallbacks: number;
    fallback_rate: number;
    by_provider: Record<string, {
        original: string;
        fallback: string;
        count: number;
    }[]>;
    top_reasons: Array<{
        reason: string;
        count: number;
    }>;
    provider_health?: Record<string, {
        requests: number;
        errors: number;
        fallbacks: number;
    }>;
    time_range?: string;
}

const RANGE_LABELS: Record<string, string> = {
    '1h': 'Last hour',
    '24h': 'Last 24 hours',
    '7d': 'Last 7 days',
    '30d': 'Last 30 days',
    '90d': 'Last 90 days',
    all: 'All retained history',
};

function formatRouteLabel(value: string): string {
    return value.toLowerCase() === 'unknown' ? 'Unknown source' : value;
}

export function FailoverMetrics({ projectId, environment, timeRange, className }: FailoverMetricsProps) {
    const { data: stats, isLoading, isError } = useQuery<FailoverStats>({
        queryKey: ['failoverStats', projectId, environment, timeRange],
        queryFn: async () => {
            const response = await fetch(
                `/api/projects/${projectId}/analytics/failover?environment=${environment}&time_range=${timeRange}`
            );
            if (!response.ok) throw new Error('Failed to fetch failover stats');
            return response.json();
        },
        staleTime: 60 * 1000,
    });

    if (isLoading) {
        return (
            <article className={cn('flex min-h-[320px] flex-col rounded-xl border border-border/55 bg-card p-5', className)}>
                <Skeleton className="h-4 w-36" />
                <Skeleton className="mt-2 h-3 w-64 max-w-full" />
                <div className="mt-6 grid grid-cols-2 gap-3">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                </div>
                <div className="mt-5 space-y-3">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-11 w-full" />)}
                </div>
            </article>
        );
    }

    const hasFallbacks = stats && stats.total_fallbacks > 0;
    const flows = hasFallbacks
        ? Object.entries(stats.by_provider)
            .flatMap(([, f]) => f)
            .sort((a, b) => b.count - a.count)
            .slice(0, 5)
        : [];

    const maximumFlowCount = flows[0]?.count || 1;
    const periodLabel = RANGE_LABELS[stats?.time_range ?? timeRange] ?? 'Selected period';

    if (isError) {
        return (
            <article className={cn('flex min-h-[320px] flex-col rounded-xl border border-border/55 bg-card p-5', className)}>
                <h3 className="text-sm font-medium">Provider recovery</h3>
                <p className="mt-1 text-[11px] text-muted-foreground">Fallback routing and provider continuity.</p>
                <div className="flex flex-1 items-center justify-center">
                    <p className="max-w-56 text-center text-[11px] leading-5 text-muted-foreground">
                        Failover telemetry is unavailable for this period.
                    </p>
                </div>
            </article>
        );
    }

    return (
        <article className={cn(
            'group flex min-h-[320px] flex-col overflow-hidden rounded-xl border border-border/55 bg-card transition-[border-color,background-color,transform] duration-200 hover:-translate-y-px hover:border-foreground/15',
            className,
        )}>
            <header className="flex items-start justify-between gap-4 px-5 pb-4 pt-4">
                <div>
                    <h3 className="text-sm font-medium tracking-[-0.01em]">Provider recovery</h3>
                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">Fallback routing when a primary model cannot deliver.</p>
                </div>
                <span className="shrink-0 text-[9px] text-muted-foreground">{periodLabel}</span>
            </header>

            <div className="grid grid-cols-2 border-y border-border/40">
                <div className="px-5 py-4">
                    <p className="text-[10px] text-muted-foreground">Recovered requests</p>
                    <p className="mt-1 font-mono text-2xl font-medium tracking-[-0.04em] tabular-nums">
                        {stats?.total_fallbacks.toLocaleString() ?? '0'}
                    </p>
                </div>
                <div className="border-l border-border/40 px-5 py-4">
                    <p className="text-[10px] text-muted-foreground">Fallback rate</p>
                    <p className="mt-1 font-mono text-2xl font-medium tracking-[-0.04em] tabular-nums">
                        {stats?.fallback_rate.toFixed(1) ?? '0.0'}%
                    </p>
                </div>
            </div>

            {hasFallbacks ? (
                <>
                    <div className="px-5 pb-4 pt-4">
                        <div className="mb-3 flex items-center justify-between">
                            <p className="text-[10px] font-medium text-muted-foreground">Recovery routes</p>
                            <div className="flex items-center gap-1.5 text-[9px] text-amber-500">
                                <AlertTriangle className="size-3" />
                                Primary provider bypassed
                            </div>
                        </div>

                        <div className="space-y-3">
                            {flows.map((flow, index) => {
                                const share = (flow.count / maximumFlowCount) * 100;

                                return (
                                    <div key={`${flow.original}-${flow.fallback}-${index}`}>
                                        <div className="mb-1.5 flex min-w-0 items-center gap-2">
                                            <span className="truncate font-mono text-[10px] text-muted-foreground">
                                                {formatRouteLabel(flow.original)}
                                            </span>
                                            <ArrowRight className="size-3 shrink-0 text-muted-foreground/45" />
                                            <span className="min-w-0 flex-1 truncate font-mono text-[10px] font-medium">
                                                {formatRouteLabel(flow.fallback)}
                                            </span>
                                            <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
                                                {flow.count}×
                                            </span>
                                        </div>
                                        <div className="h-1 overflow-hidden rounded-full bg-muted/70">
                                            <div
                                                className="h-full rounded-full bg-amber-500/75 transition-[width] duration-300"
                                                style={{ width: `${share}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {stats.top_reasons.length > 0 && (
                        <div className="mt-auto border-t border-border/40 px-5 py-3">
                            <p className="mb-2 text-[9px] font-medium text-muted-foreground">Why recovery was triggered</p>
                            <div className="space-y-1.5">
                                {stats.top_reasons.slice(0, 2).map((reason, index) => (
                                    <div key={`${reason.reason}-${index}`} className="flex items-center justify-between gap-4">
                                        <span className="truncate text-[10px] text-muted-foreground">
                                            {reason.reason}
                                        </span>
                                        <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
                                            {reason.count}×
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
                    <span className="mb-3 flex size-8 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/[0.08]">
                        <CheckCircle className="size-4 text-emerald-500" />
                    </span>
                    <p className="text-xs font-medium">All primary routes were stable</p>
                    <p className="mt-1 max-w-64 text-[10px] leading-4 text-muted-foreground">
                        No request needed a fallback provider during this period.
                    </p>
                </div>
            )}
        </article>
    );
}
