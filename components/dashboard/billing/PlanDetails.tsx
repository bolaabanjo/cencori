"use client";

import React from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { CENCORI_PAID_PLANS } from '@/lib/billing/plans';

interface PlanProps {
    tier: string;
    status: string;
    currentPeriodEnd: string | null;
    price: number;
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
    actionUrl,
    actionLabel = 'Manage Plan',
    actionExternal = false,
    onAction
}: PlanProps) {
    const freeFeatures = [
        "1,000 requests each month",
        "100+ AI models",
        "Streaming & tool calling",
        "Bring your own keys (BYOK)",
    ];
    
    const proFeatures = CENCORI_PAID_PLANS.pro.features;
    
    const teamFeatures = CENCORI_PAID_PLANS.team.features;
    
    const enterpriseFeatures = [
        "Everything in Team",
        "SSO & SAML",
        "Dedicated support",
        "Custom SLAs",
    ];
    
    const tierFeatures = tier === 'free' ? freeFeatures 
        : tier === 'pro' ? proFeatures 
        : tier === 'team' ? teamFeatures 
        : enterpriseFeatures;

    return (
        <div className="rounded-md border border-border/40 bg-card overflow-hidden">
            <div className="grid md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-border/20">
                {/* Status Column */}
                <div className="md:col-span-2">
                    <div className="px-4 py-3 border-b border-border/40">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Plan Status</p>
                    </div>
                    <div className="p-4 space-y-4">
                        <div>
                            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Current Tier</div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-lg font-medium capitalize tabular-nums">{tier}</h3>
                                <Badge variant="outline" className="text-[10px] h-5 gap-1.5 border-emerald-500/20 text-emerald-600 bg-emerald-500/5">
                                    <span className="size-1 rounded-full bg-emerald-500" />
                                    {status}
                                </Badge>
                            </div>
                        </div>

                        <div>
                            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Renewal Date</div>
                            <div className="text-xs font-medium">
                                {currentPeriodEnd ? new Date(currentPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : (tier === 'free' ? 'Lifetime access' : 'Monthly renewal')}
                            </div>
                        </div>

                        <div className="pt-2">
                            <div className="text-xl font-medium tabular-nums">
                                ${price}<span className="text-[11px] text-muted-foreground font-normal ml-1">/ month</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Features Column */}
                <div className="md:col-span-3">
                    <div className="px-4 py-3 border-b border-border/40">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Included Features</p>
                    </div>
                    <div className="p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mb-4">
                            {tierFeatures.map((feature, i) => (
                                <div key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                                    <span className="text-emerald-500/60 mt-0.5 shrink-0">•</span>
                                    <span>{feature}</span>
                                </div>
                            ))}
                        </div>
                        <div className="pt-4 border-t border-border/20 flex items-center justify-between">
                            <p className="text-[10px] text-muted-foreground max-w-[200px] leading-relaxed">
                                Need more? Explore our Team and Enterprise plans for custom scaling.
                            </p>
                            {onAction ? (
                                <Button
                                    variant="link"
                                    className="w-full h-auto p-0 text-[10px] font-medium text-muted-foreground uppercase tracking-widest hover:text-foreground hover:no-underline transition-colors w-auto"
                                    onClick={onAction}
                                >
                                    {actionLabel}
                                    <ArrowRight size={12} className="ml-1 transition-transform group-hover:translate-x-0.5" />
                                </Button>
                            ) : actionUrl ? (
                                actionExternal ? (
                                    <Button
                                        variant="link"
                                        className="w-full h-auto p-0 text-[10px] font-medium text-muted-foreground uppercase tracking-widest hover:text-foreground hover:no-underline transition-colors w-auto"
                                        onClick={() => window.open(actionUrl, '_blank', 'noopener,noreferrer')}
                                    >
                                        {actionLabel}
                                        <ArrowRight size={12} className="ml-1 transition-transform group-hover:translate-x-0.5" />
                                    </Button>
                                ) : (
                                    <Button asChild variant="link" className="w-full h-auto p-0 text-[10px] font-medium text-muted-foreground uppercase tracking-widest hover:text-foreground hover:no-underline transition-colors w-auto">
                                        <Link href={actionUrl}>
                                            {actionLabel}
                                            <ArrowRight size={12} className="ml-1 transition-transform group-hover:translate-x-0.5" />
                                        </Link>
                                    </Button>
                                )
                            ) : (
                                <Button variant="link" className="w-full h-auto p-0 text-[10px] font-medium text-muted-foreground uppercase tracking-widest opacity-50 cursor-not-allowed w-auto" disabled>
                                    {actionLabel}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
