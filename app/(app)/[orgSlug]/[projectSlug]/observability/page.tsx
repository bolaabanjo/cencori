'use client';

import { useMemo, useState, use } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { ModelUsageChart } from '@/components/analytics/ModelUsageChart';
import { CostByProviderChart } from '@/components/analytics/CostByProviderChart';
import { LatencyHistogram } from '@/components/analytics/LatencyHistogram';
import { FailoverMetrics } from '@/components/analytics/FailoverMetrics';
import { ObservabilityChartCard, ObservabilityChartCardSkeleton } from '@/components/analytics/ObservabilityChartCard';
import { ObservabilitySignalCard } from '@/components/analytics/ObservabilitySignalCard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ChartBarIcon } from '@heroicons/react/24/outline';
import { ArrowRight } from 'lucide-react';
import { useEnvironment } from '@/lib/contexts/EnvironmentContext';
import { useOrganizationProject } from '@/lib/contexts/OrganizationProjectContext';
import { queryKeys } from '@/lib/hooks/useQueries';
import { ExportDialog } from '@/components/dashboard/ExportDialog';
import { IntelligencePanel } from '@/components/analytics/intelligence/IntelligencePanel';
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
    latency_samples: number;
    latency_p50: number | null;
    latency_p75: number | null;
    latency_p90: number | null;
    latency_p95: number | null;
    latency_p99: number | null;
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

interface ProjectDetails {
    id: string;
    name: string;
    organization: {
        id: string;
        name: string;
        subscription_tier?: string;
    };
}

type ObservabilitySection = 'overview' | 'ai' | 'reliability' | 'security' | 'intelligence';

interface SectionDefinition {
    id: ObservabilitySection;
    label: string;
}

const sections: SectionDefinition[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'ai', label: 'AI' },
    { id: 'reliability', label: 'Reliability' },
    { id: 'security', label: 'Security' },
    { id: 'intelligence', label: 'Intelligence' },
];

function isObservabilitySection(value: string | null): value is ObservabilitySection {
    return value === 'overview'
        || value === 'ai'
        || value === 'reliability'
        || value === 'security'
        || value === 'intelligence';
}

function useProjectDetails(
    orgSlug: string,
    projectSlug: string,
    initialData?: ProjectDetails,
) {
    return useQuery<ProjectDetails>({
        queryKey: ['observabilityProject', orgSlug, projectSlug],
        queryFn: async () => {
            const { data: orgData } = await supabase
                .from('organizations')
                .select('id, name, subscription_tier')
                .eq('slug', orgSlug)
                .single();

            if (!orgData) throw new Error('Organization not found');

            const { data: projectData } = await supabase
                .from('projects')
                .select('id, name')
                .eq('slug', projectSlug)
                .eq('organization_id', orgData.id)
                .single();

            if (!projectData) throw new Error('Project not found');
            return { ...projectData, organization: orgData };
        },
        initialData,
        // The shared project context gives us an immediate render while this
        // observability-specific lookup quietly refreshes in the background.
        initialDataUpdatedAt: initialData ? 0 : undefined,
        staleTime: 5 * 60 * 1000,
    });
}

export default function ObservabilityPage({ params }: PageProps) {
    const { orgSlug, projectSlug } = use(params);
    const { environment } = useEnvironment();
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const { organizations, projects } = useOrganizationProject();

    const [timeRange, setTimeRange] = useState('7d');

    const rawSectionParam = searchParams.get('section');
    const section: ObservabilitySection = isObservabilitySection(rawSectionParam)
        ? rawSectionParam
        : 'overview';

    const cachedProject = useMemo<ProjectDetails | undefined>(() => {
        const organization = organizations.find((item) => item.slug === orgSlug);
        if (!organization) return undefined;

        const project = projects.find((item) => (
            item.slug === projectSlug && item.organization_id === organization.id
        ));
        if (!project) return undefined;

        return {
            id: project.id,
            name: project.name,
            organization: {
                id: organization.id,
                name: organization.name,
                subscription_tier: organization.subscription_tier,
            },
        };
    }, [organizations, orgSlug, projectSlug, projects]);

    const { data: project, isLoading: projectLoading } = useProjectDetails(
        orgSlug,
        projectSlug,
        cachedProject,
    );
    const projectId = project?.id ?? '';

    const { data: overview, error: overviewError } = useQuery<OverviewData>({
        queryKey: queryKeys.analytics(projectId || '', timeRange),
        queryFn: () => fetchJsonWithFeatureGate<OverviewData>(
            `/api/projects/${projectId}/analytics/overview?time_range=${timeRange}&environment=${environment}`
        ),
        enabled: !!projectId,
        staleTime: 30 * 1000,
        retry: (failureCount, error) => !isFeatureGateError(error) && failureCount < 1,
    });

    const { data: trendsData } = useQuery<{ trends: TrendData[]; group_by: '10min' | 'hour' | 'day' }>({
        queryKey: ['trends', projectId, timeRange, environment],
        queryFn: () => fetchJsonWithFeatureGate<{ trends: TrendData[]; group_by: '10min' | 'hour' | 'day' }>(
            `/api/projects/${projectId}/analytics/trends?time_range=${timeRange}&environment=${environment}`
        ),
        enabled: !!projectId,
        staleTime: 30 * 1000,
        retry: (failureCount, error) => !isFeatureGateError(error) && failureCount < 1,
    });

    const trends = useMemo(() => trendsData?.trends || [], [trendsData?.trends]);

    if (!project && !projectLoading) {
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

    if (project && isFeatureGateError(overviewError)) {
        return (
            <div className="w-full max-w-6xl mx-auto px-6 py-8">
                <FeatureUpgradeWall
                    orgSlug={orgSlug}
                    orgId={project.organization.id}
                    orgName={project.organization.name}
                    currentTier={project.organization.subscription_tier}
                    feature="Analytics dashboard"
                    message={overviewError.message}
                    returnPath={pathname}
                />
            </div>
        );
    }

    return (
        <main className="mx-auto w-full max-w-[980px] px-4 py-8 pb-24 sm:px-6 sm:py-10 lg:px-8">
            <header className="mb-8">
                <div>
                    <p className="text-[10px] font-medium tracking-[0.18em] text-muted-foreground">PROJECT TELEMETRY</p>
                    <h1 className="mt-3 text-[2rem] font-medium leading-none tracking-[-0.055em]">Observability</h1>
                    <p className="mt-3 max-w-[60ch] text-xs leading-5 text-muted-foreground">
                        {project ? `Live AI telemetry for ${project.name}.` : 'Live AI telemetry for this project.'}
                    </p>
                </div>
            </header>

            <nav className="mb-4 flex gap-1 overflow-x-auto pb-1 lg:hidden" aria-label="Observability sections">
                {sections.map((item) => (
                    <Link
                        key={item.id}
                        href={item.id === 'overview' ? pathname : `${pathname}?section=${item.id}`}
                        scroll={false}
                        className={`h-8 shrink-0 rounded-md px-3 text-xs leading-8 transition-colors ${
                            section === item.id
                                ? 'bg-secondary text-foreground font-medium'
                                : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                        }`}
                    >
                        {item.label}
                    </Link>
                ))}
            </nav>

            <div className="min-w-0">
                    {section === 'overview' && (
                        <div className="space-y-7">
                            <section aria-labelledby="ai-signals-heading">
                                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                                    <div>
                                        <h2 id="ai-signals-heading" className="text-sm font-medium">AI signals</h2>
                                        <p className="mt-0.5 text-xs text-muted-foreground">The operating pulse of every model request.</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {projectId ? (
                                            <ExportDialog
                                                projectId={projectId}
                                                type="analytics"
                                                environment={environment}
                                                showTriggerIcon={false}
                                                triggerClassName="border-black bg-black text-white hover:bg-black/85 dark:border-white dark:bg-white dark:text-black dark:hover:bg-white/90"
                                            />
                                        ) : (
                                            <Button variant="outline" size="sm" className="h-8 text-xs" disabled>
                                                Export
                                            </Button>
                                        )}
                                        <Select value={timeRange} onValueChange={setTimeRange}>
                                            <SelectTrigger className="h-8 w-[130px] bg-background text-xs">
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

                                {!overview ? (
                                    <div className="grid grid-cols-1 gap-4">
                                        <ObservabilityChartCardSkeleton className="min-h-[300px] rounded-lg bg-[#f3f3f1] ring-1 ring-inset ring-black/[0.045] dark:bg-[#111111] dark:ring-white/[0.035]" />
                                        <ObservabilityChartCardSkeleton className="min-h-[300px] rounded-lg bg-[#f3f3f1] ring-1 ring-inset ring-black/[0.045] dark:bg-[#111111] dark:ring-white/[0.035]" />
                                        <ObservabilityChartCardSkeleton className="min-h-[270px] rounded-lg bg-[#f3f3f1] ring-1 ring-inset ring-black/[0.045] dark:bg-[#111111] dark:ring-white/[0.035]" />
                                        <ObservabilityChartCardSkeleton className="min-h-[270px] rounded-lg bg-[#f3f3f1] ring-1 ring-inset ring-black/[0.045] dark:bg-[#111111] dark:ring-white/[0.035]" />
                                        <ObservabilityChartCardSkeleton className="min-h-[250px] rounded-lg bg-[#f3f3f1] ring-1 ring-inset ring-black/[0.045] dark:bg-[#111111] dark:ring-white/[0.035]" />
                                        <ObservabilityChartCardSkeleton className="min-h-[250px] rounded-lg bg-[#f3f3f1] ring-1 ring-inset ring-black/[0.045] dark:bg-[#111111] dark:ring-white/[0.035]" />
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-4">
                                        <ObservabilitySignalCard
                                            className="w-full"
                                            title="Request outcomes"
                                            description="Successful, failed, and filtered AI requests over time."
                                            href={`/${orgSlug}/${projectSlug}/logs`}
                                            type="line"
                                            curve="stepAfter"
                                            height={205}
                                            series={[
                                                {
                                                    key: 'success',
                                                    label: 'Success',
                                                    color: 'hsl(153, 72%, 45%)',
                                                    total: overview.overview.total_requests,
                                                    format: 'number',
                                                    data: trends.map(p => ({ timestamp: p.timestamp, value: p.success })),
                                                },
                                                {
                                                    key: 'error',
                                                    label: 'Error',
                                                    color: 'hsl(356, 80%, 58%)',
                                                    data: trends.map(p => ({ timestamp: p.timestamp, value: p.error })),
                                                },
                                                {
                                                    key: 'filtered',
                                                    label: 'Filtered',
                                                    color: 'hsl(45, 92%, 51%)',
                                                    data: trends.map(p => ({ timestamp: p.timestamp, value: p.filtered })),
                                                },
                                            ]}
                                        />
                                        <ObservabilitySignalCard
                                            className="w-full"
                                            title="Spend"
                                            description="Provider cost accumulated across model traffic."
                                            type="line"
                                            curve="stepAfter"
                                            height={205}
                                            series={[
                                                {
                                                    key: 'cost',
                                                    label: 'Total spend',
                                                    color: 'hsl(153, 72%, 45%)',
                                                    total: overview.overview.total_cost,
                                                    format: 'currency',
                                                    data: trends.map(p => ({ timestamp: p.timestamp, value: p.cost })),
                                                },
                                            ]}
                                        />
                                        <ObservabilitySignalCard
                                            className="w-full"
                                            title="Success rate"
                                            description="The share of AI requests completed successfully."
                                            type="line"
                                            curve="stepAfter"
                                            height={175}
                                            series={[
                                                {
                                                    key: 'rate',
                                                    label: 'Successful',
                                                    color: 'hsl(153, 72%, 45%)',
                                                    total: overview.overview.success_rate,
                                                    format: 'percentage',
                                                    data: trends.map(p => ({
                                                        timestamp: p.timestamp,
                                                        value: p.total > 0 ? (p.success / p.total) * 100 : 0,
                                                    })),
                                                },
                                            ]}
                                        />
                                        <ObservabilitySignalCard
                                            className="w-full"
                                            title="Response latency"
                                            description="Mean end-to-end response time across providers."
                                            type="line"
                                            curve="stepAfter"
                                            height={175}
                                            series={[
                                                {
                                                    key: 'latency',
                                                    label: 'Average latency',
                                                    color: 'hsl(153, 72%, 45%)',
                                                    total: overview.overview.avg_latency,
                                                    format: 'ms',
                                                    data: trends.map(p => ({ timestamp: p.timestamp, value: p.avg_latency })),
                                                },
                                            ]}
                                        />
                                        <ObservabilitySignalCard
                                            className="w-full"
                                            title="Token throughput"
                                            description="Tokens processed across prompts and model output."
                                            type="line"
                                            curve="stepAfter"
                                            height={155}
                                            series={[
                                                {
                                                    key: 'tokens',
                                                    label: 'Tokens',
                                                    color: 'hsl(153, 72%, 45%)',
                                                    total: overview.overview.total_tokens,
                                                    format: 'number',
                                                    data: trends.map(p => ({ timestamp: p.timestamp, value: p.tokens })),
                                                },
                                            ]}
                                        />
                                        <ObservabilitySignalCard
                                            className="w-full"
                                            title="Security signals"
                                            description="Policy incidents and blocked model output."
                                            href={`/${orgSlug}/${projectSlug}/security`}
                                            type="line"
                                            curve="stepAfter"
                                            height={155}
                                            series={[
                                                {
                                                    key: 'incidents',
                                                    label: 'Incidents',
                                                    color: 'hsl(153, 72%, 45%)',
                                                    total: overview.overview.total_incidents,
                                                    format: 'number',
                                                    data: trends.map(p => ({ timestamp: p.timestamp, value: p.filtered + p.blocked_output })),
                                                },
                                                {
                                                    key: 'blocked',
                                                    label: 'Blocked',
                                                    color: 'hsl(153, 72%, 45%)',
                                                    data: trends.map(p => ({ timestamp: p.timestamp, value: p.blocked_output })),
                                                },
                                            ]}
                                        />
                                    </div>
                                )}
                            </section>

                        </div>
                    )}
                    {section === 'ai' && (
                        <div className="space-y-6">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                    <h2 className="text-sm font-medium">AI</h2>
                                    <p className="mt-0.5 text-xs text-muted-foreground">Model traffic, token usage, provider cost, and latency.</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    {projectId ? (
                                        <ExportDialog
                                            projectId={projectId}
                                            type="analytics"
                                            environment={environment}
                                            showTriggerIcon={false}
                                            triggerClassName="border-black bg-black text-white hover:bg-black/85 dark:border-white dark:bg-white dark:text-black dark:hover:bg-white/90"
                                        />
                                    ) : (
                                        <Button variant="outline" size="sm" className="h-8 text-xs" disabled>
                                            Export
                                        </Button>
                                    )}
                                    <Select value={timeRange} onValueChange={setTimeRange}>
                                        <SelectTrigger className="h-8 w-[130px] bg-background text-xs">
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
                                    <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                                        <Link href={`/${orgSlug}/${projectSlug}/logs`}>
                                            Open AI Logs
                                            <ArrowRight className="ml-1 h-3.5 w-3.5" />
                                        </Link>
                                    </Button>
                                </div>
                            </div>

                            {!overview ? (
                                <div className="grid grid-cols-1 gap-4">
                                    <ObservabilityChartCardSkeleton className="min-h-[300px] rounded-lg bg-[#f3f3f1] ring-1 ring-inset ring-black/[0.045] dark:bg-[#111111] dark:ring-white/[0.035]" />
                                    <ObservabilityChartCardSkeleton className="min-h-[300px] rounded-lg bg-[#f3f3f1] ring-1 ring-inset ring-black/[0.045] dark:bg-[#111111] dark:ring-white/[0.035]" />
                                    <ObservabilityChartCardSkeleton className="min-h-[270px] rounded-lg bg-[#f3f3f1] ring-1 ring-inset ring-black/[0.045] dark:bg-[#111111] dark:ring-white/[0.035]" />
                                    <ObservabilityChartCardSkeleton className="min-h-[270px] rounded-lg bg-[#f3f3f1] ring-1 ring-inset ring-black/[0.045] dark:bg-[#111111] dark:ring-white/[0.035]" />
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-4">
                                    <ObservabilitySignalCard
                                        className="w-full"
                                        title="Request outcomes"
                                        description="Successful, failed, and filtered model requests over time."
                                        href={`/${orgSlug}/${projectSlug}/logs`}
                                        type="line"
                                        curve="stepAfter"
                                        height={205}
                                        series={[
                                            {
                                                key: 'success',
                                                label: 'Success',
                                                color: 'hsl(153, 72%, 45%)',
                                                total: overview.overview.total_requests,
                                                format: 'number',
                                                data: trends.map(p => ({ timestamp: p.timestamp, value: p.success })),
                                            },
                                            {
                                                key: 'error',
                                                label: 'Error',
                                                color: 'hsl(356, 80%, 58%)',
                                                data: trends.map(p => ({ timestamp: p.timestamp, value: p.error })),
                                            },
                                            {
                                                key: 'filtered',
                                                label: 'Filtered',
                                                color: 'hsl(45, 92%, 51%)',
                                                data: trends.map(p => ({ timestamp: p.timestamp, value: p.filtered })),
                                            },
                                        ]}
                                    />
                                    <ObservabilitySignalCard
                                        className="w-full"
                                        title="Token throughput"
                                        description="Tokens processed across prompts and model output."
                                        type="line"
                                        curve="stepAfter"
                                        height={205}
                                        series={[
                                            {
                                                key: 'tokens',
                                                label: 'Tokens',
                                                color: 'hsl(153, 72%, 45%)',
                                                total: overview.overview.total_tokens,
                                                format: 'number',
                                                data: trends.map(p => ({ timestamp: p.timestamp, value: p.tokens })),
                                            },
                                        ]}
                                    />
                                    <ObservabilitySignalCard
                                        className="w-full"
                                        title="Spend"
                                        description="Provider cost accumulated across model traffic."
                                        type="line"
                                        curve="stepAfter"
                                        height={175}
                                        series={[
                                            {
                                                key: 'cost',
                                                label: 'Total spend',
                                                color: 'hsl(153, 72%, 45%)',
                                                total: overview.overview.total_cost,
                                                format: 'currency',
                                                data: trends.map(p => ({ timestamp: p.timestamp, value: p.cost })),
                                            },
                                        ]}
                                    />
                                    <ObservabilitySignalCard
                                        className="w-full"
                                        title="Response latency"
                                        description="Mean end-to-end response time across model providers."
                                        type="line"
                                        curve="stepAfter"
                                        height={175}
                                        series={[
                                            {
                                                key: 'latency',
                                                label: 'Average latency',
                                                color: 'hsl(153, 72%, 45%)',
                                                total: overview.overview.avg_latency,
                                                format: 'ms',
                                                data: trends.map(p => ({ timestamp: p.timestamp, value: p.avg_latency })),
                                            },
                                        ]}
                                    />
                                </div>
                            )}

                            {overview && (
                                <section aria-labelledby="model-intelligence-heading">
                                    <div className="mb-3">
                                        <h3 id="model-intelligence-heading" className="text-sm font-medium">Model intelligence</h3>
                                        <p className="mt-0.5 text-xs text-muted-foreground">Traffic concentration, provider spend, and latency percentiles.</p>
                                    </div>
                                    <div className="overflow-hidden rounded-lg bg-[#f3f3f1] ring-1 ring-inset ring-black/[0.045] dark:bg-[#111111] dark:ring-white/[0.035]">
                                        <div className="divide-y divide-border/40">
                                            <div><ModelUsageChart data={overview.breakdown.model_usage} /></div>
                                            <div>
                                                <CostByProviderChart
                                                    data={overview.breakdown.cost_by_provider}
                                                    requests={overview.breakdown.requests_by_provider}
                                                />
                                            </div>
                                            <div>
                                                <LatencyHistogram
                                                    data={overview.breakdown.latency_percentiles}
                                                    history={trends.map(point => ({
                                                        timestamp: point.timestamp,
                                                        samples: point.latency_samples ?? 0,
                                                        p50: point.latency_p50 ?? null,
                                                        p75: point.latency_p75 ?? null,
                                                        p90: point.latency_p90 ?? null,
                                                        p95: point.latency_p95 ?? null,
                                                        p99: point.latency_p99 ?? null,
                                                    }))}
                                                    timeRange={timeRange}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            )}
                        </div>
                    )}

                    {section === 'reliability' && (
                        <div className="space-y-6">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                    <h2 className="text-sm font-medium">Reliability</h2>
                                    <p className="mt-0.5 text-xs text-muted-foreground">AI delivery health, provider recovery, and response stability.</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    {projectId ? (
                                        <ExportDialog
                                            projectId={projectId}
                                            type="analytics"
                                            environment={environment}
                                            showTriggerIcon={false}
                                            triggerClassName="border-black bg-black text-white hover:bg-black/85 dark:border-white dark:bg-white dark:text-black dark:hover:bg-white/90"
                                        />
                                    ) : (
                                        <Button variant="outline" size="sm" className="h-8 text-xs" disabled>
                                            Export
                                        </Button>
                                    )}
                                    <Select value={timeRange} onValueChange={setTimeRange}>
                                        <SelectTrigger className="h-8 w-[130px] bg-background text-xs">
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
                                    <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                                        <Link href={`/${orgSlug}/${projectSlug}/logs`}>
                                            Open AI logs
                                            <ArrowRight className="ml-1 h-3.5 w-3.5" />
                                        </Link>
                                    </Button>
                                </div>
                            </div>

                            {!overview ? (
                                <div className="grid grid-cols-1 gap-4">
                                    <ObservabilityChartCardSkeleton className="min-h-[320px] rounded-lg bg-[#f3f3f1] ring-1 ring-inset ring-black/[0.045] dark:bg-[#111111] dark:ring-white/[0.035]" />
                                    <ObservabilityChartCardSkeleton className="min-h-[320px] rounded-lg bg-[#f3f3f1] ring-1 ring-inset ring-black/[0.045] dark:bg-[#111111] dark:ring-white/[0.035]" />
                                    <ObservabilityChartCardSkeleton className="min-h-[260px] rounded-lg bg-[#f3f3f1] ring-1 ring-inset ring-black/[0.045] dark:bg-[#111111] dark:ring-white/[0.035]" />
                                    <ObservabilityChartCardSkeleton className="min-h-[260px] rounded-lg bg-[#f3f3f1] ring-1 ring-inset ring-black/[0.045] dark:bg-[#111111] dark:ring-white/[0.035]" />
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-4">
                                    <ObservabilitySignalCard
                                        className="w-full"
                                        title="Delivery outcomes"
                                        description="Completed, failed, and policy-filtered AI requests over time."
                                        href={`/${orgSlug}/${projectSlug}/logs`}
                                        type="line"
                                        curve="stepAfter"
                                        height={220}
                                        series={[
                                            {
                                                key: 'success',
                                                label: 'Delivered',
                                                color: 'hsl(153, 72%, 45%)',
                                                total: overview.overview.total_requests,
                                                format: 'number',
                                                data: trends.map(point => ({ timestamp: point.timestamp, value: point.success })),
                                            },
                                            {
                                                key: 'error',
                                                label: 'Error',
                                                color: 'hsl(356, 80%, 58%)',
                                                data: trends.map(point => ({ timestamp: point.timestamp, value: point.error })),
                                            },
                                            {
                                                key: 'filtered',
                                                label: 'Filtered',
                                                color: 'hsl(45, 92%, 51%)',
                                                data: trends.map(point => ({ timestamp: point.timestamp, value: point.filtered })),
                                            },
                                        ]}
                                    />

                                    <FailoverMetrics
                                        className="w-full"
                                        projectId={projectId}
                                        environment={environment}
                                        timeRange={timeRange}
                                    />

                                    <ObservabilitySignalCard
                                        className="w-full"
                                        title="Delivery rate"
                                        description="The share of AI requests completed successfully, including recovered fallbacks."
                                        type="line"
                                        curve="stepAfter"
                                        height={180}
                                        series={[
                                            {
                                                key: 'rate',
                                                label: 'Delivered',
                                                color: 'hsl(153, 72%, 45%)',
                                                total: overview.overview.success_rate,
                                                format: 'percentage',
                                                data: trends.map(point => ({
                                                    timestamp: point.timestamp,
                                                    value: point.total > 0 ? (point.success / point.total) * 100 : 0,
                                                })),
                                            },
                                        ]}
                                    />

                                    <ObservabilitySignalCard
                                        className="w-full"
                                        title="Response stability"
                                        description="Mean end-to-end latency across model providers."
                                        type="line"
                                        curve="stepAfter"
                                        height={180}
                                        series={[
                                            {
                                                key: 'latency',
                                                label: 'Average latency',
                                                color: 'hsl(153, 72%, 45%)',
                                                total: overview.overview.avg_latency,
                                                format: 'ms',
                                                data: trends.map(point => ({ timestamp: point.timestamp, value: point.avg_latency })),
                                            },
                                        ]}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {section === 'security' && overview && (
                        <>
                            <div className="mb-4">
                                <h2 className="text-sm font-medium">Security</h2>
                                <p className="text-xs text-muted-foreground mt-0.5">Incident severity, filtered patterns, and safety-related request behavior.</p>
                            </div>

                            <div className="mb-6 overflow-hidden rounded-lg bg-[#f3f3f1] ring-1 ring-inset ring-black/[0.045] dark:bg-[#111111] dark:ring-white/[0.035]">
                                <div className="grid grid-cols-1 divide-y divide-black/[0.055] dark:divide-white/[0.045]">
                                    <ObservabilityChartCard
                                        className="w-full bg-transparent"
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
                                        className="w-full bg-transparent"
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
                                        className="w-full bg-transparent"
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
                                        className="w-full bg-transparent"
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
                            </div>

                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                                    <Link href={`/${orgSlug}/${projectSlug}/logs`}>
                                        Review AI Security Signals
                                        <ArrowRight className="h-3.5 w-3.5 ml-1" />
                                    </Link>
                                </Button>
                            </div>
                        </>
                    )}
                    {section === 'intelligence' && projectId && (
                        <IntelligencePanel
                            projectId={projectId}
                            environment={environment}
                        />
                    )}
            </div>
        </main>
    );
}
