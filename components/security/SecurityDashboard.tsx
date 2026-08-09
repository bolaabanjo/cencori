'use client';

import { useId, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useReducedMotion } from 'framer-motion';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from '@/components/ui/chart';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

interface SecurityDashboardProps {
    projectId?: string;
}

interface SecurityStats {
    period: SecurityPeriod;
    threatScore: number;
    blocked24h: number;
    blockedPeriod: number;
    pendingReviews: number;
    blockedRate: string;
    severityBreakdown: {
        critical: number;
        high: number;
        medium: number;
        low: number;
    };
    typeBreakdown: Record<string, number>;
    trendData: SecurityTrendPoint[];
    totalIncidentsPeriod: number;
}

interface SecurityTrendPoint {
    date: string;
    riskScore: number;
    blocked: number;
    signals: number;
    needsReview: number;
}

type SecurityMetricKey = Exclude<keyof SecurityTrendPoint, 'date'>;
type SecurityPeriod = '7d' | '30d' | '90d';

const SECURITY_PERIODS: { value: SecurityPeriod; label: string }[] = [
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
    { value: '90d', label: 'Last 90 days' },
];

const SEVERITIES = [
    { key: 'critical', label: 'Critical', color: 'bg-red-500' },
    { key: 'high', label: 'High', color: 'bg-orange-500' },
    { key: 'medium', label: 'Medium', color: 'bg-amber-400' },
    { key: 'low', label: 'Low', color: 'bg-foreground/30' },
] as const;

function useSecurityStats(projectId: string | undefined, period: SecurityPeriod) {
    return useQuery({
        queryKey: ['securityStats', projectId, period],
        queryFn: async () => {
            const response = await fetch(`/api/projects/${projectId}/security/stats?range=${period}`);
            if (!response.ok) {
                const body = await response.json().catch(() => null);
                throw new Error(body?.error || 'We could not load security statistics.');
            }

            const data = await response.json();
            return data.stats as SecurityStats;
        },
        staleTime: 30 * 1000,
        refetchInterval: 60 * 1000,
        enabled: !!projectId,
        retry: 1,
    });
}

function getThreatLevel(score: number) {
    if (score >= 80) return { label: 'Critical', color: 'text-red-500', indicator: 'bg-red-500' };
    if (score >= 60) return { label: 'High', color: 'text-orange-500', indicator: 'bg-orange-500' };
    if (score >= 40) return { label: 'Elevated', color: 'text-amber-500', indicator: 'bg-amber-500' };
    if (score >= 20) return { label: 'Low', color: 'text-blue-500', indicator: 'bg-blue-500' };
    return { label: 'Secure', color: 'text-emerald-500', indicator: 'bg-emerald-500' };
}

function formatChartDate(date: string) {
    return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
    });
}

function SecurityDateTick({
    x = 0,
    y = 0,
    index = 0,
    visibleTicksCount = 0,
    payload,
}: {
    x?: number;
    y?: number;
    index?: number;
    visibleTicksCount?: number;
    payload?: { value?: string };
}) {
    const isFirst = index === 0;
    const isLast = visibleTicksCount > 1 && index === visibleTicksCount - 1;

    return (
        <text
            x={x}
            y={y + 10}
            fill="var(--muted-foreground)"
            fontSize={9}
            textAnchor={isFirst ? 'start' : isLast ? 'end' : 'middle'}
        >
            {payload?.value ? formatChartDate(payload.value) : ''}
        </text>
    );
}

export function SecurityDashboard({ projectId }: SecurityDashboardProps) {
    const [period, setPeriod] = useState<SecurityPeriod>('30d');
    const { data: stats, error, isFetching, isLoading, refetch } = useSecurityStats(projectId, period);
    const reduceMotion = useReducedMotion();
    const periodLabel = SECURITY_PERIODS.find((option) => option.value === period)?.label.toLowerCase() || 'selected period';

    if (!projectId || isLoading) {
        return (
            <div>
                <SecurityTimelinePicker value={period} onValueChange={setPeriod} />
                <SecurityDashboardSkeleton />
            </div>
        );
    }

    if (error) {
        return (
            <div>
                <SecurityTimelinePicker value={period} onValueChange={setPeriod} />
                <section className="flex min-h-72 flex-col items-start justify-center rounded-xl border border-red-500/15 bg-red-500/[0.025] px-6 py-12 sm:px-8">
                    <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-red-500/10 text-red-500">
                        <AlertTriangle className="size-4" />
                    </div>
                    <h2 className="text-sm font-medium">Security telemetry is unavailable</h2>
                    <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">
                        {error instanceof Error ? error.message : 'The security service did not return a response.'}
                    </p>
                    <Button
                        variant="outline"
                        size="sm"
                        className="mt-5 h-8 gap-2 text-xs active:translate-y-px"
                        onClick={() => void refetch()}
                        disabled={isFetching}
                    >
                        <RotateCw className={`size-3 ${isFetching ? 'animate-spin' : ''}`} />
                        Try again
                    </Button>
                </section>
            </div>
        );
    }

    if (!stats) return null;

    const threatLevel = getThreatLevel(stats.threatScore);
    const threatTypes = Object.entries(stats.typeBreakdown)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    const highestSeverity = SEVERITIES.find(({ key }) => stats.severityBreakdown[key] > 0);

    return (
        <div>
            <SecurityTimelinePicker value={period} onValueChange={setPeriod} />
            <section className="overflow-hidden rounded-lg border border-border/25 bg-[#f3f3f1] dark:bg-[#111111]">
                <h2 className="sr-only">Security overview</h2>

                <div className="grid md:grid-cols-2">
                <SecurityMetricCell
                    label="Risk posture"
                    value={`${stats.threatScore}`}
                    suffix="/100"
                    detail={`${threatLevel.label} risk`}
                    data={stats.trendData}
                    dataKey="riskScore"
                    color="#3b82f6"
                    formatValue={(value) => `${Math.round(value)}/100`}
                    hasData={stats.trendData.some((point) => point.riskScore > 0)}
                    reduceMotion={reduceMotion}
                    valueClassName={threatLevel.color}
                />
                <SecurityMetricCell
                    label="Blocked requests"
                    value={`${stats.blockedPeriod}`}
                    detail={`${stats.blocked24h} in the last 24 hours`}
                    data={stats.trendData}
                    dataKey="blocked"
                    color="#ef4444"
                    formatValue={(value) => Math.round(value).toLocaleString()}
                    hasData={stats.trendData.some((point) => point.blocked > 0)}
                    reduceMotion={reduceMotion}
                />
                <SecurityMetricCell
                    label="Threat signals"
                    value={`${stats.totalIncidentsPeriod}`}
                    detail={`Detected in the ${periodLabel}`}
                    data={stats.trendData}
                    dataKey="signals"
                    color="#f97316"
                    formatValue={(value) => Math.round(value).toLocaleString()}
                    hasData={stats.trendData.some((point) => point.signals > 0)}
                    reduceMotion={reduceMotion}
                />
                <SecurityMetricCell
                    label="Needs review"
                    value={`${stats.pendingReviews}`}
                    detail={stats.pendingReviews === 0 ? 'Review queue is clear' : 'Awaiting a decision'}
                    data={stats.trendData}
                    dataKey="needsReview"
                    color="#f59e0b"
                    formatValue={(value) => Math.round(value).toLocaleString()}
                    hasData={stats.trendData.some((point) => point.needsReview > 0)}
                    reduceMotion={reduceMotion}
                    valueClassName={stats.pendingReviews > 0 ? 'text-amber-500' : undefined}
                />
                </div>

                <div className="grid lg:grid-cols-3 lg:divide-x lg:divide-border/25">
                <aside className="border-b border-border/25 px-5 py-6 sm:px-7 sm:py-7 lg:border-b-0" aria-label="Security attention queue">
                    <h3 className="text-sm font-medium tracking-[-0.01em]">Attention queue</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">Items most likely to need an operator.</p>

                    <dl className="mt-6 divide-y divide-border/25 border-y border-border/25">
                        <QueueRow label="Pending review" value={stats.pendingReviews} warn={stats.pendingReviews > 0} />
                        <QueueRow label="Highest severity" value={highestSeverity?.label || 'None'} />
                        <QueueRow label="Blocked rate" value={`${stats.blockedRate}%`} />
                    </dl>

                    <div className="mt-6">
                        <div className="flex items-center justify-between gap-4 text-[11px]">
                            <span className="text-muted-foreground">Current posture</span>
                            <span className={`inline-flex items-center gap-2 font-medium ${threatLevel.color}`}>
                                <span className={`size-1.5 rounded-full ${threatLevel.indicator}`} />
                                {threatLevel.label}
                            </span>
                        </div>
                        <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
                            <div
                                className={`h-full rounded-full transition-[width] duration-500 ${threatLevel.indicator}`}
                                style={{ width: `${stats.threatScore === 0 ? 0 : Math.max(stats.threatScore, 2)}%` }}
                            />
                        </div>
                    </div>
                </aside>
                <BreakdownPanel
                    title="Exposure by severity"
                    description={`Threat signals recorded in the ${periodLabel}.`}
                >
                    {stats.totalIncidentsPeriod === 0 ? (
                        <PanelEmptyState>No exposure recorded in this period.</PanelEmptyState>
                    ) : (
                        <div className="space-y-4">
                            {SEVERITIES.map(({ key, label, color }) => {
                                const count = stats.severityBreakdown[key];
                                const percentage = (count / stats.totalIncidentsPeriod) * 100;

                                return (
                                    <BreakdownRow
                                        key={key}
                                        label={label}
                                        count={count}
                                        percentage={percentage}
                                        color={color}
                                    />
                                );
                            })}
                        </div>
                    )}
                </BreakdownPanel>

                <BreakdownPanel
                    title="Detection families"
                    description="The controls responsible for recorded signals."
                >
                    {threatTypes.length === 0 ? (
                        <PanelEmptyState>No detection families were triggered.</PanelEmptyState>
                    ) : (
                        <div className="space-y-4">
                            {threatTypes.map(([type, count]) => (
                                <BreakdownRow
                                    key={type}
                                    label={type.replace(/_/g, ' ')}
                                    count={count}
                                    percentage={(count / stats.totalIncidentsPeriod) * 100}
                                    color="bg-foreground/45"
                                />
                            ))}
                        </div>
                    )}
                </BreakdownPanel>
                </div>
            </section>
        </div>
    );
}

function SecurityTimelinePicker({
    value,
    onValueChange,
}: {
    value: SecurityPeriod;
    onValueChange: (value: SecurityPeriod) => void;
}) {
    return (
        <div className="mb-3 flex justify-end">
            <Select value={value} onValueChange={(nextValue) => onValueChange(nextValue as SecurityPeriod)}>
                <SelectTrigger className="h-8 w-[138px] rounded-md border-border/30 bg-transparent px-3 text-xs shadow-none" aria-label="Security timeline">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                    {SECURITY_PERIODS.map((option) => (
                        <SelectItem key={option.value} value={option.value} className="text-xs">
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

function SecurityDashboardSkeleton() {
    return (
        <div className="overflow-hidden rounded-lg border border-border/25 bg-[#f3f3f1] dark:bg-[#111111]">
            <div className="grid md:grid-cols-2">
                {[1, 2, 3, 4].map((item) => (
                    <div key={item} className="flex min-h-[22rem] flex-col border-b border-border/30 bg-[#f3f3f1] px-6 py-6 dark:bg-[#111111] md:odd:border-r">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="mt-5 h-9 w-20" />
                        <Skeleton className="mt-auto h-40 w-full rounded-sm" />
                    </div>
                ))}
            </div>

            <div className="grid lg:grid-cols-3 lg:divide-x lg:divide-border/25">
                {[1, 2, 3].map((section) => (
                    <div key={section} className="border-b border-border/25 px-5 py-6 sm:px-7 lg:border-b-0">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="mt-2 h-3 w-48" />
                        <div className="mt-6 space-y-5">
                            {[1, 2, 3].map((row) => <Skeleton key={row} className="h-4 w-full" />)}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function SecurityMetricCell({
    label,
    value,
    suffix,
    detail,
    data,
    dataKey,
    color,
    formatValue,
    hasData,
    reduceMotion,
    valueClassName,
}: {
    label: string;
    value: string;
    suffix?: string;
    detail: string;
    data: SecurityTrendPoint[];
    dataKey: SecurityMetricKey;
    color: string;
    formatValue: (value: number) => string;
    hasData: boolean;
    reduceMotion: boolean | null;
    valueClassName?: string;
}) {
    const gradientId = `security-metric-gradient-${useId().replace(/:/g, '')}`;
    const firstDate = data[0]?.date;
    const lastDate = data[data.length - 1]?.date;
    const dateTicks = firstDate && lastDate && firstDate !== lastDate
        ? [firstDate, lastDate]
        : firstDate
            ? [firstDate]
            : [];
    const chartConfig = {
        [dataKey]: { label, color },
    } satisfies ChartConfig;
    const tooltipLabel = dataKey === 'riskScore' ? 'Daily risk' : label;

    return (
        <article className="group flex min-h-[22rem] min-w-0 flex-col border-b border-border/30 bg-[#f3f3f1] px-6 py-6 transition-colors duration-150 hover:bg-muted/65 dark:bg-[#111111] md:odd:border-r">
            <div className="flex items-start justify-between gap-4">
                <p className="shrink-0 text-[13px] font-medium text-foreground/80">{label}</p>
                <p className="truncate text-right text-[11px] leading-4 text-muted-foreground">{detail}</p>
            </div>

            <p className={`mt-5 font-mono text-[2.1rem] font-medium leading-none tracking-[-0.045em] tabular-nums ${valueClassName || ''}`}>
                {value}
                {suffix && <span className="ml-1 text-xs tracking-normal text-muted-foreground">{suffix}</span>}
            </p>

            <div className="relative mt-auto h-[13rem] pt-6">
                <ChartContainer config={chartConfig} className="h-full w-full aspect-auto">
                    <AreaChart data={data} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
                        <defs>
                            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={`var(--color-${dataKey})`} stopOpacity={0.18} />
                                <stop offset="100%" stopColor={`var(--color-${dataKey})`} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.35} />
                        <XAxis
                            dataKey="date"
                            ticks={dateTicks}
                            interval={0}
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            tick={<SecurityDateTick />}
                        />
                        <YAxis hide domain={[0, 'auto']} />
                        <ChartTooltip
                            cursor={{ stroke: 'var(--border)', strokeDasharray: '3 3' }}
                            content={
                                <ChartTooltipContent
                                    indicator="line"
                                    labelFormatter={(chartLabel) => formatChartDate(String(chartLabel))}
                                    formatter={(chartValue) => (
                                        <div className="flex min-w-28 items-center justify-between gap-4">
                                            <span className="text-muted-foreground">{tooltipLabel}</span>
                                            <span className="font-mono font-medium tabular-nums">
                                                {formatValue(Number(chartValue))}
                                            </span>
                                        </div>
                                    )}
                                />
                            }
                        />
                        <Area
                            type="monotone"
                            dataKey={dataKey}
                            stroke={`var(--color-${dataKey})`}
                            strokeWidth={1.6}
                            fill={`url(#${gradientId})`}
                            dot={false}
                            activeDot={{ r: 2.75, strokeWidth: 2, fill: 'var(--background)' }}
                            isAnimationActive={!reduceMotion}
                            animationDuration={260}
                        />
                    </AreaChart>
                </ChartContainer>

                {!hasData && (
                    <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center">
                        <span className="rounded-md bg-primary/55 px-3 py-1.5 text-[11px] font-medium text-primary-foreground/80">
                            No data for this period
                        </span>
                    </div>
                )}
            </div>
        </article>
    );
}

function QueueRow({ label, value, warn = false }: { label: string; value: string | number; warn?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-4 py-3.5">
            <dt className="text-[11px] text-muted-foreground">{label}</dt>
            <dd className={`font-mono text-xs font-medium tabular-nums ${warn ? 'text-amber-500' : ''}`}>{value}</dd>
        </div>
    );
}

function BreakdownPanel({
    title,
    description,
    children,
}: {
    title: string;
    description: string;
    children: ReactNode;
}) {
    return (
        <section className="px-5 py-6 sm:px-7 sm:py-7">
            <h3 className="text-sm font-medium tracking-[-0.01em]">{title}</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
            <div className="mt-6">{children}</div>
        </section>
    );
}

function BreakdownRow({
    label,
    count,
    percentage,
    color,
}: {
    label: string;
    count: number;
    percentage: number;
    color: string;
}) {
    return (
        <div>
            <div className="flex items-center justify-between gap-4 text-[11px]">
                <span className="capitalize text-foreground">{label}</span>
                <span className="font-mono tabular-nums text-muted-foreground">
                    {count} <span className="ml-2 text-muted-foreground/65">{percentage.toFixed(0)}%</span>
                </span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${percentage}%` }} />
            </div>
        </div>
    );
}

function PanelEmptyState({
    children,
    className = '',
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div className={`flex min-h-32 items-center justify-center rounded-lg border border-dashed border-border/30 bg-muted/[0.16] px-4 text-center text-[11px] text-muted-foreground ${className}`}>
            {children}
        </div>
    );
}
