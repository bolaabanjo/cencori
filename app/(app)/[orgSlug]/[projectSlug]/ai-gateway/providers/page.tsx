"use client";

/**
 * Providers Page (BYOK - Bring Your Own Key)
 * 
 * Main page for managing API keys for built-in AI providers.
 * Accessible from project sidebar.
 */

import React, { use } from 'react';
import { useQuery } from "@tanstack/react-query";
import { supabase } from '@/lib/supabaseClient';
import { ProviderKeyManager } from "@/components/dashboard/ProviderKeyManager";
import { Skeleton } from "@/components/ui/skeleton";

interface PageProps {
    params: Promise<{
        orgSlug: string;
        projectSlug: string;
    }>;
}

// Hook to get projectId from slugs
function useProjectId(orgSlug: string, projectSlug: string) {
    return useQuery({
        queryKey: ["projectId", orgSlug, projectSlug],
        queryFn: async () => {
            const { data: orgData } = await supabase
                .from('organizations')
                .select('id')
                .eq('slug', orgSlug)
                .single();

            if (!orgData) throw new Error("Organization not found");

            const { data: projectData } = await supabase
                .from('projects')
                .select('id')
                .eq('slug', projectSlug)
                .eq('organization_id', orgData.id)
                .single();

            if (!projectData) throw new Error("Project not found");
            return projectData.id;
        },
        staleTime: 5 * 60 * 1000,
    });
}

export default function ProvidersPage({ params }: PageProps) {
    const { orgSlug, projectSlug } = use(params);
    const { data: projectId, isLoading } = useProjectId(orgSlug, projectSlug);

    if (isLoading || !projectId) {
        return (
            <div className="w-full max-w-4xl mx-auto px-6 py-8">
                <Skeleton className="h-6 w-32 mb-2" />
                <Skeleton className="h-4 w-64 mb-8" />
                <div className="space-y-1">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-3">
                            <div className="flex items-center gap-3">
                                <Skeleton className="w-8 h-8 rounded-lg" />
                                <Skeleton className="h-4 w-24" />
                            </div>
                            <Skeleton className="h-5 w-20 rounded-md" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-4xl mx-auto px-6 py-8">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-lg font-semibold">Providers</h1>
                <p className="text-xs text-muted-foreground mt-1">
                    Connect your API keys to route requests through Cencori
                </p>
            </div>

            {/* Provider Key Manager */}
            <div className="rounded-lg border border-border/40 bg-card">
                <ProviderKeyManager projectId={projectId} />
            </div>
        </div>
    );
}
