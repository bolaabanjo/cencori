"use client";

import React, { use } from "react";
import Link from "next/link";
import { notFound, usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";

import {
    Sidebar,
    SidebarContent,
    SidebarProvider,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton,
    SidebarRail,
    SidebarGroup,
    SidebarTrigger,
    SidebarSeparator,
} from "@/components/ui/sidebar";
import { PanelTopIcon } from "@/components/animate-ui/icons/panel-top";
import { SettingsIcon } from "@/components/animate-ui/icons/settings";
import { ScrollText, ShieldAlert, Server, Puzzle, Cpu, Webhook, Boxes, DatabaseZap, FileText, Receipt } from "lucide-react";
import { BeakerIcon } from "@/components/icons/BeakerIcon";
import { ObservabilityIcon } from "@/components/icons/ObservabilityIcon";
import { useMobileSheet } from "@/lib/contexts/MobileSheetContext";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { BudgetAlertBanner } from "@/components/dashboard/BudgetAlertBanner";
import { cn } from "@/lib/utils";

interface ProjectData {
    id: string;
    name: string;
    slug: string;
    organization_id: string;
}

interface OrganizationData {
    id: string;
    name: string;
    slug: string;
}

type LayoutParams = Promise<{ orgSlug: string; projectSlug: string }>;

// Hook to fetch project and org with caching
function useProjectLayout(orgSlug: string, projectSlug: string) {
    return useQuery({
        queryKey: ["projectLayout", orgSlug, projectSlug],
        queryFn: async () => {
            const { data: orgData, error: orgError } = await supabase
                .from("organizations")
                .select("id, name, slug")
                .eq("slug", orgSlug)
                .single();

            if (orgError || !orgData) throw new Error("Organization not found");

            const { data: projectData, error: projectError } = await supabase
                .from("projects")
                .select("id, name, slug, organization_id")
                .eq("slug", projectSlug)
                .eq("organization_id", orgData.id)
                .single();

            if (projectError || !projectData) throw new Error("Project not found");

            return {
                organization: orgData as OrganizationData,
                project: projectData as ProjectData,
            };
        },
        staleTime: 5 * 60 * 1000, // 5 minutes - layout data rarely changes
    });
}

// Prefetch helper for project pages
async function prefetchProjectPage(
    queryClient: ReturnType<typeof useQueryClient>,
    projectId: string,
    pageType: string
) {
    // Prefetch common data based on page type
    const prefetchMap: Record<string, () => Promise<void>> = {
        "api-keys": async () => {
            await queryClient.prefetchQuery({
                queryKey: ["apiKeys", projectId],
                queryFn: async () => {
                    const response = await fetch(`/api/projects/${projectId}/api-keys`);
                    return response.json();
                },
                staleTime: 30 * 1000,
            });
        },
        providers: async () => {
            await queryClient.prefetchQuery({
                queryKey: ["projectProviders", projectId],
                queryFn: async () => {
                    const response = await fetch(`/api/projects/${projectId}/providers`);
                    return response.json();
                },
                staleTime: 30 * 1000,
            });
        },
        observability: async () => {
            await queryClient.prefetchQuery({
                queryKey: ["analyticsStats", projectId, "7d"],
                queryFn: async () => {
                    const response = await fetch(`/api/projects/${projectId}/ai/stats?period=7d`);
                    return response.json();
                },
                staleTime: 30 * 1000,
            });
        },
    };

    const prefetchFn = prefetchMap[pageType];
    if (prefetchFn) {
        try {
            await prefetchFn();
        } catch (error) {
            console.debug("[ProjectLayout] Prefetch failed:", error);
        }
    }
}

// Nav item type
interface NavItem {
    href: string;
    icon: React.ComponentType<{ animateOnHover?: boolean; className?: string }>;
    label: string;
    prefetch?: () => void;
}

// Sidebar link with prefetching
function ProjectSidebarLink({
    href,
    icon: Icon,
    label,
    isActive,
    prefetch,
    onClick,
}: {
    href: string;
    icon: React.ComponentType<{ animateOnHover?: boolean; className?: string }>;
    label: string;
    isActive: boolean;
    prefetch?: () => void;
    onClick?: () => void;
}) {
    const handleMouseEnter = () => {
        if (prefetch) {
            setTimeout(prefetch, 100);
        }
    };

    return (
        <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={label} isActive={isActive} size="sm">
                <Link href={href} prefetch={true} onMouseEnter={handleMouseEnter} onClick={onClick}>
                    <Icon className="h-3.5 w-3.5" />
                    <span className="text-xs">{label}</span>
                </Link>
            </SidebarMenuButton>
        </SidebarMenuItem>
    );
}

// Render nav group with optional divider
function NavGroup({
    items,
    isActive,
    onClick,
    showDivider = true,
}: {
    items: NavItem[];
    isActive: (path: string) => boolean;
    onClick?: () => void;
    showDivider?: boolean;
}) {
    return (
        <>
            {items.map((item) => (
                <ProjectSidebarLink
                    key={item.href}
                    href={item.href}
                    icon={item.icon}
                    label={item.label}
                    isActive={isActive(item.href)}
                    prefetch={item.prefetch}
                    onClick={onClick}
                />
            ))}
            {showDivider && <SidebarSeparator className="my-2 mx-0 w-full" />}
        </>
    );
}

export default function ProjectLayoutClient({
    children,
    params,
}: {
    children: React.ReactNode;
    params: LayoutParams;
}) {
    const { orgSlug, projectSlug } = use(params);
    const pathname = usePathname();
    const queryClient = useQueryClient();
    const { isOpen, setIsOpen } = useMobileSheet();

    // Fetch project and org with caching - INSTANT ON REVISIT!
    const { data, error } = useProjectLayout(orgSlug, projectSlug);
    const project = data?.project;

    // Helper to check if a route is active
    const isActive = (path: string) => {
        if (path.endsWith(projectSlug || '')) {
            return pathname === path;
        }
        return pathname.startsWith(path);
    };

    // Only show not found if there's an error (not while loading)
    if (error) {
        notFound();
    }

    // Use URL params directly for nav - no need to wait for query!
    const basePath = `/dashboard/organizations/${orgSlug}/projects/${projectSlug}`;

    // Create prefetch functions for data-heavy pages (only if project data is loaded)
    const createPrefetch = (pageType: string) => () => {
        if (project?.id) {
            prefetchProjectPage(queryClient, project.id, pageType);
        }
    };

    // Grouped navigation items
    const coreItems: NavItem[] = [
        { href: basePath, icon: PanelTopIcon, label: "Project Overview" },

        { href: `${basePath}/prompts`, icon: FileText, label: "Prompts" },
        { href: `${basePath}/observability`, icon: ObservabilityIcon, label: "Observability", prefetch: createPrefetch("observability") },
        { href: `${basePath}/logs`, icon: ScrollText, label: "Logs" },
    ];

    const infrastructureItems: NavItem[] = [
        { href: `${basePath}/providers`, icon: Cpu, label: "Providers", prefetch: createPrefetch("providers") },
        { href: `${basePath}/models`, icon: Boxes, label: "Models" },
        { href: `${basePath}/custom-providers`, icon: Server, label: "Custom Providers" },
        { href: `${basePath}/cache`, icon: DatabaseZap, label: "Cache" },
        { href: `${basePath}/playground`, icon: BeakerIcon, label: "Playground" },
    ];

    const securityItems: NavItem[] = [
        { href: `${basePath}/security`, icon: ShieldAlert, label: "Security" },
        { href: `${basePath}/edge`, icon: Puzzle, label: "Edge" },
    ];

    const billingItems: NavItem[] = [
        { href: `${basePath}/end-user-billing`, icon: Receipt, label: "End-User Billing" },
    ];

    const settingsItems: NavItem[] = [
        { href: `${basePath}/webhooks`, icon: Webhook, label: "Webhooks" },
        { href: `${basePath}/settings`, icon: SettingsIcon, label: "Project Settings" },
    ];

    const isPlayground = pathname.includes("/playground");

    return (
        <SidebarProvider
            defaultOpen={false}
            className={isPlayground ? "min-h-0 flex-1 overflow-hidden" : undefined}
            style={isPlayground ? { minHeight: "0px" } : undefined}
        >
            {/* Desktop Sidebar - hidden on mobile */}
            <Sidebar collapsible="icon" expandOnHover className="top-12 h-[calc(100vh-3rem)] hidden lg:block border-r border-border/40">
                <SidebarContent>
                    <SidebarGroup className="pt-3">
                        <SidebarMenu>
                            <NavGroup items={coreItems} isActive={isActive} />
                            <NavGroup items={infrastructureItems} isActive={isActive} />
                            <NavGroup items={securityItems} isActive={isActive} />
                            <NavGroup items={billingItems} isActive={isActive} />
                            <NavGroup items={settingsItems} isActive={isActive} showDivider={false} />
                        </SidebarMenu>
                    </SidebarGroup>
                </SidebarContent>
                <SidebarRail />
                <div className="absolute bottom-0 left-0 w-full p-2">
                    <SidebarTrigger />
                </div>
            </Sidebar>

            {/* Mobile Sheet */}
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
                <SheetContent side="bottom" className="h-[70vh]">
                    <div className="py-3">
                        <SidebarGroup>
                            <SidebarMenu>
                                <NavGroup items={coreItems} isActive={isActive} onClick={() => setIsOpen(false)} />
                                <NavGroup items={infrastructureItems} isActive={isActive} onClick={() => setIsOpen(false)} />
                                <NavGroup items={securityItems} isActive={isActive} onClick={() => setIsOpen(false)} />
                                <NavGroup items={billingItems} isActive={isActive} onClick={() => setIsOpen(false)} />
                                <NavGroup items={settingsItems} isActive={isActive} onClick={() => setIsOpen(false)} showDivider={false} />
                            </SidebarMenu>
                        </SidebarGroup>
                    </div>
                </SheetContent>
            </Sheet>

            <main
                className={cn(
                    "flex w-full flex-1 flex-col overflow-hidden",
                    isPlayground && "min-h-0"
                )}
            >
                {project && !isPlayground && (
                    <BudgetAlertBanner
                        projectId={project.id}
                        settingsHref={`${basePath}/settings`}
                    />
                )}
                {children}
            </main>
        </SidebarProvider>
    );
}
