"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

export function useAuth() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [userProfile, setUserProfile] = useState<{ name: string | null; avatar: string | null; email: string | null }>({ name: null, avatar: null, email: null });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                setIsAuthenticated(true);
                const { user } = session;
                const meta = user.user_metadata ?? {};
                const avatar = meta.avatar_url ?? meta.picture ?? null;
                const name = meta.name ?? user.email?.split("@")[0] ?? null;
                setUserProfile({ name: name as string | null, avatar: avatar as string | null, email: user.email ?? null });

                // Fetch custom avatar from DB (set from /dashboard/profile)
                try {
                  const res = await fetch("/api/user/profile");
                  if (res.ok) {
                    const data = await res.json();
                    if (data?.profile?.avatar_url) {
                      setUserProfile(prev => ({ ...prev, avatar: data.profile.avatar_url }));
                    }
                  }
                } catch {}
            }
            setLoading(false);
        };
        checkUser();

        const { data: authListener } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
            if (session?.user) {
                setIsAuthenticated(true);
                const { user } = session;
                const meta = user.user_metadata ?? {};
                const avatar = meta.avatar_url ?? meta.picture ?? null;
                const name = meta.name ?? user.email?.split("@")[0] ?? null;
                setUserProfile({ name: name as string | null, avatar: avatar as string | null, email: user.email ?? null });

                fetch("/api/user/profile").then(r => r.ok && r.json()).then(data => {
                  if (data?.profile?.avatar_url) {
                    setUserProfile(prev => ({ ...prev, avatar: data.profile.avatar_url }));
                  }
                }).catch(() => {});
            } else {
                setIsAuthenticated(false);
                setUserProfile({ name: null, avatar: null, email: null });
            }
            setLoading(false);
        });

        return () => {
            authListener.subscription.unsubscribe();
        };
    }, []);

    return { isAuthenticated, userProfile, loading };
}
