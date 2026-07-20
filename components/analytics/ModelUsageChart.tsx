'use client';

import { useState } from 'react';
import { Pie, PieChart, Cell, ResponsiveContainer } from 'recharts';
import {
    ChartConfig,
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart';

interface ModelUsageChartProps {
    data: Record<string, number>;
}

const COLORS = [
    'hsl(262, 83%, 58%)',
    'hsl(24, 96%, 53%)',
    'hsl(48, 96%, 53%)',
    'hsl(217, 91%, 60%)',
    'hsl(340, 82%, 52%)',
    'hsl(187, 84%, 42%)',
];

const chartConfig = {
    usage: {
        label: 'Requests',
    },
} satisfies ChartConfig;

export function ModelUsageChart({ data }: ModelUsageChartProps) {
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    const rankedModels = Object.entries(data)
        .filter(([, value]) => value > 0)
        .map(([name, value]) => ({
            name: name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            value,
        }))
        .sort((a, b) => b.value - a.value);

    const total = rankedModels.reduce((sum, item) => sum + item.value, 0);
    const leadingModels = rankedModels.slice(0, 5);
    const otherRequests = rankedModels.slice(5).reduce((sum, item) => sum + item.value, 0);
    const chartData = [
        ...leadingModels,
        ...(otherRequests > 0 ? [{ name: 'Other models', value: otherRequests }] : []),
    ].map((item, index) => ({
        ...item,
        fill: COLORS[index % COLORS.length],
    }));

    const activeItem = activeIndex === null ? null : chartData[activeIndex];

    if (total === 0) {
        return (
        <div className="bg-card p-4">
                <div className="mb-3">
                    <h3 className="text-xs font-medium">Model Usage</h3>
                    <p className="text-[10px] text-muted-foreground">Requests by model</p>
                </div>
                <div className="h-[180px] flex items-center justify-center">
                    <p className="text-xs text-muted-foreground">No data</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col bg-card p-4">
            <div className="mb-3">
                <h3 className="text-xs font-medium">Model usage</h3>
                <p className="text-[10px] text-muted-foreground">Requests by model</p>
            </div>

            <div className="relative h-[190px]">
                <ChartContainer config={chartConfig} className="h-full w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <ChartTooltip
                                content={
                                    <ChartTooltipContent
                                        formatter={(value, name) => (
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs">{name}</span>
                                                <span className="text-xs font-mono font-medium">
                                                    {value.toLocaleString()} ({((Number(value) / total) * 100).toFixed(1)}%)
                                                </span>
                                            </div>
                                        )}
                                    />
                                }
                            />
                            <Pie
                                data={chartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={51}
                                outerRadius={78}
                                paddingAngle={2}
                                cornerRadius={3}
                                dataKey="value"
                                nameKey="name"
                                onMouseEnter={(_, index) => setActiveIndex(index)}
                                onMouseLeave={() => setActiveIndex(null)}
                            >
                                {chartData.map((entry, index) => (
                                    <Cell
                                        key={entry.name}
                                        fill={entry.fill}
                                        strokeWidth={0}
                                        opacity={activeIndex === null || activeIndex === index ? 1 : 0.24}
                                        className="transition-opacity duration-200"
                                    />
                                ))}
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                </ChartContainer>

                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="max-w-24 text-center">
                        <p className="font-mono text-lg font-medium tracking-[-0.04em] tabular-nums">
                            {activeItem ? `${((activeItem.value / total) * 100).toFixed(0)}%` : total.toLocaleString()}
                        </p>
                        <p className="mt-0.5 truncate text-[9px] text-muted-foreground">
                            {activeItem?.name ?? `${rankedModels.length} model${rankedModels.length === 1 ? '' : 's'}`}
                        </p>
                    </div>
                </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1">
                {chartData.map((item, index) => (
                    <button
                        key={item.name}
                        type="button"
                        onMouseEnter={() => setActiveIndex(index)}
                        onMouseLeave={() => setActiveIndex(null)}
                        onFocus={() => setActiveIndex(index)}
                        onBlur={() => setActiveIndex(null)}
                        className="flex min-w-0 items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition-[border-color,background-color,opacity,transform] duration-200 hover:border-border/55 hover:bg-muted/25 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                        aria-label={`${item.name}: ${item.value.toLocaleString()} requests, ${((item.value / total) * 100).toFixed(1)} percent`}
                    >
                        <span
                            className="size-2 shrink-0 rounded-[2px]"
                            style={{ backgroundColor: item.fill }}
                        />
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-[10px] text-muted-foreground">{item.name}</span>
                            <span className="block font-mono text-[8px] tabular-nums text-muted-foreground/60">
                                {item.value.toLocaleString()} requests
                            </span>
                        </span>
                        <span className="font-mono text-[10px] tabular-nums">{((item.value / total) * 100).toFixed(0)}%</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
