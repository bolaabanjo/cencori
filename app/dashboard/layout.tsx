// app/dashboard/layout.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Logo } from "@/components/logo";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

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
  const avatar = meta.avatar_url ?? meta.picture ?? null;
  const name =
    meta.name ??
    typedUser.email?.split?.("@")[0] ??
    null;

  return (
    <div className="min-h-screen bg-white-50 dark:bg-black transition-colors">
      <header className="h-14 border-b border-zinc-100 dark:border-zinc-800 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/dashboard/organizations" className="flex items-center gap-3">
            <Logo variant="mark" className="h-4"/>
          </a>
        </div>

        <div className="flex items-center gap-3">
          {/* Add other header buttons as needed */}
          <Avatar className="h-8 w-8">
            {typeof avatar === "string" && avatar.length > 0 ? (
              <AvatarImage src={avatar} alt={typeof name === "string" ? name : "User avatar"} />
            ) : (
              <AvatarFallback>{(typeof name === "string" ? name : "U").slice(0, 2).toUpperCase()}</AvatarFallback>
            )}
          </Avatar>
        </div>
      </header>

      <main className="p-8">
        {children}
      </main>
    </div>
  );
}
