"use client";

import React, { useState, use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useProjectIdBySlug } from '@/lib/hooks/useQueries';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight, CheckCircle2, XCircle, ShieldAlert } from 'lucide-react';

interface AIRequest {
    id: string;
    model: string;
    status: 'success' | 'error' | 'filtered';
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost_usd: string;
    latency_ms: number;
    created_at: string;
    error_message?: string;
}

interface PageProps {
    params: Promise<{ orgSlug: string; projectSlug: string }>;
}

function useAILogs(projectId: string | undefined, page: number) {
    return useQuery({
        queryKey: ["aiLogs", projectId, page],
        queryFn: async () => {
            const response = await fetch(`/api/projects/${projectId}/ai/logs?page=${page}&limit=20`);
            if (!response.ok) throw new Error('Failed to fetch logs');
            const data = await response.json();
            return {
                logs: (data.logs || []) as AIRequest[],
                totalPages: data.pagination?.totalPages || 1,
            };
        },
        enabled: !!projectId,
        staleTime: 15 * 1000,
    });
}

export default function AILogsPage({ params }: PageProps) {
    const { orgSlug, projectSlug } = use(params);
    const [page, setPage] = useState(1);

    const { data: projectId, isLoading: isProjectLoading } = useProjectIdBySlug(orgSlug, projectSlug);
    const { data: logsData, isLoading: isLogsLoading } = useAILogs(projectId, page);
    const isLoading = isProjectLoading || isLogsLoading;
    const logs = logsData?.logs || [];
    const totalPages = logsData?.totalPages || 1;

    function getStatusIcon(status: string) {
        switch (status) {
            case 'success':
                return <CheckCircle2 className="h-4 w-4 text-green-500" />;
            case 'error':
                return <XCircle className="h-4 w-4 text-red-500" />;
            case 'filtered':
                return <ShieldAlert className="h-4 w-4 text-yellow-500" />;
            default:
                return null;
        }
    }

    function getStatusBadge(status: string) {
        const variants: Record<string, 'default' | 'destructive' | 'outline' | 'secondary'> = {
            success: 'default',
            error: 'destructive',
            filtered: 'outline',
        };

        return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>;
    }

    return (
        <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">AI Request Logs</h1>
                    <p className="text-muted-foreground">Detailed history of all AI API requests</p>
                </div>
                <Link
                    href={`/${orgSlug}/${projectSlug}/ai`}
                    className="text-sm text-primary hover:underline"
                >
                    ← Back to dashboard
                </Link>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Recent Requests</CardTitle>
                    <CardDescription>Last 20 AI requests</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-3">
                            {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            No AI requests yet. Start using the AI API to see logs here.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {logs.map((log) => (
                                <div
                                    key={log.id}
                                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                                >
                                    <div className="flex items-center gap-4 flex-1">
                                        {getStatusIcon(log.status)}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-mono text-sm">{log.model}</span>
                                                {getStatusBadge(log.status)}
                                            </div>
                                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                                <span>{log.total_tokens.toLocaleString()} tokens</span>
                                                <span>${parseFloat(log.cost_usd).toFixed(6)}</span>
                                                <span>{log.latency_ms}ms</span>
                                                <span>{new Date(log.created_at).toLocaleString()}</span>
                                            </div>
                                            {log.error_message && (
                                                <p className="text-xs text-destructive mt-1 truncate">
                                                    Error: {log.error_message}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {totalPages > 1 && (
                        <div className="flex items-center justify-between mt-6">
                            <p className="text-sm text-muted-foreground">
                                Page {page} of {totalPages}
                            </p>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                    Previous
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page === totalPages}
                                >
                                    Next
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
