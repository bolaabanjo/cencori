"use client";

import React, { useState, useEffect } from "react";
import { ShieldCheck, Key, Smartphone, Monitor, Laptop, Tablet, Globe, LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";

function parseUserAgent(ua: string) {
    let browser = "Unknown Browser";
    if (ua.includes("Chrome") && !ua.includes("Edg")) browser = "Chrome";
    else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
    else if (ua.includes("Firefox")) browser = "Firefox";
    else if (ua.includes("Edg")) browser = "Edge";
    else if (ua.includes("Opera") || ua.includes("OPR")) browser = "Opera";

    let os = "Unknown OS";
    if (ua.includes("Windows")) os = "Windows";
    else if (ua.includes("Mac OS")) os = "macOS";
    else if (ua.includes("Linux")) os = "Linux";
    else if (ua.includes("Android")) os = "Android";
    else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

    let deviceType: "mobile" | "tablet" | "desktop" = "desktop";
    if (ua.includes("Mobile") || ua.includes("Android")) deviceType = "mobile";
    else if (ua.includes("Tablet") || ua.includes("iPad")) deviceType = "tablet";

    return { browser, os, deviceType };
}

function DeviceIcon({ type }: { type: "mobile" | "tablet" | "desktop" }) {
    switch (type) {
        case "mobile":
            return <Smartphone className="h-4 w-4 text-emerald-500" />;
        case "tablet":
            return <Tablet className="h-4 w-4 text-emerald-500" />;
        default:
            return <Monitor className="h-4 w-4 text-emerald-500" />;
    }
}

export default function SecurityPage() {
    const [sessionInfo, setSessionInfo] = useState<{
        browser: string;
        os: string;
        deviceType: "mobile" | "tablet" | "desktop";
    } | null>(null);
    const [isSigningOut, setIsSigningOut] = useState(false);

    useEffect(() => {
        if (typeof window !== "undefined") {
            const info = parseUserAgent(navigator.userAgent);
            setSessionInfo(info);
        }
    }, []);

    const handleSignOutOtherDevices = async () => {
        setIsSigningOut(true);
        try {
            const { error } = await supabase.auth.signOut({ scope: "others" });

            if (error) throw error;

            toast.success("Signed out of all other devices");
        } catch (error) {
            toast.error("Failed to sign out other devices");
        } finally {
            setIsSigningOut(false);
        }
    };

    return (
        <div className="max-w-2xl space-y-8">
            <div>
                <h1 className="text-xl font-semibold">Security</h1>
                <p className="text-sm text-muted-foreground">
                    Manage your account security and authentication settings.
                </p>
            </div>

            <section className="space-y-3">
                <h2 className="text-sm font-medium">Password</h2>
                <div className="rounded-lg border border-border/60 bg-card p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                                <Key className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div>
                                <p className="text-sm font-medium">Password</p>
                                <p className="text-xs text-muted-foreground">
                                    Last changed: Never
                                </p>
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => toast.info("Password change coming soon!")}
                        >
                            Change password
                        </Button>
                    </div>
                </div>
            </section>

            <section className="space-y-3">
                <h2 className="text-sm font-medium">Two-Factor Authentication</h2>
                <div className="rounded-lg border border-border/60 bg-card p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                                <Smartphone className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div>
                                <p className="text-sm font-medium">Authenticator App</p>
                                <p className="text-xs text-muted-foreground">
                                    Add an extra layer of security
                                </p>
                            </div>
                        </div>
                        <Button
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => toast.info("2FA setup coming soon!")}
                        >
                            Enable 2FA
                        </Button>
                    </div>
                </div>
            </section>

            <section className="space-y-3">
                <h2 className="text-sm font-medium">Active Sessions</h2>
                <div className="rounded-lg border border-border/60 bg-card p-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                                {sessionInfo ? (
                                    <DeviceIcon type={sessionInfo.deviceType} />
                                ) : (
                                    <ShieldCheck className="h-4 w-4 text-emerald-500" />
                                )}
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium">
                                        {sessionInfo ? `${sessionInfo.browser} on ${sessionInfo.os}` : "Current Session"}
                                    </p>
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-500">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        Active now
                                    </span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    This device • Current session
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-border/40" />

                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground">
                                Sign out of all other browser sessions across all devices.
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10 border-red-500/20 hover:border-red-500/30"
                            onClick={handleSignOutOtherDevices}
                            disabled={isSigningOut}
                        >
                            {isSigningOut ? (
                                <>
                                    <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                                    Signing out...
                                </>
                            ) : (
                                "Sign out other devices"
                            )}
                        </Button>
                    </div>
                </div>
            </section>
        </div>
    );
}
