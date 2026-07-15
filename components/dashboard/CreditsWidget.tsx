"use client";

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TechnicalBorder } from "@/components/landing/TechnicalBorder";
import { DollarSign, TrendingDown, AlertCircle } from 'lucide-react';

interface CreditsWidgetProps {
    orgSlug: string;
}

interface CreditsData {
    balance: number;
    lastUpdated: string;
    transactions: Array<{
        id: string;
        amount: number;
        type: string;
        description: string;
        createdAt: string;
    }>;
}

// Hook to fetch credits with caching
function useCredits(orgSlug: string) {
    return useQuery({
        queryKey: ["orgCredits", orgSlug],
        queryFn: async () => {
            const res = await fetch(`/api/organizations/${orgSlug}/credits`);
            if (!res.ok) throw new Error("Failed to fetch credits");
            return res.json() as Promise<CreditsData>;
        },
        staleTime: 30 * 1000, // 30 seconds
    });
}

export function CreditsWidget({ orgSlug }: CreditsWidgetProps) {
    // Fetch credits with caching - INSTANT ON REVISIT!
    const { data, isLoading } = useCredits(orgSlug);

    if (isLoading) {
        return (
            <TechnicalBorder cornerSize={16} borderWidth={2}>
                <Card className="border-0 shadow-none">
                    <CardHeader>
                        <Skeleton className="h-6 w-32" />
                        <Skeleton className="h-4 w-48 mt-2" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-16 w-full" />
                    </CardContent>
                </Card>
            </TechnicalBorder>
        );
    }

    const balance = data?.balance || 0;
    const isLow = balance < 5;
    const recentSpend = data?.transactions
        ?.filter(t => t.type === 'usage')
        .slice(0, 5)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0) || 0;

    return (
        <TechnicalBorder cornerSize={16} borderWidth={2} hoverEffect>
            <Card className="border-0 shadow-none">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Credits Balance</CardTitle>
                            <CardDescription>Prepaid AI usage credits</CardDescription>
                        </div>
                        <DollarSign className="h-5 w-5 text-muted-foreground" />
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <div className="text-3xl font-bold">${balance.toFixed(2)}</div>
                        {isLow && (
                            <div className="flex items-center gap-2 mt-2 text-sm text-orange-600 dark:text-orange-400">
                                <AlertCircle className="h-4 w-4" />
                                <span>Low balance - consider topping up</span>
                            </div>
                        )}
                    </div>

                    {recentSpend > 0 && (
                        <div className="pt-2 border-t">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Recent spend (last 5)</span>
                                <div className="flex items-center gap-1">
                                    <TrendingDown className="h-3 w-3 text-red-500" />
                                    <span className="font-medium">${recentSpend.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    <Button className="w-full rounded-none" variant="outline" onClick={() => window.location.href = `/${orgSlug}/~/billing`}>
                        Top Up Credits
                    </Button>
                </CardContent>
            </Card>
        </TechnicalBorder>
    );
}
