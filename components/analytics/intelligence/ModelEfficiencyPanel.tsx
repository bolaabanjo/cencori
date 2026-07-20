'use client';

import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    Anthropic,
    AssemblyAI,
    Cerebras,
    Cohere,
    DeepSeek,
    ElevenLabs,
    Google,
    Groq,
    HuggingFace,
    Meta,
    Mistral,
    OpenAI,
    OpenRouter,
    Perplexity,
    Qwen,
    Together,
    XAI,
} from '@lobehub/icons';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnomalyAlertsPanel } from './AnomalyAlertsPanel';

export interface ModelStat {
    model: string;
    provider: string;
    request_count: number;
    total_cost_usd: number;
    avg_cost_per_token: number;
    avg_latency_ms: number;
    p95_latency_ms: number;
    success_rate: number;
    avg_completion_ratio: number;
    total_tokens: number;
    cost_score: number;
    speed_score: number;
    quality_score: number;
    efficiency_score: number;
    efficiency_rank: number;
    recommendation: string;
    potential_savings_usd: number | null;
}

export interface EfficiencySummary {
    top_model: string;
    top_provider: string;
    cheapest_model: string;
    fastest_model: string;
    total_cost_analyzed: number;
    potential_savings_usd: number;
    analysis_period_days: number;
    total_requests_analyzed: number;
}

export interface EfficiencyResponse {
    models: ModelStat[];
    summary: EfficiencySummary | null;
    insufficient_data: boolean;
    total_requests_analyzed?: number;
}

interface ModelEfficiencyPanelProps {
    projectId: string;
    environment: 'production' | 'test';
    timeRange?: string;
    onTimeRangeChange?: (value: string) => void;
}

const PROVIDER_LOGOS: Record<string, (size: number) => ReactNode> = {
    openai: size => <OpenAI size={size} />,
    anthropic: size => <Anthropic size={size} />,
    google: size => <Google.Color size={size} />,
    googleai: size => <Google.Color size={size} />,
    groq: size => <Groq size={size} />,
    cerebras: size => <Cerebras.Color size={size} />,
    assemblyai: size => <AssemblyAI.Color size={size} />,
    elevenlabs: size => <ElevenLabs size={size} />,
    mistral: size => <Mistral.Color size={size} />,
    cohere: size => <Cohere.Color size={size} />,
    perplexity: size => <Perplexity.Color size={size} />,
    openrouter: size => <OpenRouter size={size} />,
    xai: size => <XAI size={size} />,
    together: size => <Together.Color size={size} />,
    meta: size => <Meta.Avatar size={size} />,
    huggingface: size => <HuggingFace.Color size={size} />,
    qwen: size => <Qwen.Avatar size={size} />,
    deepseek: size => <DeepSeek.Color size={size} />,
};

function providerKey(provider: string): string {
    return provider.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function ProviderLogo({ provider }: { provider: string }) {
    const renderLogo = PROVIDER_LOGOS[providerKey(provider)];
    if (!renderLogo) return <span className="size-7 shrink-0" aria-hidden="true" />;

    return (
        <span
            className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/45 bg-background"
            title={provider}
            aria-hidden="true"
        >
            {renderLogo(15)}
        </span>
    );
}

function formatCostPerMillion(value: number): string {
    const perMillion = value * 1_000_000;
    if (perMillion === 0) return '$0.00';
    if (perMillion < 0.01) return `$${perMillion.toFixed(4)}`;
    return `$${perMillion.toFixed(2)}`;
}

function formatCost(value: number): string {
    if (value === 0) return '$0.00';
    if (value < 0.01) return `$${value.toFixed(4)}`;
    if (value < 1) return `$${value.toFixed(3)}`;
    return `$${value.toFixed(2)}`;
}

function formatLatency(value: number): string {
    if (value < 1_000) return `${Math.round(value)}ms`;
    return `${(value / 1_000).toFixed(value >= 10_000 ? 1 : 2)}s`;
}

function RecommendationBadge({ label }: { label: string }) {
    if (!label) return null;

    return (
        <span
            className={cn(
                'inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[9px] font-medium leading-none',
                label === 'Best overall'
                    ? 'border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-600 dark:text-emerald-400'
                    : 'border-border/45 bg-muted/30 text-muted-foreground'
            )}
        >
            {label}
        </span>
    );
}

function TrafficShare({ value }: { value: number }) {
    return (
        <div className="mt-1.5 h-px w-20 overflow-hidden bg-border/70">
            <div className="h-full bg-foreground/45" style={{ width: `${Math.max(2, value)}%` }} />
        </div>
    );
}

function EfficiencyPosition({ score, highlighted }: { score: number; highlighted: boolean }) {
    const percent = Math.max(0, Math.min(100, score * 100));

    return (
        <div className="relative h-3.5 w-20" aria-hidden="true">
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
            <div
                className={cn(
                    'absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background',
                    highlighted ? 'bg-emerald-500' : 'bg-foreground/55'
                )}
                style={{ left: `${percent}%` }}
            />
        </div>
    );
}

function SummaryCell({ label, value, detail, accent = false }: {
    label: string;
    value: string;
    detail: string;
    accent?: boolean;
}) {
    return (
        <div className="min-w-0 px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">{label}</p>
            <p className={cn('mt-1 truncate text-sm font-medium', accent && 'text-emerald-600 dark:text-emerald-400')}>
                {value}
            </p>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{detail}</p>
        </div>
    );
}

export function ModelEfficiencyPanel({
    projectId,
    environment,
    timeRange: controlledTimeRange,
    onTimeRangeChange,
}: ModelEfficiencyPanelProps) {
    const [localTimeRange, setLocalTimeRange] = useState('30d');
    const timeRange = controlledTimeRange ?? localTimeRange;

    const handleTimeRangeChange = (value: string) => {
        if (onTimeRangeChange) onTimeRangeChange(value);
        else setLocalTimeRange(value);
    };

    const { data, isLoading, isError } = useQuery<EfficiencyResponse>({
        queryKey: ['modelEfficiency', projectId, environment, timeRange],
        queryFn: async () => {
            const response = await fetch(
                `/api/projects/${projectId}/analytics/model-efficiency?environment=${environment}&time_range=${timeRange}&min_requests=1`
            );
            if (!response.ok) throw new Error('Failed to fetch model efficiency data');
            return response.json();
        },
        staleTime: 5 * 60 * 1000,
    });

    const modelCount = data?.models.length ?? 0;
    const providerCount = new Set(data?.models.map(model => model.provider) ?? []).size;

    return (
        <section className="overflow-hidden rounded-xl border border-border/55 bg-card" aria-labelledby="model-efficiency-title">
            <div className="flex flex-col gap-3 border-b border-border/35 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 id="model-efficiency-title" className="text-sm font-medium">Model efficiency</h2>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Compare the models serving your workload by price, response time, and delivery.
                    </p>
                </div>
                <Select value={timeRange} onValueChange={handleTimeRangeChange}>
                    <SelectTrigger className="h-8 w-[120px] text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="7d" className="text-xs">7 days</SelectItem>
                        <SelectItem value="30d" className="text-xs">30 days</SelectItem>
                        <SelectItem value="90d" className="text-xs">90 days</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <AnomalyAlertsPanel projectId={projectId} environment={environment} embedded />

            {isLoading && (
                <div className="space-y-2 p-4">
                    <Skeleton className="h-20 w-full" />
                    {[1, 2, 3, 4].map(item => <Skeleton key={item} className="h-14 w-full" />)}
                </div>
            )}

            {isError && (
                <p className="px-4 py-10 text-center text-xs text-muted-foreground">
                    Could not load model efficiency data.
                </p>
            )}

            {data?.insufficient_data && (
                <div className="flex flex-col items-center px-4 py-12 text-center">
                    <span className="mb-3 flex size-9 items-center justify-center rounded-full border border-border/45 bg-muted/20">
                        <Activity className="size-4 text-muted-foreground" />
                    </span>
                    <p className="text-xs font-medium">Not enough traffic yet</p>
                    <p className="mt-1 max-w-sm text-[11px] leading-relaxed text-muted-foreground">
                        Make at least one AI request to begin comparing model efficiency.
                        {data.total_requests_analyzed != null && data.total_requests_analyzed > 0
                            ? ` ${data.total_requests_analyzed} requests have been analyzed so far.`
                            : ''}
                    </p>
                </div>
            )}

            {data && !data.insufficient_data && data.summary && data.models.length > 0 && (
                <>
                    <div className="grid border-b border-border/35 sm:grid-cols-2 lg:grid-cols-4 [&>*:not(:last-child)]:border-border/30 sm:[&>*:not(:nth-child(2n))]:border-r lg:[&>*:not(:last-child)]:border-r">
                        <SummaryCell
                            label="Best overall"
                            value={data.summary.top_model}
                            detail={data.summary.top_provider}
                            accent
                        />
                        <SummaryCell
                            label="Traffic analyzed"
                            value={data.summary.total_requests_analyzed.toLocaleString()}
                            detail={`${modelCount} models across ${providerCount} providers`}
                        />
                        <SummaryCell
                            label="Spend analyzed"
                            value={formatCost(data.summary.total_cost_analyzed)}
                            detail={`${data.summary.analysis_period_days}-day comparison window`}
                        />
                        <SummaryCell
                            label="Savings opportunity"
                            value={formatCost(data.summary.potential_savings_usd)}
                            detail={data.summary.potential_savings_usd > 0 ? 'Estimated against the top-ranked model' : 'No clear savings opportunity'}
                        />
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1040px] border-collapse text-left">
                            <caption className="sr-only">
                                Model efficiency ranking for {data.summary.analysis_period_days} days of AI traffic
                            </caption>
                            <thead className="bg-muted/[0.18]">
                                <tr className="border-b border-border/35">
                                    <th scope="col" className="w-12 px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Rank</th>
                                    <th scope="col" className="min-w-[280px] px-3 py-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Model</th>
                                    <th scope="col" className="w-32 px-3 py-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Requests</th>
                                    <th scope="col" className="w-28 px-3 py-2.5 text-right text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Cost / 1M</th>
                                    <th scope="col" className="w-28 px-3 py-2.5 text-right text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Median</th>
                                    <th scope="col" className="w-28 px-3 py-2.5 text-right text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">P95</th>
                                    <th scope="col" className="w-28 px-3 py-2.5 text-right text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Delivery</th>
                                    <th scope="col" className="w-36 px-4 py-2.5 text-right text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Efficiency</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.models.map(model => {
                                    const modelKey = `${model.model}||${model.provider}`;
                                    const highlighted = model.efficiency_rank === 1;
                                    const trafficShare = (model.request_count / data.summary!.total_requests_analyzed) * 100;
                                    const deliveryPercent = model.success_rate * 100;

                                    return (
                                        <tr
                                            key={modelKey}
                                            className={cn(
                                                'border-b border-border/25 transition-colors last:border-b-0 hover:bg-muted/[0.18]',
                                                model.efficiency_rank === 1 && 'bg-emerald-500/[0.025]'
                                            )}
                                        >
                                            <td className="px-4 py-3 align-middle font-mono text-[11px] tabular-nums text-muted-foreground">
                                                {String(model.efficiency_rank).padStart(2, '0')}
                                            </td>
                                            <td className="px-3 py-3 align-middle">
                                                <div className="flex max-w-full items-center gap-2.5">
                                                    <ProviderLogo provider={model.provider} />
                                                    <span className="min-w-0">
                                                        <span className="flex min-w-0 items-center gap-2">
                                                            <span className="truncate text-xs font-medium">{model.model}</span>
                                                            <RecommendationBadge label={model.recommendation} />
                                                        </span>
                                                        <span className="mt-0.5 block truncate text-[10px] capitalize text-muted-foreground">{model.provider}</span>
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 align-middle">
                                                <div className="font-mono text-[11px] tabular-nums">{model.request_count.toLocaleString()}</div>
                                                <div className="mt-0.5 text-[10px] text-muted-foreground">{trafficShare.toFixed(1)}% of traffic</div>
                                                <TrafficShare value={trafficShare} />
                                            </td>
                                            <td className="px-3 py-3 text-right align-middle font-mono text-[11px] tabular-nums">
                                                {formatCostPerMillion(model.avg_cost_per_token)}
                                            </td>
                                            <td className="px-3 py-3 text-right align-middle font-mono text-[11px] tabular-nums">
                                                {formatLatency(model.avg_latency_ms)}
                                            </td>
                                            <td className="px-3 py-3 text-right align-middle font-mono text-[11px] tabular-nums text-muted-foreground">
                                                {formatLatency(model.p95_latency_ms)}
                                            </td>
                                            <td className="px-3 py-3 text-right align-middle">
                                                <span className={cn(
                                                    'font-mono text-[11px] tabular-nums',
                                                    deliveryPercent >= 99
                                                        ? 'text-emerald-600 dark:text-emerald-400'
                                                        : deliveryPercent >= 95
                                                            ? 'text-foreground'
                                                            : deliveryPercent >= 80
                                                                ? 'text-amber-600 dark:text-amber-400'
                                                                : 'text-red-600 dark:text-red-400'
                                                )}>
                                                    {deliveryPercent.toFixed(1)}%
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 align-middle">
                                                <div className="flex items-center justify-end gap-3">
                                                    <EfficiencyPosition score={model.efficiency_score} highlighted={highlighted} />
                                                    <span className={cn(
                                                        'w-6 text-right font-mono text-[11px] font-medium tabular-nums',
                                                        highlighted ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
                                                    )}>
                                                        {Math.round(model.efficiency_score * 100)}
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex flex-col gap-1 border-t border-border/35 bg-muted/[0.12] px-4 py-3 text-[10px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                        <span>Efficiency score: cost 45% · response time 30% · delivery 25%</span>
                        <span>Scores use observed production traffic from this project.</span>
                    </div>
                </>
            )}
        </section>
    );
}
