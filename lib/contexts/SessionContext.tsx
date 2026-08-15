"use client";

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { supabase } from "@/lib/supabaseClient";
import {
    clearClientSessionCaches,
    consumeIntentionalSignOut,
} from "@/lib/auth/session-caches";
import { SessionInterruptionOverlay } from "@/components/auth/SessionInterruptionOverlay";

/**
 * What happened to the identity behind this tab while it was sitting open.
 *
 *  - "signed-out"      the session is gone (logged out elsewhere, or expired)
 *  - "account-changed" a *different* user is now signed in in this browser
 */
export type SessionInterruption =
    | { kind: "signed-out" }
    | { kind: "account-changed"; email: string | null };

interface SessionContextValue {
    /**
     * Called by data layers that get a 401/expired-JWT back from Supabase.
     * Raises the same interruption screen the watcher raises, so a dead session
     * surfaces on the first failed request instead of on the next poll.
     */
    reportSessionExpired: () => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

// How often to re-read the session cookie while the tab is open. Cheap: it's a
// cookie read, not a network call. The visibility/focus listeners below are
// what actually catch most cases; this only covers a tab left in the
// foreground on a second monitor.
const POLL_INTERVAL_MS = 60_000;

/**
 * Watches the identity behind this tab and, when it changes underneath the
 * user, says so instead of letting the UI fail sideways.
 *
 * Why this exists rather than relying on `onAuthStateChange`: with cookie
 * storage, signing out in another tab just deletes the cookie. auth-js only
 * emits SIGNED_OUT for a sign-out it performed itself — `_recoverAndRefresh`
 * returns silently when storage is already empty, and it emits nothing at all
 * when it finds a valid session belonging to somebody else. So this tab used to
 * carry on rendering the previous account's chrome, and the first RLS-filtered
 * query (an org the new account isn't a member of) came back empty and got
 * rendered as a 404. Reading the cookie ourselves is the only reliable signal.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
    const [interruption, setInterruption] = useState<SessionInterruption | null>(null);

    // The user id this tab believes it is rendering for. Null until the first
    // check settles, so we never compare against a baseline we don't have.
    const knownUserId = useRef<string | null>(null);
    const baselineSettled = useRef(false);
    // Mirrors `interruption` for use inside callbacks that must not re-subscribe
    // every time the state changes.
    const interrupted = useRef(false);

    const raise = useCallback((next: SessionInterruption) => {
        if (interrupted.current) return;
        interrupted.current = true;
        // The previous account's cached org/project names are what render the
        // stale breadcrumbs; clear before the overlay so nothing behind it is
        // showing data the current identity isn't entitled to.
        clearClientSessionCaches();
        setInterruption(next);
    }, []);

    const verify = useCallback(async () => {
        if (interrupted.current) return;

        let userId: string | null = null;
        let email: string | null = null;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            userId = session?.user?.id ?? null;
            email = session?.user?.email ?? null;
        } catch {
            // A storage read that throws is not evidence of a dead session.
            return;
        }

        if (!baselineSettled.current) {
            baselineSettled.current = true;
            knownUserId.current = userId;
            return;
        }

        if (userId === knownUserId.current) return;

        if (!userId) {
            // The user clicked "Log out" in this tab; the redirect to /login is
            // already in flight and an overlay would just flash on the way out.
            if (consumeIntentionalSignOut()) {
                knownUserId.current = null;
                return;
            }
            raise({ kind: "signed-out" });
            return;
        }

        if (knownUserId.current === null) {
            // Signed in from nothing (e.g. this tab was mid-login). Adopt it.
            knownUserId.current = userId;
            return;
        }

        raise({ kind: "account-changed", email });
    }, [raise]);

    const reportSessionExpired = useCallback(() => {
        // Confirm against the cookie before blocking the page. A one-off 401 on
        // a tab that still holds a good session is a request-level failure, not
        // an identity change, and shouldn't throw up a full-screen dialog.
        void (async () => {
            if (interrupted.current) return;

            const { data: { session } } = await supabase.auth.getSession();
            const userId = session?.user?.id ?? null;

            if (!userId) {
                if (consumeIntentionalSignOut()) return;
                raise({ kind: "signed-out" });
                return;
            }

            if (knownUserId.current && userId !== knownUserId.current) {
                raise({ kind: "account-changed", email: session?.user?.email ?? null });
            }
        })();
    }, [raise]);

    useEffect(() => {
        void verify();

        const onVisible = () => {
            if (document.visibilityState === "visible") void verify();
        };
        const onFocus = () => void verify();
        const interval = window.setInterval(() => void verify(), POLL_INTERVAL_MS);

        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("focus", onFocus);

        // auth-js still fires for same-tab transitions and token refreshes;
        // those are the cheapest possible signal when they do arrive.
        const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
            void verify();
        });

        return () => {
            window.clearInterval(interval);
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener("focus", onFocus);
            subscription.unsubscribe();
        };
    }, [verify]);

    return (
        <SessionContext.Provider value={{ reportSessionExpired }}>
            {children}
            {interruption && <SessionInterruptionOverlay interruption={interruption} />}
        </SessionContext.Provider>
    );
}

/**
 * Optional by design: components below the provider can call this, and
 * components rendered outside it (marketing, auth pages) get a no-op instead of
 * a thrown error.
 */
export function useSession(): SessionContextValue {
    const context = useContext(SessionContext);
    return context ?? { reportSessionExpired: () => { } };
}
