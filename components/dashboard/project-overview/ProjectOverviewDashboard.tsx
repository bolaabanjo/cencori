"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
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

type TrafficSeries = "requests" | "cost" | "tokens";
type TrafficDataKey = "count" | "cost" | "tokens";

const PERIODS = [
  { value: "1h", label: "Last hour" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All time" },
] as const;

const SERIES: Record<
  TrafficSeries,
  { dataKey: TrafficDataKey; label: string }
> = {
  requests: { dataKey: "count", label: "Requests" },
  cost: { dataKey: "cost", label: "Spend" },
  tokens: { dataKey: "tokens", label: "Tokens" },
};

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

function formatLatency(value: number): string {
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)} s`;
  return `${Math.round(value)} ms`;
}

function formatSeriesValue(series: TrafficSeries, value: number): string {
  if (series === "cost") return formatCost(value);
  return value.toLocaleString();
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
}: {
  label: string;
  value: string;
  detail: string;
  loading: boolean;
}) {
  return (
    <div className="group min-h-32 border-b border-border/50 px-5 py-5 transition-colors duration-150 hover:bg-secondary/35 lg:border-b-0 lg:border-r lg:last:border-r-0">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      {loading ? (
        <div className="mt-5 space-y-3">
          <Skeleton className="h-7 w-24 rounded-sm" />
          <Skeleton className="h-3 w-32 rounded-sm" />
        </div>
      ) : (
        <>
          <p className="mt-4 font-mono text-[1.7rem] font-medium leading-none tracking-[-0.045em] tabular-nums">
            {value}
          </p>
          <p className="mt-3 truncate text-[11px] text-muted-foreground">{detail}</p>
        </>
      )}
    </div>
  );
}

type HealthDataKey = "successful" | "errors" | "filtered";

function RequestHealth({
  stats,
  chartData,
  reduceMotion,
}: {
  stats: ProjectOverviewStats | null;
  chartData: ProjectOverviewChartPoint[];
  reduceMotion: boolean | null;
}) {
  const total = stats?.totalRequests ?? 0;
  const rows: Array<{
    label: string;
    value: number;
    dataKey: HealthDataKey;
    color: string;
    textClassName: string;
  }> = [
    {
      label: "Successful",
      value: stats?.successfulRequests ?? 0,
      dataKey: "successful",
      color: "#10b981",
      textClassName: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Errors",
      value: stats?.errorRequests ?? 0,
      dataKey: "errors",
      color: "#ef4444",
      textClassName: "text-red-600 dark:text-red-400",
    },
    {
      label: "Filtered",
      value: stats?.filteredRequests ?? 0,
      dataKey: "filtered",
      color: "#f59e0b",
      textClassName: "text-amber-600 dark:text-amber-400",
    },
  ];

  return (
    <section aria-labelledby="request-health-heading" className="min-w-0 border-t border-border/50 xl:border-l xl:border-t-0">
      <div className="border-b border-border/50 px-5 py-4">
        <h2 id="request-health-heading" className="text-xs font-medium">
          Request health
        </h2>
        <p className="mt-1 text-[11px] text-muted-foreground">Outcome distribution for this period</p>
      </div>
      <div className="divide-y divide-border/40 px-5">
        {rows.map((row) => {
          const share = percentage(row.value, total);
          const chartConfig = {
            [row.dataKey]: { label: row.label, color: row.color },
          } satisfies ChartConfig;

          return (
            <div key={row.label} className="py-4">
              <div className="flex items-baseline justify-between gap-4 text-xs">
                <span className="text-muted-foreground">{row.label}</span>
                <span className={cn("font-mono tabular-nums", row.textClassName)}>
                  {row.value.toLocaleString()}
                  <span className="ml-2 text-[10px] text-muted-foreground">{share.toFixed(1)}%</span>
                </span>
              </div>
              <ChartContainer config={chartConfig} className="mt-2 h-12 w-full aspect-auto">
                <LineChart data={chartData} margin={{ top: 5, right: 1, bottom: 1, left: 1 }}>
                  <YAxis
                    hide
                    domain={[0, (dataMax: number) => Math.max(1, dataMax * 1.15)]}
                  />
                  <ReferenceLine y={0} stroke="var(--border)" strokeOpacity={0.8} />
                  <ChartTooltip
                    cursor={{ stroke: "var(--border)", strokeDasharray: "2 3" }}
                    content={
                      <ChartTooltipContent
                        indicator="line"
                        labelFormatter={(label) => String(label)}
                        formatter={(value) => {
                          const count = Number(value);
                          return (
                            <div className="flex min-w-36 items-center justify-between gap-5">
                              <span className="text-muted-foreground">{row.label}</span>
                              <span className="font-mono font-medium tabular-nums">
                                {count.toLocaleString()} {count === 1 ? "request" : "requests"}
                              </span>
                            </div>
                          );
                        }}
                      />
                    }
                  />
                  <Line
                    type="linear"
                    dataKey={row.dataKey}
                    stroke={`var(--color-${row.dataKey})`}
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 2, fill: "var(--background)" }}
                    isAnimationActive={!reduceMotion}
                    animationDuration={240}
                  />
                </LineChart>
              </ChartContainer>
            </div>
          );
        })}
      </div>
      <div className="border-t border-border/50 px-5 py-4">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">Processed outcomes</span>
          <span className="font-mono tabular-nums">
            {rows.reduce((sum, row) => sum + row.value, 0).toLocaleString()}
          </span>
        </div>
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
    <section aria-labelledby="model-usage-heading" className="border-t border-border/50">
      <div className="flex items-end justify-between gap-4 border-b border-border/50 px-5 py-4">
        <div>
          <h2 id="model-usage-heading" className="text-xs font-medium">
            Usage by model
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground">Highest-volume models in this period</p>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Top {Math.min(sortedModels.length, 6)}
        </span>
      </div>

      {sortedModels.length > 0 ? (
        <div className="divide-y divide-border/40">
          <div className="hidden grid-cols-[minmax(0,1fr)_7rem_7rem_7rem] gap-4 px-5 py-2.5 text-[10px] text-muted-foreground md:grid">
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
                className="group relative grid gap-2 px-5 py-3.5 transition-colors duration-150 hover:bg-secondary/35 md:grid-cols-[minmax(0,1fr)_7rem_7rem_7rem] md:items-center md:gap-4"
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
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  const [trafficSeries, setTrafficSeries] = useState<TrafficSeries>("requests");
  const reduceMotion = useReducedMotion();
  const gradientId = `overview-gradient-${useId().replace(/:/g, "")}`;
  const currentSeries = SERIES[trafficSeries];
  const chartConfig = {
    [currentSeries.dataKey]: {
      label: currentSeries.label,
      theme: { light: "#171717", dark: "#e5e5e5" },
    },
  } satisfies ChartConfig;
  const totalRequests = stats?.totalRequests ?? 0;
  const successRate = totalRequests
    ? ((stats?.successfulRequests ?? 0) / totalRequests) * 100
    : 0;
  const totalCost = Number(stats?.totalCost ?? 0);
  const periodLabel = PERIODS.find((option) => option.value === period)?.label ?? "7 days";
  const hasChartData = chartData.length > 0 && chartData.some((point) => point[currentSeries.dataKey] > 0);

  const metrics = [
    {
      label: "Requests",
      value: totalRequests.toLocaleString(),
      detail: `${(stats?.successfulRequests ?? 0).toLocaleString()} successful`,
    },
    {
      label: "Success rate",
      value: `${successRate.toFixed(1)}%`,
      detail: `${(stats?.errorRequests ?? 0).toLocaleString()} errors`,
    },
    {
      label: "Spend",
      value: formatCost(totalCost),
      detail: `${periodLabel.toLowerCase()} total`,
    },
    {
      label: "Tokens",
      value: compactNumber.format(stats?.totalTokens ?? 0),
      detail: `${compactNumber.format(stats?.totalPromptTokens ?? 0)} in · ${compactNumber.format(stats?.totalCompletionTokens ?? 0)} out`,
    },
    {
      label: "Average latency",
      value: formatLatency(stats?.avgLatency ?? 0),
      detail: "Across all requests",
    },
  ];

  return (
    <div className="min-h-[calc(100svh-5.5rem)] bg-background p-2 dark:bg-black sm:p-3 lg:p-4">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto min-h-[calc(100svh-7.5rem)] max-w-[90rem]"
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
            <SelectTrigger className="h-9 w-full rounded-md border-border/60 bg-background px-3 text-xs shadow-none sm:w-[9rem]">
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

        <div className="overflow-hidden border border-black/[0.08] dark:border-white/[0.09]">
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

          <section aria-label="Key metrics" className="grid sm:grid-cols-2 lg:grid-cols-5">
            {metrics.map((metric) => (
              <MetricCell key={metric.label} {...metric} loading={loading} />
            ))}
          </section>

          <div className="grid border-t border-border/50 xl:grid-cols-[minmax(0,1fr)_21rem]">
          <section aria-labelledby="traffic-heading" className="min-w-0">
            <div className="flex flex-col gap-4 border-b border-border/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 id="traffic-heading" className="text-xs font-medium">Traffic</h2>
                <p className="mt-1 text-[11px] text-muted-foreground">Activity across {periodLabel.toLowerCase()}</p>
              </div>
              <div className="flex w-fit rounded-md border border-border/60 bg-secondary/40 p-0.5" aria-label="Traffic metric">
                {(Object.keys(SERIES) as TrafficSeries[]).map((series) => (
                  <button
                    key={series}
                    type="button"
                    aria-pressed={trafficSeries === series}
                    onClick={() => setTrafficSeries(series)}
                    className={cn(
                      "h-7 rounded-[4px] px-2.5 text-[11px] text-muted-foreground transition-[background-color,color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 active:translate-y-px",
                      trafficSeries === series && "bg-background text-foreground shadow-sm",
                    )}
                  >
                    {SERIES[series].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-[23rem] px-2 pb-4 pt-6 sm:px-5">
              {loading ? (
                <div className="h-full px-2 pb-5">
                  <Skeleton className="h-full w-full rounded-md" />
                </div>
              ) : hasChartData ? (
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={trafficSeries}
                    initial={reduceMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={reduceMotion ? undefined : { opacity: 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.16 }}
                    className="h-full"
                  >
                    <ChartContainer config={chartConfig} className="h-full w-full aspect-auto">
                      <AreaChart data={chartData} margin={{ left: 0, right: 10, top: 8, bottom: 0 }}>
                        <defs>
                          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={`var(--color-${currentSeries.dataKey})`} stopOpacity={0.16} />
                            <stop offset="100%" stopColor={`var(--color-${currentSeries.dataKey})`} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.55} />
                        <XAxis
                          dataKey="date"
                          tickLine={false}
                          axisLine={false}
                          minTickGap={28}
                          tickMargin={12}
                          tick={{ fontSize: 10 }}
                        />
                        <YAxis hide domain={[0, "auto"]} />
                        <ChartTooltip
                          cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }}
                          content={
                            <ChartTooltipContent
                              indicator="line"
                              formatter={(value) => (
                                <div className="flex min-w-32 items-center justify-between gap-5">
                                  <span className="text-muted-foreground">{currentSeries.label}</span>
                                  <span className="font-mono font-medium tabular-nums">
                                    {formatSeriesValue(trafficSeries, Number(value))}
                                  </span>
                                </div>
                              )}
                            />
                          }
                        />
                        <Area
                          type="monotone"
                          dataKey={currentSeries.dataKey}
                          stroke={`var(--color-${currentSeries.dataKey})`}
                          strokeWidth={1.75}
                          fill={`url(#${gradientId})`}
                          dot={false}
                          activeDot={{ r: 3, strokeWidth: 2, fill: "var(--background)" }}
                          isAnimationActive={!reduceMotion}
                          animationDuration={280}
                        />
                      </AreaChart>
                    </ChartContainer>
                  </motion.div>
                </AnimatePresence>
              ) : (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <div className="mb-4 size-9 rounded-full border border-border/60 bg-secondary/40" />
                  <p className="text-sm font-medium">No {currentSeries.label.toLowerCase()} in this period</p>
                  <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                    Send a request through the gateway or choose a wider date range.
                  </p>
                  <div className="mt-4 flex items-center gap-4 text-xs">
                    <Link
                      href={`/${orgSlug}/${projectSlug}/ai-gateway/playground`}
                      className="font-medium underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
                    >
                      Open Playground
                    </Link>
                    <Link
                      href={`/${orgSlug}/${projectSlug}/api-keys`}
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      View API keys
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </section>

          <RequestHealth stats={stats} chartData={chartData} reduceMotion={reduceMotion} />
          </div>

          <ModelUsage models={modelBreakdown} totalRequests={totalRequests} />
        </div>
      </motion.div>
    </div>
  );
}
