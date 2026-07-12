"use client";

import React, { use, useState } from "react";
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
    SidebarMenuSub,
    SidebarMenuSubItem,
    SidebarMenuSubButton,
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
import { ChevronLeft, ChevronRight, Book, ArrowUpRight, HelpCircle, Wrench, Activity, Mail, FileText } from "lucide-react";
import DashboardCircleIcon from "@hugeicons/core-free-icons/DashboardCircleIcon";
import DiscoverSquareIcon from "@hugeicons/core-free-icons/DiscoverSquareIcon";
import AiChat01Icon from "@hugeicons/core-free-icons/AiChat01Icon";
import AiCloudIcon from "@hugeicons/core-free-icons/AiCloudIcon";
import AiChipIcon from "@hugeicons/core-free-icons/AiChipIcon";
import AiSettingIcon from "@hugeicons/core-free-icons/AiSettingIcon";
import Blockchain03Icon from "@hugeicons/core-free-icons/Blockchain03Icon";
import AiChemistry01Icon from "@hugeicons/core-free-icons/AiChemistry01Icon";
import Analytics01Icon from "@hugeicons/core-free-icons/Analytics01Icon";
import Activity03Icon from "@hugeicons/core-free-icons/Activity03Icon";
import AiLockIcon from "@hugeicons/core-free-icons/AiLockIcon";
import PuzzleIcon from "@hugeicons/core-free-icons/PuzzleIcon";
import CreditCardAcceptIcon from "@hugeicons/core-free-icons/CreditCardAcceptIcon";
import AirdropIcon from "@hugeicons/core-free-icons/AirdropIcon";
import BrainCogIcon from "@hugeicons/core-free-icons/BrainCogIcon";
import { useMobileSheet } from "@/lib/contexts/MobileSheetContext";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { BudgetAlertBanner } from "@/components/dashboard/BudgetAlertBanner";
import { UserMenu } from "@/components/dashboard/UserMenu";
import { FeedbackMenu } from "@/components/dashboard/FeedbackMenu";
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
        staleTime: 5 * 60 * 1000,
    });
}

async function prefetchProjectPage(
    queryClient: ReturnType<typeof useQueryClient>,
    projectId: string,
    pageType: string
) {
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

interface NavItem {
    href: string;
    icon: React.ReactNode;
    label: string;
    prefetch?: () => void;
}

function ProjectSidebarLink({
    href,
    icon,
    label,
    isActive,
    prefetch,
    onClick,
}: {
    href: string;
    icon: React.ReactNode;
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
                    {icon}
                    <span className="text-xs">{label}</span>
                </Link>
            </SidebarMenuButton>
        </SidebarMenuItem>
    );
}

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
    const [activeView, setActiveView] = useState<"main" | "ai-gateway">("main");

    const { data, error } = useProjectLayout(orgSlug, projectSlug);
    const project = data?.project;

    const isActive = (path: string) => {
        if (path.endsWith(projectSlug || '')) {
            return pathname === path;
        }
        return pathname.startsWith(path);
    };

    if (error) {
        notFound();
    }

    const basePath = `/dashboard/organizations/${orgSlug}/projects/${projectSlug}`;

    const createPrefetch = (pageType: string) => () => {
        if (project?.id) {
            prefetchProjectPage(queryClient, project.id, pageType);
        }
    };

    const standaloneItems: NavItem[] = [
        { href: basePath, icon: <HugeiconsIcon icon={DashboardCircleIcon} className="!h-4 !w-4" />, label: "Project Overview" },
        { href: `${basePath}/observability`, icon: <HugeiconsIcon icon={Analytics01Icon} className="!h-4 !w-4" />, label: "Observability", prefetch: createPrefetch("observability") },
        { href: `${basePath}/logs`, icon: <HugeiconsIcon icon={Activity03Icon} className="!h-4 !w-4" />, label: "Logs" },
    ];

    const aiGatewayItems: NavItem[] = [
        { href: basePath, icon: <HugeiconsIcon icon={DashboardCircleIcon} className="!h-4 !w-4" />, label: "Project Overview" },
        { href: `${basePath}/prompts`, icon: <HugeiconsIcon icon={AiChat01Icon} className="!h-4 !w-4" />, label: "Prompts" },
        { href: `${basePath}/providers`, icon: <HugeiconsIcon icon={AiCloudIcon} className="!h-4 !w-4" />, label: "BYOK", prefetch: createPrefetch("providers") },
        { href: `${basePath}/models`, icon: <HugeiconsIcon icon={AiChipIcon} className="!h-4 !w-4" />, label: "Models" },
        { href: `${basePath}/custom-providers`, icon: <HugeiconsIcon icon={AiSettingIcon} className="!h-4 !w-4" />, label: "Custom Providers" },
        { href: `${basePath}/cache`, icon: <HugeiconsIcon icon={Blockchain03Icon} className="!h-4 !w-4" />, label: "Cache" },
        { href: `${basePath}/playground`, icon: <HugeiconsIcon icon={AiChemistry01Icon} className="!h-4 !w-4" />, label: "Playground" },
    ];

    const securityItems: NavItem[] = [
        { href: `${basePath}/security`, icon: <HugeiconsIcon icon={AiLockIcon} className="!h-4 !w-4" />, label: "Security" },
        { href: `${basePath}/edge`, icon: <HugeiconsIcon icon={PuzzleIcon} className="!h-4 !w-4" />, label: "Edge" },
    ];

    const billingItems: NavItem[] = [
        { href: `${basePath}/end-user-billing`, icon: <HugeiconsIcon icon={CreditCardAcceptIcon} className="!h-4 !w-4" />, label: "End-User Billing" },
    ];

    const settingsItems: NavItem[] = [
        { href: `${basePath}/webhooks`, icon: <HugeiconsIcon icon={AirdropIcon} className="!h-4 !w-4" />, label: "Webhooks" },
        { href: `${basePath}/settings`, icon: <HugeiconsIcon icon={BrainCogIcon} className="!h-4 !w-4" />, label: "Project Settings" },
    ];

    const isPlayground = pathname.includes("/playground");

    function SidebarNav({ onItemClick }: { onItemClick?: () => void }) {
        if (activeView === "ai-gateway") {
            return (
                <SidebarMenu>
                    <SidebarMenuItem>
                    <SidebarMenuButton
                        onClick={() => setActiveView("main")}
                        size="sm"
                        className="gap-1 text-muted-foreground"
                    >
                        <ChevronLeft className="!h-4 !w-4" />
                        <span className="text-xs">Back</span>
                    </SidebarMenuButton>
                    </SidebarMenuItem>
                    {aiGatewayItems.map((item) => (
                        <ProjectSidebarLink
                            key={item.href}
                            href={item.href}
                            icon={item.icon}
                            label={item.label}
                            isActive={isActive(item.href)}
                            prefetch={item.prefetch}
                            onClick={onItemClick}
                        />
                    ))}
                </SidebarMenu>
            );
        }

        return (
            <SidebarMenu>
                <NavGroup items={standaloneItems} isActive={isActive} onClick={onItemClick} />
                <SidebarMenuItem>
                    <SidebarMenuButton
                        onClick={() => setActiveView("ai-gateway")}
                        size="sm"
                        className="gap-1"
                    >
                        <HugeiconsIcon icon={DiscoverSquareIcon} className="!h-4 !w-4" />
                        <span className="text-xs">AI Gateway</span>
                        <ChevronRight className="!h-3 !w-3 ml-auto text-muted-foreground/50" />
                    </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarSeparator className="my-2 mx-0 w-full" />
                <NavGroup items={securityItems} isActive={isActive} onClick={onItemClick} />
                <NavGroup items={billingItems} isActive={isActive} onClick={onItemClick} />
                <NavGroup items={settingsItems} isActive={isActive} onClick={onItemClick} showDivider={false} />
            </SidebarMenu>
        );
    }

    return (
        <SidebarProvider
            defaultOpen={false}
            className={isPlayground ? "min-h-0 flex-1 overflow-hidden" : undefined}
            style={isPlayground ? { minHeight: "0px" } : undefined}
        >
            <Sidebar className="top-12 h-[calc(100vh-3rem)] hidden lg:block border-r border-border/40">
                <SidebarContent>
                    <SidebarGroup className="pt-3">
                        <SidebarNav />
                    </SidebarGroup>
                </SidebarContent>
                <SidebarFooter className="pt-1 space-y-0.5">
                    <Link
                        href="/docs"
                        target="_blank"
                        className="flex w-full items-center gap-2 rounded-md p-2 text-left text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors outline-hidden"
                    >
                        <Book className="size-3.5 shrink-0" />
                        <span className="flex-1">Documentation</span>
                        <ArrowUpRight className="size-3 shrink-0" />
                    </Link>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-md p-2 text-left text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors outline-hidden"
                            >
                                <HelpCircle className="size-3.5 shrink-0" />
                                <span className="flex-1">Help & Resources</span>
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" side="top" sideOffset={4} className="w-80 p-1 font-mono bg-black dark:bg-black border dark:border-[#1a1a1a] border-[#eee] max-h-none overflow-visible">
                            <DropdownMenuItem asChild className="text-xs py-1.5 cursor-pointer">
                                <Link href="/docs/troubleshooting" className="flex justify-between w-full items-center">
                                    Troubleshooting
                                    <Wrench className="h-3.5 w-3.5 shrink-0" />
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild className="text-xs py-1.5 cursor-pointer">
                                <Link href="/changelog" className="flex justify-between w-full items-center">
                                    Changelog
                                    <FileText className="h-3.5 w-3.5 shrink-0" />
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild className="text-xs py-1.5 cursor-pointer">
                                <Link href="https://status.cencori.com" target="_blank" className="flex justify-between w-full items-center">
                                    Cencori status
                                    <Activity className="h-3.5 w-3.5 shrink-0" />
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild className="text-xs py-1.5 cursor-pointer">
                                <Link href="mailto:support@cencori.com" className="flex justify-between w-full items-center">
                                    Contact support
                                    <Mail className="h-3.5 w-3.5 shrink-0" />
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="my-1" />
                            <div className="px-2 py-2">
                                <p className="text-xs font-medium mb-1">Community support</p>
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
                    <UserMenu />
                </SidebarFooter>
            </Sidebar>

            <Sheet open={isOpen} onOpenChange={setIsOpen}>
                <SheetContent side="bottom" className="h-[70vh]">
                    <div className="py-3">
                        <SidebarGroup>
                            <SidebarNav onItemClick={() => setIsOpen(false)} />
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
