"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { useOrganizationProject, type Organization, type Project } from "@/lib/contexts/OrganizationProjectContext";
import { normalizeProjectId } from "@/lib/project-id";

// Query keys for cache management
export const queryKeys = {
    organizations: ["organizations"] as const,
    projects: (orgId?: string) => ["projects", orgId] as const,
    projectDetails: (projectId: string) => ["project", projectId] as const,
    orgDetails: (orgSlug: string) => ["organization", orgSlug] as const,
    providers: (projectId: string) => ["providers", projectId] as const,
    apiKeys: (projectId: string) => ["apiKeys", projectId] as const,
    logs: (projectId: string, filters?: object) => ["logs", projectId, filters] as const,
    analytics: (projectId: string, range?: string) => ["analytics", projectId, range] as const,
    projectIdBySlug: (orgSlug: string, projectSlug: string) => ["projectId", orgSlug, projectSlug] as const,
    projectDetailsBySlug: (orgSlug: string, projectSlug: string) => ["projectDetailsBySlug", orgSlug, projectSlug] as const,
};

// Fetch all organizations for current user
export function useOrganizations() {
    return useQuery({
        queryKey: queryKeys.organizations,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("organizations")
                .select("id, name, slug, subscription_tier");

            if (error) throw error;
            return data || [];
        },
    });
}

// Fetch projects for a specific organization
export function useProjects(orgId?: string) {
    return useQuery({
        queryKey: queryKeys.projects(orgId),
        queryFn: async () => {
            if (!orgId) return [];

            const { data, error } = await supabase
                .from("projects")
                .select("id, name, slug, organization_id")
                .eq("organization_id", orgId);

            if (error) throw error;
            return data || [];
        },
        enabled: !!orgId,
    });
}

// Fetch single organization by slug
export function useOrganization(orgSlug: string) {
    const { organizations } = useOrganizationProject();
    const cachedOrganization = useMemo(
        () => organizations.find((organization) => organization.slug === orgSlug),
        [organizations, orgSlug],
    );

    return useQuery({
        queryKey: queryKeys.orgDetails(orgSlug),
        // Annotated so the fetched row and `initialData` (which comes from the
        // context cache) agree on one type.
        queryFn: async (): Promise<Organization> => {
            const { data, error } = await supabase
                .from("organizations")
                .select("id, name, slug, subscription_tier")
                .eq("slug", orgSlug)
                .single();

            if (error) throw error;
            return data;
        },
        enabled: !!orgSlug,
        initialData: cachedOrganization,
        initialDataUpdatedAt: cachedOrganization ? 0 : undefined,
        staleTime: 60 * 1000, // Org details rarely change
    });
}

// Fetch single project by slug
export function useProject(projectSlug: string, orgId?: string) {
    const { projects } = useOrganizationProject();
    const cachedProject = useMemo(
        () => projects.find((project) => (
            project.slug === projectSlug && (!orgId || project.organization_id === orgId)
        )),
        [projects, projectSlug, orgId],
    );

    return useQuery({
        queryKey: queryKeys.projectDetails(projectSlug),
        queryFn: async (): Promise<Project> => {
            if (!orgId) throw new Error("Organization ID required");

            const { data, error } = await supabase
                .from("projects")
                .select("id, name, slug, organization_id, description")
                .eq("slug", projectSlug)
                .eq("organization_id", orgId)
                .single();

            if (error) throw error;
            return data;
        },
        enabled: !!projectSlug && !!orgId,
        initialData: cachedProject,
        initialDataUpdatedAt: cachedProject ? 0 : undefined,
        staleTime: 60 * 1000,
    });
}

/**
 * Resolve a project slug without making every project page repeat the same
 * organization -> project lookup. The application shell already owns this
 * identity data, so seed React Query from that cache and refresh it in the
 * background. This prevents a second, identity-only loading screen before a
 * page can start loading its actual content.
 */
export function useProjectIdBySlug(orgSlug: string, projectSlug: string) {
    const {
        organizations,
        projects,
    } = useOrganizationProject();

    const cachedProjectId = useMemo(() => {
        const organization = organizations.find((item) => item.slug === orgSlug);
        if (!organization) return undefined;

        return projects.find((item) => (
            item.slug === projectSlug && item.organization_id === organization.id
        ))?.id;
    }, [organizations, projects, orgSlug, projectSlug]);

    const query = useQuery<unknown, Error, string | undefined>({
        queryKey: queryKeys.projectIdBySlug(orgSlug, projectSlug),
        queryFn: async () => {
            const { data: organization, error: organizationError } = await supabase
                .from("organizations")
                .select("id")
                .eq("slug", orgSlug)
                .single();

            if (organizationError) throw organizationError;

            const { data: project, error: projectError } = await supabase
                .from("projects")
                .select("id")
                .eq("slug", projectSlug)
                .eq("organization_id", organization.id)
                .single();

            if (projectError) throw projectError;
            return project.id;
        },
        // A previous Edge page implementation used this same cache key for
        // { projectId, projectName }. Normalize that shape so warm sessions
        // recover immediately while the newly separated keys take effect.
        select: normalizeProjectId,
        enabled: Boolean(orgSlug && projectSlug),
        initialData: cachedProjectId,
        initialDataUpdatedAt: cachedProjectId ? 0 : undefined,
        staleTime: 5 * 60 * 1000,
    });

    const projectId = query.data ?? cachedProjectId;

    return {
        ...query,
        data: projectId,
        isLoading: !projectId && query.isLoading,
    };
}

// Fetch providers for a project
export function useProviders(projectId: string) {
    return useQuery({
        queryKey: queryKeys.providers(projectId),
        queryFn: async () => {
            const res = await fetch(`/api/projects/${projectId}/providers`);
            if (!res.ok) throw new Error("Failed to fetch providers");
            const data = await res.json();
            return data.providers || [];
        },
        enabled: !!projectId,
    });
}

// Fetch API keys for a project
export function useApiKeys(projectId: string) {
    return useQuery({
        queryKey: queryKeys.apiKeys(projectId),
        queryFn: async () => {
            const res = await fetch(`/api/projects/${projectId}/api-keys`);
            if (!res.ok) throw new Error("Failed to fetch API keys");
            const data = await res.json();
            return data.apiKeys || [];
        },
        enabled: !!projectId,
    });
}

// Invalidate queries helper
export function useInvalidateQueries() {
    const queryClient = useQueryClient();

    return {
        invalidateOrgs: () => queryClient.invalidateQueries({ queryKey: queryKeys.organizations }),
        invalidateProjects: (orgId?: string) => queryClient.invalidateQueries({ queryKey: queryKeys.projects(orgId) }),
        invalidateProviders: (projectId: string) => queryClient.invalidateQueries({ queryKey: queryKeys.providers(projectId) }),
        invalidateApiKeys: (projectId: string) => queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys(projectId) }),
        invalidateAll: () => queryClient.invalidateQueries(),
    };
}
