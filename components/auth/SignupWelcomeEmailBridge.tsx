"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
    clearSignupNewsletterOptInPending,
    clearSignupWelcomeEmailPending,
    isSignupNewsletterOptInPending,
    isSignupWelcomeEmailPending,
} from "@/lib/auth-welcome";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

const NEW_SIGNUP_WINDOW_MS = 30 * 60 * 1000;

export function SignupWelcomeEmailBridge() {
    useEffect(() => {
        let cancelled = false;
        let inFlight = false;
        let newsletterInFlight = false;
        let loginAlertInFlight = false;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;

        const isRecentlyCreatedSession = (session: Session | null): boolean => {
            const createdAt = session?.user?.created_at;
            if (!createdAt) return false;
            const createdTimestamp = new Date(createdAt).getTime();
            if (Number.isNaN(createdTimestamp)) return false;
            return Date.now() - createdTimestamp <= NEW_SIGNUP_WINDOW_MS;
        };

        const shouldAttemptForSession = (session: Session | null): boolean => {
            if (isSignupWelcomeEmailPending()) return true;
            return isRecentlyCreatedSession(session);
        };

        const maybeSubscribeToNewsletter = async (session: Session | null) => {
            const email = session?.user?.email;
            if (!email || cancelled || newsletterInFlight) return;
            if (!isSignupNewsletterOptInPending()) return;

            newsletterInFlight = true;
            try {
                const response = await fetch("/api/newsletter/subscribe", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, source: "signup" }),
                });
                // Clear on any non-network response — we don't want to retry forever
                // if the user already exists or the request was malformed.
                if (response.ok || (response.status >= 400 && response.status < 500)) {
                    clearSignupNewsletterOptInPending();
                }
            } catch {
                // Network error — leave the flag and retry on next page load.
            } finally {
                newsletterInFlight = false;
            }
        };

        const maybeSendWelcomeEmail = async (session: Session | null) => {
            const email = session?.user?.email;
            if (!email || cancelled || inFlight || !shouldAttemptForSession(session)) {
                return;
            }

            inFlight = true;
            try {
                const response = await fetch("/api/email/welcome", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email }),
                });

                if (response.ok || response.status === 403) {
                    clearSignupWelcomeEmailPending();
                }
            } catch {
                // Best-effort flow: leave pending flag so the next authenticated page load can retry.
            } finally {
                inFlight = false;
            }
        };

        const maybeSendLoginAlert = async (session: Session | null) => {
            const email = session?.user?.email;
            if (!email || cancelled || loginAlertInFlight) return;

            loginAlertInFlight = true;
            try {
                await fetch("/api/email/login-alert", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ user_agent: navigator.userAgent }),
                });
            } catch {
                // Best-effort — don't block login on a failed alert.
            } finally {
                loginAlertInFlight = false;
            }
        };

        const processSession = async (session: Session | null) => {
            await Promise.all([
                maybeSendWelcomeEmail(session),
                maybeSubscribeToNewsletter(session),
                maybeSendLoginAlert(session),
            ]);
        };

        const trySessionSendWithRetry = async (attempt = 0) => {
            const { data: { session } }: { data: { session: Session | null } } = await supabase.auth.getSession();
            if (cancelled) return;

            await processSession(session);

            const stillPending = isSignupWelcomeEmailPending() || isSignupNewsletterOptInPending();
            if (!stillPending || attempt >= 5) {
                return;
            }

            retryTimer = setTimeout(() => {
                void trySessionSendWithRetry(attempt + 1);
            }, 1200);
        };

        void trySessionSendWithRetry();

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
            if (session?.user?.email && event !== "SIGNED_OUT") {
                void processSession(session);
            }
        });

        return () => {
            cancelled = true;
            if (retryTimer) {
                clearTimeout(retryTimer);
            }
            subscription.unsubscribe();
        };
    }, []);

    return null;
}
