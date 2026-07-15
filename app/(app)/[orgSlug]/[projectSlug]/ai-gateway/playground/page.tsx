"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { useEnvironment } from "@/lib/contexts/EnvironmentContext";
import { Skeleton } from "@/components/ui/skeleton";
import { PlaygroundChat } from "@/components/dashboard/playground/PlaygroundChat";

interface PlaygroundPageProps {
    params: Promise<{ orgSlug: string; projectSlug: string }>;
}

function useProjectData(orgSlug: string, projectSlug: string) {
    return useQuery({
        queryKey: ["projectData", orgSlug, projectSlug],
        queryFn: async () => {
            const { data: orgData } = await supabase
                .from("organizations")
                .select("id, subscription_tier")
                .eq("slug", orgSlug)
                .single();

            if (!orgData) throw new Error("Organization not found");

            const { data: projectData } = await supabase
                .from("projects")
                .select("id")
                .eq("slug", projectSlug)
                .eq("organization_id", orgData.id)
                .single();

            if (!projectData) throw new Error("Project not found");

            return {
                projectId: projectData.id,
                orgId: orgData.id,
                subscriptionTier: orgData.subscription_tier || "free",
            };
        },
        staleTime: 60 * 1000,
    });
}

export default function PlaygroundPage({ params }: PlaygroundPageProps) {
    const { orgSlug, projectSlug } = use(params);
    const { environment } = useEnvironment();
    const { data: projectData, isLoading: loadingProject } = useProjectData(
        orgSlug,
        projectSlug
    );

    if (loadingProject) {
        return (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="py-3">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="mt-1 h-3 w-48" />
                </div>
                <div className="flex flex-1 flex-col justify-end pb-4">
                    <div className="mx-auto h-16 w-full max-w-3xl rounded-2xl border border-border/30 bg-muted/20 animate-pulse" />
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <PlaygroundChat
                orgSlug={orgSlug}
                projectSlug={projectSlug}
                environment={environment}
                projectId={projectData?.projectId ?? ""}
                orgId={projectData?.orgId ?? ""}
                subscriptionTier={projectData?.subscriptionTier ?? "free"}
            />
        </div>
    );
}
