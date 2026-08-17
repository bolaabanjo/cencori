"use client";

import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { CircleUserRound, Settings, LogOut } from "lucide-react";
import { Logo } from "@/components/logo";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import posthog from "posthog-js";
import { beginIntentionalSignOut, clearClientSessionCaches } from "@/lib/auth/session-caches";

const UpgradeDialog = dynamic(
    () => import("@/components/billing/UpgradeDialog").then((module) => module.UpgradeDialog),
    { ssr: false },
);

type ProfileData = {
    first_name?: string;
    last_name?: string;
    email?: string;
    avatar_url?: string | null;
};

type UserMenuProps = {
    organization?: {
        id: string;
        name: string;
        slug: string;
        subscriptionTier: string;
    };
};

export function UserMenu({ organization }: UserMenuProps) {
    const router = useRouter();
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [upgradeOpen, setUpgradeOpen] = useState(false);
    const [upgradePreload, setUpgradePreload] = useState(false);

    useEffect(() => {
        let cancelled = false;

        supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
            if (cancelled) return;
            if (session?.user) {
                const meta = session.user.user_metadata;
                setProfile({
                    first_name: meta?.first_name || meta?.given_name || "",
                    last_name: meta?.last_name || meta?.family_name || "",
                    email: session.user.email || "",
                    avatar_url: meta?.avatar_url || meta?.picture || null,
                });
            }
        });

        fetch("/api/user/profile")
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (cancelled || !data?.profile) return;
                setProfile(data.profile);
            })
            .catch(() => {});

        return () => { cancelled = true; };
    }, []);

    const displayAvatar = profile?.avatar_url || null;
    const email = profile?.email || "";
    const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");
    const displayName = fullName || email;
    const currentTier = organization?.subscriptionTier === "pro" || organization?.subscriptionTier === "team"
        ? organization.subscriptionTier
        : "free";
    const canUpgrade = currentTier === "free";
    const upgradeLabel = "Upgrade to Pro";

    const openUpgrade = () => {
        if (!organization || !canUpgrade) return;
        setMenuOpen(false);
        setUpgradeOpen(true);
    };

    return (
        <>
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors outline-hidden"
                        aria-label="User menu"
                    >
                        <UserAvatar
                            src={displayAvatar}
                            name={fullName}
                            email={email}
                            size={24}
                        />
                        <span className="flex-1 truncate text-xs">{displayName}</span>
                        <span className="inline-flex items-center justify-center size-6 rounded-full border border-border/60 text-sm text-muted-foreground font-bold leading-none">⋯</span>
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-66 p-1 font-mono dark:bg-black dark:border-white/10 data-[state=open]:animate-none data-[state=closed]:animate-none" side="top" sideOffset={4} align="start" forceMount>
                    <div className="px-2 py-2 border-b border-border/40 mb-1 space-y-0.5">
                        <p className="text-xs font-semibold truncate text-popover-foreground leading-tight">{fullName || email}</p>
                        {fullName && <p className="text-[10px] text-muted-foreground truncate leading-tight">{email}</p>}
                    </div>
                    <p className="px-2 py-1 text-[10px] text-muted-foreground uppercase tracking-wider">Account</p>
                    <DropdownMenuItem className="text-xs py-1.5 cursor-pointer flex justify-between" onClick={() => router.push("/account/profile")}>
                        Profile
                        <CircleUserRound className="h-3.5 w-3.5 ml-auto" />
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-xs py-1.5 cursor-pointer flex justify-between" onClick={() => router.push("/account/settings")}>
                        Settings
                        <Settings className="h-3.5 w-3.5 ml-auto" />
                    </DropdownMenuItem>
                    <div className="my-1 border-t border-border/40" />
                    {canUpgrade && (
                        <div className="px-2 py-1.5">
                            <button
                                type="button"
                                onClick={openUpgrade}
                                onPointerEnter={() => setUpgradePreload(true)}
                                onFocus={() => setUpgradePreload(true)}
                                disabled={!organization}
                                className="flex h-8 w-full cursor-pointer items-center justify-center rounded-md bg-foreground text-xs font-semibold text-background transition-[opacity,transform,background-color] duration-200 hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-100"
                            >
                                {upgradeLabel}
                            </button>
                        </div>
                    )}
                    <div className="my-1 border-t border-border/40" />
                    <div className="flex items-center justify-between px-2 py-1.5">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Theme</p>
                        <ThemeSwitcher />
                    </div>
                    <div className="my-1 border-t border-border/40" />
                    <DropdownMenuItem className="text-xs py-1.5 cursor-pointer flex justify-between" onClick={() => router.push("/")}>
                        Homepage
                        <span className="size-3.5 shrink-0">
                            <Logo variant="mark" className="h-full w-full" />
                        </span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        className="text-xs py-1.5 cursor-pointer flex justify-between text-red-500 focus:text-red-500"
                        onClick={async () => {
                            // Flag it first: SessionProvider watches for the
                            // session disappearing and would otherwise raise the
                            // "you were signed out" screen over a log-out the
                            // user just asked for.
                            beginIntentionalSignOut();
                            clearClientSessionCaches();
                            await supabase.auth.signOut({ scope: "local" });
                            posthog.reset();
                            router.push("/login");
                        }}
                    >
                        Log out
                        <LogOut className="h-3.5 w-3.5" />
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {organization && canUpgrade && (upgradePreload || upgradeOpen) && (
                <UpgradeDialog
                    open={upgradeOpen}
                    onOpenChange={setUpgradeOpen}
                    orgId={organization.id}
                    orgSlug={organization.slug}
                    orgName={organization.name}
                    currentTier={currentTier}
                    recommendedTier="pro"
                    checkoutMode="direct"
                    preload={upgradePreload || upgradeOpen}
                />
            )}
        </>
    );
}
