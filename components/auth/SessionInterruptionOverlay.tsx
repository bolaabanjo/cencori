"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { beginIntentionalSignOut, clearClientSessionCaches } from "@/lib/auth/session-caches";
import { currentReturnTo, loginHrefFor } from "@/lib/auth/return-to";
import type { SessionInterruption } from "@/lib/contexts/SessionContext";
import { Logo } from "@/components/logo";

/**
 * Blocking screen shown when the identity behind this tab changed while it was
 * open. It deliberately covers the page rather than redirecting on its own:
 * whatever is underneath belongs to the previous session, and the user gets to
 * read what happened before anything moves.
 *
 * Every action leaves through `window.location.assign`, not the router — a
 * client-side navigation would keep the previous account's React Query cache,
 * Supabase client state and PostHog identity alive across the transition.
 */
export function SessionInterruptionOverlay({
    interruption,
}: {
    interruption: SessionInterruption;
}) {
    const [busy, setBusy] = useState(false);

    const returnTo = currentReturnTo();
    const loginHref = loginHrefFor(returnTo);

    const signedOut = interruption.kind === "signed-out";
    const nextEmail = interruption.kind === "account-changed" ? interruption.email : null;

    const leave = (href: string) => {
        setBusy(true);
        window.location.assign(href);
    };

    const switchAccount = async () => {
        setBusy(true);
        beginIntentionalSignOut();
        try {
            await supabase.auth.signOut();
        } catch {
            // Already gone server-side is fine — we only need the local cookie
            // cleared before handing the user back to the login screen.
        }
        clearClientSessionCaches();
        window.location.assign(loginHref);
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="session-interruption-title"
            className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
        >
            <div className="w-full max-w-md rounded-lg border border-border/60 bg-background p-6 shadow-xl">
                <Logo variant="mark" className="mb-5 h-4" />

                <h2
                    id="session-interruption-title"
                    className="font-mono text-base font-semibold tracking-tight text-foreground"
                >
                    {signedOut ? "Your session ended" : "You're signed in as someone else"}
                </h2>

                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {signedOut ? (
                        <>
                            You were signed out — either in another tab, or because the session
                            expired. Nothing here was lost; sign in again and you&apos;ll come
                            straight back to this page.
                        </>
                    ) : (
                        <>
                            This tab was opened under a different account.{" "}
                            {nextEmail ? (
                                <span className="font-medium text-foreground">{nextEmail}</span>
                            ) : (
                                "Another account"
                            )}{" "}
                            is now signed in in this browser, so what&apos;s behind this message
                            may not belong to them.
                        </>
                    )}
                </p>

                {!signedOut && (
                    <p className="mt-2 text-xs leading-5 text-muted-foreground/80">
                        Continuing reloads this tab for the current account. If the workspace in
                        the address bar isn&apos;t shared with it, you&apos;ll land on your
                        dashboard instead.
                    </p>
                )}

                <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                    {signedOut ? (
                        <>
                            <Button
                                className="sm:flex-1"
                                disabled={busy}
                                onClick={() => leave(loginHref)}
                            >
                                Sign in again
                            </Button>
                            <Button
                                variant="outline"
                                className="sm:flex-1"
                                disabled={busy}
                                onClick={() => leave("/")}
                            >
                                Back to home
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button
                                className="sm:flex-1"
                                disabled={busy}
                                onClick={() => leave(returnTo)}
                            >
                                {nextEmail ? `Continue as ${nextEmail}` : "Continue"}
                            </Button>
                            <Button
                                variant="outline"
                                className="sm:flex-1"
                                disabled={busy}
                                onClick={switchAccount}
                            >
                                Use another account
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
