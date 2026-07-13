'use client';

import { useState, use } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { RequestLogsTable } from '@/components/audit/RequestLogsTable';
import { HttpRequestLogsTable } from '@/components/audit/HttpRequestLogsTable';
import { LogsBarChart } from '@/components/audit/LogsBarChart';
import { TimeRangeSelector } from '@/components/audit/TimeRangeSelector';
import { ExportButton } from '@/components/audit/ExportButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Search, X } from 'lucide-react';
import { useEnvironment } from '@/lib/contexts/EnvironmentContext';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface PageProps {
    params: Promise<{
        orgSlug: string;
        projectSlug: string;
    }>;
}

interface ApiKey {
    id: string;
    name: string;
    key_prefix: string;
    environment: string | null;
}

type LogSource = 'ai' | 'http';

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

export default function RequestLogsPage({ params }: PageProps) {
    const { orgSlug, projectSlug } = use(params);
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const { environment } = useEnvironment();

    const sourceParam = searchParams.get('source');
    const source: LogSource = sourceParam === 'api' || sourceParam === 'web' || sourceParam === 'http'
        ? 'http'
        : 'ai';

    const [aiFilters, setAiFilters] = useState({
        status: 'all',
        model: 'all',
        time_range: '7d',
        search: '',
        api_key_id: 'all',
    });
    const [httpFilters, setHttpFilters] = useState({
        kind: 'all',
        status: 'all',
        method: 'all',
        time_range: '7d',
        search: '',
        api_key_id: 'all',
    });

    const [aiSearchInput, setAiSearchInput] = useState('');
    const [httpSearchInput, setHttpSearchInput] = useState('');

    const { data: projectId, isLoading } = useProjectId(orgSlug, projectSlug);

    const { data: apiKeys } = useQuery<ApiKey[]>({
        queryKey: ['api-keys-filter', projectId, environment],
        queryFn: async () => {
            const { data } = await supabase
                .from('api_keys')
                .select('id, name, key_prefix, environment')
                .eq('project_id', projectId)
                .is('revoked_at', null);
            return (data as ApiKey[]) || [];
        },
        enabled: !!projectId,
        staleTime: 60 * 1000,
    });

    const setLogSource = (nextSource: LogSource) => {
        const nextParams = new URLSearchParams(searchParams.toString());

        if (nextSource === 'ai') {
            nextParams.delete('source');
        } else {
            nextParams.set('source', nextSource);
        }

        const queryString = nextParams.toString();
        router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    };

    const filteredApiKeys = apiKeys?.filter((key) => {
        if (key.environment) {
            return environment === 'production'
                ? key.environment === 'production'
                : key.environment === 'test';
        }

        const isTestKey = key.key_prefix?.includes('_test') || key.key_prefix?.includes('test_');
        return environment === 'production' ? !isTestKey : isTestKey;
    });

    const handleAiSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setAiFilters((prev) => ({ ...prev, search: aiSearchInput }));
    };

    const handleHttpSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setHttpFilters((prev) => ({ ...prev, search: httpSearchInput }));
    };

    const handleClearAiFilters = () => {
        setAiFilters({
            status: 'all',
            model: 'all',
            time_range: '7d',
            search: '',
            api_key_id: 'all',
        });
        setAiSearchInput('');
    };

    const handleClearHttpFilters = () => {
        setHttpFilters({
            kind: 'all',
            status: 'all',
            method: 'all',
            time_range: '7d',
            search: '',
            api_key_id: 'all',
        });
        setHttpSearchInput('');
    };

    const hasActiveAiFilters =
        aiFilters.status !== 'all'
        || aiFilters.model !== 'all'
        || aiFilters.search.length > 0
        || aiFilters.time_range !== '7d'
        || aiFilters.api_key_id !== 'all';

    const hasActiveHttpFilters =
        httpFilters.kind !== 'all'
        || httpFilters.status !== 'all'
        || httpFilters.method !== 'all'
        || httpFilters.search.length > 0
        || httpFilters.time_range !== '7d'
        || httpFilters.api_key_id !== 'all';

    if (isLoading) {
        return (
            <div className="w-full max-w-[1360px] mx-auto px-6 py-8">
                <div className="mb-8">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-3 w-56 mt-1" />
                </div>
                <div className="lg:grid lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-6">
                    <div className="mb-4 lg:mb-0">
                        <Skeleton className="h-20 w-full max-w-[180px]" />
                    </div>
                    <div>
                        <div className="flex items-center gap-3 mb-6">
                            <Skeleton className="h-7 w-28" />
                            <Skeleton className="h-7 w-28" />
                            <Skeleton className="h-7 w-40" />
                        </div>
                        <div className="bg-card border border-border/40 rounded-md">
                            <div className="border-b border-border/40 px-4 py-2">
                                <div className="grid grid-cols-7 gap-4">
                                    {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                                        <Skeleton key={i} className="h-3 w-12" />
                                    ))}
                                </div>
                            </div>
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className="border-b border-border/40 px-4 py-3 last:border-b-0">
                                    <div className="grid grid-cols-7 gap-4 items-center">
                                        <Skeleton className="h-5 w-16" />
                                        <Skeleton className="h-3 w-20" />
                                        <Skeleton className="h-3 w-24" />
                                        <Skeleton className="h-3 w-full" />
                                        <Skeleton className="h-3 w-12" />
                                        <Skeleton className="h-3 w-16" />
                                        <Skeleton className="h-3 w-14" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!projectId) {
        return (
            <div className="w-full max-w-[1360px] mx-auto px-6 py-8">
                <div className="text-center py-16">
                    <p className="text-sm font-medium">Project not found</p>
                    <p className="text-xs text-muted-foreground mt-1">Unable to load request logs</p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-[1360px] mx-auto px-6 py-8">
            <div className="mb-6">
                <h1 className="text-base font-medium">Logs</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                    {source === 'ai'
                        ? 'View and monitor all AI requests for this project.'
                        : 'Monitor unified HTTP traffic across API and web requests for this project.'}
                </p>
            </div>

            <div className="lg:grid lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-6">
                <aside className="mb-4 lg:mb-0 lg:-ml-2">
                    <nav className="flex lg:flex-col gap-2 rounded-md">
                        <button
                            type="button"
                            onClick={() => setLogSource('ai')}
                            className={cn(
                                'flex items-center gap-2 h-8 px-2.5 rounded text-xs text-left transition-colors',
                                source === 'ai'
                                    ? 'bg-secondary text-foreground font-medium'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                            )}
                        >
                            AI
                        </button>
                        <button
                            type="button"
                            onClick={() => setLogSource('http')}
                            className={cn(
                                'flex items-center gap-2 h-8 px-2.5 rounded text-xs text-left transition-colors',
                                source === 'http'
                                    ? 'bg-secondary text-foreground font-medium'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                            )}
                        >
                            HTTP
                        </button>
                    </nav>
                </aside>

                <div className="min-w-0">
                    {source === 'ai' ? (
                        <>
                            <LogsBarChart
                                projectId={projectId}
                                timeRange={aiFilters.time_range}
                                environment={environment}
                                source="ai"
                            />

                            <div className="flex flex-wrap items-center gap-3 mb-4">
                                <Select
                                    value={aiFilters.status}
                                    onValueChange={(value) => setAiFilters((prev) => ({ ...prev, status: value }))}
                                >
                                    <SelectTrigger className="w-[130px] h-7 text-xs">
                                        <SelectValue placeholder="All statuses" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all" className="text-xs">All statuses</SelectItem>
                                        <SelectItem value="success" className="text-xs">Success</SelectItem>
                                        <SelectItem value="success_fallback" className="text-xs">Fallback Used</SelectItem>
                                        <SelectItem value="filtered" className="text-xs">Filtered</SelectItem>
                                        <SelectItem value="blocked_output" className="text-xs">Blocked</SelectItem>
                                        <SelectItem value="error" className="text-xs">Error</SelectItem>
                                        <SelectItem value="rate_limited" className="text-xs">Rate Limited</SelectItem>
                                    </SelectContent>
                                </Select>

                                <Select
                                    value={aiFilters.model}
                                    onValueChange={(value) => setAiFilters((prev) => ({ ...prev, model: value }))}
                                >
                                    <SelectTrigger className="w-[150px] h-7 text-xs">
                                        <SelectValue placeholder="All models" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all" className="text-xs">All models</SelectItem>
                                        <SelectItem value="gpt-5.4" className="text-xs">gpt-5.4</SelectItem>
                                        <SelectItem value="gpt-5.4-pro" className="text-xs">gpt-5.4-pro</SelectItem>
                                        <SelectItem value="gpt-5.3-chat-latest" className="text-xs">gpt-5.3-chat-latest</SelectItem>
                                        <SelectItem value="gpt-5" className="text-xs">gpt-5</SelectItem>
                                        <SelectItem value="gpt-4o" className="text-xs">gpt-4o</SelectItem>
                                        <SelectItem value="claude-opus-4" className="text-xs">claude-opus-4</SelectItem>
                                        <SelectItem value="gemini-3-pro" className="text-xs">gemini-3-pro</SelectItem>
                                        <SelectItem value="gemini-2.5-flash" className="text-xs">gemini-2.5-flash</SelectItem>
                                        <SelectItem value="grok-4" className="text-xs">grok-4</SelectItem>
                                    </SelectContent>
                                </Select>

                                <TimeRangeSelector
                                    value={aiFilters.time_range}
                                    onChange={(value) => setAiFilters((prev) => ({ ...prev, time_range: value }))}
                                />

                                <Select
                                    value={aiFilters.api_key_id}
                                    onValueChange={(value) => setAiFilters((prev) => ({ ...prev, api_key_id: value }))}
                                >
                                    <SelectTrigger className="w-[190px] h-7 text-xs">
                                        <SelectValue placeholder="All API keys" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all" className="text-xs">All API keys</SelectItem>
                                        {filteredApiKeys?.map((key) => (
                                            <SelectItem key={key.id} value={key.id} className="text-xs">
                                                {key.name} ({key.key_prefix}...)
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                <form onSubmit={handleAiSearchSubmit} className="relative">
                                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                    <Input
                                        placeholder="Search AI requests..."
                                        value={aiSearchInput}
                                        onChange={(e) => setAiSearchInput(e.target.value)}
                                        className="w-40 sm:w-56 h-7 pl-7 text-xs rounded border-border/50 bg-transparent placeholder:text-muted-foreground/60"
                                    />
                                </form>

                                {hasActiveAiFilters && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs px-2"
                                        onClick={handleClearAiFilters}
                                    >
                                        <X className="h-3 w-3 mr-1" />
                                        Clear
                                    </Button>
                                )}

                                <div className="ml-auto">
                                    <ExportButton projectId={projectId} filters={aiFilters} environment={environment} />
                                </div>
                            </div>

                            <RequestLogsTable projectId={projectId} filters={aiFilters} environment={environment} />
                        </>
                    ) : (
                        <>
                            <LogsBarChart
                                projectId={projectId}
                                timeRange={httpFilters.time_range}
                                environment={environment}
                                source="http"
                            />

                            <div className="flex flex-wrap items-center gap-3 mb-4">
                                <Select
                                    value={httpFilters.kind}
                                    onValueChange={(value) => setHttpFilters((prev) => ({
                                        ...prev,
                                        kind: value,
                                        api_key_id: value === 'web' ? 'all' : prev.api_key_id,
                                    }))}
                                >
                                    <SelectTrigger className="w-[138px] h-7 text-xs">
                                        <SelectValue placeholder="All traffic" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all" className="text-xs">All traffic</SelectItem>
                                        <SelectItem value="api" className="text-xs">API only</SelectItem>
                                        <SelectItem value="web" className="text-xs">Web only</SelectItem>
                                    </SelectContent>
                                </Select>

                                <Select
                                    value={httpFilters.status}
                                    onValueChange={(value) => setHttpFilters((prev) => ({ ...prev, status: value }))}
                                >
                                    <SelectTrigger className="w-[138px] h-7 text-xs">
                                        <SelectValue placeholder="All statuses" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all" className="text-xs">All statuses</SelectItem>
                                        <SelectItem value="2xx" className="text-xs">2xx Success</SelectItem>
                                        <SelectItem value="3xx" className="text-xs">3xx Redirect</SelectItem>
                                        <SelectItem value="4xx" className="text-xs">4xx Client</SelectItem>
                                        <SelectItem value="5xx" className="text-xs">5xx Server</SelectItem>
                                        <SelectItem value="429" className="text-xs">429 Rate Limited</SelectItem>
                                    </SelectContent>
                                </Select>

                                <Select
                                    value={httpFilters.method}
                                    onValueChange={(value) => setHttpFilters((prev) => ({ ...prev, method: value }))}
                                >
                                    <SelectTrigger className="w-[130px] h-7 text-xs whitespace-nowrap">
                                        <SelectValue placeholder="Method" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all" className="text-xs">All methods</SelectItem>
                                        <SelectItem value="GET" className="text-xs">GET</SelectItem>
                                        <SelectItem value="HEAD" className="text-xs">HEAD</SelectItem>
                                        <SelectItem value="POST" className="text-xs">POST</SelectItem>
                                        <SelectItem value="PUT" className="text-xs">PUT</SelectItem>
                                        <SelectItem value="PATCH" className="text-xs">PATCH</SelectItem>
                                        <SelectItem value="DELETE" className="text-xs">DELETE</SelectItem>
                                    </SelectContent>
                                </Select>

                                <TimeRangeSelector
                                    value={httpFilters.time_range}
                                    onChange={(value) => setHttpFilters((prev) => ({ ...prev, time_range: value }))}
                                />

                                <Select
                                    value={httpFilters.api_key_id}
                                    onValueChange={(value) => setHttpFilters((prev) => ({ ...prev, api_key_id: value }))}
                                    disabled={httpFilters.kind === 'web'}
                                >
                                    <SelectTrigger className="w-[190px] h-7 text-xs">
                                        <SelectValue placeholder="All API keys" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all" className="text-xs">All API keys</SelectItem>
                                        {filteredApiKeys?.map((key) => (
                                            <SelectItem key={key.id} value={key.id} className="text-xs">
                                                {key.name} ({key.key_prefix}...)
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                <form onSubmit={handleHttpSearchSubmit} className="relative">
                                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                    <Input
                                        placeholder="Search paths, hosts, caller domains, messages, or request IDs..."
                                        value={httpSearchInput}
                                        onChange={(e) => setHttpSearchInput(e.target.value)}
                                        className="w-56 sm:w-72 h-7 pl-7 text-xs rounded border-border/50 bg-transparent placeholder:text-muted-foreground/60"
                                    />
                                </form>

                                {hasActiveHttpFilters && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs px-2"
                                        onClick={handleClearHttpFilters}
                                    >
                                        <X className="h-3 w-3 mr-1" />
                                        Clear
                                    </Button>
                                )}
                            </div>

                            <HttpRequestLogsTable
                                projectId={projectId}
                                environment={environment}
                                filters={httpFilters}
                            />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
