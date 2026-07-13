'use client';

import { use, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { ArrowLeft, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PromptEditor } from '@/components/prompts/PromptEditor';
import { PromptVersionHistory } from '@/components/prompts/PromptVersionHistory';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';

interface PageProps {
    params: Promise<{ orgSlug: string; projectSlug: string; promptId: string }>;
}

interface PromptDetail {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    tags: string[];
    active_version_id: string | null;
    created_at: string;
    updated_at: string;
    active_version?: {
        id: string;
        version: number;
        content: string;
        model_hint: string | null;
        temperature: number | null;
        max_tokens: number | null;
        variables: string[];
        created_at: string;
    } | null;
}

interface AnalyticsData {
    total_usage: number;
    avg_latency_ms: number;
    by_model: { model: string; count: number }[];
    by_day: { date: string; count: number }[];
    by_version: { version_id: string; count: number }[];
}

type Tab = 'editor' | 'versions' | 'analytics';

function useProjectId(orgSlug: string, projectSlug: string) {
    return useQuery({
        queryKey: ['projectId', orgSlug, projectSlug],
        queryFn: async () => {
            const { data: org } = await supabase
                .from('organizations')
                .select('id')
                .eq('slug', orgSlug)
                .single();
            if (!org) return null;
            const { data: project } = await supabase
                .from('projects')
                .select('id')
                .eq('organization_id', org.id)
                .eq('slug', projectSlug)
                .single();
            return project?.id || null;
        },
    });
}

function CopiedButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] gap-1 text-muted-foreground"
            onClick={() => {
                navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }}
        >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy'}
        </Button>
    );
}

const MODEL_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899'];

function AnalyticsTab({ projectId, promptId }: { projectId: string; promptId: string }) {
    const { data, isLoading } = useQuery<AnalyticsData>({
        queryKey: ['promptAnalytics', promptId],
        queryFn: async () => {
            const res = await fetch(`/api/projects/${projectId}/prompts/${promptId}/analytics?range=30d`);
            if (!res.ok) throw new Error('Failed');
            return res.json();
        },
    });

    if (isLoading || !data) {
        return (
            <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-24 bg-secondary/30 rounded-xl animate-pulse" />
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* KPI row */}
            <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-border/20 bg-card p-4">
                    <p className="text-[10px] text-muted-foreground/40 uppercase tracking-wider mb-1">Total Usage</p>
                    <p className="text-2xl font-semibold tabular-nums">{data.total_usage.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-border/20 bg-card p-4">
                    <p className="text-[10px] text-muted-foreground/40 uppercase tracking-wider mb-1">Avg Latency</p>
                    <p className="text-2xl font-semibold tabular-nums">
                        {data.avg_latency_ms > 0 ? `${data.avg_latency_ms}ms` : '—'}
                    </p>
                </div>
                <div className="rounded-xl border border-border/20 bg-card p-4">
                    <p className="text-[10px] text-muted-foreground/40 uppercase tracking-wider mb-1">Models Used</p>
                    <p className="text-2xl font-semibold tabular-nums">{data.by_model.length}</p>
                </div>
            </div>

            {/* Usage over time */}
            {data.by_day.length > 0 && (
                <div className="rounded-xl border border-border/20 bg-card p-4">
                    <p className="text-xs font-medium mb-3">Usage Over Time</p>
                    <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data.by_day}>
                                <defs>
                                    <linearGradient id="promptUsageGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
                                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis
                                    dataKey="date"
                                    tickFormatter={(v) => v.slice(5)}
                                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                                    axisLine={false}
                                    tickLine={false}
                                    width={30}
                                />
                                <Tooltip
                                    contentStyle={{
                                        background: 'hsl(var(--card))',
                                        border: '1px solid hsl(var(--border))',
                                        borderRadius: 8,
                                        fontSize: 11,
                                    }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="count"
                                    stroke="#10b981"
                                    strokeWidth={1.5}
                                    fill="url(#promptUsageGrad)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Model breakdown */}
            {data.by_model.length > 0 && (
                <div className="rounded-xl border border-border/20 bg-card p-4">
                    <p className="text-xs font-medium mb-3">By Model</p>
                    <div className="h-40">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.by_model} layout="vertical">
                                <XAxis
                                    type="number"
                                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    type="category"
                                    dataKey="model"
                                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                                    axisLine={false}
                                    tickLine={false}
                                    width={120}
                                />
                                <Tooltip
                                    contentStyle={{
                                        background: 'hsl(var(--card))',
                                        border: '1px solid hsl(var(--border))',
                                        borderRadius: 8,
                                        fontSize: 11,
                                    }}
                                />
                                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                                    {data.by_model.map((_, i) => (
                                        <Cell key={i} fill={MODEL_COLORS[i % MODEL_COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {data.total_usage === 0 && (
                <div className="rounded-xl border border-dashed border-border/30 p-8 text-center">
                    <p className="text-sm text-muted-foreground">No usage data yet</p>
                    <p className="text-xs text-muted-foreground/50 mt-1">
                        Usage will appear here once this prompt is called through the API.
                    </p>
                </div>
            )}
        </div>
    );
}

export default function PromptDetailPage({ params }: PageProps) {
    const { orgSlug, projectSlug, promptId } = use(params);
    const pathname = usePathname();
    const queryClient = useQueryClient();
    const { data: projectId, isLoading: projectLoading } = useProjectId(orgSlug, projectSlug);
    const [tab, setTab] = useState<Tab>('editor');

    const { data: prompt, isLoading } = useQuery<PromptDetail>({
        queryKey: ['promptDetail', promptId],
        queryFn: async () => {
            const res = await fetch(`/api/projects/${projectId}/prompts/${promptId}`);
            if (!res.ok) throw new Error('Failed to fetch prompt');
            return res.json();
        },
        enabled: !!projectId,
    });

    const saveMutation = useMutation({
        mutationFn: async (data: {
            content: string;
            model_hint: string | null;
            temperature: number | null;
            max_tokens: number | null;
            change_message: string;
        }) => {
            const res = await fetch(`/api/projects/${projectId}/prompts/${promptId}/versions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error('Failed to save version');
            const json = await res.json();

            // Auto-deploy new version
            await fetch(`/api/projects/${projectId}/prompts/${promptId}/deploy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ version_id: json.version.id }),
            });

            return json;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['promptDetail', promptId] });
            queryClient.invalidateQueries({ queryKey: ['promptVersions', promptId] });
            queryClient.invalidateQueries({ queryKey: ['prompts', projectId] });
        },
    });

    if (projectLoading || !projectId) {
        return (
            <div className="w-full max-w-[1100px] mx-auto px-6 py-8">
                <div className="h-5 w-28 bg-secondary rounded animate-pulse" />
            </div>
        );
    }

    const parentPath = pathname.replace(`/${promptId}`, '');

    return (
        <div className="w-full max-w-[1100px] mx-auto px-6 py-8">
            {/* Header */}
            <div className="mb-6">
                <Link
                    href={parentPath}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
                >
                    <ArrowLeft className="h-3 w-3" />
                    All Prompts
                </Link>

                {isLoading || !prompt ? (
                    <div className="space-y-2">
                        <div className="h-5 w-48 bg-secondary rounded animate-pulse" />
                        <div className="h-3 w-72 bg-secondary/50 rounded animate-pulse" />
                    </div>
                ) : (
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="text-base font-medium">{prompt.name}</h1>
                            {prompt.active_version && (
                                <span className="text-[10px] font-mono text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                    v{prompt.active_version.version} active
                                </span>
                            )}
                        </div>
                        {prompt.description && (
                            <p className="text-xs text-muted-foreground/60 mb-2">{prompt.description}</p>
                        )}
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-muted-foreground/40 bg-secondary/50 px-1.5 py-0.5 rounded">
                                {prompt.slug}
                            </span>
                            <CopiedButton text={prompt.slug} />
                            <span className="text-[10px] text-muted-foreground/30">|</span>
                            <span className="text-[10px] text-muted-foreground/40">
                                Use via header: X-Cencori-Prompt: {prompt.slug}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 mb-6 border-b border-border/30">
                {(['editor', 'versions', 'analytics'] as Tab[]).map((t) => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={cn(
                            'px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px capitalize',
                            tab === t
                                ? 'border-foreground text-foreground'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        )}
                    >
                        {t}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            {tab === 'editor' && prompt?.active_version && (
                <PromptEditor
                    key={prompt.active_version_id}
                    initialContent={prompt.active_version.content}
                    initialModelHint={prompt.active_version.model_hint || ''}
                    initialTemperature={prompt.active_version.temperature ?? undefined}
                    initialMaxTokens={prompt.active_version.max_tokens ?? undefined}
                    saveLabel="Save & Deploy"
                    saving={saveMutation.isPending}
                    onSave={(data) => saveMutation.mutate(data)}
                />
            )}

            {tab === 'editor' && prompt && !prompt.active_version && (
                <PromptEditor
                    saveLabel="Save & Deploy"
                    saving={saveMutation.isPending}
                    onSave={(data) => saveMutation.mutate(data)}
                />
            )}

            {tab === 'versions' && projectId && (
                <PromptVersionHistory
                    projectId={projectId}
                    promptId={promptId}
                    activeVersionId={prompt?.active_version_id || null}
                />
            )}

            {tab === 'analytics' && projectId && (
                <AnalyticsTab projectId={projectId} promptId={promptId} />
            )}

            {saveMutation.isError && (
                <p className="text-xs text-red-500 mt-4">{saveMutation.error.message}</p>
            )}
        </div>
    );
}
