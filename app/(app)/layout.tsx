// app/dashboard/layout.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Logo } from "@/components/logo";
import { CreditCard, Command, Menu, ChevronsUpDown, PlusCircle, Search, Check } from "lucide-react";
import { GradientAvatar } from "@outpacelabs/avatars";
import { formatCurrency } from "@/lib/currency";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { OrganizationProjectProvider, useOrganizationProject } from "@/lib/contexts/OrganizationProjectContext";
import { MobileSheetProvider, useMobileSheet } from "@/lib/contexts/MobileSheetContext";
import { MobileNav } from "@/components/dashboard/MobileNav";
import { EnvironmentProvider, useEnvironment } from "@/lib/contexts/EnvironmentContext";
import { ReactQueryProvider } from "@/lib/providers/ReactQueryProvider";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import posthog from "posthog-js";
import { cn } from "@/lib/utils";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import {
  clearDashboardUserCache,
  readDashboardUserCache,
  writeDashboardUserCache,
  type DashboardUser,
} from "@/lib/auth/dashboard-user-cache";

const CommandPalette = dynamic(
  () => import("@/components/dashboard/CommandPalette").then((mod) => mod.CommandPalette),
);
const UpdateToast = dynamic(
  () => import("@/components/ui/update-toast").then((mod) => mod.UpdateToast),
  { ssr: false },
);


export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // Same-tab navigation preserves sessionStorage, so a returning user can keep
  // the existing shell visible while Supabase verifies the session again.
  const [authState, setAuthState] = useState<{
    loading: boolean;
    user: DashboardUser | null;
  }>(() => {
    const cachedUser = readDashboardUserCache();
    return { loading: cachedUser === null, user: cachedUser };
  });

  useEffect(() => {
    let mounted = true;
    async function check() {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session?.user) {
        clearDashboardUserCache();
        if (mounted) {
          setAuthState({ loading: true, user: null });
        }
        router.replace("/login");
        return;
      }

      const sessionUser = session.user;
      const dashboardUser: DashboardUser = {
        email: sessionUser.email,
        user_metadata: sessionUser.user_metadata,
      };
      writeDashboardUserCache(dashboardUser);

      if (mounted) {
        setAuthState({ loading: false, user: dashboardUser });
        // Identify user in PostHog
        try {
          posthog.identify(sessionUser.id, {
            email: sessionUser.email,
            name: sessionUser.user_metadata?.name ?? sessionUser.user_metadata?.full_name,
            created_at: sessionUser.created_at,
          });
        } catch { /* non-critical */ }
      }
    }
    check();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (event === "SIGNED_OUT") {
        clearDashboardUserCache();
        if (mounted) {
          setAuthState({ loading: true, user: null });
        }
        router.replace("/login");
      } else if (session?.user) {
        const dashboardUser: DashboardUser = {
          email: session.user.email,
          user_metadata: session.user.user_metadata,
        };
        writeDashboardUserCache(dashboardUser);
        if (mounted) {
          setAuthState({ loading: false, user: dashboardUser });
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  if (authState.loading) return null;

  const typedUser = authState.user ?? {};
  const meta = typedUser.user_metadata ?? {};
  const avatar = (meta.avatar_url as string | null) ?? (meta.picture as string | null) ?? null;
  const name =
    (meta.name as string | null) ??
    typedUser.email?.split?.("@")[0] ??
    null;

  return (
    <ReactQueryProvider>
      <MobileSheetProvider>
        <OrganizationProjectProvider>
          <EnvironmentProvider>
            <LayoutContent
              user={typedUser}
              avatar={avatar}
              name={name}>
              {children}
            </LayoutContent>
          </EnvironmentProvider>
        </OrganizationProjectProvider>
      </MobileSheetProvider>
    </ReactQueryProvider>
  );
}

type UserType = {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
};

interface LayoutContentProps {
  user: UserType;
  avatar: string | null;
  name: string | null;
  children: React.ReactNode;
}

function LayoutContent({ user, avatar, name, children }: LayoutContentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  // Use context instead of local state
  const { organizations, projects } = useOrganizationProject();
  const { toggle } = useMobileSheet();
  const { setEnvironment, isTestMode } = useEnvironment();

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Fetch user profile to get custom avatar
  const { data: userProfile } = useQuery({
    queryKey: ["userProfile"],
    queryFn: async () => {
      const response = await fetch("/api/user/profile");
      if (!response.ok) return null;
      const data = await response.json();
      return data.profile;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Use custom avatar from profile, fallback to OAuth avatar
  const displayAvatar = userProfile?.avatar_url || avatar;

  // ⌘K keyboard shortcut for command palette
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const getOrgSlug = useMemo(() => {
    if (pathname === "/" || pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
      return null;
    }
    if (pathname.startsWith("/account/") || pathname === "/account") {
      return null;
    }
    const match = pathname.match(/^\/([^/]+)/);
    return match ? match[1] : null;
  }, [pathname]);

  const getProjectSlug = useMemo(() => {
    const slug = getOrgSlug;
    if (!slug) return null;
    const match = pathname.match(new RegExp(`^/${slug}/([^/]+)`));
    if (!match) return null;
    const second = match[1];
    const reserved = ['~'];
    if (reserved.includes(second)) return null;
    return second;
  }, [pathname, getOrgSlug]);

  const orgSlug = getOrgSlug;
  const projectSlug = getProjectSlug;
  const isPlayground = pathname.includes("/playground");
  const isOnboardingFlow = pathname.includes("/onboarding");

  const currentOrg = organizations.find((org) => org.slug === orgSlug);
  const currentProject = projects.find((proj) => proj.slug === projectSlug && proj.orgSlug === orgSlug);
  const currentOrgId = currentOrg?.id ?? null;

  const {
    data: orgCreditsData,
    isLoading: orgCreditsLoading,
    isError: orgCreditsError,
  } = useQuery({
    queryKey: ["orgCreditsBalance", currentOrgId],
    enabled: !!currentOrgId,
    queryFn: async () => {
      if (!currentOrgId) {
        return { credits_balance: 0 };
      }

      const { data, error } = await supabase
        .from("organizations")
        .select("credits_balance")
        .eq("id", currentOrgId)
        .single();

      if (error) {
        throw error;
      }

      return data as { credits_balance: number | string | null };
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 30 * 1000,
  });

  const parsedCreditsBalance = Number(orgCreditsData?.credits_balance ?? 0);
  const creditsBalance = Number.isFinite(parsedCreditsBalance) ? parsedCreditsBalance : 0;
  const isLowCredits = creditsBalance > 0 && creditsBalance < 5;
  const isOutOfCredits = creditsBalance <= 0;
  const creditsPillClassName = [
    "hidden lg:inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
    isOutOfCredits
      ? "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/15"
      : isLowCredits
        ? "border-orange-500/30 bg-orange-500/10 text-orange-400 hover:bg-orange-500/15"
        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15",
  ].join(" ");
  const creditsLabel = orgCreditsError
    ? "Credits --"
    : orgCreditsLoading
      ? "Credits..."
      : formatCurrency(creditsBalance, 'USD', { maximumFractionDigits: 4, minimumFractionDigits: 2 });

  return (
    <div
      className={cn(
        "bg-background transition-colors font-inter",
        isPlayground ? "flex h-svh flex-col overflow-hidden" : "min-h-screen"
      )}
    >
      {!isOnboardingFlow && (
      <header className="fixed top-0 left-0 right-0 z-50 h-12 border-b border-border/40 bg-background px-4 md:px-6 flex items-center justify-between font-mono">
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="flex items-center">
            <Logo variant="mark" className="h-4" />
          </Link>
          {/* Breadcrumbs - hidden on mobile */}
          <span className="text-muted-foreground/50 ml-1 mr-1 select-none text-sm hidden lg:block" aria-hidden>
            /
          </span>
          <Breadcrumb className="hidden lg:flex">
            <BreadcrumbList>
              {orgSlug && (
                <React.Fragment>
                  <BreadcrumbItem>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex h-7 cursor-pointer items-center gap-1.5 px-2 py-1 text-xs font-medium text-foreground hover:bg-secondary/50 rounded-md transition-colors">
                          {currentOrg?.name || "Organizations"}
                          {currentOrg?.subscription_tier && (
                            <span className="px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider rounded-full bg-primary/10 text-primary border border-primary/20">
                              {currentOrg.subscription_tier}
                            </span>
                          )}
                          <ChevronsUpDown size={12} className="text-muted-foreground/60" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-66 p-1 font-mono bg-black border dark:border-[#1a1a1a] border-[#eee]" side="bottom" align="start" forceMount>
                        <div className="px-1.5 py-1">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-3 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                              type="search"
                              placeholder="Search organizations..."
                              className="h-9 w-full rounded bg-background pl-8 text-xs border-border/40"
                            />
                          </div>
                        </div>
                        <div className="h-auto w-full rounded-md overflow-y-auto max-h-40">
                          {organizations.map((org) => (
                            <DropdownMenuItem key={org.id} className="text-xs py-1.5 cursor-pointer flex justify-between rounded-sm" onClick={() => router.push(`/${org.slug}/~/projects`)}>
                              {org.name}
                              {org.slug === currentOrg?.slug && <Check className="h-3 w-3" />}
                            </DropdownMenuItem>
                          ))}
                        </div>
                        <div className="my-2 border-t border-border/40" />
                        <p className="px-2 py-1 text-[10px] text-muted-foreground uppercase tracking-wider">More</p>
                        <DropdownMenuItem className="text-xs py-1.5 cursor-pointer rounded-sm" onClick={() => router.push("/dashboard")}>
                          All Organizations
                        </DropdownMenuItem>
                        <div className="my-1 border-t border-border/40" />
                        <div className="px-2 py-1.5">
                          <button
                            onClick={() => router.push("/onboarding")}
                            className="flex w-full items-center justify-center gap-1.5 h-8 rounded-md bg-foreground text-xs font-semibold text-background hover:opacity-90 transition-opacity cursor-pointer dark:bg-white dark:text-black dark:hover:bg-zinc-100"
                          >
                            <PlusCircle className="h-3 w-3" />
                            New Organization
                          </button>
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </BreadcrumbItem>
                </React.Fragment>
              )}

              {orgSlug && projectSlug && (
                <React.Fragment>
                  <BreadcrumbSeparator className="text-muted-foreground/50 text-xs">/</BreadcrumbSeparator>
                  <BreadcrumbItem>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex h-7 cursor-pointer items-center gap-1 px-2 py-1 text-xs font-medium text-foreground hover:bg-secondary/50 rounded-md transition-colors">
                          {currentProject?.name || "Projects"}
                          <ChevronsUpDown size={12} className="text-muted-foreground/60" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-66 p-1 font-mono bg-black border dark:border-[#1a1a1a] border-[#eee]" side="bottom" align="start" forceMount>
                        <div className="px-1.5 py-1">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-3 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                              type="search"
                              placeholder="Search projects..."
                              className="h-9 w-full rounded bg-background pl-8 text-xs border-border/40"
                            />
                          </div>
                        </div>
                        <div className="h-auto w-full rounded-md overflow-y-auto max-h-40">
                          {projects.filter(p => p.orgSlug === orgSlug).map((proj) => (
                            <DropdownMenuItem key={proj.id} className="text-xs py-1.5 cursor-pointer flex justify-between rounded-sm" onClick={() => router.push(`/${orgSlug}/${proj.slug}`)}>
                              {proj.name}
                              {proj.slug === currentProject?.slug && <Check className="h-3 w-3" />}
                            </DropdownMenuItem>
                          ))}
                        </div>
                        <div className="my-2 border-t border-border/40" />
                        <p className="px-2 py-1 text-[10px] text-muted-foreground uppercase tracking-wider">More</p>
                        <DropdownMenuItem className="text-xs py-1.5 cursor-pointer rounded-sm" onClick={() => router.push(`/${orgSlug}/~/projects`)}>
                          All Projects
                        </DropdownMenuItem>
                        <div className="my-1 border-t border-border/40" />
                        <div className="px-2 py-1.5">
                          <button
                            onClick={() => router.push(`/${orgSlug}/~/projects/new`)}
                            className="flex w-full items-center justify-center gap-1.5 h-8 rounded-md bg-foreground text-xs font-semibold text-background hover:opacity-90 transition-opacity cursor-pointer dark:bg-white dark:text-black dark:hover:bg-zinc-100"
                          >
                            <PlusCircle className="h-3 w-3" />
                            New Project
                          </button>
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </BreadcrumbItem>
                </React.Fragment>
              )}

              {pathname.includes("/organizations/new") && (
                <React.Fragment>
                  <BreadcrumbSeparator className="text-muted-foreground/50 text-xs">/</BreadcrumbSeparator>
                  <BreadcrumbItem>
                    <BreadcrumbPage className="text-xs font-medium">New organization</BreadcrumbPage>
                  </BreadcrumbItem>
                </React.Fragment>
              )}

              {orgSlug && pathname.includes("/projects/new") && (
                <React.Fragment>
                  <BreadcrumbSeparator className="text-muted-foreground/50 text-xs">/</BreadcrumbSeparator>
                  <BreadcrumbItem>
                    <BreadcrumbPage className="text-xs font-medium">New project</BreadcrumbPage>
                  </BreadcrumbItem>
                </React.Fragment>
              )}

              {orgSlug && projectSlug && pathname.includes("/edit") && (
                <React.Fragment>
                  <BreadcrumbSeparator className="text-muted-foreground/50 text-xs">/</BreadcrumbSeparator>
                  <BreadcrumbItem>
                    <BreadcrumbPage className="text-xs font-medium">Edit project</BreadcrumbPage>
                  </BreadcrumbItem>
                </React.Fragment>
              )}
            </BreadcrumbList>
          </Breadcrumb>

          {projectSlug && (
            <div className="hidden md:flex items-center bg-muted/30 rounded-full p-0.5 border border-border/40 ml-2">
              <button
                onClick={() => setEnvironment("production")}
                className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-all ${!isTestMode
                  ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                  : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                Production
              </button>
              <button
                onClick={() => setEnvironment("test")}
                className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-all ${isTestMode
                  ? "bg-orange-500/10 text-orange-500 border border-orange-500/20"
                  : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                Development
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {orgSlug && (
            <Link
              href={`/${orgSlug}/~/billing`}
              className={creditsPillClassName}
              aria-label="View organization credit balance"
              title="Organization credits"
            >
              <CreditCard className="h-3 w-3" />
              <span>{creditsLabel}</span>
            </Link>
          )}

          {/* Search Button (icon only on mobile) */}
          <button
            type="button"
            className="w-8 h-8 lg:w-auto lg:h-6 lg:px-2.5 flex items-center justify-center lg:justify-start gap-2 text-[11px] text-muted-foreground rounded-full bg-secondary/60 hover:bg-secondary transition-colors cursor-pointer"
            onClick={() => setCommandPaletteOpen(true)}
          >
            <Search className="h-4 w-4 lg:h-3 lg:w-3" />
            <span className="hidden lg:inline">Search...</span>
            <span className="hidden lg:flex items-center gap-0.5 text-[10px] text-muted-foreground/60">
              <Command className="h-2.5 w-2.5" />K
            </span>
          </button>

          {/* Hamburger Menu - visible on mobile only */}
          <button
            type="button"
            onClick={toggle}
            className="w-8 h-8 flex lg:hidden items-center justify-center rounded-md bg-secondary/60 hover:bg-secondary transition-colors cursor-pointer"
            aria-label="Open navigation menu"
          >
            <Menu className="h-4 w-4 text-muted-foreground" />
          </button>

        </div>
      </header>
      )}

      {/* Mobile Navigation Bar - only visible on mobile screens */}
      {!isOnboardingFlow && (
        <MobileNav onMenuClick={toggle} projectSlug={projectSlug} user={user} avatar={displayAvatar} />
      )}

      <main
        className={cn(
          isPlayground
            ? "flex min-h-0 flex-1 flex-col overflow-hidden pt-0 lg:pt-12 pb-0"
            : isOnboardingFlow
              ? "p-4 md:p-6"
              : "p-4 md:p-6 pt-20 lg:pt-14"
        )}
      >
        {children}
      </main>
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        orgSlug={orgSlug}
        projectSlug={projectSlug}
      />
      <UpdateToast />
    </div>
  );
}
