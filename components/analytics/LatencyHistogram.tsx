'use client';

import { useMemo, useState } from 'react';
import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';

interface LatencyHistogramProps {
    data: {
        p50: number;
        p75: number;
        p90: number;
        p95: number;
        p99: number;
    };
    history: Array<{
        timestamp: string;
        samples: number;
        p50: number | null;
        p75: number | null;
        p90: number | null;
        p95: number | null;
        p99: number | null;
    }>;
    timeRange: string;
}

type PercentileKey = 'p50' | 'p75' | 'p90' | 'p95' | 'p99';

interface TooltipEntry {
    color?: string;
    dataKey?: string | number;
    name?: string;
    value?: number;
    payload?: {
        timestamp: string;
        samples: number;
    };
}

interface LatencyTooltipProps {
    active?: boolean;
    label?: string;
    payload?: TooltipEntry[];
}

const PERCENTILES: Array<{ key: PercentileKey; label: string; color: string }> = [
    { key: 'p50', label: 'P50', color: 'hsl(153, 72%, 45%)' },
    { key: 'p75', label: 'P75', color: 'hsl(187, 70%, 48%)' },
    { key: 'p90', label: 'P90', color: 'hsl(45, 92%, 51%)' },
    { key: 'p95', label: 'P95', color: 'hsl(24, 88%, 54%)' },
    { key: 'p99', label: 'P99', color: 'hsl(356, 80%, 58%)' },
];

const RANGE_LABELS: Record<string, string> = {
    '1h': 'the last hour',
    '24h': 'the last 24 hours',
    '7d': 'the last 7 days',
    '30d': 'the last 30 days',
    '90d': 'the last 90 days',
    all: 'all retained history',
};

function formatLatency(ms: number): string {
    if (ms === 0) return '0ms';
    if (ms >= 10000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
    return `${Math.round(ms)}ms`;
}

function formatTimestamp(value: string): string {
    if (/^\d{2}:\d{2}$/.test(value)) return value;

    const normalized = value.includes(' ') ? value.replace(' ', 'T') : value;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return value;

    if (value.includes(' ')) {
        return date.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
        });
    }

    return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
    });
}

function LatencyTooltip({ active, label, payload }: LatencyTooltipProps) {
    if (!active || !payload?.length) return null;

    const samples = payload[0]?.payload?.samples ?? 0;
    const hasSamples = samples > 0;

    return (
        <div className="min-w-44 rounded-lg border border-border/70 bg-popover/95 px-3 py-2.5 text-xs shadow-2xl backdrop-blur-xl">
            <div className="mb-2 flex items-center justify-between gap-4">
                <span className="text-[10px] text-muted-foreground">{label ? formatTimestamp(label) : 'Current bucket'}</span>
                <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
                    {hasSamples ? `${samples.toLocaleString()} sample${samples === 1 ? '' : 's'}` : 'No requests'}
                </span>
            </div>
            <div className="space-y-1.5">
                {payload.map(entry => (
                    <div key={String(entry.dataKey)} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
                        <span className="text-muted-foreground">{entry.name}</span>
                        <span className="ml-auto pl-4 font-mono font-medium tabular-nums">
                            {hasSamples ? formatLatency(entry.value ?? 0) : '—'}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function LatencyHistogram({ data, history, timeRange }: LatencyHistogramProps) {
    const [hiddenSeries, setHiddenSeries] = useState<Set<PercentileKey>>(() => new Set());
    const axisColor = 'hsl(var(--muted-foreground))';
    const periodLabel = RANGE_LABELS[timeRange] ?? 'the selected period';

    const chartData = useMemo(() => history.map(point => ({
        ...point,
        p50: point.p50 ?? 0,
        p75: point.p75 ?? 0,
        p90: point.p90 ?? 0,
        p95: point.p95 ?? 0,
        p99: point.p99 ?? 0,
    })), [history]);

    const hasData = chartData.some(point => point.samples > 0);
    const tailMultiple = data.p50 > 0 ? data.p99 / data.p50 : 0;

    const toggleSeries = (key: PercentileKey) => {
        setHiddenSeries(current => {
            const next = new Set(current);
            if (next.has(key)) {
                next.delete(key);
                return next;
            }

            if (next.size < PERCENTILES.length - 1) {
                next.add(key);
            }
            return next;
        });
    };

    return (
        <section className="flex h-full min-h-[360px] flex-col bg-transparent" aria-labelledby="latency-profile-heading">
            <header className="flex items-start justify-between gap-4 px-4 pb-1 pt-4">
                <div>
                    <h3 id="latency-profile-heading" className="text-xs font-medium">Latency percentiles</h3>
                    <p className="mt-1 text-[10px] text-muted-foreground">Tail movement across {periodLabel}</p>
                </div>
                <div className="text-right">
                    <p className="font-mono text-xl font-medium tracking-[-0.04em] tabular-nums">{formatLatency(data.p50)}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">median</p>
                </div>
            </header>

            <div className="grid w-full grid-cols-5 px-2 pb-1 pt-3" aria-label="Latency percentile series">
                {PERCENTILES.map(percentile => {
                    const isVisible = !hiddenSeries.has(percentile.key);

                    return (
                        <button
                            key={percentile.key}
                            type="button"
                            aria-pressed={isVisible}
                            onClick={() => toggleSeries(percentile.key)}
                            title={`${isVisible ? 'Hide' : 'Show'} ${percentile.label}`}
                            className={cn(
                                'group flex min-h-7 items-center justify-center gap-1.5 rounded-sm px-1 text-[9px] transition-[background-color,opacity,transform] duration-200 hover:bg-muted/30 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                                isVisible ? 'opacity-100' : 'opacity-35',
                            )}
                        >
                            <span
                                aria-hidden="true"
                                className="flex size-2.5 shrink-0 items-center justify-center rounded-[2px] border transition-colors duration-200"
                                style={{
                                    borderColor: percentile.color,
                                    backgroundColor: isVisible ? percentile.color : 'transparent',
                                }}
                            >
                                <svg
                                    viewBox="0 0 10 10"
                                    className={cn('size-2 text-black transition-opacity duration-200', isVisible ? 'opacity-100' : 'opacity-0')}
                                    fill="none"
                                >
                                    <path d="M2 5.2 4.1 7.1 8 2.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </span>
                            <span className="text-muted-foreground">{percentile.label}</span>
                        </button>
                    );
                })}
            </div>

            {!hasData ? (
                <div className="flex flex-1 items-center justify-center px-4 py-8">
                    <p className="text-[11px] text-muted-foreground/55">No latency in this period</p>
                </div>
            ) : (
                <div className="h-[220px] w-full shrink-0 pb-2 pt-1">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 12, right: 8, bottom: 0, left: 8 }}>
                            <CartesianGrid vertical={false} stroke={axisColor} strokeOpacity={0.09} />
                            <XAxis
                                dataKey="timestamp"
                                axisLine={false}
                                tickLine={false}
                                minTickGap={22}
                                scale="point"
                                padding={{ left: 0, right: 0 }}
                                tick={{ fill: axisColor, fillOpacity: 0.58, fontSize: 9 }}
                                tickFormatter={formatTimestamp}
                            />
                            <YAxis
                                hide
                                axisLine={false}
                                tickLine={false}
                                width={0}
                                tickFormatter={(value: number) => formatLatency(value)}
                            />
                            <Tooltip
                                cursor={{ stroke: axisColor, strokeOpacity: 0.35, strokeWidth: 1 }}
                                content={<LatencyTooltip />}
                            />
                            {PERCENTILES.map(percentile => (
                                <Line
                                    key={percentile.key}
                                    type="stepAfter"
                                    dataKey={percentile.key}
                                    name={percentile.label}
                                    stroke={percentile.color}
                                    strokeWidth={1.6}
                                    dot={false}
                                    activeDot={{ r: 3, fill: percentile.color, strokeWidth: 0 }}
                                    connectNulls={false}
                                    hide={hiddenSeries.has(percentile.key)}
                                    isAnimationActive
                                    animationDuration={450}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}

            <div className="grid grid-cols-5 border-t border-border/40">
                {PERCENTILES.map(percentile => (
                    <div
                        key={percentile.key}
                        className="border-border/40 px-2 py-2.5 text-center transition-colors duration-200 not-last:border-r hover:bg-muted/30"
                    >
                        <p className="text-[9px] font-medium text-muted-foreground">{percentile.label}</p>
                        <p className="mt-1 font-mono text-[10px] font-medium tabular-nums">{formatLatency(data[percentile.key])}</p>
                    </div>
                ))}
            </div>

            <footer className="flex items-center justify-between border-t border-border/40 px-4 py-2 text-[9px] text-muted-foreground">
                <span>P99 tail versus median</span>
                <span className="font-mono tabular-nums">{tailMultiple.toFixed(1)}×</span>
            </footer>
        </section>
    );
}
