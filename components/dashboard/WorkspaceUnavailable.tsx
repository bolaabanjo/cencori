"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { useOrganizationProject } from "@/lib/contexts/OrganizationProjectContext";
import { beginIntentionalSignOut, clearClientSessionCaches } from "@/lib/auth/session-caches";
import { currentReturnTo, loginHrefFor } from "@/lib/auth/return-to";

/**
 * Shown when an org-scoped URL resolves to nothing for the signed-in account.
 *
 * This used to render the global 404, which was wrong far more often than it
 * was right: the overwhelmingly common cause is a link into a workspace the
 * current account isn't a member of (a bookmark from another account, a URL
 * shared between colleagues), not a URL that never existed. RLS can't tell the
 * two apart from the browser — a row you can't see and a row that isn't there
 * are both zero rows — so the copy covers both without asserting which, and
 * without leaking whether the slug exists.
 */
export function WorkspaceUnavailable({ orgSlug }: { orgSlug: string }) {
    const { organizations, loading } = useOrganizationProject();
    const [email, setEmail] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let mounted = true;
        void supabase.auth.getSession().then(({ data: { session } }) => {
            if (mounted) setEmail(session?.user?.email ?? null);
        });
        return () => {
            mounted = false;
        };
    }, []);

    const switchAccount = async () => {
        setBusy(true);
        beginIntentionalSignOut();
        try {
            await supabase.auth.signOut();
        } catch {
            // Local cookie clearing is what matters before we hand off to login.
        }
        clearClientSessionCaches();
        // Hard navigation: a router push would carry the previous account's
        // React Query cache and Supabase client state into the next session.
        window.location.assign(loginHrefFor(currentReturnTo()));
    };

    const hasOrganizations = organizations.length > 0;

    return (
        <div className="flex min-h-[calc(100dvh-8rem)] w-full items-center justify-center px-6">
            <div className="w-full max-w-md">
                <h1 className="font-mono text-lg font-semibold tracking-tight text-foreground">
                    This workspace isn&apos;t available
                </h1>

                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    <span className="font-mono text-foreground">{orgSlug}</span> either
                    doesn&apos;t exist or isn&apos;t shared with
                    {email ? (
                        <>
                            {" "}
                            <span className="font-medium text-foreground">{email}</span>.
                        </>
                    ) : (
                        <> the account you&apos;re signed in as.</>
                    )}{" "}
                    If you reached this from a bookmark, it may belong to a different account.
                </p>

                {!loading && hasOrganizations && (
                    <div className="mt-6">
                        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                            Your organizations
                        </p>
                        <ul className="mt-2 divide-y divide-border/40 rounded-md border border-border/40">
                            {organizations.slice(0, 5).map((org) => (
                                <li key={org.id}>
                                    <Link
                                        href={`/${org.slug}/~/projects`}
                                        className="flex items-center justify-between px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-secondary/50"
                                    >
                                        <span>{org.name}</span>
                                        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                    <Button asChild className="sm:flex-1">
                        <Link href={hasOrganizations || loading ? "/dashboard" : "/onboarding"}>
                            {hasOrganizations || loading
                                ? "Go to your dashboard"
                                : "Create an organization"}
                        </Link>
                    </Button>
                    <Button
                        variant="outline"
                        className="sm:flex-1"
                        disabled={busy}
                        onClick={switchAccount}
                    >
                        Use another account
                    </Button>
                </div>
            </div>
        </div>
    );
}
