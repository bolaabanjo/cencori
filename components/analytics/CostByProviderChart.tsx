'use client';

import { cn } from '@/lib/utils';

interface CostByProviderChartProps {
    data: Record<string, number>;
}

const PROVIDER_COLORS: Record<string, string> = {
    openai: 'bg-emerald-500',
    anthropic: 'bg-orange-500',
    google: 'bg-blue-500',
    gemini: 'bg-blue-500',
    cohere: 'bg-purple-500',
    mistral: 'bg-pink-500',
    groq: 'bg-yellow-500',
    deepseek: 'bg-cyan-500',
    together: 'bg-indigo-500',
    perplexity: 'bg-teal-500',
    xai: 'bg-slate-400',
};

function formatCost(v: number): string {
    if (v === 0) return '$0';
    if (v < 0.001) return `$${v.toFixed(6)}`;
    if (v < 0.01) return `$${v.toFixed(4)}`;
    if (v < 1) return `$${v.toFixed(3)}`;
    return `$${v.toFixed(2)}`;
}

export function CostByProviderChart({ data }: CostByProviderChartProps) {
    const items = Object.entries(data)
        .map(([name, value]) => ({
            name: name.charAt(0).toUpperCase() + name.slice(1),
            key: name.toLowerCase(),
            value,
        }))
        .filter(item => item.value > 0)
        .sort((a, b) => b.value - a.value);

    const total = items.reduce((sum, item) => sum + item.value, 0);
    const maxValue = items[0]?.value || 0;

    return (
        <div className="bg-card p-4">
            <div className="mb-3">
                <p className="text-xs font-medium text-muted-foreground">Cost by Provider</p>
                <p className="text-lg font-semibold tabular-nums tracking-tight mt-0.5">
                    {formatCost(total)}
                </p>
            </div>

            {items.length === 0 ? (
                <div className="py-6 text-center">
                    <p className="text-[11px] text-muted-foreground/30">No spend data</p>
                </div>
            ) : (
                <div className="space-y-2.5">
                    {items.map(item => {
                        const pct = total > 0 ? (item.value / total) * 100 : 0;
                        const barWidth = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
                        const colorClass = PROVIDER_COLORS[item.key] || 'bg-muted-foreground/50';

                        return (
                            <div key={item.key}>
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1.5">
                                        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', colorClass)} />
                                        <span className="text-xs">{item.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-muted-foreground/50 tabular-nums">
                                            {pct.toFixed(0)}%
                                        </span>
                                        <span className="text-xs font-medium tabular-nums font-mono">
                                            {formatCost(item.value)}
                                        </span>
                                    </div>
                                </div>
                                <div className="h-1 rounded-full bg-secondary overflow-hidden">
                                    <div
                                        className={cn('h-full rounded-full transition-all', colorClass)}
                                        style={{ width: `${barWidth}%`, opacity: 0.7 }}
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
