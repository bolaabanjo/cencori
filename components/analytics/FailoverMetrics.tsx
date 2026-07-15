'use client';

import { ArrowRight, CheckCircle, AlertTriangle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface FailoverMetricsProps {
    projectId: string;
    environment: 'production' | 'test';
    timeRange: string;
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
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

export function FailoverMetrics({ projectId, environment, timeRange }: FailoverMetricsProps) {
    const { data: stats, isLoading } = useQuery<FailoverStats>({
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
            <div className="border border-border/30 bg-card p-4">
                <Skeleton className="h-3.5 w-32 mb-3" />
                <Skeleton className="h-6 w-20 mb-4" />
                <div className="space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
            </div>
        );
    }

    const hasFallbacks = stats && stats.total_fallbacks > 0;
    const flows = hasFallbacks
        ? Object.entries(stats.by_provider)
            .flatMap(([, f]) => f)
            .sort((a, b) => b.count - a.count)
            .slice(0, 5)
        : [];

    // Derive provider list from failover routes or show empty
    const providerSet = new Set<string>();
    if (stats) {
        for (const [, f] of Object.entries(stats.by_provider)) {
            for (const flow of f) {
                providerSet.add(flow.original.toLowerCase());
                providerSet.add(flow.fallback.toLowerCase());
            }
        }
    }

    return (
        <div className="border border-border/30 bg-card p-4">
            <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-muted-foreground">Provider Failover</p>
                {hasFallbacks && (
                    <span className="text-[10px] text-muted-foreground/50">{timeRange}</span>
                )}
            </div>

            {/* Status headline */}
            <div className="flex items-center gap-2 mb-4">
                {hasFallbacks ? (
                    <>
                        <span className="text-lg font-semibold tabular-nums tracking-tight">
                            {stats.total_fallbacks}
                        </span>
                        <span className="text-xs text-muted-foreground/50">
                            fallbacks
                        </span>
                        <span className="text-[10px] text-amber-500 font-medium ml-auto tabular-nums">
                            {stats.fallback_rate.toFixed(1)}% of requests
                        </span>
                    </>
                ) : (
                    <>
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="text-sm font-medium text-emerald-500">All providers stable</span>
                    </>
                )}
            </div>

            {hasFallbacks ? (
                <>
                    {/* Failover routes */}
                    <div className="space-y-1.5">
                        {flows.map((flow, i) => {
                            const maxCount = flows[0]?.count || 1;
                            const barWidth = (flow.count / maxCount) * 100;

                            return (
                                <div key={i} className="group">
                                    <div className="flex items-center justify-between mb-0.5">
                                        <div className="flex items-center gap-1.5 text-xs">
                                            <span className="text-muted-foreground">{capitalize(flow.original)}</span>
                                            <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/40" />
                                            <span className="font-medium">{capitalize(flow.fallback)}</span>
                                        </div>
                                        <span className="text-[10px] text-muted-foreground/50 tabular-nums font-mono">
                                            {flow.count}x
                                        </span>
                                    </div>
                                    <div className="h-1 rounded-full bg-secondary overflow-hidden">
                                        <div
                                            className="h-full rounded-full bg-amber-500 transition-all"
                                            style={{ width: `${barWidth}%`, opacity: 0.5 }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Top reasons */}
                    {stats.top_reasons.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border/20">
                            <p className="text-[10px] text-muted-foreground/40 uppercase tracking-wider mb-2">Reasons</p>
                            <div className="space-y-1">
                                {stats.top_reasons.slice(0, 3).map((reason, i) => (
                                    <div key={i} className="flex items-center justify-between">
                                        <span className="text-[11px] text-muted-foreground truncate max-w-[70%]">
                                            {reason.reason}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground/40 tabular-nums font-mono">
                                            {reason.count}x
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <div className="space-y-1.5">
                    <p className="text-[11px] text-muted-foreground/40">
                        No provider failovers triggered in this period. All requests routed to their primary provider successfully.
                    </p>
                </div>
            )}
        </div>
    );
}
