'use client';

import { useId, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
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

export function formatAxisValue(val: number, format?: ChartSeries['format']): string {
    if (format === 'percentage') return `${Math.round(val)}%`;
    return formatValue(val, format);
}

export function getAxisTicks(maxValue: number, format?: ChartSeries['format']): number[] {
    if (format === 'percentage') return [0, 50, 100];
    if (!Number.isFinite(maxValue) || maxValue <= 0) return [0, 1, 2];

    const halfRange = maxValue / 2;
    const magnitude = 10 ** Math.floor(Math.log10(halfRange));
    const normalized = halfRange / magnitude;
    const niceMultiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    const middle = niceMultiplier * magnitude;

    return [0, middle, middle * 2];
}

function timestampToDate(value: string, now: Date) {
    if (/^\d{2}:\d{2}$/.test(value)) {
        const [hours, minutes] = value.split(':').map(Number);
        const date = new Date(now);
        date.setHours(hours, minutes, 0, 0);
        if (date.getTime() > now.getTime()) date.setDate(date.getDate() - 1);
        return date;
    }

    const normalized = value.includes(' ') ? value.replace(' ', 'T') : value;
    return new Date(normalized);
}

function formatRelativeTime(value: string, now: Date) {
    const date = timestampToDate(value, now);
    if (Number.isNaN(date.getTime())) return value;

    const diffMs = Math.max(0, now.getTime() - date.getTime());
    const diffMinutes = Math.max(1, Math.round(diffMs / 60_000));

    if (diffMinutes < 60) return `${diffMinutes}m ago`;

    const diffHours = Math.round(diffMs / 3_600_000);
    if (diffHours < 48) return `${diffHours}h ago`;

    return `${Math.round(diffMs / 86_400_000)}d ago`;
}

export function getTimeLabels(timestamps: string[]): { start: string; end: string } {
    if (timestamps.length === 0) return { start: '', end: 'Now' };

    const now = new Date();
    return {
        start: formatRelativeTime(timestamps[0], now),
        end: formatRelativeTime(timestamps[timestamps.length - 1], now),
    };
}

function formatTooltipLabel(value?: string) {
    if (!value) return 'Current period';
    if (/^\d{2}:\d{2}$/.test(value)) return value;

    const normalized = value.includes(' ') ? value.replace(' ', 'T') : value;
    const date = new Date(normalized);

    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function ChartTooltipContent({
    timestamp,
    row,
    series,
}: {
    timestamp: string;
    row: Record<string, string | number>;
    series: ChartSeries[];
}) {
    return (
        <div className="w-52 rounded-lg bg-white px-3.5 py-3 text-xs text-black shadow-[0_18px_48px_rgba(0,0,0,0.22)] ring-1 ring-black/10 dark:bg-[#1a1a1a] dark:text-white dark:ring-white/10">
            <p className="font-mono text-[10px] tabular-nums text-black/55 dark:text-white/55">{formatTooltipLabel(timestamp)}</p>
            <div className="mt-3 space-y-2">
                {series.map((item) => (
                    <div key={item.key} className="flex items-center gap-2.5">
                        <span className="size-2 shrink-0 rounded-[2px]" style={{ background: item.color }} />
                        <span className="text-black/55 dark:text-white/55">{item.label}</span>
                        <span className="ml-auto pl-5 font-mono font-medium tabular-nums">
                            {formatValue(Number(row[item.key] ?? 0), item.format)}
                        </span>
                    </div>
                ))}
            </div>
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
    const [hoveredPoint, setHoveredPoint] = useState<{ index: number; x: number; tooltipX: number } | null>(null);
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
    const maxValue = useMemo(
        () => Math.max(0, ...chartData.flatMap(row => series.map(item => Number(row[item.key] ?? 0)))),
        [chartData, series],
    );
    const axisTicks = useMemo(() => getAxisTicks(maxValue, primaryFormat), [maxValue, primaryFormat]);
    const hoveredRow = hoveredPoint ? chartData[hoveredPoint.index] : undefined;
    const hasData = chartData.length > 0 && chartData.some(d => {
        for (const s of series) {
            if ((d[s.key] as number) > 0) return true;
        }
        return false;
    });

    if (isLoading) {
        return <ObservabilityChartCardSkeleton className={className} />;
    }

    const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!chartData.length) return;

        const bounds = event.currentTarget.getBoundingClientRect();
        const plotLeft = 48;
        const plotRight = 12;
        const plotWidth = Math.max(1, bounds.width - plotLeft - plotRight);
        const plotX = Math.min(Math.max(event.clientX - bounds.left - plotLeft, 0), plotWidth);
        const index = chartData.length === 1
            ? 0
            : Math.round((plotX / plotWidth) * (chartData.length - 1));
        const crosshairX = plotLeft + (chartData.length === 1 ? plotWidth / 2 : (index / (chartData.length - 1)) * plotWidth);
        const tooltipWidth = 208;
        const tooltipX = crosshairX > bounds.width / 2
            ? Math.max(8, crosshairX - tooltipWidth - 12)
            : Math.min(bounds.width - tooltipWidth - 8, crosshairX + 12);

        setHoveredPoint({ index, x: crosshairX, tooltipX });
    };

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
            <div
                className="relative min-h-0 flex-1 touch-pan-y cursor-crosshair px-0"
                onPointerMove={handlePointerMove}
                onPointerLeave={() => setHoveredPoint(null)}
            >
                {hasData ? (
                    <>
                        <ResponsiveContainer width="100%" height={chartHeight}>
                            {type === 'bar' ? (
                                <BarChart data={chartData} margin={{ top: 2, right: 12, bottom: 0, left: 0 }} barCategoryGap="25%">
                                    <defs>
                                        {series.map(s => (
                                            <linearGradient key={s.key} id={`fill-${gradientId}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor={s.color} stopOpacity={0.85} />
                                                <stop offset="100%" stopColor={s.color} stopOpacity={0.35} />
                                            </linearGradient>
                                        ))}
                                    </defs>
                                    <CartesianGrid
                                        vertical={false}
                                        stroke="var(--muted-foreground)"
                                        strokeOpacity={0.1}
                                    />
                                    <XAxis dataKey="timestamp" hide />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        width={48}
                                        ticks={axisTicks}
                                        domain={[axisTicks[0], axisTicks[axisTicks.length - 1]]}
                                        allowDecimals={primaryFormat === 'currency' || primaryFormat === 'ms'}
                                        tick={{ fill: 'var(--muted-foreground)', fillOpacity: 0.68, fontSize: 10 }}
                                        tickFormatter={(value: number) => formatAxisValue(value, primaryFormat)}
                                    />
                                    {series.map(s => (
                                        <Bar key={s.key} dataKey={s.key} name={s.label} fill={`url(#fill-${gradientId}-${s.key})`} radius={[3, 3, 0, 0]} maxBarSize={16} />
                                    ))}
                                </BarChart>
                            ) : (
                                <AreaChart data={chartData} margin={{ top: 2, right: 12, bottom: 0, left: 0 }}>
                                    <defs>
                                        {series.map(s => (
                                            <linearGradient key={s.key} id={`grad-${gradientId}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor={s.color} stopOpacity={0.25} />
                                                <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                                            </linearGradient>
                                        ))}
                                    </defs>
                                    <CartesianGrid
                                        vertical={false}
                                        stroke="var(--muted-foreground)"
                                        strokeOpacity={0.1}
                                    />
                                    <XAxis dataKey="timestamp" hide />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        width={48}
                                        ticks={axisTicks}
                                        domain={[axisTicks[0], axisTicks[axisTicks.length - 1]]}
                                        allowDecimals={primaryFormat === 'currency' || primaryFormat === 'ms'}
                                        tick={{ fill: 'var(--muted-foreground)', fillOpacity: 0.68, fontSize: 10 }}
                                        tickFormatter={(value: number) => formatAxisValue(value, primaryFormat)}
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

                        {hoveredPoint && hoveredRow && (
                            <>
                                <div
                                    aria-hidden="true"
                                    className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-foreground/20"
                                    style={{ left: hoveredPoint.x }}
                                />
                                <div
                                    role="tooltip"
                                    className="pointer-events-none absolute top-2 z-20"
                                    style={{ left: hoveredPoint.tooltipX }}
                                >
                                    <ChartTooltipContent
                                        timestamp={String(hoveredRow.timestamp)}
                                        row={hoveredRow}
                                        series={series}
                                    />
                                </div>
                            </>
                        )}
                    </>
                ) : (
                    <div className="flex items-center justify-center" style={{ height: chartHeight }}>
                        <p className="text-[11px] text-muted-foreground/30">No data yet</p>
                    </div>
                )}
            </div>

            {/* Time range footer */}
            {hasData && (
                <div className="flex items-center justify-between pb-3 pl-12 pr-3 pt-1">
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground/65">{start}</span>
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground/65">{end}</span>
                </div>
            )}
        </div>
    );
}
