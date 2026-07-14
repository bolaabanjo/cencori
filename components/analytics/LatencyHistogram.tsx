'use client';

import { cn } from '@/lib/utils';

interface LatencyHistogramProps {
    data: {
        p50: number;
        p75: number;
        p90: number;
        p95: number;
        p99: number;
    };
}

function formatLatency(ms: number): string {
    if (ms === 0) return '0ms';
    if (ms >= 10000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
    return `${Math.round(ms)}ms`;
}

export function LatencyHistogram({ data }: LatencyHistogramProps) {
    const percentiles = [
        { label: 'P50', value: data.p50, desc: 'Median' },
        { label: 'P75', value: data.p75, desc: '75th' },
        { label: 'P90', value: data.p90, desc: '90th' },
        { label: 'P95', value: data.p95, desc: '95th' },
        { label: 'P99', value: data.p99, desc: '99th' },
    ];

    const maxValue = Math.max(...percentiles.map(p => p.value), 1);
    const hasData = percentiles.some(p => p.value > 0);

    return (
        <div className="bg-card p-4">
            <div className="mb-3">
                <p className="text-xs font-medium text-muted-foreground">Latency Distribution</p>
                <p className="text-lg font-semibold tabular-nums tracking-tight mt-0.5">
                    {formatLatency(data.p50)}
                    <span className="text-xs font-normal text-muted-foreground/50 ml-1.5">median</span>
                </p>
            </div>

            {!hasData ? (
                <div className="py-6 text-center">
                    <p className="text-[11px] text-muted-foreground/30">No latency data</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {percentiles.map(p => {
                        const barWidth = maxValue > 0 ? (p.value / maxValue) * 100 : 0;
                        const isHigh = p.label === 'P99' || p.label === 'P95';
                        const isMid = p.label === 'P90' || p.label === 'P75';

                        return (
                            <div key={p.label}>
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] text-muted-foreground/60 font-mono w-7">{p.label}</span>
                                    <span className={cn(
                                        'text-xs font-medium tabular-nums font-mono',
                                        isHigh && p.value > 0 ? 'text-orange-400' : ''
                                    )}>
                                        {formatLatency(p.value)}
                                    </span>
                                </div>
                                <div className="h-1 rounded-full bg-secondary overflow-hidden">
                                    <div
                                        className={cn(
                                            'h-full rounded-full transition-all',
                                            isHigh ? 'bg-orange-500' : isMid ? 'bg-amber-500' : 'bg-emerald-500'
                                        )}
                                        style={{ width: `${barWidth}%`, opacity: 0.6 }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
