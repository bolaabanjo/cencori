"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useOrganizationProject } from "@/lib/contexts/OrganizationProjectContext";
import { useEnvironment } from "@/lib/contexts/EnvironmentContext";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronsUpDown, HelpCircle, ExternalLink, CircleUserRound, CreditCard, Settings } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useTheme } from "next-themes";
import { supabase } from "@/lib/supabaseClient";
import { beginIntentionalSignOut, clearClientSessionCaches } from "@/lib/auth/session-caches";

interface MobileNavProps {
    onMenuClick: () => void;
    projectSlug?: string | null;
    user?: { email?: string | null };
    avatar?: string | null;
}

export function MobileNav({ projectSlug, user, avatar }: MobileNavProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { organizations, projects } = useOrganizationProject();
    const { setEnvironment, isTestMode } = useEnvironment();
    const { theme, setTheme } = useTheme();
    const [feedbackOpen, setFeedbackOpen] = useState(false);
    const [feedbackText, setFeedbackText] = useState("");

    const getOrgSlug = () => {
        if (pathname === "/" || pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
            return null;
        }
        if (pathname.startsWith("/account/") || pathname === "/account") {
            return null;
        }
        const match = pathname.match(/^\/([^/]+)/);
        return match ? match[1] : null;
    };

    const orgSlug = getOrgSlug();
    const currentOrg = organizations.find((org) => org.slug === orgSlug);
    const currentProject = projects.find((proj) => proj.slug === projectSlug && proj.orgSlug === orgSlug);

    // Get available orgs and projects for dropdowns
    const availableOrgs = organizations;
    const availableProjects = projects.filter((proj) => proj.orgSlug === orgSlug);

    return (
        <div className="sticky top-12 z-50 lg:hidden border-b border-border/40 bg-background">
            <div className="flex items-center gap-1 px-4 py-2 overflow-x-auto scrollbar-hide">
                {/* Organization selector dropdown */}
                {orgSlug && (
                    <>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-foreground bg-secondary/50 hover:bg-secondary rounded-md transition-colors shrink-0">
                                    {currentOrg?.name || "Organization"}
                                    <ChevronsUpDown className="h-3 w-3 text-muted-foreground" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-48">
                                {availableOrgs.map((org) => (
                                    <DropdownMenuItem
                                        key={org.id}
                                        className="text-xs cursor-pointer"
                                        onClick={() => router.push(`/${org.slug}/~/projects`)}
                                    >
                                        {org.name}
                                    </DropdownMenuItem>
                                ))}
                                <DropdownMenuItem
                                    className="text-xs cursor-pointer text-primary"
                                    onClick={() => router.push("/onboarding")}
                                >
                                    + New organization
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        {currentOrg?.subscription_tier && (
                            <span className="px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0">
                                {currentOrg.subscription_tier}
                            </span>
                        )}
                    </>
                )}

                {/* Project selector dropdown */}
                {projectSlug && (
                    <>
                        <span className="text-muted-foreground/50 text-xs shrink-0">/</span>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-foreground bg-secondary/50 hover:bg-secondary rounded-md transition-colors shrink-0">
                                    {currentProject?.name || projectSlug}
                                    <ChevronsUpDown className="h-3 w-3 text-muted-foreground" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-48">
                                <DropdownMenuItem
                                    className="text-xs cursor-pointer"
                                    onClick={() => router.push(`/${orgSlug}/~/projects`)}
                                >
                                    All projects
                                </DropdownMenuItem>
                                {availableProjects.map((proj) => (
                                    <DropdownMenuItem
                                        key={proj.id}
                                        className="text-xs cursor-pointer"
                                        onClick={() => router.push(`/${orgSlug}/${proj.slug}`)}
                                    >
                                        {proj.name}
                                    </DropdownMenuItem>
                                ))}
                                <DropdownMenuItem
                                    className="text-xs cursor-pointer text-primary"
                                    onClick={() => router.push(`/${orgSlug}/~/projects/new`)}
                                >
                                    + New project
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </>
                )}

                {/* Environment Toggle */}
                {projectSlug && (
                    <div className="flex items-center bg-muted/30 rounded-full p-0.5 border border-border/40 ml-2 shrink-0">
                        <button
                            onClick={() => setEnvironment("production")}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${!isTestMode
                                ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                : "text-muted-foreground"
                                }`}
                        >
                            Prod
                        </button>
                        <button
                            onClick={() => setEnvironment("test")}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${isTestMode
                                ? "bg-orange-500/10 text-orange-500 border border-orange-500/20"
                                : "text-muted-foreground"
                                }`}
                        >
                            Dev
                        </button>
                    </div>
                )}

                {/* Spacer */}
                <div className="flex-1 min-w-4" />

                {/* Feedback dropdown */}
                <DropdownMenu open={feedbackOpen} onOpenChange={setFeedbackOpen}>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className="px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        >
                            Feedback
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-72 p-3">
                        <div className="space-y-3">
                            <textarea
                                placeholder="My idea for improving Cencori is..."
                                value={feedbackText}
                                onChange={(e) => setFeedbackText(e.target.value)}
                                className="w-full h-20 text-xs bg-secondary/50 border border-border/40 rounded-md p-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring/20"
                            />
                            <div className="flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    className="h-7 px-3 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                                    disabled={!feedbackText.trim()}
                                    onClick={() => {
                                        // TODO: Submit feedback
                                        setFeedbackText("");
                                        setFeedbackOpen(false);
                                    }}
                                >
                                    Send
                                </button>
                            </div>
                        </div>
                    </DropdownMenuContent>
                </DropdownMenu>

                {/* Help dropdown */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className="w-7 h-7 flex items-center justify-center rounded-full border border-border/100 hover:bg-secondary transition-colors shrink-0"
                            aria-label="Help"
                        >
                            <HelpCircle className="h-4 w-4 text-muted-foreground" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 p-2">
                        <div className="px-2 py-1.5 mb-1">
                            <p className="text-xs font-medium">Need help?</p>
                            <p className="text-[10px] text-muted-foreground">Start with our docs or community.</p>
                        </div>
                        <DropdownMenuItem asChild className="text-xs cursor-pointer">
                            <Link href="/docs" target="_blank">
                                <ExternalLink className="h-3 w-3 mr-2" />
                                Documentation
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild className="text-xs cursor-pointer">
                            <Link href="https://discord.gg/j3eAV5WzCa" target="_blank">
                                <ExternalLink className="h-3 w-3 mr-2" />
                                Discord Community
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild className="text-xs cursor-pointer">
                            <Link href="mailto:support@cencori.com">
                                <ExternalLink className="h-3 w-3 mr-2" />
                                Email Support
                            </Link>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                {/* User Avatar Menu */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className="w-7 h-7 flex items-center justify-center rounded-full border border-border/100 hover:bg-secondary transition-colors shrink-0 overflow-hidden"
                            aria-label="User menu"
                        >
                            <UserAvatar
                                src={avatar}
                                email={user?.email}
                                size={28}
                                className="border-0"
                            />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-66 p-1" align="end" forceMount>
                        {user?.email && (
                            <div className="px-2 py-1.5 border-b border-border/40 mb-1">
                                <p className="text-xs font-medium truncate">
                                    {user.email}
                                </p>
                            </div>
                        )}
                        <p className="px-2 py-1 text-[10px] text-muted-foreground uppercase tracking-wider">Account</p>
                        <DropdownMenuItem className="text-xs py-1.5 cursor-pointer" onClick={() => router.push("/account/profile")}>
                            <CircleUserRound className="mr-2 h-3.5 w-3.5" />
                            Profile
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-xs py-1.5 cursor-pointer" onClick={() => router.push("/account/settings")}>
                            <Settings className="mr-2 h-3.5 w-3.5" />
                            Settings
                        </DropdownMenuItem>
                        <div className="my-1 border-t border-border/40" />
                        <p className="px-2 py-1 text-[10px] text-muted-foreground uppercase tracking-wider">Theme</p>
                        <DropdownMenuItem className="text-xs py-1.5 cursor-pointer" onClick={() => setTheme("light")}>
                            {theme === "light" && <span className="mr-2 h-1.5 w-1.5 rounded-full bg-foreground" />}
                            {theme !== "light" && <span className="mr-2 h-1.5 w-1.5" />}
                            Light
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-xs py-1.5 cursor-pointer" onClick={() => setTheme("dark")}>
                            {theme === "dark" && <span className="mr-2 h-1.5 w-1.5 rounded-full bg-foreground" />}
                            {theme !== "dark" && <span className="mr-2 h-1.5 w-1.5" />}
                            Dark
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-xs py-1.5 cursor-pointer" onClick={() => setTheme("system")}>
                            {theme === "system" && <span className="mr-2 h-1.5 w-1.5 rounded-full bg-foreground" />}
                            {theme !== "system" && <span className="mr-2 h-1.5 w-1.5" />}
                            System
                        </DropdownMenuItem>
                        <div className="my-1 border-t border-border/40" />
                        <DropdownMenuItem className="text-xs py-1.5 cursor-pointer" onClick={() => router.push("/")}>
                            Homepage
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="text-xs py-1.5 cursor-pointer text-red-500 focus:text-red-500"
                            onClick={async () => {
                                beginIntentionalSignOut();
                                clearClientSessionCaches();
                                await supabase.auth.signOut({ scope: "local" });
                                router.push("/login");
                            }}
                        >
                            Log out
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
}
