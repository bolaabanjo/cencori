"use client";

/**
 * Providers Page (BYOK - Bring Your Own Key)
 * 
 * Main page for managing API keys for built-in AI providers.
 * Accessible from project sidebar.
 */

import React, { use } from 'react';
import { ProviderKeyManager } from "@/components/dashboard/ProviderKeyManager";
import { useProjectIdBySlug } from "@/lib/hooks/useQueries";

interface PageProps {
    params: Promise<{
        orgSlug: string;
        projectSlug: string;
    }>;
}

// Hook to get projectId from slugs
function useProjectId(orgSlug: string, projectSlug: string) {
    return useProjectIdBySlug(orgSlug, projectSlug);
}

export default function ProvidersPage({ params }: PageProps) {
    const { orgSlug, projectSlug } = use(params);
    const { data: projectId, isLoading } = useProjectId(orgSlug, projectSlug);

    if (!isLoading && !projectId) {
        return (
            <div className="w-full max-w-4xl mx-auto px-6 py-8">
                <p className="py-16 text-center text-sm text-muted-foreground">Project not found.</p>
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
