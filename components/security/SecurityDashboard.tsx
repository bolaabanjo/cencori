'use client';

import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';

interface SecurityDashboardProps {
    projectId?: string;
}

interface SecurityStats {
    threatScore: number;
    blocked24h: number;
    blocked7d: number;
    pendingReviews: number;
    blockedRate: string;
    severityBreakdown: {
        critical: number;
        high: number;
        medium: number;
        low: number;
    };
    typeBreakdown: Record<string, number>;
    trendData: { date: string; count: number }[];
    totalIncidents30d: number;
}

function useSecurityStats(projectId?: string) {
    return useQuery({
        queryKey: ['securityStats', projectId],
        queryFn: async () => {
            const response = await fetch(`/api/projects/${projectId}/security/stats`);
            if (!response.ok) throw new Error('Failed to fetch security stats');
            const data = await response.json();
            return data.stats as SecurityStats;
        },
        staleTime: 30 * 1000,
        refetchInterval: 60 * 1000,
        enabled: !!projectId,
    });
}

function getThreatLevel(score: number): { label: string; color: string } {
    if (score >= 80) return { label: 'Critical', color: 'text-red-500' };
    if (score >= 60) return { label: 'High', color: 'text-amber-500' };
    if (score >= 40) return { label: 'Medium', color: 'text-yellow-500' };
    if (score >= 20) return { label: 'Low', color: 'text-blue-500' };
    return { label: 'Secure', color: 'text-emerald-500' };
}

const SEVERITY_COLORS: Record<string, string> = {
    critical: 'bg-red-500',
    high: 'bg-amber-500',
    medium: 'bg-yellow-500',
    low: 'bg-foreground/30',
};

export function SecurityDashboard({ projectId }: SecurityDashboardProps) {
    const { data: stats, isLoading } = useSecurityStats(projectId);

    if (!projectId || isLoading) {
        return (
            <div className="space-y-4">
                {/* Metrics skeleton */}
                <div className="rounded-md border border-border/40 bg-card overflow-hidden">
                    <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-border/30">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="px-5 py-4">
                                <Skeleton className="h-3 w-20 mb-2.5" />
                                <Skeleton className="h-6 w-14 mb-2" />
                                <Skeleton className="h-3 w-24" />
                            </div>
                        ))}
                    </div>
                    <div className="grid md:grid-cols-2 divide-x divide-border/30 border-t border-border/30">
                        {[1, 2].map(section => (
                            <div key={section}>
                                <div className="px-5 py-3 border-b border-border/20">
                                    <Skeleton className="h-3 w-24" />
                                </div>
                                <div className="divide-y divide-border/10">
                                    {[1, 2, 3, 4].map(row => (
                                        <div key={row} className="flex items-center justify-between px-5 py-2.5">
                                            <Skeleton className="h-3.5 w-20" />
                                            <div className="flex items-center gap-3">
                                                <Skeleton className="w-16 h-1 rounded-full" />
                                                <Skeleton className="h-3 w-8" />
                                                <Skeleton className="h-3 w-8" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                {/* Trend skeleton */}
                <div className="rounded-md border border-border/40 bg-card overflow-hidden">
                    <div className="px-5 py-3 border-b border-border/20">
                        <Skeleton className="h-3 w-28" />
                    </div>
                    <div className="p-5">
                        <div className="flex items-end gap-1 h-20">
                            {[1, 2, 3, 4, 5, 6, 7].map(i => (
                                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                    <Skeleton className="w-full rounded-t" style={{ height: `${20 + Math.random() * 60}%` }} />
                                    <Skeleton className="h-2 w-4" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!stats) return null;

    const threatLevel = getThreatLevel(stats.threatScore);

    const severities = [
        { key: 'critical', label: 'Critical' },
        { key: 'high', label: 'High' },
        { key: 'medium', label: 'Medium' },
        { key: 'low', label: 'Low' },
    ] as const;

    const threatTypes = Object.entries(stats.typeBreakdown)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    return (
        <div className="space-y-4">
            {/* Unified stats + breakdowns card */}
            <div className="rounded-md border border-border/40 bg-card overflow-hidden">
                {/* Top row: key metrics */}
                <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-border/30">
                    <div className="px-5 py-4">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Threat Score</span>
                        <div className="flex items-baseline gap-2 mt-1">
                            <span className={`text-xl font-semibold font-mono tracking-tight ${threatLevel.color}`}>
                                {stats.threatScore}
                            </span>
                            <span className={`text-[10px] font-medium ${threatLevel.color}`}>
                                {threatLevel.label}
                            </span>
                        </div>
                    </div>
                    <div className="px-5 py-4">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Blocked (24h)</span>
                        <p className="text-xl font-semibold font-mono tracking-tight mt-1">{stats.blocked24h}</p>
                        <span className="text-[10px] text-muted-foreground">last 24 hours</span>
                    </div>
                    <div className="px-5 py-4">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Blocked (7d)</span>
                        <p className="text-xl font-semibold font-mono tracking-tight mt-1">{stats.blocked7d}</p>
                        <span className="text-[10px] text-muted-foreground">{stats.blockedRate}% of requests</span>
                    </div>
                    <div className="px-5 py-4">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Pending Review</span>
                        <p className={`text-xl font-semibold font-mono tracking-tight mt-1 ${stats.pendingReviews > 0 ? 'text-amber-500' : ''}`}>
                            {stats.pendingReviews}
                        </p>
                        <span className="text-[10px] text-muted-foreground">awaiting action</span>
                    </div>
                </div>

                {/* Bottom row: severity + threat types side by side */}
                <div className="grid md:grid-cols-2 divide-x divide-border/30 border-t border-border/30">
                    {/* Severity Breakdown */}
                    <div>
                        <div className="px-5 py-3 border-b border-border/20">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Severity (30d)</span>
                        </div>
                        <div className="divide-y divide-border/10">
                            {severities.map(({ key, label }) => {
                                const count = stats.severityBreakdown[key];
                                const pct = stats.totalIncidents30d > 0
                                    ? (count / stats.totalIncidents30d) * 100
                                    : 0;
                                return (
                                    <div key={key} className="flex items-center justify-between px-5 py-2.5 hover:bg-muted/10 transition-colors">
                                        <span className="text-xs font-medium">{label}</span>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <div className="w-16 h-1 rounded-full bg-muted-foreground/10 overflow-hidden">
                                                <div className={`h-full rounded-full ${SEVERITY_COLORS[key]}`} style={{ width: `${pct}%` }} />
                                            </div>
                                            <span className="text-[11px] tabular-nums text-muted-foreground w-8 text-right">{pct.toFixed(0)}%</span>
                                            <span className="text-[11px] tabular-nums text-foreground w-8 text-right font-medium">{count}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Threat Types */}
                    <div>
                        <div className="px-5 py-3 border-b border-border/20">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Threat Types (30d)</span>
                        </div>
                        {threatTypes.length === 0 ? (
                            <div className="px-5 py-6 text-xs text-muted-foreground">No threats detected</div>
                        ) : (
                            <div className="divide-y divide-border/10">
                                {threatTypes.map(([type, count]) => {
                                    const pct = stats.totalIncidents30d > 0
                                        ? (count / stats.totalIncidents30d) * 100
                                        : 0;
                                    return (
                                        <div key={type} className="flex items-center justify-between px-5 py-2.5 hover:bg-muted/10 transition-colors">
                                            <span className="text-xs font-medium capitalize truncate mr-4">{type.replace(/_/g, ' ')}</span>
                                            <div className="flex items-center gap-3 shrink-0">
                                                <div className="w-16 h-1 rounded-full bg-muted-foreground/10 overflow-hidden">
                                                    <div className="h-full rounded-full bg-foreground/40" style={{ width: `${pct}%` }} />
                                                </div>
                                                <span className="text-[11px] tabular-nums text-muted-foreground w-8 text-right">{pct.toFixed(0)}%</span>
                                                <span className="text-[11px] tabular-nums text-foreground w-8 text-right font-medium">{count}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Daily Incidents trend */}
            <div className="rounded-md border border-border/40 bg-card overflow-hidden">
                <div className="px-5 py-3 border-b border-border/20">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Daily Incidents (7d)</span>
                </div>
                <div className="p-5">
                    <div className="flex items-end gap-1 h-20">
                        {stats.trendData.map((day, i) => {
                            const maxCount = Math.max(...stats.trendData.map(d => d.count), 1);
                            const height = (day.count / maxCount) * 100;
                            const isToday = i === stats.trendData.length - 1;
                            return (
                                <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                                    <div
                                        className={`w-full rounded-t transition-all ${isToday ? 'bg-foreground' : 'bg-foreground/25'}`}
                                        style={{ height: `${Math.max(height, 4)}%` }}
                                        title={`${day.date}: ${day.count} incidents`}
                                    />
                                    <span className="text-[8px] text-muted-foreground">
                                        {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
