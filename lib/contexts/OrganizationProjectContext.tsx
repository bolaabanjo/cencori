"use client";

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import { createBrowserClient } from "@supabase/ssr";

interface Organization {
    id: string;
    name: string;
    slug: string;
    description?: string;
    subscription_tier?: string;
}

interface Project {
    id: string;
    name: string;
    slug: string;
    description?: string;
    organization_id: string;
    orgSlug?: string;
}

interface OrganizationProjectContextType {
    organizations: Organization[];
    projects: Project[];
    loading: boolean;
    updateOrganization: (id: string, updates: Partial<Organization>) => void;
    updateProject: (id: string, updates: Partial<Project>) => void;
    refetchData: () => Promise<void>;
}

const OrganizationProjectContext = createContext<OrganizationProjectContextType | undefined>(
    undefined
);

const CACHE_KEY = "cencori:org-project-cache";

function loadCache(): { organizations: Organization[]; projects: Project[] } | null {
    try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.organizations) && Array.isArray(parsed.projects)) {
            return parsed;
        }
    } catch { /* ignore corrupt cache */ }
    return null;
}

function saveCache(organizations: Organization[], projects: Project[]) {
    try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ organizations, projects }));
    } catch { /* storage full, ignore */ }
}

export const OrganizationProjectProvider = ({ children }: { children: ReactNode }) => {
    const cached = useMemo(() => loadCache(), []);
    const [organizations, setOrganizations] = useState<Organization[]>(cached?.organizations ?? []);
    const [projects, setProjects] = useState<Project[]>(cached?.projects ?? []);
    const [loading, setLoading] = useState(!cached);

    const supabase = useMemo(
        () =>
            createBrowserClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
            ),
        []
    );

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const {
                data: { session },
                error: sessionError,
            } = await supabase.auth.getSession();

            if (sessionError || !session?.user) {
                console.error("User not logged in:", sessionError?.message);
                setLoading(false);
                return;
            }

            // Fetch organizations
            const { data: orgsData, error: orgsError } = await supabase
                .from("organizations")
                .select("id, name, slug, subscription_tier");

            if (orgsError) {
                console.error("Error fetching organizations:", orgsError.message);
            } else {
                setOrganizations(orgsData || []);
            }

            // Fetch projects
            let projectsWithOrgSlug: Project[] = [];
            if (orgsData && orgsData.length > 0) {
                const orgIds = orgsData.map((org) => org.id);
                const { data: projectsData, error: projectsError } = await supabase
                    .from("projects")
                    .select("id, name, slug, organization_id")
                    .in("organization_id", orgIds);

                if (projectsError) {
                    console.error("Error fetching projects:", projectsError.message);
                } else {
                    // Map project data to include orgSlug
                    projectsWithOrgSlug =
                        projectsData?.map((proj) => ({
                            ...proj,
                            orgSlug: orgsData.find((org) => org.id === proj.organization_id)?.slug,
                        })) || [];
                    setProjects(projectsWithOrgSlug);
                }
            }

            saveCache(orgsData || [], projectsWithOrgSlug);
        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setLoading(false);
        }
    }, [supabase]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const updateOrganization = (id: string, updates: Partial<Organization>) => {
        setOrganizations((prev) =>
            prev.map((org) => (org.id === id ? { ...org, ...updates } : org))
        );
    };

    const updateProject = (id: string, updates: Partial<Project>) => {
        setProjects((prev) => prev.map((proj) => (proj.id === id ? { ...proj, ...updates } : proj)));
    };

    const refetchData = async () => {
        await fetchData();
    };

    return (
        <OrganizationProjectContext.Provider
            value={{
                organizations,
                projects,
                loading,
                updateOrganization,
                updateProject,
                refetchData,
            }}
        >
            {children}
        </OrganizationProjectContext.Provider>
    );
};

export const useOrganizationProject = () => {
    const context = useContext(OrganizationProjectContext);
    if (context === undefined) {
        throw new Error("useOrganizationProject must be used within an OrganizationProjectProvider");
    }
    return context;
};
