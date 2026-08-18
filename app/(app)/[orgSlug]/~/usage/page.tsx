"use client";

import React, { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from "@/components/ui/skeleton";
import { cn as clsx } from "@/lib/utils";
import { supabase } from '@/lib/supabaseClient';
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/toast';

interface Organization {
    id: string;
    name: string;
    subscription_tier: 'free' | 'pro' | 'team' | 'enterprise';
    monthly_requests_used: number;
}

interface UsageStats {
    total_requests: number;
    total_tokens: number;
    input_tokens: number;
    output_tokens: number;
    total_cost: number;
    avg_latency: number;
    success_rate: number;
    model_usage: Record<string, number>;
    provider_usage: Record<string, number>;
    daily_requests: Array<{
        date: string;
        count: number;
        input_tokens: number;
        output_tokens: number;
    }>;
}

type UsageRequest = {
    created_at: string;
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
};

function buildRequestActivity(requests: UsageRequest[], timeRange: string) {
    const isHourly = timeRange === '24h';
    const bucketCount = isHourly ? 24 : timeRange === '30d' ? 30 : 7;
    const stepMs = isHourly ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const end = new Date();

    if (isHourly) {
        end.setMinutes(0, 0, 0);
    } else {
        end.setHours(0, 0, 0, 0);
    }

    const startMs = end.getTime() - ((bucketCount - 1) * stepMs);
    const buckets = new Map<number, { count: number; inputTokens: number; outputTokens: number }>();

    for (const request of requests) {
        const bucket = new Date(request.created_at);
        if (Number.isNaN(bucket.getTime())) continue;

        if (isHourly) {
            bucket.setMinutes(0, 0, 0);
        } else {
            bucket.setHours(0, 0, 0, 0);
        }

        const bucketTime = bucket.getTime();
        if (bucketTime < startMs || bucketTime > end.getTime()) continue;
        const current = buckets.get(bucketTime) || { count: 0, inputTokens: 0, outputTokens: 0 };
        const inputTokens = Number(request.prompt_tokens || 0);
        const outputTokens = Number(request.completion_tokens || 0);

        buckets.set(bucketTime, {
            count: current.count + 1,
            inputTokens: current.inputTokens + (Number.isFinite(inputTokens) ? inputTokens : 0),
            outputTokens: current.outputTokens + (Number.isFinite(outputTokens) ? outputTokens : 0),
        });
    }

    return Array.from({ length: bucketCount }, (_, index) => {
        const bucket = new Date(startMs + (index * stepMs));
        const values = buckets.get(bucket.getTime());
        return {
            date: isHourly
                ? bucket.toLocaleTimeString('en-US', { hour: 'numeric' })
                : bucket.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            count: values?.count || 0,
            input_tokens: values?.inputTokens || 0,
            output_tokens: values?.outputTokens || 0,
        };
    });
}

function emptyUsageStats(timeRange: string): UsageStats {
    return {
        total_requests: 0,
        total_tokens: 0,
        input_tokens: 0,
        output_tokens: 0,
        total_cost: 0,
        avg_latency: 0,
        success_rate: 0,
        model_usage: {},
        provider_usage: {},
        daily_requests: buildRequestActivity([], timeRange),
    };
}

function formatCompactNumber(value: number): string {
    return new Intl.NumberFormat('en-US', {
        notation: value >= 1_000 ? 'compact' : 'standard',
        maximumFractionDigits: 1,
    }).format(value);
}

function PeriodMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
    return (
        <div className="min-w-0 px-5 py-5 sm:px-6">
            <p className="text-[10px] font-medium tracking-[0.08em] text-muted-foreground">{label}</p>
            <p className="mt-3 truncate font-mono text-[1.35rem] font-medium leading-none tracking-[-0.05em] tabular-nums sm:text-2xl">{value}</p>
            <p className="mt-2 truncate text-[10px] leading-4 text-muted-foreground">{detail}</p>
        </div>
    );
}

function TrafficLedger({
    title,
    description,
    items,
    total,
    capitalize = false,
}: {
    title: string;
    description: string;
    items: Array<[string, number]>;
    total: number;
    capitalize?: boolean;
}) {
    return (
        <section className="min-w-0">
            <header className="flex items-end justify-between gap-4 px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
                <div>
                    <h3 className="text-sm font-medium tracking-[-0.02em]">{title}</h3>
                    <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{description}</p>
                </div>
                <span className="font-mono text-[9px] tracking-[0.12em] text-muted-foreground">SHARE OF TOTAL</span>
            </header>
            {items.length === 0 ? (
                <div className="flex min-h-48 items-center px-5 pb-6 sm:px-6">
                    <div>
                        <p className="text-xs font-medium">No routed traffic</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">Requests will appear after the first model call.</p>
                    </div>
                </div>
            ) : (
                <ol className="pb-3">
                    {items.map(([name, count], index) => {
                        const share = total > 0 ? (count / total) * 100 : 0;
                        return (
                            <li key={name} className="group relative grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-3 border-t border-border/25 px-5 py-3.5 transition-colors duration-200 hover:bg-foreground/[0.025] sm:px-6">
                                <span className="font-mono text-[9px] text-muted-foreground/60">{String(index + 1).padStart(2, '0')}</span>
                                <div className="min-w-0">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className={clsx("truncate text-xs font-medium", capitalize && "capitalize")}>{name}</span>
                                        <span className="font-mono text-[9px] tabular-nums text-muted-foreground">{share.toFixed(1)}%</span>
                                    </div>
                                    <div className="mt-2 h-px overflow-hidden bg-foreground/[0.07]">
                                        <div className="h-full bg-foreground/65 transition-[width] duration-500" style={{ width: `${share}%` }} />
                                    </div>
                                </div>
                                <span className="w-12 text-right font-mono text-[10px] tabular-nums">{count.toLocaleString()}</span>
                            </li>
                        );
                    })}
                </ol>
            )}
        </section>
    );
}

interface PageProps {
    params: Promise<{ orgSlug: string }>;
}

// Hook to fetch org data
function useOrganization(orgSlug: string) {
    return useQuery({
        queryKey: ["organizationUsage", orgSlug],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('organizations')
                .select('id, name, subscription_tier, monthly_requests_used')
                .eq('slug', orgSlug)
                .single();

            if (error || !data) throw new Error("Organization not found");

            const subscriptionTier: Organization['subscription_tier'] = (
                data.subscription_tier === 'pro'
                || data.subscription_tier === 'team'
                || data.subscription_tier === 'enterprise'
            ) ? data.subscription_tier : 'free';
            const requestsUsed = Number(data.monthly_requests_used ?? 0);

            const organization: Organization = {
                id: data.id,
                name: data.name,
                subscription_tier: subscriptionTier,
                monthly_requests_used: Number.isFinite(requestsUsed) && requestsUsed >= 0
                    ? requestsUsed
                    : 0,
            };

            return organization;
        },
        staleTime: 30 * 1000,
    });
}

// Hook to fetch usage stats across all org projects
function useUsageStats(orgId: string | undefined, timeRange: string) {
    return useQuery({
        queryKey: ["usageStats", orgId, timeRange],
        queryFn: async () => {
            if (!orgId) throw new Error("No org ID");

            // Get all projects for this org
            const { data: projects } = await supabase
                .from('projects')
                .select('id')
                .eq('organization_id', orgId);

            const projectIds = projects?.map((p: { id: string }) => p.id) || [];
            if (projectIds.length === 0) {
                return emptyUsageStats(timeRange);
            }

            // Calculate time filter
            const now = new Date();
            let startTime: Date;
            switch (timeRange) {
                case '24h':
                    startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                    break;
                case '7d':
                    startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
                case '30d':
                    startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    break;
                default:
                    startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            }

            // Fetch all requests across all projects
            const { data: requests } = await supabase
                .from('ai_requests')
                .select('*')
                .in('project_id', projectIds)
                .gte('created_at', startTime.toISOString());

            if (!requests || requests.length === 0) {
                return emptyUsageStats(timeRange);
            }

            // Calculate stats
            const totalRequests = requests.length;
            const successfulRequests = requests.filter((r: { status: string }) => r.status === 'success').length;
            const totalTokens = requests.reduce((sum: number, r: { total_tokens?: number }) => sum + (r.total_tokens || 0), 0);
            const inputTokens = requests.reduce((sum: number, r: { prompt_tokens?: number }) => sum + (r.prompt_tokens || 0), 0);
            const outputTokens = requests.reduce((sum: number, r: { completion_tokens?: number }) => sum + (r.completion_tokens || 0), 0);
            const totalCost = requests.reduce((sum: number, r: { cost_usd?: number }) => sum + (r.cost_usd || 0), 0);
            const latencies = requests.map((r: { latency_ms?: number }) => r.latency_ms).filter((l: number | null | undefined): l is number => l != null);
            const avgLatency = latencies.length > 0
                ? latencies.reduce((sum: number, l: number) => sum + l, 0) / latencies.length
                : 0;

            // Model usage breakdown
            const modelUsage: Record<string, number> = {};
            requests.forEach((r: { model?: string }) => {
                if (r.model) {
                    modelUsage[r.model] = (modelUsage[r.model] || 0) + 1;
                }
            });

            // Provider usage breakdown
            const providerUsage: Record<string, number> = {};
            requests.forEach((r: { provider?: string }) => {
                const provider = r.provider || 'unknown';
                providerUsage[provider] = (providerUsage[provider] || 0) + 1;
            });

            const dailyRequests = buildRequestActivity(requests as UsageRequest[], timeRange);

            return {
                total_requests: totalRequests,
                total_tokens: totalTokens,
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                total_cost: totalCost,
                avg_latency: Math.round(avgLatency),
                success_rate: totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0,
                model_usage: modelUsage,
                provider_usage: providerUsage,
                daily_requests: dailyRequests,
            } as UsageStats;
        },
        enabled: !!orgId,
        staleTime: 60 * 1000,
    });
}

export default function UsagePage({ params }: PageProps) {
    const { orgSlug } = use(params);
    const [timeRange, setTimeRange] = React.useState('7d');
    const [isExporting, setIsExporting] = React.useState(false);
    const [hoveredActivityIndex, setHoveredActivityIndex] = React.useState<number | null>(null);

    const handleExport = async (format: 'csv' | 'json') => {
        setIsExporting(true);
        try {
            const now = new Date();
            let from: string | undefined;
            switch (timeRange) {
                case '24h':
                    from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
                    break;
                case '7d':
                    from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
                    break;
                case '30d':
                    from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
                    break;
            }

            let url = `/api/organizations/${orgSlug}/export?format=${format}`;
            if (from) url += `&from=${from}`;

            const response = await fetch(url);
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Export failed');
            }

            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = `usage-export.${format}`;
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="(.+)"/);
                if (match) filename = match[1];
            }

            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(downloadUrl);

            toast.success(`Usage data exported as ${format.toUpperCase()}`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Export failed');
        } finally {
            setIsExporting(false);
        }
    };

    const { data: org, isLoading: orgLoading } = useOrganization(orgSlug);
    const { data: stats, isLoading: statsLoading } = useUsageStats(org?.id, timeRange);

    const isLoading = orgLoading || statsLoading;

    if (isLoading) {
        return (
            <main className="mx-auto w-full max-w-[980px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
                <div className="flex items-end justify-between gap-6">
                    <div className="space-y-3">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-8 w-28" />
                        <Skeleton className="h-3 w-80 max-w-full" />
                    </div>
                    <Skeleton className="hidden h-8 w-48 sm:block" />
                </div>

                <div className="mt-10 overflow-hidden rounded-lg bg-muted/35 dark:bg-[#111111]">
                    <div className="grid lg:grid-cols-[1.55fr_1fr]">
                        <div className="p-6 sm:p-8 lg:p-10">
                            <Skeleton className="h-3 w-28" />
                            <Skeleton className="mt-8 h-12 w-64" />
                            <Skeleton className="mt-8 h-9 w-full" />
                            <div className="mt-8 grid grid-cols-3 gap-5 border-t border-border/25 pt-5">
                                {[1, 2, 3].map((item) => <Skeleton key={item} className="h-8 w-24 max-w-full" />)}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-px bg-border/25 lg:border-l lg:border-border/25">
                            {[1, 2, 3, 4].map((item) => (
                                <div key={item} className="bg-muted/35 p-6 dark:bg-[#111111]">
                                    <Skeleton className="h-3 w-16" />
                                    <Skeleton className="mt-4 h-7 w-24" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="mt-12 border-y border-border/25 py-7">
                    <div className="flex items-end justify-between">
                        <Skeleton className="h-5 w-28" />
                        <Skeleton className="h-8 w-24" />
                    </div>
                    <Skeleton className="mt-8 h-64 w-full" />
                </div>

                <div className="mt-12 grid overflow-hidden rounded-lg bg-muted/30 dark:bg-[#0d0d0d] lg:grid-cols-2 lg:divide-x lg:divide-border/25">
                    {[1, 2].map((section) => (
                        <div key={section} className="space-y-px">
                            <div className="p-6"><Skeleton className="h-5 w-32" /></div>
                            {[1, 2, 3, 4].map((row) => (
                                <div key={row} className="px-6"><Skeleton className="h-10 w-full" /></div>
                            ))}
                        </div>
                    ))}
                </div>
            </main>
        );
    }

    if (!org) {
        return (
            <div className="w-full max-w-5xl mx-auto px-6 py-8">
                <div className="text-center py-16 flex flex-col items-center">
                    <div className="w-10 h-10 rounded-md bg-secondary flex items-center justify-center mb-3">
                    </div>
                    <p className="text-sm font-medium">Organization not found</p>
                </div>
            </div>
        );
    }

    const monthlyRequestsUsed = Number.isFinite(org.monthly_requests_used) && org.monthly_requests_used >= 0
        ? org.monthly_requests_used
        : 0;

    const topModels = Object.entries(stats?.model_usage || {})
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

    const topProviders = Object.entries(stats?.provider_usage || {})
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

    const totalRequests = stats?.total_requests || 0;
    const totalInputTokens = stats?.input_tokens || 0;
    const totalOutputTokens = stats?.output_tokens || 0;
    const totalTokens = stats?.total_tokens || totalInputTokens + totalOutputTokens;
    const totalCost = stats?.total_cost || 0;
    const successRate = stats?.success_rate || 0;
    const averageLatency = stats?.avg_latency || 0;
    const successfulRequests = Math.round(totalRequests * (successRate / 100));
    const activity = stats?.daily_requests || buildRequestActivity([], timeRange);
    const activityMaximum = Math.max(...activity.map((point) => point.input_tokens + point.output_tokens), 1);
    const activityLabelInterval = activity.length > 24 ? 5 : activity.length > 12 ? 4 : 1;
    const nextReset = new Date();
    nextReset.setMonth(nextReset.getMonth() + 1, 1);
    nextReset.setHours(0, 0, 0, 0);
    const periodLabel = timeRange === '24h' ? 'Last 24 hours' : timeRange === '30d' ? 'Last 30 days' : 'Last 7 days';
    const planLabel = `${org.subscription_tier.charAt(0).toUpperCase()}${org.subscription_tier.slice(1)}`;
    const peakTokenInterval = Math.max(...activity.map((point) => point.input_tokens + point.output_tokens), 0);
    const averageTokenInterval = activity.length > 0 ? totalTokens / activity.length : 0;
    const hoveredActivityPoint = hoveredActivityIndex === null ? null : activity[hoveredActivityIndex] || null;

    return (
        <main className="mx-auto w-full max-w-[980px] px-4 py-8 pb-24 sm:px-6 sm:py-10 lg:px-8">
            <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-[10px] font-medium tracking-[0.18em] text-muted-foreground">ORGANIZATION TELEMETRY</p>
                    <h1 className="mt-3 text-[2rem] font-medium leading-none tracking-[-0.055em]">Usage</h1>
                    <p className="mt-3 max-w-[60ch] text-xs leading-5 text-muted-foreground">
                        Model traffic, token consumption, and capacity across {org.name}.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 rounded-md border-border/30 bg-transparent px-3 text-[10px] shadow-none transition-colors hover:bg-muted/50 active:scale-[0.98]" disabled={isExporting}>
                                {isExporting && <Loader2 className="mr-1 size-3 animate-spin" />}
                                Export data
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleExport('csv')}>Export CSV</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleExport('json')}>Export JSON</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <div className="flex h-8 items-center rounded-md border border-border/30 p-0.5" aria-label="Usage period">
                        {['24h', '7d', '30d'].map((range) => {
                            const isGated = range === '30d' && org.subscription_tier === 'free';

                            if (isGated) {
                                return (
                                    <div key={range} className="group relative">
                                        <span
                                            tabIndex={0}
                                            aria-label="30-day history requires an upgrade"
                                            className="block rounded-[4px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                        >
                                            <button
                                                type="button"
                                                disabled
                                                className="h-6 cursor-not-allowed rounded-[4px] px-3 font-mono text-[9px] font-medium text-muted-foreground/45"
                                            >
                                                30D
                                            </button>
                                        </span>
                                        <div
                                            className="pointer-events-none invisible absolute -right-4 top-full z-50 w-60 pt-2 group-hover:pointer-events-auto group-hover:visible group-focus-within:pointer-events-auto group-focus-within:visible"
                                        >
                                            <div
                                                role="dialog"
                                                aria-label="Upgrade to unlock 30-day history"
                                                className="rounded-md border border-border/30 bg-[#f0f0ee] p-3.5 shadow-2xl dark:bg-[#191919]"
                                            >
                                                <p className="text-[11px] font-medium text-popover-foreground">Unlock 30-day history</p>
                                                <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Available on Pro, Team, and Enterprise plans.</p>
                                                <Link
                                                    href={`/${orgSlug}/~/billing`}
                                                    className="mt-3 inline-flex text-[10px] font-medium text-popover-foreground underline underline-offset-4 transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                >
                                                    Upgrade plan
                                                </Link>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            return (
                                <button
                                key={range}
                                type="button"
                                onClick={() => {
                                    setHoveredActivityIndex(null);
                                    setTimeRange(range);
                                }}
                                    aria-pressed={timeRange === range}
                                    className={clsx(
                                        "h-6 rounded-[4px] px-3 font-mono text-[9px] font-medium transition-[background-color,color,transform] duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:scale-[0.97]",
                                        timeRange === range ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                                    )}
                                >
                                    {range.toUpperCase()}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </header>

            <section className="relative mt-10 overflow-hidden rounded-lg bg-[#f3f3f1] dark:bg-[#111111]" aria-labelledby="capacity-heading">
                <div className="grid lg:grid-cols-[1.55fr_1fr]">
                    <div className="relative px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-10">
                        <div>
                            <div>
                                <p className="text-[9px] font-medium tracking-[0.16em] text-muted-foreground">REQUESTS THIS MONTH</p>
                                <h2 id="capacity-heading" className="mt-2 text-sm font-medium">{planLabel} plan</h2>
                            </div>
                        </div>

                        <div className="mt-10 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                            <div className="flex min-w-0 items-baseline gap-3">
                                <span className="font-mono text-4xl font-medium leading-none tracking-[-0.075em] tabular-nums sm:text-[3.25rem]">{monthlyRequestsUsed.toLocaleString()}</span>
                                <span className="truncate text-xs text-muted-foreground">requests</span>
                            </div>
                        </div>

                        {/* The quota meter that used to sit here charted requests
                            against a per-tier ceiling. There is no ceiling on any
                            plan now, so there is nothing to fill. Spend is the
                            number worth watching, and it has its own tile. */}

                        <dl className="mt-8 grid grid-cols-2 gap-4 border-t border-border/25 pt-5">
                            <div className="min-w-0">
                                <dt className="text-[9px] tracking-[0.08em] text-muted-foreground">Resets</dt>
                                <dd className="mt-1.5 truncate text-[11px]">{nextReset.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</dd>
                            </div>
                            <div className="min-w-0">
                                <dt className="text-[9px] tracking-[0.08em] text-muted-foreground">Scope</dt>
                                <dd className="mt-1.5 truncate text-[11px]">All projects</dd>
                            </div>
                        </dl>
                    </div>

                    <div className="grid grid-cols-2 gap-px border-t border-border/25 bg-border/25 lg:border-l lg:border-t-0">
                        <div className="bg-[#f3f3f1] dark:bg-[#111111]"><PeriodMetric label="Requests" value={totalRequests.toLocaleString()} detail={periodLabel} /></div>
                        <div className="bg-[#f3f3f1] dark:bg-[#111111]"><PeriodMetric label="Success" value={`${successRate.toFixed(1)}%`} detail={`${successfulRequests.toLocaleString()} completed`} /></div>
                        <div className="bg-[#f3f3f1] dark:bg-[#111111]"><PeriodMetric label="Tokens" value={formatCompactNumber(totalTokens)} detail={totalRequests ? `${formatCompactNumber(Math.round(totalTokens / totalRequests))} / request` : 'No token activity'} /></div>
                        <div className="bg-[#f3f3f1] dark:bg-[#111111]"><PeriodMetric label="Spend" value={`$${totalCost.toFixed(2)}`} detail={totalRequests ? `$${(totalCost / totalRequests).toFixed(4)} / request` : 'No spend recorded'} /></div>
                        <div className="col-span-2 flex items-center justify-between gap-4 bg-[#ededeb] px-5 py-4 dark:bg-[#0d0d0d] sm:px-6">
                            <span className="text-[10px] text-muted-foreground">Mean response latency</span>
                            <span className="font-mono text-xs tabular-nums">{averageLatency.toLocaleString()} ms</span>
                        </div>
                    </div>
                </div>
            </section>

            <section className="mt-14 overflow-hidden rounded-lg bg-muted/30 dark:bg-[#111111]" aria-labelledby="activity-heading">
                <header className="flex flex-col gap-5 border-b border-border/25 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6 sm:py-6">
                    <div>
                        <p className="text-[9px] font-medium tracking-[0.16em] text-muted-foreground">TOKEN FLOW</p>
                        <h2 id="activity-heading" className="mt-2 text-lg font-medium tracking-[-0.035em]">Input and output tokens</h2>
                        <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">Token volume processed across every organization project.</p>
                    </div>
                    <div className="flex gap-8 sm:text-right">
                        <div>
                            <p className="text-[9px] text-muted-foreground">Peak tokens</p>
                            <p className="mt-1.5 font-mono text-xs tabular-nums">{formatCompactNumber(peakTokenInterval)}</p>
                        </div>
                        <div>
                            <p className="text-[9px] text-muted-foreground">Average tokens</p>
                            <p className="mt-1.5 font-mono text-xs tabular-nums">{formatCompactNumber(Math.round(averageTokenInterval))}</p>
                        </div>
                    </div>
                </header>

                <div className="relative overflow-hidden px-5 pb-5 pt-6 sm:px-6 sm:pb-6 sm:pt-7">
                    <div
                        className="relative h-64 w-full sm:h-72"
                        role="img"
                        aria-label={`Input and output token activity for the ${periodLabel.toLowerCase()}`}
                        onMouseLeave={() => setHoveredActivityIndex(null)}
                    >
                        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden="true">
                            {[0, 1, 2, 3].map((line) => <span key={line} className="w-full border-t border-foreground/[0.08]" />)}
                        </div>

                        <div className="absolute inset-0 z-10 flex items-end">
                            {activity.map((point, index) => {
                                const intervalTokens = point.input_tokens + point.output_tokens;
                                const barHeight = intervalTokens > 0 ? Math.max((intervalTokens / activityMaximum) * 100, 1.5) : 0;
                                const inputShare = intervalTokens > 0 ? (point.input_tokens / intervalTokens) * 100 : 0;
                                const outputShare = intervalTokens > 0 ? (point.output_tokens / intervalTokens) * 100 : 0;
                                const isActive = hoveredActivityIndex === index;

                                return (
                                    <div
                                        key={`${point.date}-bars-${index}`}
                                        className={clsx(
                                            "relative flex h-full min-w-0 flex-1 cursor-crosshair items-end justify-center px-px transition-colors",
                                            isActive && "bg-foreground/[0.025]",
                                        )}
                                        onMouseEnter={() => setHoveredActivityIndex(index)}
                                    >
                                        <div
                                            className="flex w-full min-w-[4px] flex-col overflow-hidden rounded-t-[2px] transition-opacity duration-150"
                                            style={{ height: `${barHeight}%`, opacity: isActive ? 1 : 0.86 }}
                                        >
                                            <span className="w-full bg-orange-400" style={{ height: `${outputShare}%` }} />
                                            <span className="w-full bg-emerald-500" style={{ height: `${inputShare}%` }} />
                                        </div>

                                        {isActive && hoveredActivityPoint && (
                                            <div
                                                role="status"
                                                className={clsx(
                                                    "pointer-events-none absolute top-3 z-20 w-44 rounded-md border border-border/30 bg-[#f0f0ee] px-3 py-2.5 text-left shadow-xl dark:bg-[#191919]",
                                                    index <= 1 ? "left-0" : index >= activity.length - 2 ? "right-0" : "left-1/2 -translate-x-1/2",
                                                )}
                                            >
                                                <p className="font-mono text-[9px] text-muted-foreground">{point.date}</p>
                                                <div className="mt-2.5 flex items-center justify-between gap-5">
                                                    <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><span className="size-1.5 bg-emerald-500" />Input</span>
                                                    <span className="font-mono text-[10px] font-medium tabular-nums">{point.input_tokens.toLocaleString()}</span>
                                                </div>
                                                <div className="mt-1.5 flex items-center justify-between gap-5">
                                                    <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><span className="size-1.5 bg-orange-400" />Output</span>
                                                    <span className="font-mono text-[10px] font-medium tabular-nums">{point.output_tokens.toLocaleString()}</span>
                                                </div>
                                                <div className="mt-2 flex items-center justify-between gap-5 border-t border-border/25 pt-2">
                                                    <span className="text-[10px] text-muted-foreground">Requests</span>
                                                    <span className="font-mono text-[10px] tabular-nums">{point.count.toLocaleString()}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {totalTokens === 0 && (
                            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                                <div className="bg-background/80 px-4 py-3 text-center backdrop-blur-sm">
                                    <p className="text-xs font-medium">No token activity</p>
                                    <p className="mt-1 text-[10px] text-muted-foreground">Input and output volume will appear after the first model call.</p>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="mt-1 flex justify-between gap-2 font-mono text-[8px] text-muted-foreground">
                        {activity.map((point, index) => {
                            const showLabel = index === 0 || index === activity.length - 1 || index % activityLabelInterval === 0;
                            return (
                                <span key={`${point.date}-label-${index}`} className="min-w-0 flex-1 truncate text-center">{showLabel ? point.date : ''}</span>
                            );
                        })}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/25 pt-4 text-[10px]">
                        <div className="flex items-center gap-2">
                            <span className="size-2 bg-emerald-500" />
                            <span className="text-muted-foreground">Input tokens</span>
                            <span className="font-mono tabular-nums">{formatCompactNumber(totalInputTokens)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="size-2 bg-orange-400" />
                            <span className="text-muted-foreground">Output tokens</span>
                            <span className="font-mono tabular-nums">{formatCompactNumber(totalOutputTokens)}</span>
                        </div>
                        <span className="ml-auto font-mono text-[9px] text-muted-foreground">{timeRange === '24h' ? 'HOURLY' : 'DAILY'} BUCKETS</span>
                    </div>
                </div>
            </section>

            <section className="mt-14" aria-labelledby="routing-heading">
                <header>
                    <p className="text-[9px] font-medium tracking-[0.16em] text-muted-foreground">ROUTING DISTRIBUTION</p>
                    <h2 id="routing-heading" className="mt-2 text-lg font-medium tracking-[-0.035em]">Where traffic ran</h2>
                    <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">
                        Traffic distribution for the selected window. Bars show share of total requests, not usage limits.
                    </p>
                </header>

                <div className="mt-6 grid overflow-hidden rounded-lg bg-muted/30 dark:bg-[#0d0d0d] lg:grid-cols-2 lg:divide-x lg:divide-border/25">
                    <TrafficLedger title="Models" description="Request share by model identifier" items={topModels} total={totalRequests} />
                    <div className="border-t border-border/25 lg:border-t-0">
                        <TrafficLedger title="Providers" description="Request share by upstream provider" items={topProviders} total={totalRequests} capitalize />
                    </div>
                </div>
            </section>

            <footer className="mt-12 flex flex-col gap-2 border-t border-border/25 pt-5 text-[10px] leading-4 text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <p>Usage aggregates every project and environment in {org.name}.</p>
                <p className="font-mono">WINDOW / {timeRange.toUpperCase()}</p>
            </footer>
        </main>
    );
}
