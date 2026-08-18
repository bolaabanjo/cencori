"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";

interface PlanProps {
    tier: string;
    status: string;
    currentPeriodEnd: string | null;
    price: number;
    monthlyRequestsUsed: number;
    projectCount: number;
    projectLimit: number;
    creditBalance: number;
    actionUrl?: string | null;
    actionLabel?: string;
    actionExternal?: boolean;
    onAction?: () => void;
}

export function PlanDetails({
    tier,
    status,
    currentPeriodEnd,
    price,
    monthlyRequestsUsed,
    projectCount,
    projectLimit,
    creditBalance,
    actionUrl,
    actionLabel = "Manage plan",
    actionExternal = false,
    onAction,
}: PlanProps) {
    const renewalLabel = currentPeriodEnd
        ? new Date(currentPeriodEnd).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        })
        : tier === "free"
            ? "No renewal"
            : "Monthly";
    const planName = tier === "free"
        ? "Free"
        : `${tier.charAt(0).toUpperCase()}${tier.slice(1)}`;
    const projectValue = projectLimit >= 999999
        ? projectCount.toLocaleString()
        : `${projectCount.toLocaleString()} of ${projectLimit.toLocaleString()}`;

    const action = onAction ? (
        <Button onClick={onAction} className="h-7 rounded-md px-3 text-[11px] font-medium shadow-none">
            {actionLabel}
        </Button>
    ) : actionUrl ? (
        actionExternal ? (
            <Button
                className="h-7 rounded-md px-3 text-[11px] font-medium shadow-none"
                onClick={() => window.open(actionUrl, "_blank", "noopener,noreferrer")}
            >
                {actionLabel}
            </Button>
        ) : (
            <Button asChild className="h-7 rounded-md px-3 text-[11px] font-medium shadow-none">
                <Link href={actionUrl}>
                    {actionLabel}
                </Link>
            </Button>
        )
    ) : null;

    return (
        <section className="grid gap-6 border-t border-border/30 py-9 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
            <div>
                <h2 className="text-sm font-medium">Plan</h2>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                    Your subscription and included account capacity.
                </p>
            </div>

            <div className="overflow-hidden rounded-lg border border-border/40 bg-muted/20">
                <div className="flex flex-col gap-5 bg-muted/50 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-base font-medium">{planName} plan</h3>
                            <span className="text-[10px] capitalize text-emerald-600 dark:text-emerald-400">
                                {status || "active"}
                            </span>
                        </div>
                        <div className="mt-2 flex items-baseline gap-1.5">
                            <span className="font-mono text-2xl font-medium tabular-nums">
                                {formatCurrency(price, "USD")}
                            </span>
                            <span className="text-xs text-muted-foreground">per month</span>
                        </div>
                    </div>
                    {action}
                </div>

                <dl className="divide-y divide-border/30 border-t border-border/30 text-xs">
                    <div className="grid gap-1 px-5 py-3.5 transition-colors hover:bg-muted/30 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
                        <dt className="text-muted-foreground">Monthly requests</dt>
                        <dd className="font-mono tabular-nums">
                            {monthlyRequestsUsed.toLocaleString()}
                        </dd>
                    </div>
                    <div className="grid gap-1 px-5 py-3.5 transition-colors hover:bg-muted/30 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
                        <dt className="text-muted-foreground">Active projects</dt>
                        <dd className="font-mono tabular-nums">{projectValue}</dd>
                    </div>
                    <div className="grid gap-1 px-5 py-3.5 transition-colors hover:bg-muted/30 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
                        <dt className="text-muted-foreground">Prepaid balance</dt>
                        <dd className="font-mono tabular-nums">
                            {formatCurrency(creditBalance, "USD", { maximumFractionDigits: 4 })}
                        </dd>
                    </div>
                    <div className="grid gap-1 px-5 py-3.5 transition-colors hover:bg-muted/30 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
                        <dt className="text-muted-foreground">Next renewal</dt>
                        <dd className="font-mono tabular-nums">{renewalLabel}</dd>
                    </div>
                </dl>
            </div>
        </section>
    );
}
