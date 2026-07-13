"use client";

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TechnicalBorder } from "@/components/landing/TechnicalBorder";
import { Cpu, Zap, Settings } from 'lucide-react';
import Link from 'next/link';

interface ProvidersOverviewProps {
    orgSlug: string;
}

// Hook to fetch provider count with caching
function useProviderCount(orgSlug: string) {
    return useQuery({
        queryKey: ["orgProvidersCount", orgSlug],
        queryFn: async () => {
            const res = await fetch(`/api/organizations/${orgSlug}/providers`);
            if (!res.ok) return 0;
            const data = await res.json();
            return (data.providers?.length || 0) as number;
        },
        staleTime: 30 * 1000, // 30 seconds
    });
}

export function ProvidersOverview({ orgSlug }: ProvidersOverviewProps) {
    // Fetch provider count with caching - INSTANT ON REVISIT!
    const { data: providerCount = 0, isLoading } = useProviderCount(orgSlug);

    const coreProviders = [
        { name: 'OpenAI', models: 'GPT-4, GPT-3.5', icon: Zap },
        { name: 'Anthropic', models: 'Claude 3', icon: Cpu },
        { name: 'Google', models: 'Gemini 2.5', icon: Zap },
    ];

    return (
        <TechnicalBorder cornerSize={16} borderWidth={2} hoverEffect>
            <Card className="border-0 shadow-none">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>AI Providers</CardTitle>
                            <CardDescription>Multi-model support enabled</CardDescription>
                        </div>
                        <Link href={`/${orgSlug}/~/providers`}>
                            <Settings className="h-5 w-5 text-muted-foreground hover:text-foreground cursor-pointer" />
                        </Link>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    {coreProviders.map((provider) => (
                        <div key={provider.name} className="flex items-center justify-between py-2">
                            <div className="flex items-center gap-3">
                                <provider.icon className="h-4 w-4 text-primary" />
                                <div>
                                    <div className="font-medium text-sm">{provider.name}</div>
                                    <div className="text-xs text-muted-foreground">{provider.models}</div>
                                </div>
                            </div>
                            <Badge variant="default" className="rounded-none text-xs">Active</Badge>
                        </div>
                    ))}

                    {isLoading ? (
                        <div className="pt-2 border-t">
                            <div className="flex items-center justify-between text-sm">
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-5 w-8" />
                            </div>
                        </div>
                    ) : providerCount > 0 && (
                        <div className="pt-2 border-t">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Custom providers</span>
                                <Badge variant="secondary" className="rounded-none">{providerCount}</Badge>
                            </div>
                        </div>
                    )}

                    <Link href={`/${orgSlug}/~/providers`} className="block pt-2">
                        <div className="text-sm text-primary hover:underline cursor-pointer">
                            Manage providers →
                        </div>
                    </Link>
                </CardContent>
            </Card>
        </TechnicalBorder>
    );
}
