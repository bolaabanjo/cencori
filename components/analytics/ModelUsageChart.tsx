'use client';

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
    'hsl(217, 91%, 60%)',  // Blue
    'hsl(142, 71%, 45%)',  // Green
    'hsl(262, 83%, 58%)',  // Purple
    'hsl(24, 96%, 53%)',   // Orange
    'hsl(340, 82%, 52%)',  // Pink
    'hsl(48, 96%, 53%)',   // Yellow
    'hsl(187, 100%, 42%)', // Cyan
    'hsl(0, 84%, 60%)',    // Red
];

const chartConfig = {
    usage: {
        label: 'Requests',
    },
} satisfies ChartConfig;

export function ModelUsageChart({ data }: ModelUsageChartProps) {
    const chartData = Object.entries(data)
        .map(([name, value], index) => ({
            name: name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            value,
            fill: COLORS[index % COLORS.length],
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8); // Top 8 models

    const total = chartData.reduce((sum, item) => sum + item.value, 0);

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
        <div className="bg-card p-4">
            <div className="mb-3">
                <h3 className="text-xs font-medium">Model Usage</h3>
                <p className="text-[10px] text-muted-foreground">Requests by model</p>
            </div>

            <div className="h-[180px]">
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
                                innerRadius={45}
                                outerRadius={70}
                                paddingAngle={2}
                                dataKey="value"
                                nameKey="name"
                            >
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.fill} strokeWidth={0} />
                                ))}
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                </ChartContainer>
            </div>

            {/* Legend */}
            <div className="mt-3 grid grid-cols-2 gap-1.5">
                {chartData.slice(0, 6).map((item, index) => (
                    <div key={index} className="flex items-center gap-1.5 text-[10px]">
                        <div
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: item.fill }}
                        />
                        <span className="text-muted-foreground truncate">{item.name}</span>
                        <span className="font-mono ml-auto">{((item.value / total) * 100).toFixed(0)}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
