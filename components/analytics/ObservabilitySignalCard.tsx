'use client';

import { useId, useMemo } from 'react';
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
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatValue, type ChartSeries } from '@/components/analytics/ObservabilityChartCard';

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

interface TooltipEntry {
    color?: string;
    dataKey?: string | number;
    name?: string;
    value?: number;
}

function formatTimeTick(value: string) {
    if (/^\d{2}:\d{2}$/.test(value)) return value;

    const normalized = value.includes(' ') ? value.replace(' ', 'T') : value;
    const date = new Date(normalized);

    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
    });
}

function SignalTooltip({
    active,
    label,
    payload,
    series,
}: {
    active?: boolean;
    label?: string;
    payload?: TooltipEntry[];
    series: ChartSeries[];
}) {
    if (!active || !payload?.length) return null;

    return (
        <div className="min-w-40 rounded-lg border border-border/70 bg-popover/95 px-3 py-2.5 text-xs shadow-2xl backdrop-blur-xl">
            <p className="mb-2 text-[10px] text-muted-foreground">{label ? formatTimeTick(label) : 'Current period'}</p>
            <div className="space-y-1.5">
                {payload.map((entry) => {
                    const key = String(entry.dataKey ?? '');
                    const definition = series.find((item) => item.key === key);
                    const value = entry.value ?? 0;

                    return (
                        <div key={key} className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
                            <span className="text-muted-foreground">{entry.name}</span>
                            <span className="ml-auto pl-4 font-mono font-medium tabular-nums text-foreground">
                                {formatValue(value, definition?.format)}
                            </span>
                        </div>
                    );
                })}
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
    const hasData = chartData.some((row) => series.some((item) => Number(row[item.key]) > 0));
    const chartMargin = { top: 12, right: 18, bottom: 2, left: 0 };
    const axisColor = 'hsl(var(--muted-foreground))';

    const commonAxes = (
        <>
            <CartesianGrid vertical={false} stroke={axisColor} strokeOpacity={0.09} />
            <XAxis
                dataKey="timestamp"
                axisLine={false}
                tickLine={false}
                minTickGap={28}
                tick={{ fill: axisColor, fillOpacity: 0.55, fontSize: 10 }}
                tickFormatter={formatTimeTick}
            />
            <YAxis
                axisLine={false}
                tickLine={false}
                width={46}
                tick={{ fill: axisColor, fillOpacity: 0.55, fontSize: 10 }}
                tickFormatter={(value: number) => formatValue(value, primarySeries?.format)}
            />
            <Tooltip
                cursor={{ stroke: axisColor, strokeOpacity: 0.35, strokeWidth: 1 }}
                content={<SignalTooltip series={series} />}
            />
        </>
    );

    return (
        <article
            className={cn(
                'group flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/55 bg-card transition-[border-color,background-color,transform] duration-200 hover:-translate-y-px hover:border-foreground/15',
                className,
            )}
        >
            <header className="px-5 pb-1 pt-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        {href ? (
                            <Link href={href} className="inline-flex items-center gap-1.5 text-sm font-medium tracking-[-0.01em]">
                                {title}
                                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                            </Link>
                        ) : (
                            <h3 className="text-sm font-medium tracking-[-0.01em]">{title}</h3>
                        )}
                        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{description}</p>
                    </div>

                    {primarySeries?.total !== undefined && (
                        <span className="shrink-0 font-mono text-2xl font-medium tracking-[-0.04em] tabular-nums">
                            {formatValue(primarySeries.total, primarySeries.format)}
                        </span>
                    )}
                </div>

                <div className="mt-4 flex min-h-4 flex-wrap items-center gap-x-4 gap-y-1">
                    {series.map((item) => (
                        <span key={item.key} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                            {item.label}
                        </span>
                    ))}
                </div>
            </header>

            <div className="mt-auto px-2 pb-3 pt-1">
                {hasData ? (
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
                ) : (
                    <div className="flex items-center justify-center" style={{ height }}>
                        <p className="text-[11px] text-muted-foreground/55">No activity in this period</p>
                    </div>
                )}
            </div>
        </article>
    );
}
