'use client';

import { useEffect, useState } from 'react';
import { Bar, BarChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig } from '@/components/ui/chart';

interface LogsBarChartProps {
    projectId?: string;
    timeRange: string;
    environment?: 'production' | 'test';
    source?: 'ai' | 'http' | 'api' | 'web';
}

interface LogBucket {
    timestamp: string;
    success: number;
    error: number;
    filtered: number;
    total: number;
}

const chartConfig = {
    success: { label: 'Success', color: 'hsl(142 76% 36%)' },
    error: { label: 'Error', color: 'hsl(0 84% 60%)' },
    filtered: { label: 'Filtered', color: 'hsl(24 80% 50%)' },
} satisfies ChartConfig;

export function LogsBarChart({
    projectId,
    timeRange,
    environment,
    source = 'ai',
}: LogsBarChartProps) {
    const [data, setData] = useState<LogBucket[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!projectId) {
            setLoading(true);
            setData([]);
            return;
        }
        const fetchData = async () => {
            setLoading(true);
            try {
                const params = new URLSearchParams({ time_range: timeRange });
                if ((source === 'ai' || source === 'http' || source === 'api') && environment) {
                    params.set('environment', environment);
                }

                const endpoint =
                    source === 'ai'
                        ? `/api/projects/${projectId}/analytics/trends`
                        : source === 'http'
                            ? `/api/projects/${projectId}/logs/http/timeline`
                        : source === 'api'
                            ? `/api/projects/${projectId}/logs/gateway/timeline`
                            : `/api/projects/${projectId}/logs/web/timeline`;

                const res = await fetch(`${endpoint}?${params.toString()}`);
                if (!res.ok) return;
                const json = await res.json();
                setData(json.trends || []);
            } catch (error) {
                console.error('Failed to fetch chart data:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [projectId, timeRange, environment, source]);

    if (loading || data.length === 0) {
        return null;
    }

    // Format x-axis timestamp
    const formatXAxis = (timestamp: string) => {
        // For 10-minute intervals (format: "HH:MM")
        if (timestamp.match(/^\d{2}:\d{2}$/)) {
            return timestamp;
        }
        // For hourly (format: "YYYY-MM-DD HH:00")
        if (timestamp.includes(' ')) {
            const [datePart, timePart] = timestamp.split(' ');
            const date = new Date(datePart);
            const hours = parseInt(timePart.split(':')[0]);
            const period = hours >= 12 ? 'pm' : 'am';
            const hour12 = hours % 12 || 12;
            return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${hour12}${period}`;
        }
        // For daily (format: "YYYY-MM-DD")
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return timestamp;
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    // Transform data for stacked bar
    const chartData = data.map(d => ({
        timestamp: formatXAxis(d.timestamp),
        success: d.success || 0,
        error: d.error || 0,
        filtered: d.filtered || 0,
    }));

    return (
        <div className="mb-4 bg-card rounded-md border border-border/40 p-3">
            <div className="h-14">
                <ChartContainer config={chartConfig} className="h-full w-full">
                    <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                        <XAxis
                            dataKey="timestamp"
                            hide
                        />
                        <YAxis hide />
                        <ChartTooltip
                            cursor={{ fill: 'hsl(var(--muted)/0.3)' }}
                            content={<ChartTooltipContent />}
                        />
                        <Bar dataKey="success" stackId="a" fill="var(--color-success)" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="filtered" stackId="a" fill="var(--color-filtered)" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="error" stackId="a" fill="var(--color-error)" radius={[2, 2, 0, 0]} />
                    </BarChart>
                </ChartContainer>
            </div>
            {/* Date labels */}
            <div className="flex justify-between mt-2 text-[10px] font-mono text-muted-foreground">
                <span>{chartData[0]?.timestamp}</span>
                <span>{chartData[chartData.length - 1]?.timestamp}</span>
            </div>
        </div>
    );
}
