"use client";

/**
 * AI Gateway — product Overview at the project level.
 *
 * Distinct from the project Overview at `/{org}/{proj}` which will
 * eventually summarize across every product a project uses (AI Gateway
 * today; Memory, Compute, Cloud as they ship). This page is scoped to
 * the AI Gateway product only.
 *
 * For now it shows AI-specific stats — requests, cost, tokens, latency.
 * When Memory / Compute ship, the project Overview will pull each
 * product's headline stats into a single summary; this page continues
 * to serve as the AI Gateway product homepage with deeper AI-specific
 * detail.
 */

import { use, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { supabase as browserSupabase } from "@/lib/supabaseClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Bar, BarChart, XAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useEnvironment } from "@/lib/contexts/EnvironmentContext";
import { ArrowUpRight } from "lucide-react";

interface AIStats {
    totalRequests: number;
    successfulRequests: number;
    errorRequests: number;
    filteredRequests: number;
    totalCost: string;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    averageLatency: number;
}

interface ChartDataPoint {
    date: string;
    requests: number;
}

interface ProjectData {
    id: string;
    name: string;
    slug: string;
}

function useProject(orgSlug: string, projectSlug: string) {
    return useQuery({
        queryKey: ["projectId", orgSlug, projectSlug],
        queryFn: async (): Promise<ProjectData | null> => {
            const { data: org } = await browserSupabase
                .from("organizations")
                .select("id")
                .eq("slug", orgSlug)
                .single();
            if (!org) return null;
            const { data: project } = await browserSupabase
                .from("projects")
                .select("id, name, slug")
                .eq("slug", projectSlug)
                .eq("organization_id", org.id)
                .single();
            return (project as ProjectData) || null;
        },
        staleTime: 5 * 60 * 1000,
    });
}

export default function AiGatewayOverviewPage({
    params,
}: {
    params: Promise<{ orgSlug: string; projectSlug: string }>;
}) {
    const { orgSlug, projectSlug } = use(params);
    const { environment } = useEnvironment();
    const { data: project, isLoading: projectLoading } = useProject(orgSlug, projectSlug);

    const { data: statsData, isLoading: statsLoading } = useQuery<{
        stats: AIStats;
        chartData: ChartDataPoint[];
    } | null>({
        queryKey: ["projectAiStats", project?.id, "7d", environment],
        queryFn: async () => {
            if (!project?.id) return null;
            const response = await fetch(
                `/api/projects/${project.id}/ai/stats?period=7d&environment=${environment}`
            );
            if (!response.ok) return null;
            return response.json();
        },
        enabled: !!project?.id,
        staleTime: 60 * 1000,
    });

    const stats = statsData?.stats;
    const chartData = statsData?.chartData || [];
    const busy = projectLoading || statsLoading;

    const successRate = useMemo(() => {
        if (!stats || stats.totalRequests === 0) return null;
        return ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(1);
    }, [stats]);

    return (
        <div className="w-full max-w-[1360px] mx-auto px-6 py-8">
            <div className="mb-8">
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    AI Gateway
                </p>
                <h1 className="text-base font-medium mt-1">Overview</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Last 7 days · {environment}
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <StatCard
                    label="Requests"
                    value={stats ? stats.totalRequests.toLocaleString() : "—"}
                    hint={successRate ? `${successRate}% success` : "no data yet"}
                    loading={busy}
                />
                <StatCard
                    label="Cost"
                    value={stats ? `$${Number(stats.totalCost).toFixed(4)}` : "—"}
                    hint={stats ? `${stats.totalTokens.toLocaleString()} tokens` : "no data yet"}
                    loading={busy}
                />
                <StatCard
                    label="Latency"
                    value={stats && stats.averageLatency > 0 ? `${Math.round(stats.averageLatency)}ms` : "—"}
                    hint="avg across models"
                    loading={busy}
                />
                <StatCard
                    label="Errors"
                    value={stats ? stats.errorRequests.toLocaleString() : "—"}
                    hint={stats ? `${stats.filteredRequests.toLocaleString()} filtered` : "no data yet"}
                    loading={busy}
                />
            </div>

            <div className="border border-border/40 rounded-md p-5 mb-6 bg-card">
                <div className="flex items-baseline justify-between mb-4">
                    <div>
                        <p className="text-xs font-medium">Requests · 7-day</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                            Volume by day across every model this project has called
                        </p>
                    </div>
                    <Link
                        href={`/${orgSlug}/${projectSlug}/observability`}
                        className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    >
                        Observability <ArrowUpRight className="size-3" />
                    </Link>
                </div>
                {busy ? (
                    <Skeleton className="h-40 w-full" />
                ) : chartData.length === 0 ? (
                    <div className="h-40 flex items-center justify-center text-[11px] text-muted-foreground">
                        No requests in this window
                    </div>
                ) : (
                    <ChartContainer
                        config={{ requests: { label: "Requests", color: "hsl(var(--foreground))" } }}
                        className="h-40 w-full"
                    >
                        <BarChart data={chartData}>
                            <XAxis
                                dataKey="date"
                                tickLine={false}
                                axisLine={false}
                                tick={{ fontSize: 10 }}
                            />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Bar dataKey="requests" fill="var(--color-requests)" radius={2} />
                        </BarChart>
                    </ChartContainer>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <JumpCard
                    href={`/${orgSlug}/${projectSlug}/ai-gateway/playground`}
                    title="Playground"
                    body="Test any of the 150+ models with your project's keys."
                />
                <JumpCard
                    href={`/${orgSlug}/${projectSlug}/ai-gateway/prompts`}
                    title="Prompts"
                    body="Save reusable prompts you can reference by name from any SDK."
                />
                <JumpCard
                    href={`/${orgSlug}/${projectSlug}/ai-gateway/providers`}
                    title="BYOK"
                    body="Bring your own OpenAI, Anthropic, Google, and other provider keys."
                />
            </div>
        </div>
    );
}

function StatCard({
    label,
    value,
    hint,
    loading,
}: {
    label: string;
    value: string;
    hint: string;
    loading: boolean;
}) {
    return (
        <div className="border border-border/40 rounded-md p-4 bg-card">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            {loading ? (
                <Skeleton className="h-6 w-20 mt-1.5" />
            ) : (
                <p className="text-lg font-medium tabular-nums mt-1">{value}</p>
            )}
            <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>
        </div>
    );
}

function JumpCard({ href, title, body }: { href: string; title: string; body: string }) {
    return (
        <Link
            href={href}
            className="group border border-border/40 rounded-md p-4 bg-card hover:border-border transition-colors flex flex-col"
        >
            <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-medium">{title}</p>
                <ArrowUpRight className="size-3.5 text-muted-foreground opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{body}</p>
        </Link>
    );
}
