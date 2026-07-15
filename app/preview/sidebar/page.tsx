"use client";

import React from "react";
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
import { HugeiconsIcon } from "@hugeicons/react";
import { ChevronRight, Book, ArrowUpRight } from "lucide-react";
import DashboardCircleIcon from "@hugeicons/core-free-icons/DashboardCircleIcon";
import Analytics01Icon from "@hugeicons/core-free-icons/Analytics01Icon";
import Activity03Icon from "@hugeicons/core-free-icons/Activity03Icon";
import DiscoverSquareIcon from "@hugeicons/core-free-icons/DiscoverSquareIcon";
import AiLockIcon from "@hugeicons/core-free-icons/AiLockIcon";
import PuzzleIcon from "@hugeicons/core-free-icons/PuzzleIcon";
import CreditCardAcceptIcon from "@hugeicons/core-free-icons/CreditCardAcceptIcon";
import AirdropIcon from "@hugeicons/core-free-icons/AirdropIcon";
import BrainCogIcon from "@hugeicons/core-free-icons/BrainCogIcon";
import DollarCircleIcon from "@hugeicons/core-free-icons/DollarCircleIcon";
import Chart01Icon from "@hugeicons/core-free-icons/Chart01Icon";
import Plug01Icon from "@hugeicons/core-free-icons/Plug01Icon";
import UserMultipleIcon from "@hugeicons/core-free-icons/UserMultipleIcon";
import DocumentValidationIcon from "@hugeicons/core-free-icons/DocumentValidationIcon";

const navItems = {
    main: [
        { icon: DashboardCircleIcon, label: "Overview" },
        { icon: Analytics01Icon, label: "Observability" },
        { icon: Activity03Icon, label: "Logs" },
    ],
    aiGateway: { icon: DiscoverSquareIcon, label: "AI Gateway", right: ChevronRight },
    org: [
        { icon: DollarCircleIcon, label: "Billing" },
        { icon: Chart01Icon, label: "Usage" },
        { icon: Plug01Icon, label: "Integrations" },
        { icon: UserMultipleIcon, label: "Teams" },
        { icon: DocumentValidationIcon, label: "Audit Log" },
    ],
    security: [
        { icon: AiLockIcon, label: "Security" },
        { icon: PuzzleIcon, label: "Edge" },
    ],
    billing: [
        { icon: CreditCardAcceptIcon, label: "End-User Billing" },
    ],
    settings: [
        { icon: AirdropIcon, label: "Webhooks" },
        { icon: BrainCogIcon, label: "Project Settings" },
    ],
};

function NavItem({ icon, label, right: Right }: { icon: any; label: string; right?: any }) {
    return (
        <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={false} size="sm">
                <button type="button" className="w-full text-left">
                    <HugeiconsIcon icon={icon} className="!h-4 !w-4" />
                    <span className="text-xs">{label}</span>
                    {Right && <Right className="!h-3 !w-3 ml-auto text-muted-foreground/50" />}
                </button>
            </SidebarMenuButton>
        </SidebarMenuItem>
    );
}

export default function SidebarPreview() {
    return (
        <div className="flex min-h-screen bg-black">
            <SidebarProvider defaultOpen>
                <Sidebar className="relative top-0 h-screen border-r border-border/40">
                    <SidebarContent>
                        <SidebarGroup className="pt-3">
                            <SidebarMenu>
                                {navItems.main.map((item) => (
                                    <NavItem key={item.label} icon={item.icon} label={item.label} />
                                ))}
                                <NavItem icon={navItems.aiGateway.icon} label={navItems.aiGateway.label} right={navItems.aiGateway.right} />
                                <SidebarSeparator className="my-2 mx-0 w-full" />
                                {navItems.org.map((item) => (
                                    <NavItem key={item.label} icon={item.icon} label={item.label} />
                                ))}
                                <SidebarSeparator className="my-2 mx-0 w-full" />
                                {navItems.security.map((item) => (
                                    <NavItem key={item.label} icon={item.icon} label={item.label} />
                                ))}
                                <SidebarSeparator className="my-2 mx-0 w-full" />
                                {navItems.billing.map((item) => (
                                    <NavItem key={item.label} icon={item.icon} label={item.label} />
                                ))}
                                <SidebarSeparator className="my-2 mx-0 w-full" />
                                {navItems.settings.map((item) => (
                                    <NavItem key={item.label} icon={item.icon} label={item.label} />
                                ))}
                            </SidebarMenu>
                        </SidebarGroup>
                    </SidebarContent>
                    <SidebarFooter className="pt-1 space-y-0.5">
                        <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-md p-2 text-left text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors outline-hidden"
                        >
                            <Book className="size-3.5 shrink-0" />
                            <span className="flex-1">Documentation</span>
                            <ArrowUpRight className="size-3 shrink-0" />
                        </button>
                    </SidebarFooter>
                </Sidebar>
                <main className="flex-1 p-8">
                    <h1 className="text-xl font-semibold text-white">Sidebar Preview</h1>
                    <p className="text-zinc-400 text-sm mt-2">New unified sidebar with org-level items added</p>
                    <div className="mt-6 space-y-2 text-xs text-zinc-500">
                        <hr className="border-zinc-800 my-4" />
                        <p className="text-zinc-300 font-medium">Sidebar structure:</p>
                        <ul className="list-disc list-inside space-y-1">
                            <li className="text-green-400">Overview (unifies project listing + project dashboard)</li>
                            <li>Observability / Logs</li>
                            <li>AI Gateway (expandable sub-nav)</li>
                            <li className="text-green-400">Billing, Usage, Integrations, Teams, Audit Log</li>
                            <li>Security / Edge</li>
                            <li>End-User Billing</li>
                            <li>Webhooks / Project Settings</li>
                        </ul>
                    </div>
                </main>
            </SidebarProvider>
        </div>
    );
}
