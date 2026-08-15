"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useParams, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import {
    Sidebar,
    SidebarContent,
    SidebarProvider,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton,
    SidebarGroup,
    SidebarSeparator,
    SidebarFooter,
} from "@/components/ui/sidebar";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { HugeiconsIcon } from "@hugeicons/react";
import { Book, ArrowUpRight, HelpCircle, Wrench, Activity, Mail, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import DashboardCircleIcon from "@hugeicons/core-free-icons/DashboardCircleIcon";
import Analytics01Icon from "@hugeicons/core-free-icons/Analytics01Icon";
import Activity03Icon from "@hugeicons/core-free-icons/Activity03Icon";
import DiscoverSquareIcon from "@hugeicons/core-free-icons/DiscoverSquareIcon";
import AiLockIcon from "@hugeicons/core-free-icons/AiLockIcon";
import AiBrain02Icon from "@hugeicons/core-free-icons/AiBrain02Icon";
import PuzzleIcon from "@hugeicons/core-free-icons/PuzzleIcon";
import CreditCardAcceptIcon from "@hugeicons/core-free-icons/CreditCardAcceptIcon";
import AirdropIcon from "@hugeicons/core-free-icons/AirdropIcon";
import Settings02Icon from "@hugeicons/core-free-icons/Settings02Icon";
import Configuration02Icon from "@hugeicons/core-free-icons/Configuration02Icon";
import AiChat01Icon from "@hugeicons/core-free-icons/AiChat01Icon";
import AiCloudIcon from "@hugeicons/core-free-icons/AiCloudIcon";
import AiChipIcon from "@hugeicons/core-free-icons/AiChipIcon";
import ThreeDMoveIcon from "@hugeicons/core-free-icons/ThreeDMoveIcon";
import AiSettingIcon from "@hugeicons/core-free-icons/AiSettingIcon";
import Blockchain03Icon from "@hugeicons/core-free-icons/Blockchain03Icon";
import AiChemistry01Icon from "@hugeicons/core-free-icons/AiChemistry01Icon";
import DollarCircleIcon from "@hugeicons/core-free-icons/DollarCircleIcon";
import Chart01Icon from "@hugeicons/core-free-icons/Chart01Icon";
import Plug01Icon from "@hugeicons/core-free-icons/Plug01Icon";
import UserMultipleIcon from "@hugeicons/core-free-icons/UserMultipleIcon";
import DocumentValidationIcon from "@hugeicons/core-free-icons/DocumentValidationIcon";
import { useMobileSheet } from "@/lib/contexts/MobileSheetContext";
import { useSession } from "@/lib/contexts/SessionContext";
import { isAuthExpiredError } from "@/lib/auth/auth-errors";
import { WorkspaceUnavailable } from "@/components/dashboard/WorkspaceUnavailable";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { UsageLimitBanner } from "@/components/billing/UsageLimitBanner";
import { UserMenu } from "@/components/dashboard/UserMenu";
import { FeedbackMenu } from "@/components/dashboard/FeedbackMenu";

interface OrganizationData {
    id: string;
    name: string;
    slug: string;
    subscription_tier: string;
    monthly_requests_used: number;
    monthly_request_limit: number;
}

// Sentinel message that marks an org the server returned zero rows for, vs. a
// transient failure (offline, 5xx). Only the former renders the unavailable
// screen — a network blip must never nuke the dashboard.
//
// "Zero rows" is not the same as "doesn't exist": RLS filters out every org the
// signed-in account isn't a member of, so a workspace belonging to another
// account is indistinguishable from a slug that was never real. See
// WorkspaceUnavailable for how that ambiguity is presented.
const ORG_NOT_FOUND = "ORG_NOT_FOUND";
// The session behind the tab is dead or belongs to somebody else. Handed to
// SessionProvider, which owns the interruption UI.
const ORG_AUTH_EXPIRED = "ORG_AUTH_EXPIRED";

function useOrganization(orgSlug: string) {
    return useQuery({
        queryKey: ["orgLayout", orgSlug],
        queryFn: async () => {
            const { data: orgData, error: orgError } = await supabase
                .from("organizations")
                .select("id, name, slug, subscription_tier, monthly_requests_used, monthly_request_limit")
                .eq("slug", orgSlug)
                .single();

            if (orgError) {
                // An expired or swapped session comes back as an auth error,
                // not as missing data. Never render that as a missing org.
                if (isAuthExpiredError(orgError)) {
                    throw new Error(ORG_AUTH_EXPIRED);
                }
                // PGRST116 = query succeeded but matched no rows → nothing this
                // account can reach at this slug. Anything else (network drop,
                // timeout, 5xx) is transient and must be surfaced as a
                // retryable error.
                if (orgError.code === "PGRST116") {
                    throw new Error(ORG_NOT_FOUND);
                }
                throw orgError;
            }
            if (!orgData) {
                throw new Error(ORG_NOT_FOUND);
            }

            return orgData as OrganizationData;
        },
        staleTime: 15 * 60 * 1000,
        // Retrying a definitive answer only delays the explanation. Transient
        // failures keep the default single retry.
        retry: (failureCount, error) => {
            const message = error instanceof Error ? error.message : "";
            if (message === ORG_NOT_FOUND || message === ORG_AUTH_EXPIRED) return false;
            return failureCount < 1;
        },
    });
}

export default function OrganizationLayoutClient({
    children,
}: {
    children: React.ReactNode;
}) {
    const params = useParams<{ orgSlug: string }>();
    const { orgSlug } = params;
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { isOpen, setIsOpen } = useMobileSheet();
    const { reportSessionExpired } = useSession();

    const { data: organization, error } = useOrganization(orgSlug);

    const { data: projects } = useQuery({
        queryKey: ["sidebarProjects", organization?.id],
        queryFn: async () => {
            if (!organization?.id) return [];
            const { data } = await supabase
                .from("projects")
                .select("slug")
                .eq("organization_id", organization.id)
                .limit(1);
            return data || [];
        },
        enabled: !!organization?.id,
        staleTime: 15 * 60 * 1000,
        placeholderData: (prev: { slug: string }[] | undefined) => prev,
    });

    // URL shape after the polish is /{orgSlug}/{projectSlug OR ~}/*.
    // Everything at segments[1] except "~" is a project slug — every
    // org-scoped route lives under /{orgSlug}/~/*.
    const router = useRouter();
    const segments = useMemo(() => pathname.split("/").filter(Boolean), [pathname]);
    const orgSubSegment = segments[1];
    const isInsideProject = !!orgSubSegment && orgSubSegment !== "~";
    const projectSlug = isInsideProject ? orgSubSegment : (projects?.[0]?.slug || null);
    const isProjectCreation = pathname.includes("/projects/new") || pathname.includes("/projects/import");
    const isPlayground = pathname.includes("/ai-gateway/playground");
    const scopedArea = segments[2];
    const isProjectSettingsView = isInsideProject && scopedArea === "settings";
    const isOrganizationSettingsView = !isInsideProject && scopedArea === "settings";
    const [activeView, setActiveView] = useState<"main" | "observability" | "ai-gateway" | "project-settings" | "settings">(() => {
        if (isInsideProject && pathname.includes("/observability")) return "observability";
        if (pathname.includes("/ai-gateway")) return "ai-gateway";
        if (isProjectSettingsView) return "project-settings";
        if (isOrganizationSettingsView) return "settings";
        return "main";
    });

    const orgBase = `/${orgSlug}`;
    const basePath = projectSlug ? `${orgBase}/${projectSlug}` : null;
    const observabilityHref = isInsideProject ? `${basePath}/observability` : `${orgBase}/~/observability`;
    const rawObservabilitySection = searchParams.get("section");
    const observabilitySection = rawObservabilitySection === "http" || rawObservabilitySection === "api" || rawObservabilitySection === "web"
        ? "overview"
        : rawObservabilitySection || "overview";
    const organizationSettingsSection = searchParams.get("section") === "advanced" ? "advanced" : "general";
    const requestedProjectSettingsTab = searchParams.get("tab");
    const projectSettingsTab = ["general", "budget", "providers", "infrastructure", "networking", "integrations", "api"].includes(requestedProjectSettingsTab || "")
        ? requestedProjectSettingsTab
        : "general";

    const isActive = (path: string) => {
        const exactMatchOnly =
            path === basePath ||
            path === orgBase ||
            path === `${basePath}/ai-gateway` ||
            path === `${orgBase}/~/ai-gateway`;
        if (exactMatchOnly) return pathname === path;
        if (pathname === path) return true;
        if (pathname.startsWith(path + "/")) return true;
        return false;
    };

    const prefetchRoute = (href: string) => {
        router.prefetch(href);
    };

    const queryClient = useQueryClient();
    useEffect(() => {
        queryClient.prefetchQuery({ queryKey: ["orgLayout", orgSlug] });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (isInsideProject && pathname.includes("/observability")) {
            setActiveView("observability");
        } else if (pathname.includes("/ai-gateway")) {
            setActiveView("ai-gateway");
        } else if (isProjectSettingsView) {
            setActiveView("project-settings");
        } else if (isOrganizationSettingsView) {
            setActiveView("settings");
        } else {
            setActiveView("main");
        }
    }, [isInsideProject, isOrganizationSettingsView, isProjectSettingsView, pathname]);

    // Transient/network errors keep the last-good dashboard on screen; the
    // global ConnectivityWatcher tells the user to reconnect, and React Query
    // refetches once back online. Only a definitive answer changes the page.
    const orgErrorMessage = error instanceof Error ? error.message : null;

    useEffect(() => {
        if (orgErrorMessage === ORG_AUTH_EXPIRED) {
            reportSessionExpired();
        }
    }, [orgErrorMessage, reportSessionExpired]);

    if (orgErrorMessage === ORG_NOT_FOUND) {
        // Deliberately not notFound(): the sidebar around it links into an org
        // this account can't open, and "404" answers the wrong question. See
        // WorkspaceUnavailable.
        return <WorkspaceUnavailable orgSlug={orgSlug} />;
    }

    // Layout groups (top → bottom):
    //   1. overviewItem                  — Projects (org level) or Overview (project level)
    //   2. Observability toggle           — expands to observabilitySubItems
    //   3. projectItems                  — Logs
    //   4. AI Gateway toggle             — expands to projectSubItems
    //   5. projectSecondaryItems         — Security, Memory, Edge, Deployments, Monetization
    //   6. orgItems                      — Billing, Usage, Integrations, Teams, Audit Log
    //   7. bottomItems                   — Webhooks, Settings

    const overviewItem = {
        href: isInsideProject ? `${basePath}` : `${orgBase}/~/projects`,
        icon: <HugeiconsIcon icon={DashboardCircleIcon} className="!h-5 !w-5" />,
        label: isInsideProject ? "Overview" : "Projects",
    };

    const observabilityItem = {
        href: observabilityHref,
        icon: <HugeiconsIcon icon={Analytics01Icon} className="!h-5 !w-5" />,
        label: "Observability",
    };

    const projectItems = [
        {
            href: isInsideProject ? `${basePath}/logs` : `${orgBase}/~/logs`,
            icon: <HugeiconsIcon icon={Activity03Icon} className="!h-5 !w-5" />,
            label: "Logs",
        },
    ];

    const observabilitySubItems = [
        { section: "overview", href: observabilityHref, icon: <HugeiconsIcon icon={DashboardCircleIcon} className="!h-5 !w-5" />, label: "Overview" },
        { section: "ai", href: `${observabilityHref}?section=ai`, icon: <HugeiconsIcon icon={AiChipIcon} className="!h-5 !w-5" />, label: "AI" },
        { section: "reliability", href: `${observabilityHref}?section=reliability`, icon: <HugeiconsIcon icon={Activity03Icon} className="!h-5 !w-5" />, label: "Reliability" },
        { section: "security", href: `${observabilityHref}?section=security`, icon: <HugeiconsIcon icon={AiLockIcon} className="!h-5 !w-5" />, label: "Security" },
        { section: "intelligence", href: `${observabilityHref}?section=intelligence`, icon: <HugeiconsIcon icon={AiChemistry01Icon} className="!h-5 !w-5" />, label: "Intelligence" },
    ];

    const projectSubItems = [
        { href: isInsideProject ? `${basePath}/ai-gateway` : `${orgBase}/~/ai-gateway`, icon: <HugeiconsIcon icon={DashboardCircleIcon} className="!h-5 !w-5" />, label: "Overview" },
        { href: isInsideProject ? `${basePath}/ai-gateway/prompts` : `${orgBase}/~/ai-gateway/prompts`, icon: <HugeiconsIcon icon={AiChat01Icon} className="!h-5 !w-5" />, label: "Prompts" },
        { href: isInsideProject ? `${basePath}/ai-gateway/providers` : `${orgBase}/~/ai-gateway/providers`, icon: <HugeiconsIcon icon={AiCloudIcon} className="!h-5 !w-5" />, label: "BYOK" },
        { href: isInsideProject ? `${basePath}/ai-gateway/models` : `${orgBase}/~/ai-gateway/models`, icon: <HugeiconsIcon icon={AiChipIcon} className="!h-5 !w-5" />, label: "Models" },
        { href: isInsideProject ? `${basePath}/ai-gateway/custom-providers` : `${orgBase}/~/ai-gateway/custom-providers`, icon: <HugeiconsIcon icon={AiSettingIcon} className="!h-5 !w-5" />, label: "Custom Providers" },
        { href: isInsideProject ? `${basePath}/ai-gateway/cache` : `${orgBase}/~/ai-gateway/cache`, icon: <HugeiconsIcon icon={Blockchain03Icon} className="!h-5 !w-5" />, label: "Cache" },
        { href: isInsideProject ? `${basePath}/ai-gateway/playground` : `${orgBase}/~/ai-gateway/playground`, icon: <HugeiconsIcon icon={AiChemistry01Icon} className="!h-5 !w-5" />, label: "Playground" },
    ];

    const projectSecondaryItems = [
        { href: isInsideProject ? `${basePath}/security` : `${orgBase}/~/security`, icon: <HugeiconsIcon icon={AiLockIcon} className="!h-5 !w-5" />, label: "Security" },
        // Memory is per-project (a memory belongs to one project's end-users),
        // so there is no org-scope view to fall back to — hide it outside a project.
        ...(isInsideProject && process.env.NODE_ENV !== "production"
            ? [{ href: `${basePath}/memory`, icon: <HugeiconsIcon icon={AiBrain02Icon} className="!h-5 !w-5" />, label: "Memory" }]
            : []),
        { href: isInsideProject ? `${basePath}/edge` : `${orgBase}/~/edge`, icon: <HugeiconsIcon icon={PuzzleIcon} className="!h-5 !w-5" />, label: "Edge" },
        // Compute — agent hosting. Project scope = that agent's version history;
        // org scope = the agent fleet (one row per agent-project). See ~/deployments.
        ...(process.env.NODE_ENV !== "production"
            ? [{ href: isInsideProject ? `${basePath}/deployments` : `${orgBase}/~/deployments`, icon: <HugeiconsIcon icon={ThreeDMoveIcon} className="!h-5 !w-5" />, label: "Deployments" }]
            : []),
        { href: isInsideProject ? `${basePath}/monetization` : `${orgBase}/~/monetization`, icon: <HugeiconsIcon icon={CreditCardAcceptIcon} className="!h-5 !w-5" />, label: "Monetization" },
    ];

    const orgItems = [
        { href: `${orgBase}/~/billing`, icon: <HugeiconsIcon icon={DollarCircleIcon} className="!h-5 !w-5" />, label: "Billing" },
        { href: `${orgBase}/~/usage`, icon: <HugeiconsIcon icon={Chart01Icon} className="!h-5 !w-5" />, label: "Usage" },
        { href: `${orgBase}/~/integrations`, icon: <HugeiconsIcon icon={Plug01Icon} className="!h-5 !w-5" />, label: "Integrations" },
        { href: `${orgBase}/~/teams`, icon: <HugeiconsIcon icon={UserMultipleIcon} className="!h-5 !w-5" />, label: "Teams" },
        { href: `${orgBase}/~/audit-log`, icon: <HugeiconsIcon icon={DocumentValidationIcon} className="!h-5 !w-5" />, label: "Audit Log" },
        { href: `${orgBase}/~/governance`, icon: <HugeiconsIcon icon={AiLockIcon} className="!h-5 !w-5" />, label: "Governance" },
    ];

    const bottomItems = [
        { href: isInsideProject ? `${basePath}/webhooks` : `${orgBase}/~/webhooks`, icon: <HugeiconsIcon icon={AirdropIcon} className="!h-5 !w-5" />, label: "Webhooks" },
        { href: isInsideProject ? `${basePath}/settings` : `${orgBase}/~/settings`, icon: <HugeiconsIcon icon={Settings02Icon} className="!h-5 !w-5" />, label: "Settings" },
    ];

    const organizationSettingsItems = [
        { section: "general", href: `${orgBase}/~/settings`, icon: <HugeiconsIcon icon={Settings02Icon} className="!h-5 !w-5" />, label: "General" },
        { section: "advanced", href: `${orgBase}/~/settings?section=advanced`, icon: <HugeiconsIcon icon={Configuration02Icon} className="!h-5 !w-5" />, label: "Advanced" },
    ];

    const projectSettingsItems = [
        { tab: "general", href: `${basePath}/settings`, label: "General" },
        { tab: "budget", href: `${basePath}/settings?tab=budget`, label: "Budget" },
        { tab: "providers", href: `${basePath}/settings?tab=providers`, label: "Providers" },
        { tab: "infrastructure", href: `${basePath}/settings?tab=infrastructure`, label: "Infrastructure" },
        { tab: "networking", href: `${basePath}/settings?tab=networking`, label: "Networking" },
        { tab: "integrations", href: `${basePath}/settings?tab=integrations`, label: "Integrations" },
        { tab: "api", href: `${basePath}/settings?tab=api`, label: "API" },
    ];

    return (
        <SidebarProvider
            defaultOpen
            className={isPlayground ? "h-full min-h-0 overflow-hidden" : undefined}
        >
            {!isProjectCreation && (
                <Sidebar className="top-12 hidden h-[calc(100vh-3rem)] border-r border-sidebar-border/70 bg-sidebar lg:block">
                    <SidebarContent>
                        <SidebarGroup className="pt-3">
                            <SidebarMenu>
                                {activeView === "observability" ? (
                                    <>
                                        <SidebarMenuItem>
                                            <SidebarMenuButton
                                                onClick={() => setActiveView("main")}
                                                size="sm"
                                                className="gap-1 text-muted-foreground"
                                            >
                                                <ChevronLeft className="!h-5 !w-5" />
                                                <span className="text-sm">Back</span>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                        {observabilitySubItems.map((item) => (
                                            <SidebarMenuItem key={item.section}>
                                                <SidebarMenuButton
                                                    asChild
                                                    tooltip={item.label}
                                                    isActive={observabilitySection === item.section}
                                                    size="sm"
                                                >
                                                    <Link href={item.href} prefetch={true} onMouseEnter={() => prefetchRoute(item.href)}>
                                                        {item.icon}
                                                        <span className="text-sm">{item.label}</span>
                                                    </Link>
                                                </SidebarMenuButton>
                                            </SidebarMenuItem>
                                        ))}
                                    </>
                                ) : activeView === "ai-gateway" ? (
                                    <>
                                        <SidebarMenuItem>
                                            <SidebarMenuButton
                                                onClick={() => setActiveView("main")}
                                                size="sm"
                                                className="gap-1 text-muted-foreground"
                                            >
                                                <ChevronLeft className="!h-5 !w-5" />
                                                <span className="text-sm">Back</span>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                        {projectSubItems.map((item) => (
                                            <SidebarMenuItem key={item.href}>
                                                <SidebarMenuButton asChild tooltip={item.label} isActive={isActive(item.href)} size="sm">
                                                    <Link href={item.href} prefetch={true} onMouseEnter={() => prefetchRoute(item.href)}>
                                                        {item.icon}
                                                        <span className="text-sm">{item.label}</span>
                                                    </Link>
                                                </SidebarMenuButton>
                                            </SidebarMenuItem>
                                        ))}
                                    </>
                                ) : activeView === "project-settings" ? (
                                    <>
                                        <SidebarMenuItem>
                                            <SidebarMenuButton
                                                onClick={() => setActiveView("main")}
                                                size="sm"
                                                className="gap-1 text-muted-foreground"
                                            >
                                                <ChevronLeft className="!h-5 !w-5" />
                                                <span className="text-sm">Back</span>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                        {projectSettingsItems.map((item) => (
                                            <SidebarMenuItem key={item.tab}>
                                                <SidebarMenuButton
                                                    asChild
                                                    tooltip={item.label}
                                                    isActive={projectSettingsTab === item.tab}
                                                    size="sm"
                                                >
                                                    <Link href={item.href} prefetch={true} onMouseEnter={() => prefetchRoute(item.href)}>
                                                        <span className="text-sm">{item.label}</span>
                                                    </Link>
                                                </SidebarMenuButton>
                                            </SidebarMenuItem>
                                        ))}
                                    </>
                                ) : activeView === "settings" ? (
                                    <>
                                        <SidebarMenuItem>
                                            <SidebarMenuButton
                                                onClick={() => setActiveView("main")}
                                                size="sm"
                                                className="gap-1 text-muted-foreground"
                                            >
                                                <ChevronLeft className="!h-5 !w-5" />
                                                <span className="text-sm">Back</span>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                        {organizationSettingsItems.map((item) => (
                                            <SidebarMenuItem key={item.section}>
                                                <SidebarMenuButton
                                                    asChild
                                                    tooltip={item.label}
                                                    isActive={organizationSettingsSection === item.section}
                                                    size="sm"
                                                >
                                                    <Link href={item.href} prefetch={true} onMouseEnter={() => prefetchRoute(item.href)}>
                                                        {item.icon}
                                                        <span className="text-sm">{item.label}</span>
                                                    </Link>
                                                </SidebarMenuButton>
                                            </SidebarMenuItem>
                                        ))}
                                    </>
                                ) : (
                                    <>
                                        {/* 1. Projects / Overview */}
                                        <SidebarMenuItem>
                                            <SidebarMenuButton asChild tooltip={overviewItem.label} isActive={isActive(overviewItem.href)} size="sm">
                                                <Link href={overviewItem.href} prefetch={true} onMouseEnter={() => prefetchRoute(overviewItem.href)}>
                                                    {overviewItem.icon}
                                                    <span className="text-sm">{overviewItem.label}</span>
                                                </Link>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                        {/* 2. Observability */}
                                        <SidebarMenuItem>
                                            {isInsideProject ? (
                                                <SidebarMenuButton
                                                    onClick={() => setActiveView("observability")}
                                                    onMouseEnter={() => prefetchRoute(observabilityHref)}
                                                    isActive={pathname === observabilityHref}
                                                    size="sm"
                                                    className="gap-1"
                                                >
                                                    {observabilityItem.icon}
                                                    <span className="text-sm">{observabilityItem.label}</span>
                                                    <ChevronRight className="!h-3 !w-3 ml-auto text-muted-foreground/50" />
                                                </SidebarMenuButton>
                                            ) : (
                                                <SidebarMenuButton asChild tooltip={observabilityItem.label} isActive={isActive(observabilityItem.href)} size="sm">
                                                    <Link href={observabilityItem.href} prefetch={true} onMouseEnter={() => prefetchRoute(observabilityItem.href)}>
                                                        {observabilityItem.icon}
                                                        <span className="text-sm">{observabilityItem.label}</span>
                                                    </Link>
                                                </SidebarMenuButton>
                                            )}
                                        </SidebarMenuItem>
                                        {/* 3. Logs */}
                                        {projectItems.map((item) => (
                                            <SidebarMenuItem key={item.href}>
                                                <SidebarMenuButton asChild tooltip={item.label} isActive={isActive(item.href)} size="sm">
                                                    <Link href={item.href} prefetch={true} onMouseEnter={() => prefetchRoute(item.href)}>
                                                        {item.icon}
                                                        <span className="text-sm">{item.label}</span>
                                                    </Link>
                                                </SidebarMenuButton>
                                            </SidebarMenuItem>
                                        ))}
                                        {/* 4. AI Gateway toggle */}
                                        <SidebarMenuItem>
                                            <SidebarMenuButton
                                                onClick={() => setActiveView("ai-gateway")}
                                                size="sm"
                                                className="gap-1"
                                            >
                                                <HugeiconsIcon icon={DiscoverSquareIcon} className="!h-5 !w-5" />
                                                <span className="text-sm">AI Gateway</span>
                                                <ChevronRight className="!h-3 !w-3 ml-auto text-muted-foreground/50" />
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                        {/* 5. Security, Edge, Monetization */}
                                        {projectSecondaryItems.map((item) => (
                                            <SidebarMenuItem key={item.href}>
                                                <SidebarMenuButton asChild tooltip={item.label} isActive={isActive(item.href)} size="sm">
                                                    <Link href={item.href} prefetch={true} onMouseEnter={() => prefetchRoute(item.href)}>
                                                        {item.icon}
                                                        <span className="text-sm">{item.label}</span>
                                                    </Link>
                                                </SidebarMenuButton>
                                            </SidebarMenuItem>
                                        ))}
                                        <SidebarSeparator className="my-2 mx-0 w-full" />
                                        {/* 6. Billing, Usage, Integrations, Teams, Audit Log */}
                                        {orgItems.map((item) => (
                                            <SidebarMenuItem key={item.href}>
                                                <SidebarMenuButton asChild tooltip={item.label} isActive={isActive(item.href)} size="sm">
                                                    <Link href={item.href} prefetch={true} onMouseEnter={() => prefetchRoute(item.href)}>
                                                        {item.icon}
                                                        <span className="text-sm">{item.label}</span>
                                                    </Link>
                                                </SidebarMenuButton>
                                            </SidebarMenuItem>
                                        ))}
                                        <SidebarSeparator className="my-2 mx-0 w-full" />
                                        {/* 7. Webhooks, Settings */}
                                        {bottomItems.map((item) => {
                                            const isProjectSettingsItem = isInsideProject && item.label === "Settings";
                                            const isOrganizationSettingsItem = !isInsideProject && item.label === "Settings";
                                            const isSettingsItem = isProjectSettingsItem || isOrganizationSettingsItem;

                                            return (
                                                <SidebarMenuItem key={item.href}>
                                                    {isSettingsItem ? (
                                                        <SidebarMenuButton
                                                            onClick={() => setActiveView(isProjectSettingsItem ? "project-settings" : "settings")}
                                                            onMouseEnter={() => prefetchRoute(item.href)}
                                                            isActive={isProjectSettingsItem ? isProjectSettingsView : isOrganizationSettingsView}
                                                            size="sm"
                                                            className="gap-1"
                                                        >
                                                            {item.icon}
                                                            <span className="text-sm">{item.label}</span>
                                                            <ChevronRight className="!h-3 !w-3 ml-auto text-muted-foreground/50" />
                                                        </SidebarMenuButton>
                                                    ) : (
                                                        <SidebarMenuButton asChild tooltip={item.label} isActive={isActive(item.href)} size="sm">
                                                            <Link href={item.href} prefetch={true} onMouseEnter={() => prefetchRoute(item.href)}>
                                                                {item.icon}
                                                                <span className="text-sm">{item.label}</span>
                                                            </Link>
                                                        </SidebarMenuButton>
                                                    )}
                                                </SidebarMenuItem>
                                            );
                                        })}
                                    </>
                                )}
                            </SidebarMenu>
                        </SidebarGroup>
                    </SidebarContent>
                    <SidebarFooter className="pt-1 space-y-0.5">
                        <Link
                            href="/docs"
                            target="_blank"
                            className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors outline-hidden"
                        >
                            <Book className="size-3.5 shrink-0" />
                            <span className="flex-1">Documentation</span>
                            <ArrowUpRight className="size-3 shrink-0" />
                        </Link>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors outline-hidden"
                                >
                                    <HelpCircle className="size-3.5 shrink-0" />
                                    <span className="flex-1">Help & Resources</span>
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" side="top" sideOffset={4} className="w-80 p-1 font-mono dark:bg-black dark:border-white/10 max-h-none overflow-visible">
                                <DropdownMenuItem asChild className="text-sm py-1.5 cursor-pointer">
                                    <Link href="/docs/troubleshooting" className="flex justify-between w-full items-center">
                                        Troubleshooting
                                        <Wrench className="h-3.5 w-3.5 shrink-0" />
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild className="text-sm py-1.5 cursor-pointer">
                                    <Link href="/changelog" className="flex justify-between w-full items-center">
                                        Changelog
                                        <FileText className="h-3.5 w-3.5 shrink-0" />
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild className="text-sm py-1.5 cursor-pointer">
                                    <Link href="/status" className="flex justify-between w-full items-center">
                                        Cencori status
                                        <Activity className="h-3.5 w-3.5 shrink-0" />
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild className="text-sm py-1.5 cursor-pointer">
                                    <Link href="mailto:support@cencori.com" className="flex justify-between w-full items-center">
                                        Contact support
                                        <Mail className="h-3.5 w-3.5 shrink-0" />
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="my-1" />
                                <div className="px-2 py-2">
                                    <p className="text-sm font-medium mb-1">Community support</p>
                                    <p className="text-[10px] text-muted-foreground mb-2">Our Discord community can help with code-related issues.</p>
                                    <Link
                                        href="https://cencori.com/discord"
                                        target="_blank"
                                        className="flex items-center gap-1.5 text-[11px] font-medium text-primary hover:underline"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" color="currentColor" fill="none" stroke="currentColor" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round" className="shrink-0">
                                            <path d="M15.5 17.5C16.5 19 17.3333 19.6667 18 20C19.3333 19.6667 22 18.2 22 15C22 11.8 20.6667 7.33333 20 5.5C18 4.3 15.8333 4 15 4L14.198 5.60393C13.4135 5.28708 12.4058 5.25438 12 5.27763C11.5942 5.25438 10.5865 5.28708 9.80197 5.60393L9 4C8.16667 4 6 4.3 4 5.5C3.33333 7.33333 2 11.8 2 15C2 18.2 4.66667 19.6667 6 20C6.66667 19.6667 7.5 19 8.5 17.5"></path>
                                            <path d="M17.3652 11.5C17.3652 12.6046 16.5817 13.5 15.6152 13.5C14.6487 13.5 13.8652 12.6046 13.8652 11.5C13.8652 10.3954 14.6487 9.5 15.6152 9.5C16.5817 9.5 17.3652 10.3954 17.3652 11.5Z"></path>
                                            <path d="M10 11.5C10 12.6046 9.2165 13.5 8.25 13.5C7.2835 13.5 6.5 12.6046 6.5 11.5C6.5 10.3954 7.2835 9.5 8.25 9.5C9.2165 9.5 10 10.3954 10 11.5Z"></path>
                                            <path d="M17.5 16.5C16.4022 17.3967 14.3502 18 12 18C9.64981 18 7.59785 17.3967 6.5 16.5"></path>
                                        </svg>
                                        Join us on Discord
                                    </Link>
                                    <div className="mt-2 -mx-2 -mb-2 rounded-b-md overflow-hidden">
                                        <img src="/dbanner.png" alt="Discord banner" className="w-full h-auto" />
                                    </div>
                                </div>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <FeedbackMenu />
                        <UserMenu
                            organization={organization ? {
                                id: organization.id,
                                name: organization.name,
                                slug: organization.slug,
                                subscriptionTier: organization.subscription_tier,
                            } : undefined}
                        />
                    </SidebarFooter>
                </Sidebar>
            )}

            <Sheet open={isOpen} onOpenChange={setIsOpen}>
                <SheetContent side="bottom" className="h-[70vh]">
                    <div className="py-3">
                        <SidebarGroup>
                            <SidebarMenu>
                                {[overviewItem, observabilityItem, ...projectItems, ...projectSecondaryItems, ...orgItems, ...bottomItems].map((item) => (
                                    <SidebarMenuItem key={item.href}>
                                        <SidebarMenuButton asChild size="sm" onClick={() => setIsOpen(false)}>
                                            <Link href={item.href} prefetch={true}>
                                                {item.icon}
                                                <span className="text-sm">{item.label}</span>
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                ))}
                            </SidebarMenu>
                        </SidebarGroup>
                    </div>
                </SheetContent>
            </Sheet>

            <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
                {organization && <UsageLimitBanner orgId={organization.id} orgSlug={organization.slug} />}
                <div
                    key={pathname}
                    className={isPlayground
                        ? "flex min-h-0 flex-1 flex-col overflow-hidden animate-fade-in"
                        : "animate-fade-in"
                    }
                    style={{ animationDuration: "150ms" }}
                >
                    {children}
                </div>
            </main>
        </SidebarProvider>
    );
}
