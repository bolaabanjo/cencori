"use client";

import React from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

const GitHubIcon = () => (
    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
);

const GoogleIcon = () => (
    <svg className="h-5 w-5" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
);

interface Provider {
    id: string;
    name: string;
    icon: React.ComponentType;
    connected: boolean;
    email?: string;
}

export default function ConnectedAccountsPage() {
    const [providers, setProviders] = React.useState<Provider[]>([
        { id: "github", name: "GitHub", icon: GitHubIcon, connected: false },
        { id: "google", name: "Google", icon: GoogleIcon, connected: false },
    ]);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        async function fetchIdentities() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const identities = user.identities || [];

            setProviders((prev) =>
                prev.map((provider) => {
                    const identity = identities.find((i: { provider: string }) => i.provider === provider.id);
                    return {
                        ...provider,
                        connected: !!identity,
                        email: identity?.identity_data?.email,
                    };
                })
            );
            setLoading(false);
        }
        fetchIdentities();
    }, []);

    const handleConnect = async (providerId: string) => {
        try {
            const { error } = await supabase.auth.linkIdentity({
                provider: providerId as "github" | "google",
                options: {
                    redirectTo: `${window.location.origin}/account/connected-accounts`,
                },
            });
            if (error) throw error;
        } catch {
            toast.error("Failed to connect account");
        }
    };

    const handleDisconnect = async (providerId: string) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const identity = user.identities?.find((i: { provider: string }) => i.provider === providerId);
            if (!identity) return;

            const { error } = await supabase.auth.unlinkIdentity(identity);
            if (error) throw error;

            setProviders((prev) =>
                prev.map((p) =>
                    p.id === providerId ? { ...p, connected: false, email: undefined } : p
                )
            );
            toast.success("Account disconnected");
        } catch {
            toast.error("Failed to disconnect account");
        }
    };

    return (
        <div className="max-w-2xl space-y-8">
            <div>
                <h1 className="text-xl font-semibold">Connected Accounts</h1>
                <p className="text-sm text-muted-foreground">
                    Link your accounts for easier sign-in and enhanced functionality.
                </p>
            </div>

            <div className="space-y-3">
                {providers.map((provider) => {
                    const Icon = provider.icon;
                    return (
                        <div
                            key={provider.id}
                            className="flex items-center justify-between p-4 rounded-lg border border-border/60 bg-card"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                                    <Icon />
                                </div>
                                <div>
                                    <p className="text-sm font-medium">{provider.name}</p>
                                    {provider.connected ? (
                                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                                            <Check className="h-3 w-3 text-emerald-500" />
                                            {provider.email || "Connected"}
                                        </p>
                                    ) : (
                                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                                            <X className="h-3 w-3" />
                                            Not connected
                                        </p>
                                    )}
                                </div>
                            </div>
                            {provider.connected ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs"
                                    onClick={() => handleDisconnect(provider.id)}
                                >
                                    Disconnect
                                </Button>
                            ) : (
                                <Button
                                    size="sm"
                                    className="h-8 text-xs"
                                    onClick={() => handleConnect(provider.id)}
                                    disabled={loading}
                                >
                                    Connect
                                </Button>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground">
                    Connecting accounts allows you to sign in with multiple providers.
                    Your primary email remains the same.
                </p>
            </div>
        </div>
    );
}
