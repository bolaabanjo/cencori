"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function SettingsPage() {
    return (
        <div className="max-w-2xl space-y-8">
            <div>
                <h1 className="text-xl font-semibold">Account Settings</h1>
                <p className="text-sm text-muted-foreground">
                    Manage your account preferences and settings.
                </p>
            </div>

            <div className="space-y-4">
                <Link
                    href="/account/profile"
                    className="flex items-center justify-between p-4 rounded-lg border border-border/60 bg-card hover:bg-secondary/50 transition-colors"
                >
                    <div>
                        <p className="text-sm font-medium">Profile</p>
                        <p className="text-xs text-muted-foreground">Update your personal information</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>

                <Link
                    href="/account/connected-accounts"
                    className="flex items-center justify-between p-4 rounded-lg border border-border/60 bg-card hover:bg-secondary/50 transition-colors"
                >
                    <div>
                        <p className="text-sm font-medium">Connected Accounts</p>
                        <p className="text-xs text-muted-foreground">Manage linked OAuth providers</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>

                <Link
                    href="/account/security"
                    className="flex items-center justify-between p-4 rounded-lg border border-border/60 bg-card hover:bg-secondary/50 transition-colors"
                >
                    <div>
                        <p className="text-sm font-medium">Security</p>
                        <p className="text-xs text-muted-foreground">Password, 2FA, and security settings</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
            </div>
        </div>
    );
}
