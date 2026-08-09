'use client';

import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import { AlertTriangle, Brain } from 'lucide-react';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';

interface MemoryOverviewProps {
    projectId: string;
}

interface OverviewResponse {
    quota: { used: number; limit: number | null; percent: number; tier: string };
    memories: {
        active: number;
        superseded: number;
        users: number;
        namespaces: number;
        avgImportance: number;
        recalls: number;
        neverRecalled: number;
    };
    graph: { entities: number; edges: number; mentions: number };
    daily: { date: string; count: number }[];
    topUsers: { scopeKey: string; count: number }[];
    settings: { enabled: boolean; graphEnabled: boolean };
}

const numberFormat = new Intl.NumberFormat('en-US');

function useMemoryOverview(projectId: string) {
    return useQuery({
        queryKey: ['memoryOverview', projectId],
        queryFn: async (): Promise<OverviewResponse> => {
            const response = await fetch(`/api/projects/${projectId}/memory/overview`);
            if (!response.ok) {
                const body = await response.json().catch(() => null);
                throw new Error(body?.error || 'We could not load memory statistics.');
            }
            return response.json();
        },
        staleTime: 30_000,
    });
}

/** The fill gauge from the pricing model: one bar, 0–100% of the tier's quota. */
function QuotaGauge({ quota }: { quota: OverviewResponse['quota'] }) {
    const unlimited = quota.limit == null;
    // 80% is the nudge threshold, 100% hard-blocks writes (reads keep working).
    const tone = quota.percent >= 100
        ? 'bg-red-500'
        : quota.percent >= 80
            ? 'bg-amber-500'
            : 'bg-foreground';

    return (
        <section className="border-b border-border/30 px-6 py-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-[13px] font-medium text-foreground/80">Memories stored</p>
                    <p className="mt-4 font-mono text-[2.1rem] font-medium leading-none tracking-[-0.045em] tabular-nums">
                        {numberFormat.format(quota.used)}
                        <span className="ml-2 text-xs tracking-normal text-muted-foreground">
                            {unlimited ? 'of unlimited' : `of ${numberFormat.format(quota.limit!)}`}
                        </span>
                    </p>
                </div>
                <p className="text-right text-[11px] leading-4 text-muted-foreground">
                    {unlimited ? 'Enterprise — no cap' : `${quota.percent}% of the ${quota.tier} quota`}
                </p>
            </div>

            {!unlimited && (
                <div className="mt-5">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                            className={`h-full rounded-full transition-[width] duration-500 ${tone}`}
                            style={{ width: `${Math.max(quota.percent, quota.used > 0 ? 1 : 0)}%` }}
                        />
                    </div>
                    {quota.percent >= 80 && (
                        <p className="mt-3 flex items-center gap-1.5 text-[11px] leading-4 text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            {quota.percent >= 100
                                ? 'Writes are blocked at 100%. Reads keep working — nothing has been forgotten.'
                                : 'Approaching the quota. Writes stop at 100%; reads are never cut off.'}
                        </p>
                    )}
                </div>
            )}
        </section>
    );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
    return (
        <div className="border-b border-border/30 px-6 py-5 md:border-r last:md:border-r-0">
            <p className="text-[11px] leading-4 text-muted-foreground">{label}</p>
            <p className="mt-2 font-mono text-lg font-medium leading-none tracking-[-0.03em] tabular-nums">{value}</p>
            {detail && <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{detail}</p>}
        </div>
    );
}

export function MemoryOverview({ projectId }: MemoryOverviewProps) {
    const { data, isLoading, error } = useMemoryOverview(projectId);

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-40 w-full rounded-xl" />
                <Skeleton className="h-56 w-full rounded-xl" />
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="flex flex-col items-center py-16 text-center">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                    <Brain className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">Could not load memory stats</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    {error instanceof Error ? error.message : 'Try again in a moment.'}
                </p>
            </div>
        );
    }

    const { quota, memories, graph, daily, topUsers } = data;
    const chartConfig = { count: { label: 'Memories written', color: 'var(--muted-foreground)' } } satisfies ChartConfig;
    const totalWrites = daily.reduce((sum, d) => sum + d.count, 0);
    const recallRate = memories.active > 0
        ? Math.round(((memories.active - memories.neverRecalled) / memories.active) * 100)
        : 0;

    return (
        <div className="overflow-hidden rounded-xl border border-border/30">
            <QuotaGauge quota={quota} />

            <div className="grid grid-cols-2 md:grid-cols-4">
                <Stat
                    label="End-users"
                    value={numberFormat.format(memories.users)}
                    detail={memories.namespaces > 0 ? `${memories.namespaces} namespaces` : 'No namespaces in use'}
                />
                <Stat
                    label="Recalled at least once"
                    value={`${recallRate}%`}
                    detail={`${numberFormat.format(memories.neverRecalled)} never surfaced`}
                />
                <Stat
                    label="Superseded history"
                    value={numberFormat.format(memories.superseded)}
                    detail="Replaced facts, still queryable as-of"
                />
                <Stat
                    label="Entity graph"
                    value={`${numberFormat.format(graph.entities)} / ${numberFormat.format(graph.edges)}`}
                    detail={data.settings.graphEnabled ? 'entities / relations' : 'Graph layer is off'}
                />
            </div>

            <section className="px-6 py-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[13px] font-medium text-foreground/80">Memories written</p>
                    <p className="text-[11px] leading-4 text-muted-foreground">
                        {numberFormat.format(totalWrites)} in the last 14 days
                    </p>
                </div>

                {daily.length === 0 ? (
                    <p className="mt-6 text-[11px] leading-4 text-muted-foreground">
                        No write history yet. Send a request with a <span className="font-mono">memory</span> field to start.
                    </p>
                ) : (
                    <div className="mt-5 h-[11rem]">
                        <ChartContainer config={chartConfig} className="h-full w-full aspect-auto">
                            <BarChart data={daily} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                                <CartesianGrid vertical={false} strokeDasharray="2 4" className="stroke-border/40" />
                                <XAxis
                                    dataKey="date"
                                    tickLine={false}
                                    axisLine={false}
                                    ticks={daily.length > 1 ? [daily[0].date, daily[daily.length - 1].date] : undefined}
                                    tickFormatter={(value: string) =>
                                        new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                    }
                                    tick={{ fontSize: 10 }}
                                    className="text-muted-foreground"
                                />
                                <ChartTooltip
                                    cursor={false}
                                    content={
                                        <ChartTooltipContent
                                            labelFormatter={(value) =>
                                                new Date(value as string).toLocaleDateString('en-US', {
                                                    weekday: 'short', month: 'short', day: 'numeric',
                                                })
                                            }
                                        />
                                    }
                                />
                                <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} maxBarSize={18} />
                            </BarChart>
                        </ChartContainer>
                    </div>
                )}
            </section>

            {topUsers.length > 0 && (
                <section className="border-t border-border/30 px-6 py-6">
                    <p className="text-[13px] font-medium text-foreground/80">Heaviest end-users</p>
                    <ul className="mt-4 space-y-2.5">
                        {topUsers.map(user => {
                            const share = quota.used > 0 ? Math.round((user.count / quota.used) * 100) : 0;
                            return (
                                <li key={user.scopeKey} className="flex items-center gap-3">
                                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                                        {user.scopeKey}
                                    </span>
                                    <span className="h-1 w-24 overflow-hidden rounded-full bg-muted">
                                        <span className="block h-full rounded-full bg-foreground/40" style={{ width: `${Math.max(share, 2)}%` }} />
                                    </span>
                                    <span className="w-14 text-right font-mono text-[11px] tabular-nums">
                                        {numberFormat.format(user.count)}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}
        </div>
    );
}
