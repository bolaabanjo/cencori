'use client';

import { useId, useMemo } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

export interface ChartSeries {
    key: string;
    label: string;
    color: string;
    data: Array<{ timestamp: string; value: number }>;
    total?: number;
    format?: 'number' | 'currency' | 'percentage' | 'ms';
}

interface ObservabilityChartCardProps {
    title: string;
    href?: string;
    series: ChartSeries[];
    type?: 'area' | 'bar';
    isLoading?: boolean;
    className?: string;
    chartHeight?: number;
}

export function formatValue(val: number, format?: ChartSeries['format']): string {
    switch (format) {
        case 'currency':
            if (val === 0) return '$0';
            if (val < 0.01) return `$${val.toFixed(4)}`;
            if (val < 1) return `$${val.toFixed(3)}`;
            return `$${val.toFixed(2)}`;
        case 'percentage':
            return `${val.toFixed(1)}%`;
        case 'ms':
            return val >= 1000 ? `${(val / 1000).toFixed(1)}s` : `${Math.round(val)}ms`;
        default:
            return val >= 1000000
                ? `${(val / 1000000).toFixed(1)}M`
                : val >= 1000
                ? `${(val / 1000).toFixed(1)}k`
                : val.toLocaleString();
    }
}

function getTimeLabels(timestamps: string[]): { start: string; end: string } {
    if (timestamps.length === 0) return { start: '', end: 'Now' };

    const first = timestamps[0];
    const now = new Date();

    let date: Date;
    if (first.match(/^\d{2}:\d{2}$/)) {
        const [h, m] = first.split(':').map(Number);
        date = new Date(now);
        date.setHours(h, m, 0, 0);
    } else if (first.includes(' ')) {
        date = new Date(first.replace(' ', 'T'));
    } else {
        date = new Date(first);
    }

    if (isNaN(date.getTime())) return { start: first, end: 'Now' };

    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.round(diffMs / 60000);
    const diffHours = Math.round(diffMs / 3600000);
    const diffDays = Math.round(diffMs / 86400000);

    let start: string;
    if (diffMins < 60) start = `${diffMins}m ago`;
    else if (diffHours < 48) start = `${diffHours}h ago`;
    else start = `${diffDays}d ago`;

    return { start, end: 'Now' };
}

function ChartTooltipContent({ active, payload, label }: { active?: boolean; payload?: Array<{ color: string; name: string; value: number; dataKey: string }>; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-lg border border-border/50 bg-popover px-3 py-2 shadow-xl text-xs backdrop-blur-sm">
            <p className="text-muted-foreground/70 mb-1 text-[10px]">{label}</p>
            {payload.map((p) => (
                <div key={p.dataKey} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.color }} />
                    <span className="text-muted-foreground">{p.name}</span>
                    <span className="font-medium ml-auto pl-4 tabular-nums">{p.value?.toLocaleString()}</span>
                </div>
            ))}
        </div>
    );
}

export function ObservabilityChartCardSkeleton({ className }: { className?: string }) {
    return (
        <div className={cn('bg-card p-4 flex flex-col', className)}>
            <div className="flex items-center justify-between mb-3">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-5 w-16 rounded-md" />
            </div>
            <Skeleton className="flex-1 min-h-[100px] rounded-lg" />
        </div>
    );
}

export function ObservabilityChartCard({
    title,
    href,
    series,
    type = 'area',
    isLoading = false,
    className,
    chartHeight = 100,
}: ObservabilityChartCardProps) {
    const gradientId = useId().replace(/:/g, '');
    const chartData = useMemo(() => {
        if (series.length === 0) return [];
        const allTimestamps = [...new Set(series.flatMap(s => s.data.map(d => d.timestamp)))].sort();
        return allTimestamps.map(ts => {
            const row: Record<string, string | number> = { timestamp: ts };
            for (const s of series) {
                const point = s.data.find(d => d.timestamp === ts);
                row[s.key] = point?.value ?? 0;
            }
            return row;
        });
    }, [series]);

    const allTimestamps = useMemo(() => chartData.map(d => d.timestamp as string), [chartData]);
    const { start, end } = useMemo(() => getTimeLabels(allTimestamps), [allTimestamps]);

    const primaryFormat = series[0]?.format;
    const primaryTotal = series[0]?.total;
    const hasData = chartData.length > 0 && chartData.some(d => {
        for (const s of series) {
            if ((d[s.key] as number) > 0) return true;
        }
        return false;
    });

    if (isLoading) {
        return <ObservabilityChartCardSkeleton className={className} />;
    }

    return (
        <div className={cn(
            'group bg-card flex flex-col overflow-hidden transition-colors',
            className
        )}>
            {/* Header: title + primary value */}
            <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-medium text-muted-foreground">{title}</span>
                    {href && (
                        <Link href={href} className="text-muted-foreground/40 hover:text-foreground transition-colors opacity-0 group-hover:opacity-100">
                            <ArrowRight className="h-3 w-3" />
                        </Link>
                    )}
                </div>
                {/* Legend dots for multi-series */}
                {series.length > 1 && (
                    <div className="flex items-center gap-3">
                        {series.map(s => (
                            <div key={s.key} className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
                                <span className="text-[10px] text-muted-foreground/60">{s.label}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Big number */}
            {primaryTotal !== undefined && (
                <div className="px-4 pb-2">
                    <span className="text-2xl font-semibold tabular-nums tracking-tight">
                        {formatValue(primaryTotal, primaryFormat)}
                    </span>
                    {series.length === 1 && (
                        <span className="text-[10px] text-muted-foreground/50 ml-1.5">{series[0].label}</span>
                    )}
                </div>
            )}

            {/* Chart */}
            <div className="flex-1 min-h-0 px-0">
                {hasData ? (
                    <ResponsiveContainer width="100%" height={chartHeight}>
                        {type === 'bar' ? (
                            <BarChart data={chartData} margin={{ top: 2, right: 12, bottom: 0, left: 12 }} barCategoryGap="25%">
                                <defs>
                                    {series.map(s => (
                                        <linearGradient key={s.key} id={`fill-${gradientId}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={s.color} stopOpacity={0.85} />
                                            <stop offset="100%" stopColor={s.color} stopOpacity={0.35} />
                                        </linearGradient>
                                    ))}
                                </defs>
                                <CartesianGrid
                                    horizontal vertical={false}
                                    stroke="hsl(var(--muted-foreground))"
                                    strokeOpacity={0.06}
                                />
                                <XAxis dataKey="timestamp" hide />
                                <YAxis hide />
                                <Tooltip
                                    cursor={{ fill: 'hsl(var(--muted-foreground))', fillOpacity: 0.04 }}
                                    content={<ChartTooltipContent />}
                                />
                                {series.map(s => (
                                    <Bar key={s.key} dataKey={s.key} name={s.label} fill={`url(#fill-${gradientId}-${s.key})`} radius={[3, 3, 0, 0]} maxBarSize={16} />
                                ))}
                            </BarChart>
                        ) : (
                            <AreaChart data={chartData} margin={{ top: 2, right: 12, bottom: 0, left: 12 }}>
                                <defs>
                                    {series.map(s => (
                                        <linearGradient key={s.key} id={`grad-${gradientId}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={s.color} stopOpacity={0.25} />
                                            <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                                        </linearGradient>
                                    ))}
                                </defs>
                                <CartesianGrid
                                    horizontal vertical={false}
                                    stroke="hsl(var(--muted-foreground))"
                                    strokeOpacity={0.06}
                                />
                                <XAxis dataKey="timestamp" hide />
                                <YAxis hide />
                                <Tooltip
                                    cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1, strokeOpacity: 0.3 }}
                                    content={<ChartTooltipContent />}
                                />
                                {series.map(s => (
                                    <Area
                                        key={s.key}
                                        type="monotone"
                                        dataKey={s.key}
                                        name={s.label}
                                        stroke={s.color}
                                        strokeWidth={1.5}
                                        fill={`url(#grad-${gradientId}-${s.key})`}
                                        dot={false}
                                        activeDot={{ r: 2.5, fill: s.color, strokeWidth: 0 }}
                                    />
                                ))}
                            </AreaChart>
                        )}
                    </ResponsiveContainer>
                ) : (
                    <div className="flex items-center justify-center" style={{ height: chartHeight }}>
                        <p className="text-[11px] text-muted-foreground/30">No data yet</p>
                    </div>
                )}
            </div>

            {/* Time range footer */}
            {hasData && (
                <div className="flex items-center justify-between px-4 pb-3 pt-1">
                    <span className="text-[10px] text-muted-foreground/40 tabular-nums">{start}</span>
                    <span className="text-[10px] text-muted-foreground/40 tabular-nums">{end}</span>
                </div>
            )}
        </div>
    );
}
