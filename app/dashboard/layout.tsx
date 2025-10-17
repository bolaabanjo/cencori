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
  const [user, setUser] = useState<any | null>(null);

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

  const meta = (user.user_metadata ?? {}) as Record<string, any>;
  const avatar = meta.avatar_url ?? meta.picture ?? null;
  const name = meta.name ?? user.email?.split("@")[0] ?? null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors">
      <header className="h-14 border-b border-slate-100 dark:border-slate-800 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/dashboard/organizations" className="flex items-center gap-3">
            <Logo variant="mark" />
            <span className="hidden sm:inline text-sm font-medium text-slate-900 dark:text-white">Dashboard</span>
          </a>
        </div>

        <div className="flex items-center gap-3">
          {/* Add other header buttons as needed */}
          <Avatar className="h-8 w-8">
            {avatar ? (
              <AvatarImage src={avatar} alt={name ?? "User avatar"} />
            ) : (
              <AvatarFallback>{(name ?? "U").slice(0, 2).toUpperCase()}</AvatarFallback>
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
