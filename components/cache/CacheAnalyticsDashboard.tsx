'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ObservabilityChartCard } from '@/components/analytics/ObservabilityChartCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

interface CacheAnalyticsDashboardProps {
    projectId?: string;
    timeRange: string;
    environment?: string;
}

interface CacheAnalytics {
    hitRate: number;
    totalLookups: number;
    exactHits: number;
    semanticHits: number;
    misses: number;
    totalTokensSaved: number;
    totalCostSaved: number;
    activeEntries: number;
    hitRateOverTime: Array<{
        timestamp: string;
        hitRate: number;
        lookups: number;
    }>;
    topCachedPrompts: Array<{
        id: string;
        promptPreview: string;
        model: string;
        hitCount: number;
        costSaved: number;
        lastHitAt: string | null;
    }>;
}

const rangeApiMap: Record<string, string> = {
    'Last 1 Hour': '1h',
    'Last 24 Hours': '24h',
    'Last 7 Days': '7d',
    'Last 30 Days': '30d',
};

function formatTokens(n: number): string {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
}

function formatCost(v: number): string {
    if (v === 0) return '$0';
    if (v < 0.01) return `$${v.toFixed(4)}`;
    if (v < 1) return `$${v.toFixed(3)}`;
    return `$${v.toFixed(2)}`;
}

export function CacheAnalyticsDashboard({ projectId, timeRange, environment = 'production' }: CacheAnalyticsDashboardProps) {
    const range = rangeApiMap[timeRange] || '7d';
    const queryClient = useQueryClient();

    const { data: analytics, isLoading } = useQuery<CacheAnalytics>({
        queryKey: ['cacheAnalytics', projectId, range, environment],
        queryFn: async () => {
            const res = await fetch(`/api/projects/${projectId}/cache/analytics?range=${range}&environment=${environment}`);
            if (!res.ok) throw new Error('Failed to fetch cache analytics');
            return res.json();
        },
        staleTime: 30 * 1000,
        enabled: !!projectId,
    });

    const invalidateMutation = useMutation({
        mutationFn: async (entryId?: string) => {
            const res = await fetch(`/api/projects/${projectId}/cache/entries`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(entryId ? { cache_key: entryId, environment } : { all: true, environment }),
            });
            if (!res.ok) throw new Error('Failed to invalidate');
            return res.json();
        },
        onMutate: async () => {
            await queryClient.cancelQueries({ queryKey: ['cacheAnalytics', projectId, range, environment] });
            const previous = queryClient.getQueryData<CacheAnalytics>(['cacheAnalytics', projectId, range, environment]);

            queryClient.setQueryData(['cacheAnalytics', projectId, range, environment], (old: CacheAnalytics | undefined) => {
                if (!old) return old;
                return { ...old, activeEntries: 0, topCachedPrompts: [] };
            });

            return { previous };
        },
        onError: (_err, _vars, context) => {
            if (context?.previous) {
                queryClient.setQueryData(['cacheAnalytics', projectId, range, environment], context.previous);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['cacheAnalytics', projectId] });
        },
    });

    if (!projectId || isLoading) {
        return (
            <div className="space-y-4">
                <div className="rounded-md border border-border/40 bg-card overflow-hidden">
                    <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-border/30">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="px-5 py-4">
                                <Skeleton className="h-3 w-16 mb-2.5" />
                                <Skeleton className="h-6 w-14 mb-2" />
                                <Skeleton className="h-3 w-24" />
                            </div>
                        ))}
                    </div>
                </div>
                <Skeleton className="h-48 rounded-md" />
            </div>
        );
    }

    if (!analytics) return null;

    const hasData = analytics.totalLookups > 0;

    return (
        <div className="space-y-4">
            {/* KPI cards */}
            <div className="rounded-md border border-border/40 bg-card overflow-hidden">
                <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-border/30">
                    <div className="px-5 py-4">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Hit Rate</span>
                        <p className="text-xl font-semibold font-mono tracking-tight mt-1">
                            {hasData ? `${(analytics.hitRate * 100).toFixed(1)}%` : '--'}
                        </p>
                        <span className="text-[10px] text-muted-foreground">
                            {analytics.exactHits + analytics.semanticHits} hits / {analytics.totalLookups} lookups
                        </span>
                    </div>
                    <div className="px-5 py-4">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Tokens Saved</span>
                        <p className="text-xl font-semibold font-mono tracking-tight mt-1">
                            {formatTokens(analytics.totalTokensSaved)}
                        </p>
                        <span className="text-[10px] text-muted-foreground">
                            across {analytics.exactHits + analytics.semanticHits} cache hits
                        </span>
                    </div>
                    <div className="px-5 py-4">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Cost Saved</span>
                        <p className="text-xl font-semibold font-mono tracking-tight text-emerald-500 mt-1">
                            {formatCost(analytics.totalCostSaved)}
                        </p>
                        <span className="text-[10px] text-muted-foreground">estimated savings</span>
                    </div>
                    <div className="px-5 py-4">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Active Entries</span>
                        <p className="text-xl font-semibold font-mono tracking-tight mt-1">
                            {analytics.activeEntries.toLocaleString()}
                        </p>
                        <span className="text-[10px] text-muted-foreground">cached prompts</span>
                    </div>
                </div>
            </div>

            {/* Charts */}
            {hasData && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    <ObservabilityChartCard
                        title="Hit Rate Over Time"
                        series={[
                            {
                                key: 'hitRate',
                                label: 'Hit Rate',
                                color: 'hsl(142, 71%, 45%)',
                                format: 'percentage',
                                data: analytics.hitRateOverTime.map(p => ({
                                    timestamp: p.timestamp,
                                    value: p.hitRate * 100,
                                })),
                            },
                        ]}
                    />
                    <ObservabilityChartCard
                        title="Cache Lookups"
                        series={[
                            {
                                key: 'lookups',
                                label: 'Lookups',
                                color: 'hsl(220, 70%, 55%)',
                                data: analytics.hitRateOverTime.map(p => ({
                                    timestamp: p.timestamp,
                                    value: p.lookups,
                                })),
                                total: analytics.totalLookups,
                            },
                        ]}
                        type="bar"
                    />
                </div>
            )}

            {/* Top cached prompts */}
            {analytics.topCachedPrompts.length > 0 && (
                <div className="rounded-xl border border-border/30 bg-card">
                    <div className="flex items-center justify-between px-4 pt-4 pb-2">
                        <p className="text-xs font-medium text-muted-foreground">Top Cached Prompts</p>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] text-muted-foreground/50 hover:text-destructive"
                            onClick={() => invalidateMutation.mutate(undefined)}
                        >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Clear All
                        </Button>
                    </div>
                    <div className="divide-y divide-border/20">
                        {analytics.topCachedPrompts.map((entry) => (
                            <div key={entry.id} className="px-4 py-2.5 flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs text-foreground truncate">{entry.promptPreview}</p>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="text-[10px] text-muted-foreground/50 font-mono">{entry.model}</span>
                                        <span className="text-[10px] text-muted-foreground/50 tabular-nums">{entry.hitCount} hits</span>
                                        <span className="text-[10px] text-emerald-500/70 tabular-nums">{formatCost(entry.costSaved)} saved</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Empty state */}
            {!hasData && (
                <div className="rounded-xl border border-border/30 bg-card py-12 text-center">
                    <p className="text-sm font-medium mb-1">No cache activity yet</p>
                    <p className="text-xs text-muted-foreground/60 max-w-[300px] mx-auto">
                        Enable caching in Settings, then make API requests. Cache hits will appear here.
                    </p>
                </div>
            )}
        </div>
    );
}
