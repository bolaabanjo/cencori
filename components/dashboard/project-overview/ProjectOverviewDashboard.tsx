"use client";

import { useId, useMemo } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import Github from "@/components/logos/github";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface ProjectOverviewStats {
  totalRequests: number;
  successfulRequests: number;
  errorRequests: number;
  filteredRequests: number;
  totalCost: string;
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  avgLatency: number;
}

export interface ProjectOverviewChartPoint {
  date: string;
  count: number;
  cost: number;
  tokens: number;
  promptTokens: number;
  completionTokens: number;
  successful: number;
  errors: number;
  filtered: number;
}

export interface ProjectOverviewModel {
  model: string;
  count: number;
  cost: number;
}

export interface ProjectOverviewDeployment {
  status: string;
  agentName: string;
  endpoint: string | null;
  framework: string;
  repoFullName: string | null;
  branch: string;
  version: number | null;
  updatedAt: string | null;
}

export interface ProjectOverviewMonetization {
  enabled: boolean;
  customerRevenue: number;
  providerCost: number;
  margin: number;
  marginPercentage: number;
  activeCustomers: number;
  totalCustomers: number;
}

type MetricDataKey = "count" | "cost" | "tokens" | "successRate";
type MetricChartPoint = ProjectOverviewChartPoint & { successRate: number };

const PERIODS = [
  { value: "1h", label: "Last hour" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All time" },
] as const;

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatCost(value: number): string {
  if (value === 0) return "$0.00";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function percentage(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, (value / total) * 100);
}

function MetricCell({
  label,
  value,
  detail,
  loading,
  data,
  dataKey,
  color,
  formatValue,
  hasData,
  reduceMotion,
}: {
  label: string;
  value: string;
  detail: string;
  loading: boolean;
  data: MetricChartPoint[];
  dataKey: MetricDataKey;
  color: string;
  formatValue: (value: number) => string;
  hasData: boolean;
  reduceMotion: boolean | null;
}) {
  const gradientId = `metric-gradient-${useId().replace(/:/g, "")}`;
  const firstDate = data[0]?.date;
  const lastDate = data[data.length - 1]?.date;
  const dateTicks = firstDate && lastDate && firstDate !== lastDate
    ? [firstDate, lastDate]
    : firstDate
      ? [firstDate]
      : [];
  const chartConfig = {
    [dataKey]: { label, color },
  } satisfies ChartConfig;

  return (
    <div className="group flex min-h-[22rem] min-w-0 flex-col border-b border-border/30 px-6 py-6 transition-colors duration-150 hover:bg-muted/65 md:odd:border-r">
      <div className="flex items-start justify-between gap-4">
        <p className="shrink-0 text-[13px] font-medium text-foreground/80">{label}</p>
        <p className="truncate text-right text-[11px] leading-4 text-muted-foreground">{detail}</p>
      </div>
      {loading ? (
        <div className="mt-5 flex flex-1 flex-col space-y-3">
          <Skeleton className="h-7 w-24 rounded-sm" />
          <Skeleton className="h-3 w-32 rounded-sm" />
          <Skeleton className="mt-auto h-24 w-full rounded-sm" />
        </div>
      ) : (
        <>
          <p className="mt-5 font-mono text-[2.1rem] font-medium leading-none tracking-[-0.045em] tabular-nums">
            {value}
          </p>
          <div className="relative mt-auto h-[13rem] pt-6">
            <ChartContainer config={chartConfig} className="h-full w-full aspect-auto">
              <AreaChart data={data} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={`var(--color-${dataKey})`} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={`var(--color-${dataKey})`} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.35} />
                <XAxis
                  dataKey="date"
                  ticks={dateTicks}
                  interval={0}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  tick={{ fontSize: 9 }}
                />
                <YAxis hide domain={[0, "auto"]} />
                <ChartTooltip
                  cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }}
                  content={
                    <ChartTooltipContent
                      indicator="line"
                      formatter={(chartValue) => (
                        <div className="flex min-w-28 items-center justify-between gap-4">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-mono font-medium tabular-nums">
                            {formatValue(Number(chartValue))}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey={dataKey}
                  stroke={`var(--color-${dataKey})`}
                  strokeWidth={1.6}
                  fill={`url(#${gradientId})`}
                  dot={false}
                  activeDot={{ r: 2.75, strokeWidth: 2, fill: "var(--background)" }}
                  isAnimationActive={!reduceMotion}
                  animationDuration={260}
                />
              </AreaChart>
            </ChartContainer>
            {!hasData && (
              <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center">
                <span className="rounded-md bg-primary/55 px-3 py-1.5 text-[11px] font-medium text-primary-foreground/80">
                  No data for this period
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function formatFramework(framework: string): string {
  const frameworks: Record<string, string> = {
    arcie: "Arcie",
    langgraph: "LangGraph",
    crewai: "CrewAI",
    "openai-agents": "OpenAI Agents SDK",
    mastra: "Mastra",
    "vercel-eve": "eve",
  };

  return frameworks[framework.toLowerCase()] ?? framework;
}

function formatUpdatedAt(value: string | null): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function deploymentStatus(status: string | null | undefined) {
  const normalized = status?.toLowerCase() ?? "";

  if (["live", "deployed", "ready", "healthy", "active"].includes(normalized)) {
    return {
      label: "Live",
      dotClassName: "bg-emerald-500",
      badgeClassName: "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-600 dark:text-emerald-400",
    };
  }
  if (["building", "created", "pending", "deploying"].includes(normalized)) {
    return {
      label: "Building",
      dotClassName: "bg-amber-500",
      badgeClassName: "border-amber-500/25 bg-amber-500/[0.08] text-amber-600 dark:text-amber-400",
    };
  }
  if (["failed", "error", "stopped"].includes(normalized)) {
    return {
      label: "Failed",
      dotClassName: "bg-red-500",
      badgeClassName: "border-red-500/25 bg-red-500/[0.08] text-red-600 dark:text-red-400",
    };
  }

  return {
    label: normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "Not deployed",
    dotClassName: "bg-muted-foreground/50",
    badgeClassName: "border-border/45 bg-muted/40 text-muted-foreground",
  };
}

function ProjectState({
  orgSlug,
  projectSlug,
  deployment,
  deploymentLoading,
  deploymentError,
  monetization,
  monetizationLoading,
  monetizationError,
}: {
  orgSlug: string;
  projectSlug: string;
  deployment: ProjectOverviewDeployment | null;
  deploymentLoading: boolean;
  deploymentError: boolean;
  monetization: ProjectOverviewMonetization | null;
  monetizationLoading: boolean;
  monetizationError: boolean;
}) {
  const deploymentMeta = deploymentStatus(deployment?.status);
  const deploymentHref = `/${orgSlug}/${projectSlug}/deployments`;
  const monetizationHref = `/${orgSlug}/${projectSlug}/monetization`;
  const endpointHref = deployment?.endpoint
    ? deployment.endpoint.startsWith("http")
      ? deployment.endpoint
      : `https://${deployment.endpoint}`
    : null;
  const repositoryHref = deployment?.repoFullName
    ? `https://github.com/${deployment.repoFullName}`
    : null;

  return (
    <section aria-labelledby="project-state-heading">
      <div className="border-b border-border/30 bg-muted/30 px-6 py-5">
        <h2 id="project-state-heading" className="text-sm font-semibold tracking-[-0.012em]">Project state</h2>
        <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
          Production delivery and customer revenue at a glance
        </p>
      </div>

      <div className="grid md:grid-cols-2">
        <article className="flex min-h-[18rem] flex-col border-b border-border/30 p-6 md:border-b-0 md:border-r">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-[13px] font-semibold tracking-[-0.008em]">Deployment</h3>
              <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">Production agent runtime</p>
            </div>
            {!deploymentLoading && !deploymentError && (
              <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-md border px-2 font-mono text-[9px] uppercase tracking-[0.12em]", deploymentMeta.badgeClassName)}>
                <span className={cn("size-1.5 rounded-full", deploymentMeta.dotClassName)} />
                {deploymentMeta.label}
              </span>
            )}
          </div>

          {deploymentLoading ? (
            <div className="mt-8 space-y-4">
              <Skeleton className="h-7 w-36 rounded-sm" />
              <Skeleton className="h-4 w-56 rounded-sm" />
              <Skeleton className="h-4 w-44 rounded-sm" />
            </div>
          ) : deploymentError ? (
            <div className="my-auto py-8">
              <p className="text-sm font-medium">Deployment status unavailable</p>
              <p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
                Cencori could not load this project&apos;s agent runtime.
              </p>
            </div>
          ) : deployment ? (
            <>
              <div className="mt-7">
                <div className="flex items-baseline gap-2">
                  <p className="truncate text-xl font-semibold tracking-[-0.025em]">{deployment.agentName}</p>
                  {deployment.version !== null && (
                    <span className="font-mono text-[10px] text-muted-foreground">v{deployment.version}</span>
                  )}
                </div>
                <dl className="mt-6 grid gap-3 text-xs">
                  <div className="flex items-center justify-between gap-5">
                    <dt className="text-muted-foreground">Endpoint</dt>
                    <dd className="min-w-0 truncate font-mono">
                      {endpointHref ? (
                        <a
                          href={endpointHref}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 transition-colors hover:text-blue-500 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:text-sky-400 dark:hover:text-sky-300"
                        >
                          {deployment.endpoint}
                        </a>
                      ) : "Pending"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-5">
                    <dt className="text-muted-foreground">Source</dt>
                    <dd className="flex min-w-0 items-center justify-end gap-1.5 truncate font-mono">
                      <Github aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                      {repositoryHref ? (
                        <a
                          href={repositoryHref}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate underline decoration-border underline-offset-4 transition-colors hover:text-blue-600 hover:decoration-blue-500/50 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:hover:text-sky-400"
                        >
                          {deployment.repoFullName}
                        </a>
                      ) : (
                        <span className="truncate text-muted-foreground">Repository unavailable</span>
                      )}
                      <span className="shrink-0 text-muted-foreground">· {deployment.branch}</span>
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-5">
                    <dt className="text-muted-foreground">Framework</dt>
                    <dd>{formatFramework(deployment.framework)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-5">
                    <dt className="text-muted-foreground">Updated</dt>
                    <dd>{formatUpdatedAt(deployment.updatedAt)}</dd>
                  </div>
                </dl>
              </div>
              <Link href={deploymentHref} className="mt-auto pt-6 text-xs font-medium underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground">
                Open deployments
              </Link>
            </>
          ) : (
            <div className="my-auto py-8">
              <p className="text-sm font-medium">No agent deployed</p>
              <p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
                Import a repository and deploy this project&apos;s production agent.
              </p>
              <Link href={deploymentHref} className="mt-4 inline-block text-xs font-medium underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground">
                Deploy agent
              </Link>
            </div>
          )}
        </article>

        <article className="flex min-h-[18rem] flex-col p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-[13px] font-semibold tracking-[-0.008em]">Monetization</h3>
              <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">Customer revenue · last 30 days</p>
            </div>
            {!monetizationLoading && !monetizationError && (
              <span className={cn(
                "inline-flex h-6 items-center rounded-md border px-2 font-mono text-[9px] uppercase tracking-[0.12em]",
                monetization?.enabled
                  ? "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-600 dark:text-emerald-400"
                  : "border-border/45 bg-muted/40 text-muted-foreground",
              )}>
                {monetization?.enabled ? "Active" : "Not enabled"}
              </span>
            )}
          </div>

          {monetizationLoading ? (
            <div className="mt-8 space-y-4">
              <Skeleton className="h-8 w-32 rounded-sm" />
              <Skeleton className="h-4 w-52 rounded-sm" />
              <Skeleton className="h-4 w-40 rounded-sm" />
            </div>
          ) : monetizationError ? (
            <div className="my-auto py-8">
              <p className="text-sm font-medium">Monetization unavailable</p>
              <p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
                Cencori could not load this project&apos;s revenue data.
              </p>
            </div>
          ) : monetization?.enabled ? (
            <>
              <div className="mt-7">
                <p className="font-mono text-[2rem] font-medium leading-none tracking-[-0.045em] tabular-nums">
                  {formatCost(monetization.customerRevenue)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">Gross customer revenue</p>
                <dl className="mt-6 grid gap-3 text-xs">
                  <div className="flex items-center justify-between gap-5">
                    <dt className="text-muted-foreground">Provider cost</dt>
                    <dd className="font-mono tabular-nums">{formatCost(monetization.providerCost)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-5">
                    <dt className="text-muted-foreground">Margin</dt>
                    <dd className="font-mono tabular-nums">
                      {formatCost(monetization.margin)} · {monetization.marginPercentage.toFixed(1)}%
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-5">
                    <dt className="text-muted-foreground">Active customers</dt>
                    <dd className="font-mono tabular-nums">{monetization.activeCustomers.toLocaleString()}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-5">
                    <dt className="text-muted-foreground">Total customers</dt>
                    <dd className="font-mono tabular-nums">{monetization.totalCustomers.toLocaleString()}</dd>
                  </div>
                </dl>
              </div>
              <Link href={monetizationHref} className="mt-auto pt-6 text-xs font-medium underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground">
                Open monetization
              </Link>
            </>
          ) : (
            <div className="my-auto py-8">
              <p className="text-sm font-medium">Monetization is off</p>
              <p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
                Meter AI usage, set pricing, and bill customers from this project.
              </p>
              <Link href={monetizationHref} className="mt-4 inline-block text-xs font-medium underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground">
                Configure monetization
              </Link>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}

function ModelUsage({
  models,
  totalRequests,
}: {
  models: ProjectOverviewModel[];
  totalRequests: number;
}) {
  const sortedModels = useMemo(
    () => [...models].sort((a, b) => b.count - a.count).slice(0, 6),
    [models],
  );

  return (
    <section aria-labelledby="model-usage-heading" className="border-t border-border/30">
      <div className="flex items-end justify-between gap-4 border-b border-border/30 bg-muted/30 px-6 py-5">
        <div>
          <h2 id="model-usage-heading" className="text-sm font-semibold tracking-[-0.012em]">
            Usage by model
          </h2>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">Highest-volume models in this period</p>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Top {Math.min(sortedModels.length, 6)}
        </span>
      </div>

      {sortedModels.length > 0 ? (
        <div className="divide-y divide-border/30">
          <div className="hidden grid-cols-[minmax(0,1fr)_7rem_7rem_7rem] gap-4 px-6 py-3 text-[11px] font-medium text-muted-foreground md:grid">
            <span>Model</span>
            <span className="text-right">Requests</span>
            <span className="text-right">Share</span>
            <span className="text-right">Spend</span>
          </div>
          {sortedModels.map((model) => {
            const share = percentage(model.count, totalRequests);
            return (
              <div
                key={model.model}
                className="group relative grid gap-2 px-6 py-4 transition-colors duration-150 hover:bg-muted/45 md:grid-cols-[minmax(0,1fr)_7rem_7rem_7rem] md:items-center md:gap-4"
              >
                <div
                  className="absolute inset-y-0 left-0 origin-left bg-foreground/[0.025] transition-transform duration-300 dark:bg-foreground/[0.04]"
                  style={{ width: `${share}%` }}
                  aria-hidden="true"
                />
                <span className="relative truncate font-mono text-xs">{model.model}</span>
                <span className="relative font-mono text-xs tabular-nums md:text-right">
                  {model.count.toLocaleString()}
                </span>
                <span className="relative hidden font-mono text-xs text-muted-foreground tabular-nums md:block md:text-right">
                  {share.toFixed(1)}%
                </span>
                <span className="relative font-mono text-xs text-muted-foreground tabular-nums md:text-right">
                  {formatCost(model.cost)}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-5 py-10 text-center text-xs text-muted-foreground">
          Model usage will appear after the first request in this period.
        </div>
      )}
    </section>
  );
}

export function ProjectOverviewDashboard({
  projectName,
  viewerName,
  orgSlug,
  projectSlug,
  period,
  onPeriodChange,
  stats,
  chartData,
  modelBreakdown,
  deployment,
  deploymentLoading,
  deploymentError,
  monetization,
  monetizationLoading,
  monetizationError,
  loading,
  error,
  onRetry,
}: {
  projectName: string;
  viewerName?: string | null;
  orgSlug: string;
  projectSlug: string;
  period: string;
  onPeriodChange: (period: string) => void;
  stats: ProjectOverviewStats | null;
  chartData: ProjectOverviewChartPoint[];
  modelBreakdown: ProjectOverviewModel[];
  deployment: ProjectOverviewDeployment | null;
  deploymentLoading: boolean;
  deploymentError: boolean;
  monetization: ProjectOverviewMonetization | null;
  monetizationLoading: boolean;
  monetizationError: boolean;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const totalRequests = stats?.totalRequests ?? 0;
  const successRate = totalRequests
    ? ((stats?.successfulRequests ?? 0) / totalRequests) * 100
    : 0;
  const totalCost = Number(stats?.totalCost ?? 0);
  const periodLabel = PERIODS.find((option) => option.value === period)?.label ?? "7 days";
  const metricChartData = useMemo<MetricChartPoint[]>(
    () => chartData.map((point) => ({
      ...point,
      successRate: point.count > 0 ? (point.successful / point.count) * 100 : 0,
    })),
    [chartData],
  );
  const hasMetricData = metricChartData.some((point) => point.count > 0);

  const metrics = [
    {
      label: "Requests",
      value: totalRequests.toLocaleString(),
      detail: `${(stats?.successfulRequests ?? 0).toLocaleString()} successful`,
      dataKey: "count" as const,
      color: "#22d3ee",
      formatValue: (metricValue: number) => metricValue.toLocaleString(),
    },
    {
      label: "Success rate",
      value: `${successRate.toFixed(1)}%`,
      detail: `${(stats?.errorRequests ?? 0).toLocaleString()} errors`,
      dataKey: "successRate" as const,
      color: "#34d399",
      formatValue: (metricValue: number) => `${metricValue.toFixed(1)}%`,
    },
    {
      label: "Spend",
      value: formatCost(totalCost),
      detail: `${periodLabel.toLowerCase()} total`,
      dataKey: "cost" as const,
      color: "#fb923c",
      formatValue: formatCost,
    },
    {
      label: "Tokens",
      value: compactNumber.format(stats?.totalTokens ?? 0),
      detail: `${compactNumber.format(stats?.totalPromptTokens ?? 0)} in · ${compactNumber.format(stats?.totalCompletionTokens ?? 0)} out`,
      dataKey: "tokens" as const,
      color: "#a78bfa",
      formatValue: (metricValue: number) => compactNumber.format(metricValue),
    },
  ];

  return (
    <div className="min-h-[calc(100svh-5.5rem)] bg-background dark:bg-black">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto min-h-[calc(100svh-7.5rem)] w-full max-w-[980px] px-4 pb-24 sm:px-6 lg:px-8"
      >
        <header className="flex flex-col gap-5 py-6 lg:flex-row lg:items-end lg:justify-between lg:py-7">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.035em] sm:text-[1.75rem]">
              Hey, {viewerName || "there"}
            </h1>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
              Overview activity for {projectName}.
            </p>
          </div>

          <Select value={period} onValueChange={onPeriodChange}>
            <SelectTrigger className="h-9 w-full rounded-md border-border/45 bg-muted/20 px-3 text-xs shadow-none sm:w-[9rem]">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((option) => (
                <SelectItem key={option.value} value={option.value} className="text-xs">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </header>

        <div className="overflow-hidden rounded-lg border border-border/40 bg-muted/20">
          {error && (
            <div className="flex flex-col gap-3 border-b border-red-500/20 bg-red-500/[0.04] px-5 py-3 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-7 lg:px-8">
              <p className="text-red-600 dark:text-red-400">We couldn&apos;t refresh this project&apos;s analytics.</p>
              <button
                type="button"
                onClick={onRetry}
                className="w-fit font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                Try again
              </button>
            </div>
          )}

          <section aria-label="Key metrics" className="grid bg-muted/50 md:grid-cols-2">
            {metrics.map((metric) => (
              <MetricCell
                key={metric.label}
                {...metric}
                loading={loading}
                data={metricChartData}
                hasData={hasMetricData}
                reduceMotion={reduceMotion}
              />
            ))}
          </section>

          <ProjectState
            orgSlug={orgSlug}
            projectSlug={projectSlug}
            deployment={deployment}
            deploymentLoading={deploymentLoading}
            deploymentError={deploymentError}
            monetization={monetization}
            monetizationLoading={monetizationLoading}
            monetizationError={monetizationError}
          />

          <ModelUsage models={modelBreakdown} totalRequests={totalRequests} />
        </div>
      </motion.div>
    </div>
  );
}
