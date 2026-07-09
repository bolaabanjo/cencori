'use client';

import { useMemo, useState, use } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { ModelUsageChart } from '@/components/analytics/ModelUsageChart';
import { CostByProviderChart } from '@/components/analytics/CostByProviderChart';
import { LatencyHistogram } from '@/components/analytics/LatencyHistogram';
import { FailoverMetrics } from '@/components/analytics/FailoverMetrics';
import { ObservabilityChartCard, ObservabilityChartCardSkeleton } from '@/components/analytics/ObservabilityChartCard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
    ChartBarIcon,
    CurrencyDollarIcon,
    ClockIcon,
    BoltIcon,
    ShieldExclamationIcon,
} from '@heroicons/react/24/outline';
import { ArrowRight } from 'lucide-react';
import { useEnvironment } from '@/lib/contexts/EnvironmentContext';
import { Skeleton } from '@/components/ui/skeleton';
import { queryKeys } from '@/lib/hooks/useQueries';
import { ExportDialog } from '@/components/dashboard/ExportDialog';
import { IntelligencePanel } from '@/components/analytics/intelligence/IntelligencePanel';
import { cn } from '@/lib/utils';
import { fetchJsonWithFeatureGate, isFeatureGateError } from '@/lib/feature-gate-client';
import { FeatureUpgradeWall } from '@/components/billing/FeatureUpgradeWall';

interface TrendData {
    timestamp: string;
    total: number;
    success: number;
    filtered: number;
    blocked_output: number;
    error: number;
    cost: number;
    tokens: number;
    avg_latency: number;
}

interface HttpTrendData {
    timestamp: string;
    total: number;
    success: number;
    filtered: number;
    error: number;
}

interface OverviewData {
    overview: {
        total_requests: number;
        success_rate: number;
        total_cost: number;
        avg_latency: number;
        total_tokens: number;
        total_incidents: number;
        critical_incidents: number;
    };
    breakdown: {
        model_usage: Record<string, number>;
        incidents_by_severity: {
            critical: number;
            high: number;
            medium: number;
            low: number;
        };
        cost_by_provider: Record<string, number>;
        requests_by_provider: Record<string, number>;
        latency_percentiles: {
            p50: number;
            p75: number;
            p90: number;
            p95: number;
            p99: number;
        };
        requests_by_country: Record<string, number>;
    };
}

interface PageProps {
    params: Promise<{
        orgSlug: string;
        projectSlug: string;
    }>;
}

type ObservabilitySection = 'overview' | 'ai' | 'http' | 'reliability' | 'security' | 'intelligence';

type HttpMetricKey = 'total' | 'success' | 'filtered' | 'error';

interface SectionDefinition {
    id: ObservabilitySection;
    label: string;
}

const sections: SectionDefinition[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'ai', label: 'AI' },
    { id: 'http', label: 'HTTP' },
    { id: 'reliability', label: 'Reliability' },
    { id: 'security', label: 'Security' },
    { id: 'intelligence', label: 'Intelligence' },
];

function isObservabilitySection(value: string | null): value is ObservabilitySection {
    return value === 'overview'
        || value === 'ai'
        || value === 'http'
        || value === 'reliability'
        || value === 'security'
        || value === 'intelligence';
}

function useProjectId(orgSlug: string, projectSlug: string) {
    return useQuery({
        queryKey: ['projectId', orgSlug, projectSlug],
        queryFn: async () => {
            const { data: orgData } = await supabase
                .from('organizations')
                .select('id')
                .eq('slug', orgSlug)
                .single();

            if (!orgData) throw new Error('Organization not found');

            const { data: projectData } = await supabase
                .from('projects')
                .select('id')
                .eq('slug', projectSlug)
                .eq('organization_id', orgData.id)
                .single();

            if (!projectData) throw new Error('Project not found');
            return projectData.id;
        },
        staleTime: 5 * 60 * 1000,
    });
}

function formatTimestamp(timestamp: string): string {
    if (timestamp.match(/^\d{2}:\d{2}$/)) {
        const [hours, minutes] = timestamp.split(':').map(Number);
        const period = hours >= 12 ? 'pm' : 'am';
        const hour12 = hours % 12 || 12;
        const now = new Date();
        const month = now.toLocaleDateString(undefined, { month: 'short' });
        const day = now.getDate();
        return `${month} ${day}, ${hour12}:${minutes.toString().padStart(2, '0')}${period}`;
    }

    if (timestamp.includes(' ')) {
        const [datePart, timePart] = timestamp.split(' ');
        const date = new Date(datePart);
        const hours = Number.parseInt(timePart.split(':')[0], 10);
        const period = hours >= 12 ? 'pm' : 'am';
        const hour12 = hours % 12 || 12;
        return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${hour12}:00${period}`;
    }

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return timestamp;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function summarizeHttpTrends(trends: HttpTrendData[]) {
    const totals = trends.reduce(
        (acc, point) => {
            acc.total += point.total || 0;
            acc.success += point.success || 0;
            acc.filtered += point.filtered || 0;
            acc.error += point.error || 0;
            return acc;
        },
        { total: 0, success: 0, filtered: 0, error: 0 }
    );

    const successRate = totals.total > 0 ? Math.round((totals.success / totals.total) * 100) : 0;
    const errorRate = totals.total > 0 ? Math.round((totals.error / totals.total) * 100) : 0;

    return {
        ...totals,
        successRate,
        errorRate,
    };
}

function getLastUpdateTime<T extends { timestamp: string }>(
    points: T[],
    hasData: (point: T) => boolean
): string | undefined {
    if (points.length === 0) return undefined;
    const lastWithData = [...points].reverse().find(hasData);
    return lastWithData ? formatTimestamp(lastWithData.timestamp) : undefined;
}

function toHttpMetricSeries(
    trends: HttpTrendData[],
    key: HttpMetricKey
): Array<{ label: string; value: number }> {
    return trends.map((trend) => ({
        label: formatTimestamp(trend.timestamp),
        value: trend[key] || 0,
    }));
}

export default function ObservabilityPage({ params }: PageProps) {
    const { orgSlug, projectSlug } = use(params);
    const { environment } = useEnvironment();
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const [timeRange, setTimeRange] = useState('7d');

    const rawSectionParam = searchParams.get('section');
    const normalizedSectionParam = rawSectionParam === 'api' || rawSectionParam === 'web'
        ? 'http'
        : rawSectionParam;
    const section: ObservabilitySection = isObservabilitySection(normalizedSectionParam)
        ? normalizedSectionParam
        : 'overview';

    const setSection = (nextSection: ObservabilitySection) => {
        const nextParams = new URLSearchParams(searchParams.toString());

        if (nextSection === 'overview') {
            nextParams.delete('section');
        } else {
            nextParams.set('section', nextSection);
        }

        const queryString = nextParams.toString();
        router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    };

    const { data: projectId, isLoading: projectLoading } = useProjectId(orgSlug, projectSlug);

    const { data: overview, isLoading: overviewLoading, error: overviewError } = useQuery<OverviewData>({
        queryKey: queryKeys.analytics(projectId || '', timeRange),
        queryFn: () => fetchJsonWithFeatureGate<OverviewData>(
            `/api/projects/${projectId}/analytics/overview?time_range=${timeRange}&environment=${environment}`
        ),
        enabled: !!projectId,
        staleTime: 30 * 1000,
        retry: (failureCount, error) => !isFeatureGateError(error) && failureCount < 1,
    });

    const { data: trendsData } = useQuery<{ trends: TrendData[]; group_by: 'hour' | 'day' }>({
        queryKey: ['trends', projectId, timeRange, environment],
        queryFn: () => fetchJsonWithFeatureGate<{ trends: TrendData[]; group_by: 'hour' | 'day' }>(
            `/api/projects/${projectId}/analytics/trends?time_range=${timeRange}&environment=${environment}`
        ),
        enabled: !!projectId,
        staleTime: 30 * 1000,
        retry: (failureCount, error) => !isFeatureGateError(error) && failureCount < 1,
    });

    const { data: httpTrendsData } = useQuery<{ trends: HttpTrendData[] }>({
        queryKey: ['gatewayTimeline', 'http', projectId, timeRange, environment],
        queryFn: async () => {
            const res = await fetch(`/api/projects/${projectId}/logs/http/timeline?time_range=${timeRange}&environment=${environment}`);
            if (!res.ok) throw new Error('Failed to fetch HTTP traffic timeline');
            return res.json();
        },
        enabled: !!projectId,
        staleTime: 30 * 1000,
    });

    const trends = useMemo(() => trendsData?.trends || [], [trendsData?.trends]);
    const groupBy: 'hour' | 'day' = trendsData?.group_by || 'day';

    const httpTrends = useMemo(
        () => httpTrendsData?.trends || [],
        [httpTrendsData?.trends]
    );

    const httpSummary = useMemo(
        () => summarizeHttpTrends(httpTrends),
        [httpTrends]
    );

    const aiLastUpdate = getLastUpdateTime(trends, (point) => point.total > 0);
    const httpLastUpdate = getLastUpdateTime(httpTrends, (point) => point.total > 0);

    if (projectLoading) {
        return (
            <div className="w-full max-w-[1360px] mx-auto px-6 py-8">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <Skeleton className="h-5 w-28" />
                        <Skeleton className="h-3 w-52 mt-1" />
                    </div>
                    <Skeleton className="h-8 w-32" />
                </div>
                <div className="lg:grid lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-6">
                    <div className="mb-4 lg:mb-0 space-y-0.5">
                        {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-8 w-full max-w-[180px] rounded-lg" />)}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {[1, 2, 3, 4, 5].map(i => (
                            <ObservabilityChartCardSkeleton key={i} />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (!projectId) {
        return (
            <div className="w-full max-w-6xl mx-auto px-6 py-8">
                <div className="text-center py-16 flex flex-col items-center">
                    <div className="w-10 h-10 rounded-md bg-secondary flex items-center justify-center mb-3">
                        <ChartBarIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">Project not found</p>
                </div>
            </div>
        );
    }

    if (isFeatureGateError(overviewError)) {
        return (
            <div className="w-full max-w-6xl mx-auto px-6 py-8">
                <FeatureUpgradeWall
                    orgSlug={orgSlug}
                    feature="Analytics dashboard"
                    message={overviewError.message}
                />
            </div>
        );
    }

    const emptyOverall = !overview || (
        overview.overview.total_requests === 0
        && httpSummary.total === 0
    );

    return (
        <div className="w-full max-w-[1360px] mx-auto px-6 py-8">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-base font-medium">Observability</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">Real-time observability across AI and HTTP traffic</p>
                </div>
                <div className="flex items-center gap-2">
                    <ExportDialog projectId={projectId} type="analytics" environment={environment} />
                    <Select value={timeRange} onValueChange={setTimeRange}>
                        <SelectTrigger className="w-[130px] h-8 text-xs">
                            <SelectValue placeholder="Period" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1h" className="text-xs">Last Hour</SelectItem>
                            <SelectItem value="24h" className="text-xs">24 Hours</SelectItem>
                            <SelectItem value="7d" className="text-xs">7 Days</SelectItem>
                            <SelectItem value="30d" className="text-xs">30 Days</SelectItem>
                            <SelectItem value="90d" className="text-xs">90 Days</SelectItem>
                            <SelectItem value="all" className="text-xs">All Time</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="lg:grid lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-6">
                <aside className="mb-4 lg:mb-0">
                    <nav className="flex lg:flex-col gap-0.5 overflow-x-auto lg:overflow-visible">
                        {sections.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setSection(item.id)}
                                className={cn(
                                    'h-8 px-2.5 rounded-lg text-xs text-left transition-all whitespace-nowrap',
                                    section === item.id
                                        ? 'bg-secondary text-foreground font-medium'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                                )}
                            >
                                {item.label}
                            </button>
                        ))}
                    </nav>
                </aside>

                <div className="min-w-0">
                    {section === 'overview' && (
                        <>
                            {/* AI Charts grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-2.5">
                                {!overview ? (
                                    <>
                                        <ObservabilityChartCardSkeleton />
                                        <ObservabilityChartCardSkeleton />
                                        <ObservabilityChartCardSkeleton />
                                        <ObservabilityChartCardSkeleton />
                                    </>
                                ) : (
                                    <>
                                        <ObservabilityChartCard
                                            title="AI Requests"
                                            href={`/dashboard/organizations/${orgSlug}/projects/${projectSlug}/logs`}
                                            series={[
                                                {
                                                    key: 'success',
                                                    label: 'Success',
                                                    color: 'hsl(142, 71%, 45%)',
                                                    total: overview.overview.total_requests,
                                                    format: 'number',
                                                    data: trends.map(p => ({ timestamp: p.timestamp, value: p.success })),
                                                },
                                                {
                                                    key: 'error',
                                                    label: 'Error',
                                                    color: 'hsl(0, 84%, 60%)',
                                                    data: trends.map(p => ({ timestamp: p.timestamp, value: p.error })),
                                                },
                                                {
                                                    key: 'filtered',
                                                    label: 'Filtered',
                                                    color: 'hsl(24, 96%, 53%)',
                                                    data: trends.map(p => ({ timestamp: p.timestamp, value: p.filtered })),
                                                },
                                            ]}
                                        />
                                        <ObservabilityChartCard
                                            title="Cost"
                                            series={[
                                                {
                                                    key: 'cost',
                                                    label: 'Total spend',
                                                    color: 'hsl(217, 91%, 60%)',
                                                    total: overview.overview.total_cost,
                                                    format: 'currency',
                                                    data: trends.map(p => ({ timestamp: p.timestamp, value: p.cost })),
                                                },
                                            ]}
                                        />
                                        <ObservabilityChartCard
                                            title="Success Rate"
                                            series={[
                                                {
                                                    key: 'rate',
                                                    label: 'Success',
                                                    color: 'hsl(142, 71%, 45%)',
                                                    total: overview.overview.success_rate,
                                                    format: 'percentage',
                                                    data: trends.map(p => ({
                                                        timestamp: p.timestamp,
                                                        value: p.total > 0 ? Math.round((p.success / p.total) * 100) : 0,
                                                    })),
                                                },
                                            ]}
                                        />
                                        <ObservabilityChartCard
                                            title="Latency"
                                            series={[
                                                {
                                                    key: 'latency',
                                                    label: 'Avg response',
                                                    color: 'hsl(24, 96%, 53%)',
                                                    total: overview.overview.avg_latency,
                                                    format: 'ms',
                                                    data: trends.map(p => ({ timestamp: p.timestamp, value: p.avg_latency })),
                                                },
                                            ]}
                                        />
                                        <ObservabilityChartCard
                                            title="Tokens"
                                            series={[
                                                {
                                                    key: 'tokens',
                                                    label: 'Total tokens',
                                                    color: 'hsl(280, 65%, 60%)',
                                                    total: overview.overview.total_tokens,
                                                    format: 'number',
                                                    data: trends.map(p => ({ timestamp: p.timestamp, value: p.tokens })),
                                                },
                                            ]}
                                        />
                                        <ObservabilityChartCard
                                            title="Security"
                                            href={`/dashboard/organizations/${orgSlug}/projects/${projectSlug}/security`}
                                            series={[
                                                {
                                                    key: 'incidents',
                                                    label: 'Incidents',
                                                    color: 'hsl(280, 65%, 60%)',
                                                    total: overview.overview.total_incidents,
                                                    format: 'number',
                                                    data: trends.map(p => ({ timestamp: p.timestamp, value: p.filtered + p.blocked_output })),
                                                },
                                                {
                                                    key: 'blocked',
                                                    label: 'Blocked',
                                                    color: 'hsl(0, 84%, 60%)',
                                                    data: trends.map(p => ({ timestamp: p.timestamp, value: p.blocked_output })),
                                                },
                                            ]}
                                        />
                                    </>
                                )}
                            </div>

                            {/* HTTP section — only show when there's actual HTTP data */}
                            {httpSummary.total > 0 && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-2.5">
                                    <ObservabilityChartCard
                                        title="HTTP Traffic"
                                        type="bar"
                                        series={[
                                            {
                                                key: 'total',
                                                label: 'Requests',
                                                color: 'hsl(217, 91%, 60%)',
                                                total: httpSummary.total,
                                                format: 'number',
                                                data: httpTrends.map(p => ({ timestamp: p.timestamp, value: p.total })),
                                            },
                                            {
                                                key: 'error',
                                                label: 'Errors',
                                                color: 'hsl(0, 84%, 60%)',
                                                data: httpTrends.map(p => ({ timestamp: p.timestamp, value: p.error })),
                                            },
                                        ]}
                                    />
                                    <ObservabilityChartCard
                                        title="HTTP Success Rate"
                                        series={[
                                            {
                                                key: 'success',
                                                label: 'Success',
                                                color: 'hsl(142, 71%, 45%)',
                                                total: httpSummary.successRate,
                                                format: 'percentage',
                                                data: httpTrends.map(p => ({ timestamp: p.timestamp, value: p.success })),
                                            },
                                        ]}
                                    />
                                </div>
                            )}
                        </>
                    )}
                    {section === 'ai' && (
                        <>
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h2 className="text-sm font-medium">AI</h2>
                                    <p className="text-xs text-muted-foreground mt-0.5">Model traffic, token usage, provider cost, and latency.</p>
                                </div>
                                <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                                    <Link href={`/dashboard/organizations/${orgSlug}/projects/${projectSlug}/logs`}>
                                        Open AI Logs
                                        <ArrowRight className="h-3.5 w-3.5 ml-1" />
                                    </Link>
                                </Button>
                            </div>

                            {overview && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-4">
                                    <ObservabilityChartCard
                                        title="Requests"
                                        series={[
                                            {
                                                key: 'success',
                                                label: 'Success',
                                                color: 'hsl(142, 71%, 45%)',
                                                total: overview.overview.total_requests,
                                                format: 'number',
                                                data: trends.map(p => ({ timestamp: p.timestamp, value: p.success })),
                                            },
                                            {
                                                key: 'filtered',
                                                label: 'Filtered',
                                                color: 'hsl(24, 96%, 53%)',
                                                data: trends.map(p => ({ timestamp: p.timestamp, value: p.filtered })),
                                            },
                                            {
                                                key: 'error',
                                                label: 'Error',
                                                color: 'hsl(0, 84%, 60%)',
                                                data: trends.map(p => ({ timestamp: p.timestamp, value: p.error })),
                                            },
                                        ]}
                                    />
                                    <ObservabilityChartCard
                                        title="Tokens"
                                        series={[
                                            {
                                                key: 'tokens',
                                                label: 'Total tokens',
                                                color: 'hsl(280, 65%, 60%)',
                                                total: overview.overview.total_tokens,
                                                format: 'number',
                                                data: trends.map(p => ({ timestamp: p.timestamp, value: p.tokens })),
                                            },
                                        ]}
                                    />
                                    <ObservabilityChartCard
                                        title="Cost"
                                        series={[
                                            {
                                                key: 'cost',
                                                label: 'Total spend',
                                                color: 'hsl(217, 91%, 60%)',
                                                total: overview.overview.total_cost,
                                                format: 'currency',
                                                data: trends.map(p => ({ timestamp: p.timestamp, value: p.cost })),
                                            },
                                        ]}
                                    />
                                    <ObservabilityChartCard
                                        title="Latency"
                                        series={[
                                            {
                                                key: 'latency',
                                                label: 'Avg response',
                                                color: 'hsl(24, 96%, 53%)',
                                                total: overview.overview.avg_latency,
                                                format: 'ms',
                                                data: trends.map(p => ({ timestamp: p.timestamp, value: p.avg_latency })),
                                            },
                                        ]}
                                    />
                                </div>
                            )}

                            {overview && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                                    <ModelUsageChart data={overview.breakdown.model_usage} />
                                    <CostByProviderChart data={overview.breakdown.cost_by_provider} />
                                    <LatencyHistogram data={overview.breakdown.latency_percentiles} />
                                </div>
                            )}
                        </>
                    )}

                    {section === 'http' && (
                        <>
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h2 className="text-sm font-medium">HTTP</h2>
                                    <p className="text-xs text-muted-foreground mt-0.5">Unified API and web request health, status mix, and request volume.</p>
                                </div>
                                <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                                    <Link href={`/dashboard/organizations/${orgSlug}/projects/${projectSlug}/logs?source=http`}>
                                        Open HTTP Logs
                                        <ArrowRight className="h-3.5 w-3.5 ml-1" />
                                    </Link>
                                </Button>
                            </div>

                            {httpSummary.total > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                    <ObservabilityChartCard
                                        title="Requests"
                                        type="bar"
                                        series={[
                                            {
                                                key: 'total',
                                                label: 'Total',
                                                color: 'hsl(217, 91%, 60%)',
                                                total: httpSummary.total,
                                                format: 'number',
                                                data: httpTrends.map(p => ({ timestamp: p.timestamp, value: p.total })),
                                            },
                                        ]}
                                    />
                                    <ObservabilityChartCard
                                        title="Success Rate"
                                        series={[
                                            {
                                                key: 'success',
                                                label: 'Success',
                                                color: 'hsl(142, 71%, 45%)',
                                                total: httpSummary.successRate,
                                                format: 'percentage',
                                                data: httpTrends.map(p => ({ timestamp: p.timestamp, value: p.success })),
                                            },
                                        ]}
                                    />
                                    <ObservabilityChartCard
                                        title="Errors"
                                        series={[
                                            {
                                                key: 'error',
                                                label: '4xx/5xx',
                                                color: 'hsl(0, 84%, 60%)',
                                                total: httpSummary.errorRate,
                                                format: 'percentage',
                                                data: httpTrends.map(p => ({ timestamp: p.timestamp, value: p.error })),
                                            },
                                        ]}
                                    />
                                    <ObservabilityChartCard
                                        title="Rate Limited"
                                        series={[
                                            {
                                                key: 'filtered',
                                                label: '429 responses',
                                                color: 'hsl(24, 96%, 53%)',
                                                total: httpSummary.filtered,
                                                format: 'number',
                                                data: httpTrends.map(p => ({ timestamp: p.timestamp, value: p.filtered })),
                                            },
                                        ]}
                                    />
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="rounded-xl border border-border/30 bg-card px-5 py-4">
                                        <p className="text-sm font-medium mb-1">Connect Vercel to see HTTP traffic</p>
                                        <p className="text-xs text-muted-foreground/60 max-w-[480px] mb-4">
                                            Install the Vercel integration to automatically stream every request to your observability dashboard — no SDK or code changes needed.
                                        </p>
                                        <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                                            <Link href={`/dashboard/organizations/${orgSlug}/projects/${projectSlug}/edge`}>
                                                Set up Vercel Integration
                                                <ArrowRight className="h-3.5 w-3.5 ml-1" />
                                            </Link>
                                        </Button>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                                        {[
                                            { label: 'Request Volume', desc: 'Total requests, methods, and paths across all routes' },
                                            { label: 'Success Rate', desc: '2xx/3xx vs 4xx/5xx breakdown over time' },
                                            { label: 'Error Tracking', desc: 'Spot failing endpoints and status code spikes' },
                                            { label: 'Rate Limiting', desc: '429 responses and throttle patterns per route' },
                                        ].map(card => (
                                            <div key={card.label} className="rounded-xl border border-dashed border-border/30 bg-card/50 px-4 py-3.5">
                                                <p className="text-xs font-medium text-muted-foreground/70 mb-1">{card.label}</p>
                                                <p className="text-[10px] text-muted-foreground/40 leading-relaxed">{card.desc}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {section === 'reliability' && (
                        <>
                            <div className="mb-4">
                                <h2 className="text-sm font-medium">Reliability</h2>
                                <p className="text-xs text-muted-foreground mt-0.5">Failover behavior, request error rates, and system stability signals.</p>
                            </div>

                            {/* Failover card — keeps its own data fetching */}
                            <div className="mb-4">
                                <FailoverMetrics
                                    projectId={projectId}
                                    environment={environment}
                                    timeRange={timeRange}
                                />
                            </div>

                            {overview && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                    <ObservabilityChartCard
                                        title="AI Success Rate"
                                        series={[
                                            {
                                                key: 'rate',
                                                label: 'Success',
                                                color: 'hsl(142, 71%, 45%)',
                                                total: overview.overview.success_rate,
                                                format: 'percentage',
                                                data: trends.map(p => ({
                                                    timestamp: p.timestamp,
                                                    value: p.total > 0 ? Math.round((p.success / p.total) * 100) : 0,
                                                })),
                                            },
                                        ]}
                                    />
                                    <ObservabilityChartCard
                                        title="Average Latency"
                                        series={[
                                            {
                                                key: 'latency',
                                                label: 'Avg response',
                                                color: 'hsl(24, 96%, 53%)',
                                                total: overview.overview.avg_latency,
                                                format: 'ms',
                                                data: trends.map(p => ({ timestamp: p.timestamp, value: p.avg_latency })),
                                            },
                                        ]}
                                    />
                                    <ObservabilityChartCard
                                        title="HTTP Errors"
                                        series={[
                                            {
                                                key: 'error',
                                                label: '4xx/5xx rate',
                                                color: 'hsl(0, 84%, 60%)',
                                                total: httpSummary.errorRate,
                                                format: 'percentage',
                                                data: httpTrends.map(p => ({ timestamp: p.timestamp, value: p.error })),
                                            },
                                        ]}
                                    />
                                    <ObservabilityChartCard
                                        title="HTTP Throttles"
                                        series={[
                                            {
                                                key: 'filtered',
                                                label: '429 responses',
                                                color: 'hsl(24, 96%, 53%)',
                                                total: httpSummary.filtered,
                                                format: 'number',
                                                data: httpTrends.map(p => ({ timestamp: p.timestamp, value: p.filtered })),
                                            },
                                        ]}
                                    />
                                </div>
                            )}
                        </>
                    )}

                    {section === 'security' && overview && (
                        <>
                            <div className="mb-4">
                                <h2 className="text-sm font-medium">Security</h2>
                                <p className="text-xs text-muted-foreground mt-0.5">Incident severity, filtered patterns, and safety-related request behavior.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-6">
                                <ObservabilityChartCard
                                    title="Security Incidents"
                                    series={[
                                        {
                                            key: 'incidents',
                                            label: 'Incidents',
                                            color: 'hsl(280, 65%, 60%)',
                                            data: trends.map(p => ({ timestamp: p.timestamp, value: p.filtered + p.blocked_output })),
                                            total: overview.overview.total_incidents,
                                        },
                                    ]}
                                />
                                <ObservabilityChartCard
                                    title="Critical Severity"
                                    series={[
                                        {
                                            key: 'critical',
                                            label: 'Critical',
                                            color: 'hsl(0, 84%, 60%)',
                                            data: trends.map(p => ({ timestamp: p.timestamp, value: p.filtered + p.blocked_output })),
                                            total: overview.breakdown.incidents_by_severity.critical,
                                        },
                                    ]}
                                />
                                <ObservabilityChartCard
                                    title="High Priority"
                                    series={[
                                        {
                                            key: 'high',
                                            label: 'High',
                                            color: 'hsl(24, 96%, 53%)',
                                            data: overview.breakdown.incidents_by_severity.high > 0
                                                ? trends.map(p => ({ timestamp: p.timestamp, value: p.filtered }))
                                                : [],
                                            total: overview.breakdown.incidents_by_severity.high,
                                        },
                                    ]}
                                />
                                <ObservabilityChartCard
                                    title="Blocked Output"
                                    series={[
                                        {
                                            key: 'blocked',
                                            label: 'Blocked',
                                            color: 'hsl(0, 84%, 60%)',
                                            data: trends.map(p => ({ timestamp: p.timestamp, value: p.blocked_output || 0 })),
                                            total: trends.reduce((sum, p) => sum + (p.blocked_output || 0), 0),
                                        },
                                    ]}
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                                    <Link href={`/dashboard/organizations/${orgSlug}/projects/${projectSlug}/logs`}>
                                        Review AI Security Signals
                                        <ArrowRight className="h-3.5 w-3.5 ml-1" />
                                    </Link>
                                </Button>
                            </div>
                        </>
                    )}
                    {section === 'intelligence' && projectId && (
                        <IntelligencePanel projectId={projectId} environment={environment} />
                    )}
                </div>
            </div>
        </div>
    );
}
