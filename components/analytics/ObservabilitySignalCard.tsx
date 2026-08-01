'use client';

import { useId, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import Link from 'next/link';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    XAxis,
    YAxis,
} from 'recharts';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    formatAxisValue,
    formatValue,
    getAxisTicks,
    getTimeLabels,
    type ChartSeries,
} from '@/components/analytics/ObservabilityChartCard';

type SignalChartType = 'area' | 'bar' | 'line';
type SignalCurve = 'monotone' | 'stepAfter';

interface ObservabilitySignalCardProps {
    title: string;
    description: string;
    series: ChartSeries[];
    href?: string;
    type?: SignalChartType;
    curve?: SignalCurve;
    height?: number;
    className?: string;
}

function formatTooltipTime(value: string) {
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

function SignalTooltip({
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
            <p className="font-mono text-[10px] tabular-nums text-black/55 dark:text-white/55">
                {formatTooltipTime(timestamp)}
            </p>
            <div className="mt-3 space-y-2">
                {series.map((item) => (
                    <div key={item.key} className="flex items-center gap-2.5">
                        <span className="size-2 rounded-[2px]" style={{ backgroundColor: item.color }} />
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

export function ObservabilitySignalCard({
    title,
    description,
    series,
    href,
    type = 'area',
    curve = 'monotone',
    height = 180,
    className,
}: ObservabilitySignalCardProps) {
    const gradientId = useId().replace(/:/g, '');
    const [hoveredPoint, setHoveredPoint] = useState<{ index: number; x: number; tooltipX: number } | null>(null);

    const chartData = useMemo(() => {
        const timestamps = [...new Set(series.flatMap((item) => item.data.map((point) => point.timestamp)))].sort();

        return timestamps.map((timestamp) => {
            const row: Record<string, string | number> = { timestamp };

            series.forEach((item) => {
                row[item.key] = item.data.find((point) => point.timestamp === timestamp)?.value ?? 0;
            });

            return row;
        });
    }, [series]);

    const primarySeries = series[0];
    const timestamps = useMemo(() => chartData.map(row => String(row.timestamp)), [chartData]);
    const { start, end } = useMemo(() => getTimeLabels(timestamps), [timestamps]);
    const maxValue = useMemo(
        () => Math.max(0, ...chartData.flatMap(row => series.map(item => Number(row[item.key] ?? 0)))),
        [chartData, series],
    );
    const axisTicks = useMemo(
        () => getAxisTicks(maxValue, primarySeries?.format),
        [maxValue, primarySeries?.format],
    );
    const hasData = chartData.some((row) => series.some((item) => Number(row[item.key]) > 0));
    const chartMargin = { top: 12, right: 18, bottom: 2, left: 0 };
    const axisColor = 'var(--muted-foreground)';
    const hoveredRow = hoveredPoint ? chartData[hoveredPoint.index] : undefined;

    const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!chartData.length) return;

        const bounds = event.currentTarget.getBoundingClientRect();
        const pointerX = event.clientX - bounds.left;
        const plotLeft = 56;
        const plotRight = 26;
        const plotWidth = Math.max(1, bounds.width - plotLeft - plotRight);
        const plotX = Math.min(Math.max(pointerX - plotLeft, 0), plotWidth);
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

    const commonAxes = (
        <>
            <CartesianGrid vertical={false} stroke={axisColor} strokeOpacity={0.09} />
            <XAxis dataKey="timestamp" hide />
            <YAxis
                axisLine={false}
                tickLine={false}
                width={48}
                ticks={axisTicks}
                domain={[axisTicks[0], axisTicks[axisTicks.length - 1]]}
                allowDecimals={primarySeries?.format === 'currency' || primarySeries?.format === 'ms'}
                tick={{ fill: axisColor, fillOpacity: 0.68, fontSize: 10 }}
                tickFormatter={(value: number) => formatAxisValue(value, primarySeries?.format)}
            />
        </>
    );

    return (
        <article
            className={cn(
                'group flex min-w-0 flex-col overflow-hidden rounded-lg bg-[#f3f3f1] ring-1 ring-inset ring-black/[0.045] transition-colors duration-200 dark:bg-[#111111] dark:ring-white/[0.035]',
                className,
            )}
        >
            <header className="border-b border-black/[0.055] px-5 pb-5 pt-5 dark:border-white/[0.045] sm:px-6 sm:pt-6">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        {href ? (
                            <Link href={href} className="inline-flex items-center gap-1.5 text-base font-medium tracking-[-0.025em]">
                                {title}
                                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                            </Link>
                        ) : (
                            <h3 className="text-base font-medium tracking-[-0.025em]">{title}</h3>
                        )}
                        <p className="mt-1.5 max-w-[60ch] text-xs leading-5 text-muted-foreground">{description}</p>
                    </div>

                    {primarySeries?.total !== undefined && (
                        <span className="shrink-0 font-mono text-3xl font-medium tracking-[-0.055em] tabular-nums">
                            {formatValue(primarySeries.total, primarySeries.format)}
                        </span>
                    )}
                </div>

                <div className="mt-5 flex min-h-4 flex-wrap items-center gap-x-4 gap-y-1">
                    {series.map((item) => (
                        <span key={item.key} className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span className="size-1.5 rounded-[2px]" style={{ backgroundColor: item.color }} />
                            {item.label}
                        </span>
                    ))}
                </div>
            </header>

            <div
                className="relative mt-auto touch-pan-y cursor-crosshair px-2 pb-3 pt-1"
                onPointerMove={handlePointerMove}
                onPointerLeave={() => setHoveredPoint(null)}
            >
                {hasData ? (
                    <>
                        <ResponsiveContainer width="100%" height={height}>
                            {type === 'bar' ? (
                                <BarChart data={chartData} margin={chartMargin} barCategoryGap="26%">
                                <defs>
                                    {series.map((item) => (
                                        <linearGradient key={item.key} id={`signal-bar-${gradientId}-${item.key}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={item.color} stopOpacity={0.9} />
                                            <stop offset="100%" stopColor={item.color} stopOpacity={0.42} />
                                        </linearGradient>
                                    ))}
                                </defs>
                                {commonAxes}
                                {series.map((item) => (
                                    <Bar
                                        key={item.key}
                                        dataKey={item.key}
                                        name={item.label}
                                        fill={`url(#signal-bar-${gradientId}-${item.key})`}
                                        maxBarSize={20}
                                        radius={[2, 2, 0, 0]}
                                    />
                                ))}
                                </BarChart>
                            ) : type === 'line' ? (
                                <LineChart data={chartData} margin={chartMargin}>
                                {commonAxes}
                                {series.map((item) => (
                                    <Line
                                        key={item.key}
                                        type={curve}
                                        dataKey={item.key}
                                        name={item.label}
                                        stroke={item.color}
                                        strokeWidth={1.6}
                                        dot={false}
                                        activeDot={{ r: 3, fill: item.color, strokeWidth: 0 }}
                                    />
                                ))}
                                </LineChart>
                            ) : (
                                <AreaChart data={chartData} margin={chartMargin}>
                                <defs>
                                    {series.map((item) => (
                                        <linearGradient key={item.key} id={`signal-area-${gradientId}-${item.key}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={item.color} stopOpacity={0.24} />
                                            <stop offset="70%" stopColor={item.color} stopOpacity={0.05} />
                                            <stop offset="100%" stopColor={item.color} stopOpacity={0} />
                                        </linearGradient>
                                    ))}
                                </defs>
                                {commonAxes}
                                {series.map((item) => (
                                    <Area
                                        key={item.key}
                                        type={curve}
                                        dataKey={item.key}
                                        name={item.label}
                                        stroke={item.color}
                                        strokeWidth={1.6}
                                        fill={`url(#signal-area-${gradientId}-${item.key})`}
                                        dot={false}
                                        activeDot={{ r: 3, fill: item.color, strokeWidth: 0 }}
                                    />
                                ))}
                                </AreaChart>
                            )}
                        </ResponsiveContainer>

                        <div className="flex items-center justify-between pb-0.5 pl-12 pr-[18px] pt-1">
                            <span className="font-mono text-[10px] tabular-nums text-muted-foreground/65">{start}</span>
                            <span className="font-mono text-[10px] tabular-nums text-muted-foreground/65">{end}</span>
                        </div>

                        {hoveredPoint && hoveredRow && (
                            <>
                                <div
                                    aria-hidden="true"
                                    className="pointer-events-none absolute bottom-8 top-3 z-10 w-px bg-foreground/20"
                                    style={{ left: hoveredPoint.x }}
                                />
                                <div
                                    role="tooltip"
                                    className="pointer-events-none absolute top-3 z-20"
                                    style={{ left: hoveredPoint.tooltipX }}
                                >
                                    <SignalTooltip
                                        timestamp={String(hoveredRow.timestamp)}
                                        row={hoveredRow}
                                        series={series}
                                    />
                                </div>
                            </>
                        )}
                    </>
                ) : (
                    <div className="flex items-center justify-center" style={{ height }}>
                        <p className="text-[11px] text-muted-foreground/55">No activity in this period</p>
                    </div>
                )}
            </div>
        </article>
    );
}
