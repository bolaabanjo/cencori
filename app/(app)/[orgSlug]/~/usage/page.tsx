"use client";

import React, { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { cn as clsx } from "@/lib/utils";
import { supabase } from '@/lib/supabaseClient';
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Organization {
    id: string;
    name: string;
    subscription_tier: 'free' | 'pro' | 'team' | 'enterprise';
    monthly_requests_used: number;
    monthly_request_limit: number;
}

interface UsageStats {
    total_requests: number;
    total_tokens: number;
    total_cost: number;
    avg_latency: number;
    success_rate: number;
    model_usage: Record<string, number>;
    provider_usage: Record<string, number>;
    daily_requests: Array<{ date: string; count: number }>;
}

interface PageProps {
    params: Promise<{ orgSlug: string }>;
}

// Hook to fetch org data
function useOrganization(orgSlug: string) {
    return useQuery({
        queryKey: ["organization", orgSlug],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('organizations')
                .select('id, name, subscription_tier, monthly_requests_used, monthly_request_limit')
                .eq('slug', orgSlug)
                .single();

            if (error || !data) throw new Error("Organization not found");
            return data as Organization;
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
                return {
                    total_requests: 0,
                    total_tokens: 0,
                    total_cost: 0,
                    avg_latency: 0,
                    success_rate: 0,
                    model_usage: {},
                    provider_usage: {},
                    daily_requests: [],
                };
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
                return {
                    total_requests: 0,
                    total_tokens: 0,
                    total_cost: 0,
                    avg_latency: 0,
                    success_rate: 0,
                    model_usage: {},
                    provider_usage: {},
                    daily_requests: [],
                };
            }

            // Calculate stats
            const totalRequests = requests.length;
            const successfulRequests = requests.filter((r: { status: string }) => r.status === 'success').length;
            const totalTokens = requests.reduce((sum: number, r: { total_tokens?: number }) => sum + (r.total_tokens || 0), 0);
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

            // Daily requests breakdown
            const dailyMap: Record<string, number> = {};
            requests.forEach((r: { created_at: string }) => {
                const date = new Date(r.created_at).toISOString().split('T')[0];
                dailyMap[date] = (dailyMap[date] || 0) + 1;
            });
            const dailyRequests = Object.entries(dailyMap)
                .map(([date, count]) => ({ date, count }))
                .sort((a, b) => a.date.localeCompare(b.date));

            return {
                total_requests: totalRequests,
                total_tokens: totalTokens,
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

const PROVIDER_COLORS: Record<string, string> = {
    openai: 'bg-emerald-500',
    anthropic: 'bg-orange-500',
    google: 'bg-blue-500',
    mistral: 'bg-pink-500',
    groq: 'bg-yellow-500',
    cohere: 'bg-purple-500',
    deepseek: 'bg-cyan-500',
};

export default function UsagePage({ params }: PageProps) {
    const { orgSlug } = use(params);
    const [timeRange, setTimeRange] = React.useState('7d');
    const [isExporting, setIsExporting] = React.useState(false);
    const [exportFormat, setExportFormat] = React.useState<'csv' | 'json'>('csv');

    const handleExport = async (format: 'csv' | 'json') => {
        setIsExporting(true);
        setExportFormat(format);
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
            <div className="w-full max-w-5xl mx-auto px-6 py-8 space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <Skeleton className="h-5 w-16" />
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-7 w-16 rounded-md" />
                        <Skeleton className="h-7 w-28 rounded-lg" />
                    </div>
                </div>

                {/* Monthly Quota skeleton */}
                <div className="rounded-md border border-border/40 bg-card overflow-hidden">
                    <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between">
                        <div>
                            <Skeleton className="h-4 w-28 mb-2" />
                            <Skeleton className="h-3 w-44" />
                        </div>
                        <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                    <div className="p-6">
                        <div className="flex items-center gap-[2px] w-full h-6 mb-3">
                            {Array.from({ length: 60 }).map((_, i) => (
                                <div key={i} className="flex-1 h-full rounded-[1px] bg-muted-foreground/10" />
                            ))}
                        </div>
                        <div className="flex items-center justify-between">
                            <Skeleton className="h-3 w-52" />
                            <Skeleton className="h-3 w-24" />
                        </div>
                    </div>
                </div>

                {/* Stats + breakdowns skeleton */}
                <div className="rounded-md border border-border/40 bg-card overflow-hidden">
                    <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-border/30">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="px-5 py-4">
                                <Skeleton className="h-3 w-16 mb-2.5" />
                                <Skeleton className="h-6 w-20 mb-2" />
                                <Skeleton className="h-3 w-24" />
                            </div>
                        ))}
                    </div>
                    <div className="grid md:grid-cols-2 divide-x divide-border/30 border-t border-border/30">
                        {[1, 2].map((section) => (
                            <div key={section}>
                                <div className="px-5 py-3 border-b border-border/20">
                                    <Skeleton className="h-3 w-16" />
                                </div>
                                <div className="divide-y divide-border/10">
                                    {[1, 2, 3].map((row) => (
                                        <div key={row} className="flex items-center justify-between px-5 py-2.5">
                                            <Skeleton className="h-3.5 w-32" />
                                            <div className="flex items-center gap-3">
                                                <Skeleton className="w-16 h-1 rounded-full" />
                                                <Skeleton className="h-3 w-8" />
                                                <Skeleton className="h-3 w-8" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
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

    const percentage = Math.min((org.monthly_requests_used / org.monthly_request_limit) * 100, 100);
    const isNearLimit = percentage >= 80;
    const isAtLimit = percentage >= 100;

    const topModels = Object.entries(stats?.model_usage || {})
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

    const topProviders = Object.entries(stats?.provider_usage || {})
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

    return (
        <div className="w-full max-w-5xl mx-auto px-6 py-8 space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-base font-medium">Usage</h1>
                </div>
                <div className="flex items-center gap-2">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px] px-2.5"
                            disabled={isExporting}
                        >
                            {isExporting && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                            Export
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleExport('csv')}>
                            CSV
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleExport('json')}>
                            JSON
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                <div className="flex bg-muted/50 p-0.5 rounded-lg border border-border/40">
                    {['24h', '7d', '30d'].map((range) => (
                        <button
                            key={range}
                            onClick={() => setTimeRange(range)}
                            className={`px-3 py-1 text-[10px] font-medium rounded-md transition-all ${timeRange === range
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            {range}
                        </button>
                    ))}
                </div>
                </div>
            </div>

            {/* Monthly Quota */}
            <div className="rounded-md border border-border/40 bg-card overflow-hidden">
                <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-medium tracking-tight">Monthly Quota</h3>
                        <p className="text-[11px] text-muted-foreground mt-1">
                            {org.monthly_requests_used.toLocaleString()} / {org.monthly_request_limit.toLocaleString()} requests used
                        </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] h-5 gap-1.5 px-2.5 font-normal uppercase tracking-wider">
                        <span className={`size-1.5 rounded-full ${isAtLimit ? 'bg-red-500' : 'bg-emerald-500'}`} />
                        {org.subscription_tier} Plan
                    </Badge>
                </div>
                <div className="p-6">
                    <div className="flex items-center gap-[2px] w-full h-6 mb-3">
                        {Array.from({ length: 60 }).map((_, i) => {
                            const filled = i < Math.round((percentage / 100) * 60);
                            const barColor = isAtLimit ? "bg-red-500" : isNearLimit ? "bg-amber-500" : "bg-emerald-500";
                            return (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, scaleY: 0 }}
                                    animate={{ opacity: filled ? 1 : 0.15, scaleY: 1 }}
                                    transition={{ duration: 0.3, delay: i * 0.008, ease: "easeOut" }}
                                    className={clsx(
                                        "flex-1 h-full rounded-[1px]",
                                        filled ? barColor : "bg-muted-foreground/50"
                                    )}
                                />
                            );
                        })}
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">Reset happens on the 1st of every month</span>
                        {isAtLimit ? (
                            <span className="flex items-center gap-1.5 text-red-500 font-medium">
                                <AlertTriangle className="h-3 w-3" />
                                Limit reached
                            </span>
                        ) : (
                            <span className={isNearLimit ? "text-amber-500 font-medium" : "text-muted-foreground"}>
                                {Math.round(100 - percentage)}% remaining
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Stats + Breakdowns — single dense card */}
            <div className="rounded-md border border-border/40 bg-card overflow-hidden">
                {/* Top row: key metrics */}
                <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-border/30">
                    <div className="px-5 py-4">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Requests</span>
                        <p className="text-xl font-semibold font-mono tracking-tight mt-1">{(stats?.total_requests || 0).toLocaleString()}</p>
                        <span className="text-[10px] text-muted-foreground">{stats?.success_rate ? `${stats.success_rate.toFixed(1)}% success` : '—'}</span>
                    </div>
                    <div className="px-5 py-4">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Tokens</span>
                        <p className="text-xl font-semibold font-mono tracking-tight mt-1">
                            {stats?.total_tokens && stats.total_tokens >= 1000000
                                ? `${(stats.total_tokens / 1000000).toFixed(1)}M`
                                : stats?.total_tokens && stats.total_tokens >= 1000
                                    ? `${(stats.total_tokens / 1000).toFixed(1)}K`
                                    : (stats?.total_tokens || 0).toLocaleString()}
                        </p>
                        <span className="text-[10px] text-muted-foreground">
                            {stats?.total_requests ? `~${Math.round((stats?.total_tokens || 0) / stats.total_requests)} per req` : '—'}
                        </span>
                    </div>
                    <div className="px-5 py-4">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Cost</span>
                        <p className="text-xl font-semibold font-mono tracking-tight mt-1">${(stats?.total_cost || 0).toFixed(2)}</p>
                        <span className="text-[10px] text-muted-foreground">
                            {stats?.total_requests ? `$${((stats?.total_cost || 0) / stats.total_requests).toFixed(4)}/req` : '—'}
                        </span>
                    </div>
                    <div className="px-5 py-4">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Avg Latency</span>
                        <p className="text-xl font-semibold font-mono tracking-tight mt-1">{stats?.avg_latency || 0}ms</p>
                        <span className="text-[10px] text-muted-foreground">
                            {(stats?.avg_latency || 0) > 1000 ? `${((stats?.avg_latency || 0) / 1000).toFixed(1)}s` : 'p50 response'}
                        </span>
                    </div>
                </div>

                {/* Bottom row: models + providers side by side */}
                <div className="grid md:grid-cols-2 divide-x divide-border/30 border-t border-border/30">
                    {/* Models */}
                    <div>
                        <div className="px-5 py-3 border-b border-border/20">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Models</span>
                        </div>
                        {topModels.length === 0 ? (
                            <div className="px-5 py-6 text-xs text-muted-foreground">No data</div>
                        ) : (
                            <div className="divide-y divide-border/10">
                                {topModels.map(([model, count]) => {
                                    const pct = stats?.total_requests ? (count / stats.total_requests) * 100 : 0;
                                    return (
                                        <div key={model} className="flex items-center justify-between px-5 py-2.5 hover:bg-muted/10 transition-colors">
                                            <span className="text-xs font-medium truncate mr-4">{model}</span>
                                            <div className="flex items-center gap-3 shrink-0">
                                                <div className="w-16 h-1 rounded-full bg-muted-foreground/10 overflow-hidden">
                                                    <div className="h-full rounded-full bg-foreground/40" style={{ width: `${pct}%` }} />
                                                </div>
                                                <span className="text-[11px] tabular-nums text-muted-foreground w-8 text-right">{pct.toFixed(0)}%</span>
                                                <span className="text-[11px] tabular-nums text-foreground w-10 text-right font-medium">{count.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Providers */}
                    <div>
                        <div className="px-5 py-3 border-b border-border/20">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Providers</span>
                        </div>
                        {topProviders.length === 0 ? (
                            <div className="px-5 py-6 text-xs text-muted-foreground">No data</div>
                        ) : (
                            <div className="divide-y divide-border/10">
                                {topProviders.map(([provider, count]) => {
                                    const pct = stats?.total_requests ? (count / stats.total_requests) * 100 : 0;
                                    return (
                                        <div key={provider} className="flex items-center justify-between px-5 py-2.5 hover:bg-muted/10 transition-colors">
                                            <span className="text-xs font-medium capitalize truncate mr-4">{provider}</span>
                                            <div className="flex items-center gap-3 shrink-0">
                                                <div className="w-16 h-1 rounded-full bg-muted-foreground/10 overflow-hidden">
                                                    <div className="h-full rounded-full bg-foreground/40" style={{ width: `${pct}%` }} />
                                                </div>
                                                <span className="text-[11px] tabular-nums text-muted-foreground w-8 text-right">{pct.toFixed(0)}%</span>
                                                <span className="text-[11px] tabular-nums text-foreground w-10 text-right font-medium">{count.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
