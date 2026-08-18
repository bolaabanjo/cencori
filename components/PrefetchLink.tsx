"use client";

import React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";

interface PrefetchLinkProps extends React.ComponentProps<typeof Link> {
    prefetchKeys?: string[][];
    prefetchFn?: () => Promise<void>;
    children: React.ReactNode;
}

/**
 * PrefetchLink - A Link component that prefetches data on hover
 * 
 * Usage:
 * <PrefetchLink href="/path" prefetchKeys={[["queryKey", "id"]]}>
 *   Link Text
 * </PrefetchLink>
 * 
 * Or with custom prefetch function:
 * <PrefetchLink href="/path" prefetchFn={() => prefetchData()}>
 *   Link Text
 * </PrefetchLink>
 */
export function PrefetchLink({
    prefetchKeys,
    prefetchFn,
    onMouseEnter,
    onFocus,
    children,
    ...props
}: PrefetchLinkProps) {
    const queryClient = useQueryClient();
    const prefetchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

    const handlePrefetch = React.useCallback(async () => {
        // Use custom prefetch function if provided
        if (prefetchFn) {
            try {
                await prefetchFn();
            } catch (error) {
                // Silently fail - prefetching is just an optimization
                console.debug("[PrefetchLink] Prefetch failed:", error);
            }
            return;
        }

        // Otherwise prefetch by query keys
        if (prefetchKeys) {
            prefetchKeys.forEach(queryKey => {
                // Check if data is already cached and fresh
                const existingData = queryClient.getQueryData(queryKey);
                if (!existingData) {
                    // Prefetch only if not already cached
                    queryClient.prefetchQuery({
                        queryKey,
                        queryFn: async () => {
                            // Generic prefetch - the actual query function will be used when navigated
                            return null;
                        },
                        staleTime: 30 * 1000,
                    });
                }
            });
        }
    }, [prefetchFn, prefetchKeys, queryClient]);

    const handleMouseEnter = React.useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
        // Delay prefetch slightly to avoid prefetching on accidental hovers
        prefetchTimeoutRef.current = setTimeout(() => {
            handlePrefetch();
        }, 100);

        onMouseEnter?.(e);
    }, [handlePrefetch, onMouseEnter]);

    const handleMouseLeave = React.useCallback(() => {
        // Cancel prefetch if user moves away quickly
        if (prefetchTimeoutRef.current) {
            clearTimeout(prefetchTimeoutRef.current);
            prefetchTimeoutRef.current = null;
        }
    }, []);

    const handleFocus = React.useCallback((e: React.FocusEvent<HTMLAnchorElement>) => {
        // Also prefetch on focus for keyboard navigation
        handlePrefetch();
        onFocus?.(e);
    }, [handlePrefetch, onFocus]);

    return (
        <Link
            {...props}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onFocus={handleFocus}
        >
            {children}
        </Link>
    );
}

// Prefetch helper functions for common data types
export const prefetchHelpers = {
    orgSettings: async (queryClient: ReturnType<typeof useQueryClient>, orgSlug: string) => {
        await queryClient.prefetchQuery({
            queryKey: ["orgSettings", orgSlug],
            queryFn: async () => {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return null;

                const { data: orgData } = await supabase
                    .from("organizations")
                    .select("id, name, slug, description, plan_id, organization_plans(name)")
                    .eq("slug", orgSlug)
                    .single();

                if (!orgData) return null;

                const { data: projectsData } = await supabase
                    .from("projects")
                    .select("id, name, slug, status, created_at")
                    .eq("organization_id", orgData.id);

                return { organization: orgData, projects: projectsData || [] };
            },
            staleTime: 60 * 1000,
        });
    },

    orgBilling: async (queryClient: ReturnType<typeof useQueryClient>, orgSlug: string) => {
        await queryClient.prefetchQuery({
            queryKey: ["orgBilling", orgSlug],
            queryFn: async () => {
                const { data } = await supabase
                    .from("organizations")
                    .select("id, name, subscription_tier, subscription_status, monthly_requests_used, subscription_current_period_end")
                    .eq("slug", orgSlug)
                    .single();
                return data;
            },
            staleTime: 30 * 1000,
        });
    },

    orgProjects: async (queryClient: ReturnType<typeof useQueryClient>, orgSlug: string) => {
        await queryClient.prefetchQuery({
            queryKey: ["orgProjects", orgSlug],
            queryFn: async () => {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return null;

                const { data: orgData } = await supabase
                    .from("organizations")
                    .select("id, name, slug")
                    .eq("slug", orgSlug)
                    .single();

                if (!orgData) return null;

                const { data: projectsData } = await supabase
                    .from("projects")
                    .select("id, name, slug, description, visibility, github_repo_url, status, region, created_at")
                    .eq("organization_id", orgData.id);

                return { organization: orgData, projects: projectsData || [] };
            },
            staleTime: 30 * 1000,
        });
    },
};
