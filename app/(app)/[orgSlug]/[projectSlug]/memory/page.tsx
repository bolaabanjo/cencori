'use client';

import { use, useState } from 'react';
import { Brain } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { MemoryOverview } from '@/components/memory/MemoryOverview';
import { MemoryBrowser } from '@/components/memory/MemoryBrowser';
import { MemoryForgetSuggestions } from '@/components/memory/MemoryForgetSuggestions';
import { MemoryGraphExplorer } from '@/components/memory/MemoryGraphExplorer';
import { MemorySettingsPanel } from '@/components/memory/MemorySettingsPanel';
import { useProjectIdBySlug } from '@/lib/hooks/useQueries';

interface PageProps {
    params: Promise<{
        orgSlug: string;
        projectSlug: string;
    }>;
}

export default function MemoryPage({ params }: PageProps) {
    const { orgSlug, projectSlug } = use(params);
    const [activeTab, setActiveTab] = useState('overview');
    const { data: projectId, isLoading } = useProjectIdBySlug(orgSlug, projectSlug);

    if (isLoading) {
        return (
            <main className="mx-auto w-full max-w-[1180px] px-4 py-8 pb-24 sm:px-6 sm:py-10 lg:px-8">
                <div className="mb-8">
                    <Skeleton className="h-8 w-32" />
                    <Skeleton className="mt-3 h-3 w-80 max-w-full" />
                </div>
                <Skeleton className="mb-7 h-10 w-full" />
                <Skeleton className="h-[560px] w-full rounded-xl" />
            </main>
        );
    }

    if (!projectId) {
        return (
            <div className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
                <div className="flex flex-col items-center py-16 text-center">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                        <Brain className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">Project not found</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Unable to load memory for this project</p>
                </div>
            </div>
        );
    }

    return (
        <main className="mx-auto w-full max-w-[1180px] px-4 py-8 pb-24 sm:px-6 sm:py-10 lg:px-8">
            <header className="mb-8">
                <h1 className="text-[2rem] font-medium leading-none tracking-[-0.055em] text-balance">Memory</h1>
                <p className="mt-3 max-w-[58ch] text-xs leading-5 text-muted-foreground text-pretty">
                    What this project remembers about its end-users — what is stored, what gets recalled,
                    what it has connected, and what is no longer earning its place.
                </p>
            </header>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-7">
                <TabsList className="w-full justify-start gap-6 overflow-x-auto border-border/30">
                    <TabsTrigger value="overview" className="shrink-0 px-0 py-3 text-xs">Overview</TabsTrigger>
                    <TabsTrigger value="browse" className="shrink-0 px-0 py-3 text-xs">Memories</TabsTrigger>
                    <TabsTrigger value="graph" className="shrink-0 px-0 py-3 text-xs">Graph</TabsTrigger>
                    <TabsTrigger value="forgetting" className="shrink-0 px-0 py-3 text-xs">Forgetting</TabsTrigger>
                    <TabsTrigger value="settings" className="shrink-0 px-0 py-3 text-xs">Controls</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-0">
                    <MemoryOverview projectId={projectId} />
                </TabsContent>

                <TabsContent value="browse" className="mt-0">
                    <MemoryBrowser projectId={projectId} />
                </TabsContent>

                <TabsContent value="graph" className="mt-0">
                    <MemoryGraphExplorer projectId={projectId} />
                </TabsContent>

                <TabsContent value="forgetting" className="mt-0">
                    <MemoryForgetSuggestions projectId={projectId} />
                </TabsContent>

                <TabsContent value="settings" className="mt-0">
                    <MemorySettingsPanel projectId={projectId} />
                </TabsContent>
            </Tabs>
        </main>
    );
}
