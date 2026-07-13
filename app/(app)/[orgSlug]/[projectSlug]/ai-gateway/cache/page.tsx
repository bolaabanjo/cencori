'use client';

import { use, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { CacheAnalyticsDashboard } from '@/components/cache/CacheAnalyticsDashboard';
import { CacheSettingsPanel } from '@/components/cache/CacheSettingsPanel';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useEnvironment } from '@/lib/contexts/EnvironmentContext';

interface PageProps {
    params: Promise<{
        orgSlug: string;
        projectSlug: string;
    }>;
}

type Tab = 'analytics' | 'settings';

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

const TIME_RANGES = ['Last 1 Hour', 'Last 24 Hours', 'Last 7 Days', 'Last 30 Days'] as const;

export default function CachePage({ params }: PageProps) {
    const { orgSlug, projectSlug } = use(params);
    const { data: projectId, isLoading } = useProjectId(orgSlug, projectSlug);
    const { environment } = useEnvironment();
    const [tab, setTab] = useState<Tab>('analytics');
    const [timeRange, setTimeRange] = useState<string>('Last 7 Days');

    if (isLoading || !projectId) {
        return (
            <div className="w-full max-w-[1100px] mx-auto px-6 py-8">
                <div className="h-5 w-28 bg-secondary rounded animate-pulse" />
            </div>
        );
    }

    return (
        <div className="w-full max-w-[1100px] mx-auto px-6 py-8">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-base font-medium">Prompt Cache</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Reduce latency and cost by caching repeated AI responses.
                    </p>
                </div>
                {tab === 'analytics' && (
                    <Select value={timeRange} onValueChange={setTimeRange}>
                        <SelectTrigger className="w-[140px] h-8 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {TIME_RANGES.map(r => (
                                <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 mb-6 border-b border-border/30">
                {(['analytics', 'settings'] as Tab[]).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={cn(
                            'px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px',
                            tab === t
                                ? 'border-foreground text-foreground'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        )}
                    >
                        {t === 'analytics' ? 'Analytics' : 'Settings'}
                    </button>
                ))}
            </div>

            {tab === 'analytics' ? (
                <CacheAnalyticsDashboard projectId={projectId} timeRange={timeRange} environment={environment} />
            ) : (
                <CacheSettingsPanel projectId={projectId} />
            )}
        </div>
    );
}
