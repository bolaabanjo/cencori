"use client";

import React from "react";
import { notFound, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import {
    Sidebar,
    SidebarContent,
    SidebarProvider,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton,
    SidebarTrigger,
    SidebarRail,
    SidebarGroup,
    useSidebar,
} from "@/components/ui/sidebar";
import { LayersIcon } from "@/components/animate-ui/icons/layers";
import { SettingsIcon } from "@/components/animate-ui/icons/settings";
import { PanelTopIcon } from "@/components/animate-ui/icons/panel-top";
import { ActivityIcon } from "@/components/animate-ui/icons/activity";
import { UnplugIcon } from "@/components/animate-ui/icons/unplug";
import { UserRoundIcon } from "@/components/animate-ui/icons/user-round";
import { UsageLimitBanner } from "@/components/billing/UsageLimitBanner";
import { ScrollText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { useMobileSheet } from "@/lib/contexts/MobileSheetContext";
import { Sheet, SheetContent } from "@/components/ui/sheet";

interface OrganizationData {
    id: string;
    name: string;
    slug: string;
    subscription_tier: string;
    monthly_requests_used: number;
    monthly_request_limit: number;
}

type LayoutParams = { orgSlug: string } | Promise<{ orgSlug: string }>;

function useOrganization(orgSlug: string) {
    return useQuery({
        queryKey: ["orgLayout", orgSlug],
        queryFn: async () => {
            const { data: orgData, error: orgError } = await supabase
                .from("organizations")
                .select("id, name, slug, subscription_tier, monthly_requests_used, monthly_request_limit")
                .eq("slug", orgSlug)
                .single();

            if (orgError || !orgData) {
                throw new Error("Organization not found");
            }

            return orgData as OrganizationData;
        },
        staleTime: 5 * 60 * 1000,
    });
}

// Component that applies sidebar mode from context
function SidebarWithMode({
    children,
    className
}: {
    children: React.ReactNode;
    className?: string;
}) {
    const { sidebarMode } = useSidebar();

    const sidebarProps = {
        expanded: { collapsible: "icon" as const, expandOnHover: false },
        collapsed: { collapsible: "icon" as const, expandOnHover: false },
        hover: { collapsible: "icon" as const, expandOnHover: true },
    }[sidebarMode];

    return (
        <Sidebar
            {...sidebarProps}
            className={className}
        >
            {children}
            {sidebarMode !== "expanded" && <SidebarRail />}
        </Sidebar>
    );
}

export default function OrganizationLayoutClient({
    children,
    params,
}: {
    children: React.ReactNode;
    params: LayoutParams;
}) {
    const resolved = params instanceof Promise ? React.use(params) : params;
    const { orgSlug } = resolved;
    const pathname = usePathname();
    const { isOpen, setIsOpen } = useMobileSheet();

    const { data: organization, error } = useOrganization(orgSlug);

    const isProjectRoute = pathname.includes(`/dashboard/organizations/${organization?.slug}/projects/`);

    if (error) {
        notFound();
    }

    if (!organization) return null;

    return (
        <SidebarProvider defaultOpen>
            {/* Desktop Sidebar - hidden on mobile */}
            {!isProjectRoute && (
                <SidebarWithMode className="top-12 h-[calc(100vh-3rem)] hidden lg:block border-r border-border/40 bg-sidebar">
                    <SidebarContent>
                        <SidebarGroup className="pt-3">
                            <SidebarMenu>
                                <SidebarMenuItem>
                                    <SidebarMenuButton asChild tooltip="Projects" size="sm">
                                        <Link href={`/dashboard/organizations/${organization.slug}/projects`} prefetch={true}>
                                            <LayersIcon animateOnHover />
                                            <span className="text-[13px]">Projects</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                                <SidebarMenuItem>
                                    <SidebarMenuButton asChild tooltip="Billing" size="sm">
                                        <Link href={`/dashboard/organizations/${organization.slug}/billing`} prefetch={true}>
                                            <PanelTopIcon animateOnHover />
                                            <span className="text-[13px]">Billing</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                                <SidebarMenuItem>
                                    <SidebarMenuButton asChild tooltip="Usage" size="sm">
                                        <Link href={`/dashboard/organizations/${organization.slug}/usage`} prefetch={true}>
                                            <ActivityIcon animateOnHover />
                                            <span className="text-[13px]">Usage</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>

                                <SidebarMenuItem>
                                    <SidebarMenuButton asChild tooltip="Integrations" size="sm">
                                        <Link href={`/dashboard/organizations/${organization.slug}/integrations`} prefetch={true}>
                                            <UnplugIcon animateOnHover />
                                            <span className="text-[13px]">Integrations</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                                <SidebarMenuItem>
                                    <SidebarMenuButton asChild tooltip="Teams" size="sm">
                                        <Link href={`/dashboard/organizations/${organization.slug}/teams`} prefetch={true}>
                                            <UserRoundIcon animateOnHover />
                                            <span className="text-[13px]">Teams</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                                <SidebarMenuItem>
                                    <SidebarMenuButton asChild tooltip="Audit Log" size="sm">
                                        <Link href={`/dashboard/organizations/${organization.slug}/audit-log`} prefetch={true}>
                                            <ScrollText className="h-4 w-4" />
                                            <span className="text-[13px]">Audit Log</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                                <SidebarMenuItem>
                                    <SidebarMenuButton asChild tooltip="Settings" size="sm">
                                        <Link href={`/dashboard/organizations/${organization.slug}/settings`} prefetch={true}>
                                            <SettingsIcon animateOnHover />
                                            <span className="text-[13px]">Settings</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            </SidebarMenu>
                        </SidebarGroup>
                    </SidebarContent>
                    <div className="absolute bottom-0 left-0 w-full p-1.5">
                        <SidebarTrigger />
                    </div>
                </SidebarWithMode>
            )}

            {/* Mobile Sheet - slides up from bottom, only visible on mobile */}
            {!isProjectRoute && (
                <Sheet open={isOpen} onOpenChange={setIsOpen}>
                    <SheetContent side="bottom" className="h-[75vh]">
                        <div className="py-4">
                            <SidebarGroup>
                                <SidebarMenu>
                                    <SidebarMenuItem>
                                        <SidebarMenuButton asChild size="sm">
                                            <Link href={`/dashboard/organizations/${organization.slug}/projects`} prefetch={true} onClick={() => setIsOpen(false)}>
                                                <LayersIcon animateOnHover />
                                                <span className="text-[13px]">Projects</span>
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                    <SidebarMenuItem>
                                        <SidebarMenuButton asChild size="sm">
                                            <Link href={`/dashboard/organizations/${organization.slug}/billing`} prefetch={true} onClick={() => setIsOpen(false)}>
                                                <PanelTopIcon animateOnHover />
                                                <span className="text-[13px]">Billing</span>
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                    <SidebarMenuItem>
                                        <SidebarMenuButton asChild size="sm">
                                            <Link href={`/dashboard/organizations/${organization.slug}/usage`} prefetch={true} onClick={() => setIsOpen(false)}>
                                                <ActivityIcon animateOnHover />
                                                <span className="text-[13px]">Usage</span>
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>

                                    <SidebarMenuItem>
                                        <SidebarMenuButton asChild size="sm">
                                            <Link href={`/dashboard/organizations/${organization.slug}/integrations`} prefetch={true} onClick={() => setIsOpen(false)}>
                                                <UnplugIcon animateOnHover />
                                                <span className="text-[13px]">Integrations</span>
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                    <SidebarMenuItem>
                                        <SidebarMenuButton asChild size="sm">
                                            <Link href={`/dashboard/organizations/${organization.slug}/teams`} prefetch={true} onClick={() => setIsOpen(false)}>
                                                <UserRoundIcon animateOnHover />
                                                <span className="text-[13px]">Teams</span>
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                    <SidebarMenuItem>
                                        <SidebarMenuButton asChild size="sm">
                                            <Link href={`/dashboard/organizations/${organization.slug}/audit-log`} prefetch={true} onClick={() => setIsOpen(false)}>
                                                <ScrollText className="h-4 w-4" />
                                                <span className="text-[13px]">Audit Log</span>
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                    <SidebarMenuItem>
                                        <SidebarMenuButton asChild size="sm">
                                            <Link href={`/dashboard/organizations/${organization.slug}/settings`} prefetch={true} onClick={() => setIsOpen(false)}>
                                                <SettingsIcon animateOnHover />
                                                <span className="text-[13px]">Settings</span>
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                </SidebarMenu>
                            </SidebarGroup>
                        </div>
                    </SheetContent>
                </Sheet>
            )}

            <main className="flex w-full flex-1 flex-col overflow-hidden">
                <UsageLimitBanner orgId={organization.id} orgSlug={organization.slug} />
                {children}
            </main>
        </SidebarProvider>
    );
}
