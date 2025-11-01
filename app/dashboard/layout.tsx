// app/dashboard/layout.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Logo } from "@/components/logo";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { LogOut, CircleUserRound, CreditCard, Settings, Home, Users, UserPlus } from "lucide-react";
import Link from "next/link";
import { BreadcrumbProvider, useBreadcrumbs } from "@/lib/contexts/BreadcrumbContext";

// Optional header/nav links later
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<unknown | null>(null);

  useEffect(() => {
    let mounted = true;
    async function check() {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        // not signed in: redirect to login
        router.push("/login");
        return;
      }
      if (mounted) {
        setUser(data.user);
        setLoading(false);
      }
    }
    check();
    return () => {
      mounted = false;
    };
  }, [router]);

  // while checking auth, render nothing or a simple skeleton to avoid flash
  if (loading) return null;

  // Fix type issue: ensure 'user' is typed
  type UserType = {
    email?: string | null;
    user_metadata?: Record<string, unknown>;
  };

  const typedUser = (user ?? {}) as UserType;
  const meta = typedUser.user_metadata ?? {};
  const avatar = (meta.avatar_url as string | null) ?? (meta.picture as string | null) ?? null;
  const name =
    (meta.name as string | null) ??
    typedUser.email?.split?.("@")[0] ??
    null;

  return (
    <BreadcrumbProvider>
      <LayoutContent
        user={typedUser}
        avatar={avatar}
        name={name}>
        {children}
      </LayoutContent>
    </BreadcrumbProvider>
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
  const { breadcrumbs } = useBreadcrumbs();

  return (
    <div className="min-h-screen bg-white-50 dark:bg-black transition-colors">
      <header className="h-12 border-b border-zinc-100 dark:border-zinc-800 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/organizations" className="flex items-center gap-3">
            <Logo variant="mark" className="h-4"/>
          </Link>
          {breadcrumbs.length > 0 && (
            <nav className="flex items-center space-x-2 text-sm text-muted-foreground ml-4">
              {breadcrumbs.map((item, index) => (
                <React.Fragment key={index}>
                  {index > 0 && <span>/</span>}
                  {item.href ? (
                    <Link href={item.href} className="hover:text-primary flex items-center gap-1">
                      {item.label}
                    </Link>
                  ) : (
                    <span className="text-primary flex items-center gap-1">
                      {item.label}
                    </span>
                  )}
                </React.Fragment>
              ))}
            </nav>
          )}
        </div>
        <div className="flex items-center gap-3">
        <button
            type="button"
            className="w-7 h-7 cursor-pointer inline-flex items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black/40 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900"
            aria-label="Toggle theme"
            onClick={() => {
              if (typeof document !== "undefined") {
                const html = document.documentElement;
                const isDark = html.classList.contains("dark");
                if (isDark) {
                  html.classList.remove("dark");
                  window.localStorage.setItem("theme", "light");
                } else {
                  html.classList.add("dark");
                  window.localStorage.setItem("theme", "dark");
                }
              }
            }}
          >
            {/* Light (sun) icon */}
            <svg
              className="h-3 w-3 text-zinc-700 dark:hidden"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="5" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
            {/* Dark (moon) icon */}
            <svg
              className="h-3 w-3 text-zinc-300 hidden dark:block"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </button>

          {/* Add other header buttons as needed */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Avatar className="h-7 w-7 cursor-pointer">
                {typeof avatar === "string" && avatar.length > 0 ? (
                  <AvatarImage src={avatar} alt={typeof name === "string" ? name : "User avatar"} />
                ) : (
                  <AvatarFallback>
                    <CircleUserRound className="h-5 w-5 text-zinc-500 dark:text-zinc-200" />
                  </AvatarFallback>
                )}
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-66" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-s leading-none dark:text-white text-black font-semibold">
                    {user.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/dashboard/profile")}>
                <CircleUserRound className="mr-2 h-4 w-4" />
                <span className="text-xs">Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/dashboard/billing")}>
                <CreditCard className="mr-2 h-4 w-4" />
                <span className="text-xs">Billing</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/dashboard/settings")}>
                <Settings className="mr-2 h-4 w-4" />
                <span className="text-xs"> Account Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/")}>
                
                <span className="text-xs">Homepage</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/dashboard/team")}>
                <Users className="mr-2 h-4 w-4" />
                <span className="text-xs">Team</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/dashboard/invite-user")}>
                <UserPlus className="mr-2 h-4 w-4" />
                <span className="text-xs">Invite User</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  await supabase.auth.signOut();
                  router.push("/login");
                }}
              >
                <span className="text-xs">Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="p-8">
        {children}
      </main>
    </div>
  );
}
