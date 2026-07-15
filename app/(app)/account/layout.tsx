"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CircleUserRound, Settings, Link2, ShieldCheck, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
    { href: "/account/profile", icon: CircleUserRound, label: "Profile" },
    { href: "/account/settings", icon: Settings, label: "Account Settings" },
    { href: "/account/connected-accounts", icon: Link2, label: "Connected Accounts" },
    { href: "/account/security", icon: ShieldCheck, label: "Security" },
];

export default function AccountLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();

    return (
        <div className="flex min-h-[calc(100vh-6rem)]">
            <aside className="hidden lg:flex w-56 flex-col border-r border-border/40 pr-6">
                <div className="mb-4">
                    <button
                        onClick={() => router.back()}
                        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                        <ChevronLeft className="h-3 w-3" />
                        Back
                    </button>
                </div>
                <h2 className="text-sm font-medium mb-4">Account</h2>
                <nav className="space-y-1">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-colors",
                                    isActive
                                        ? "bg-secondary text-foreground font-medium"
                                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                                )}
                            >
                                <item.icon className="h-3.5 w-3.5" />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>
            </aside>

            <div className="lg:hidden mb-4 overflow-x-auto pb-2">
                <div className="flex gap-1 min-w-max">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors",
                                    isActive
                                        ? "bg-secondary text-foreground font-medium"
                                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                                )}
                            >
                                <item.icon className="h-3 w-3" />
                                {item.label}
                            </Link>
                        );
                    })}
                </div>
            </div>

            <main className="flex-1 lg:pl-6 flex justify-center">
                <div className="w-full max-w-2xl">{children}</div>
            </main>
        </div>
    );
}
