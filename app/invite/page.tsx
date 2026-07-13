"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, CheckCircle, XCircle, Mail } from "lucide-react";
import Link from "next/link";

interface InviteDetails {
    email: string;
    role: string;
    organizationName: string;
}

function InvitePageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get("token");

    const [status, setStatus] = useState<"loading" | "invite-details" | "success" | "error">("loading");
    const [inviteDetails, setInviteDetails] = useState<InviteDetails | null>(null);
    const [errorMessage, setErrorMessage] = useState<string>("");
    const [isAccepting, setIsAccepting] = useState(false);
    const [user, setUser] = useState<{ email: string } | null>(null);
    const [authChecked, setAuthChecked] = useState(false);
    const [orgSlug, setOrgSlug] = useState<string | null>(null);

    useEffect(() => {
        if (!token) {
            setStatus("error");
            setErrorMessage("Invalid invite link - no token provided");
            setAuthChecked(true);
            return;
        }

        // Check auth status and fetch invite details
        const init = async () => {
            // Use getSession which is more reliable on client-side
            const { data: { session }, error } = await supabase.auth.getSession();
            console.log('[Invite] Session check:', { hasSession: !!session, error });

            if (session?.user) {
                setUser({ email: session.user.email || "" });
            } else {
                setUser(null);
            }
            setAuthChecked(true);

            // Fetch invite details
            try {
                const res = await fetch(`/api/invites/${token}/accept`);
                const data = await res.json();

                if (!res.ok) {
                    setStatus("error");
                    setErrorMessage(data.error || "Invalid invite");
                    return;
                }

                setInviteDetails({
                    email: data.email,
                    role: data.role,
                    organizationName: data.organizationName,
                });
                setStatus("invite-details");
            } catch {
                setStatus("error");
                setErrorMessage("Failed to load invite details");
            }
        };

        init();

        // Listen for auth state changes (e.g., user logs in from another tab or redirects back)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
            if (session?.user) {
                setUser({ email: session.user.email || "" });
            } else {
                setUser(null);
            }
            setAuthChecked(true);
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [token]);

    const handleAccept = async () => {
        if (!token) return;

        setIsAccepting(true);

        try {
            const res = await fetch(`/api/invites/${token}/accept`, {
                method: "POST",
            });
            const data = await res.json();

            if (!res.ok) {
                // If not logged in, redirect to login
                if (res.status === 401) {
                    // Store the invite token in session storage so we can redirect back
                    sessionStorage.setItem("pending_invite_token", token);
                    router.push(`/login?redirect=/invite?token=${token}`);
                    return;
                }
                toast.error(data.error || "Failed to accept invite");
                setIsAccepting(false);
                return;
            }

            setOrgSlug(data.organizationSlug);
            setStatus("success");
            toast.success(data.message || "Invite accepted!");
        } catch {
            toast.error("Something went wrong");
            setIsAccepting(false);
        }
    };

    if (status === "loading") {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
                    <p className="mt-4 text-sm text-muted-foreground">Loading invite...</p>
                </div>
            </div>
        );
    }

    if (status === "error") {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center max-w-md mx-auto px-6">
                    <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                        <XCircle className="h-6 w-6 text-red-500" />
                    </div>
                    <h1 className="text-lg font-semibold mb-2">Invalid Invite</h1>
                    <p className="text-sm text-muted-foreground mb-6">{errorMessage}</p>
                    <Button asChild variant="outline">
                        <Link href="/dashboard">Go to Dashboard</Link>
                    </Button>
                </div>
            </div>
        );
    }

    if (status === "success") {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center max-w-md mx-auto px-6">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="h-6 w-6 text-emerald-500" />
                    </div>
                    <h1 className="text-lg font-semibold mb-2">You're In!</h1>
                    <p className="text-sm text-muted-foreground mb-6">
                        You've successfully joined {inviteDetails?.organizationName || "the organization"}.
                    </p>
                    <Button asChild>
                        <Link href={orgSlug ? `/${orgSlug}` : "/dashboard"}>
                            Go to Organization
                        </Link>
                    </Button>
                </div>
            </div>
        );
    }

    // Invite details view
    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="w-full max-w-md mx-auto px-6">
                <div className="bg-card border border-border/40 rounded-lg p-8">
                    <div className="text-center mb-6">
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                            <Mail className="h-6 w-6 text-primary" />
                        </div>
                        <h1 className="text-lg font-semibold">You're Invited</h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Join <span className="text-foreground font-medium">{inviteDetails?.organizationName}</span>
                        </p>
                    </div>

                    <div className="bg-muted/30 rounded-md p-4 mb-6 space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Email</span>
                            <span>{inviteDetails?.email}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Role</span>
                            <span className="capitalize">{inviteDetails?.role}</span>
                        </div>
                    </div>

                    {!authChecked ? (
                        <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : user ? (
                        user.email.toLowerCase() === inviteDetails?.email.toLowerCase() ? (
                            <Button
                                className="w-full"
                                onClick={handleAccept}
                                disabled={isAccepting}
                            >
                                {isAccepting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Accepting...
                                    </>
                                ) : (
                                    "Accept Invite"
                                )}
                            </Button>
                        ) : (
                            <div className="space-y-3">
                                <p className="text-sm text-amber-500 text-center">
                                    You're logged in as {user.email}. This invite is for {inviteDetails?.email}.
                                </p>
                                <Button variant="outline" className="w-full" asChild>
                                    <Link href={`/login?redirect=/invite?token=${token}`}>
                                        Log in with different account
                                    </Link>
                                </Button>
                            </div>
                        )
                    ) : (
                        <div className="space-y-3">
                            <Button className="w-full" asChild>
                                <Link href={`/login?redirect=/invite?token=${token}`}>
                                    Log in to Accept
                                </Link>
                            </Button>
                            <p className="text-xs text-muted-foreground text-center">
                                Don't have an account?{" "}
                                <Link href={`/signup?redirect=/invite?token=${token}`} className="text-primary hover:underline">
                                    Sign up
                                </Link>
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function InvitePage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
                    <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
                </div>
            </div>
        }>
            <InvitePageContent />
        </Suspense>
    );
}

