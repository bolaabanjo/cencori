"use client";

import { use, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { useEnvironment } from "@/lib/contexts/EnvironmentContext";
import { useOrganizationProject } from "@/lib/contexts/OrganizationProjectContext";
import { Skeleton } from "@/components/ui/skeleton";
import { PlaygroundChat } from "@/components/dashboard/playground/PlaygroundChat";

interface PlaygroundPageProps {
    params: Promise<{ orgSlug: string; projectSlug: string }>;
}

interface ProjectData {
    projectId: string;
    orgId: string;
    subscriptionTier: string;
}

function useProjectData(orgSlug: string, projectSlug: string, initialData?: ProjectData) {
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
        initialData,
        initialDataUpdatedAt: initialData ? 0 : undefined,
        staleTime: 60 * 1000,
    });
}

export default function PlaygroundPage({ params }: PlaygroundPageProps) {
    const { orgSlug, projectSlug } = use(params);
    const { environment } = useEnvironment();
    const { organizations, projects } = useOrganizationProject();
    const cachedProjectData = useMemo<ProjectData | undefined>(() => {
        const organization = organizations.find((item) => item.slug === orgSlug);
        if (!organization) return undefined;

        const project = projects.find((item) => (
            item.slug === projectSlug && item.organization_id === organization.id
        ));
        if (!project) return undefined;

        return {
            projectId: project.id,
            orgId: organization.id,
            subscriptionTier: organization.subscription_tier || "free",
        };
    }, [organizations, projects, orgSlug, projectSlug]);
    const { data: projectData, isLoading: loadingProject } = useProjectData(
        orgSlug,
        projectSlug,
        cachedProjectData,
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
