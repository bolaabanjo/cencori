'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiGatewayRequestDetailModal } from './ApiGatewayRequestDetailModal';
import { WebRequestDetailModal } from './WebRequestDetailModal';
import { FileText } from 'lucide-react';
import { toast } from '@/components/ui/toast';

type HttpLogKind = 'api' | 'web';

interface HttpRequestLog {
    id: string;
    request_id: string;
    created_at: string;
    kind: HttpLogKind;
    method: string;
    status_code: number;
    target: string;
    origin: string | null;
    context: string | null;
    latency_ms: number | null;
}

interface HttpRequestLogsTableProps {
    projectId?: string;
    environment: 'production' | 'test';
    filters: {
        kind?: string;
        status?: string;
        method?: string;
        time_range?: string;
        search?: string;
        api_key_id?: string;
    };
}

function statusBadgeClass(statusCode: number): string {
    if (statusCode >= 200 && statusCode < 300) return 'bg-emerald-500/20 text-emerald-400';
    if (statusCode >= 300 && statusCode < 400) return 'bg-blue-500/20 text-blue-400';
    if (statusCode === 429) return 'bg-yellow-500/20 text-yellow-400';
    if (statusCode >= 400 && statusCode < 500) return 'bg-orange-500/20 text-orange-400';
    return 'bg-red-500/20 text-red-400';
}

function kindBadgeClass(kind: HttpLogKind): string {
    return kind === 'api'
        ? 'bg-cyan-500/15 text-cyan-400'
        : 'bg-emerald-500/15 text-emerald-400';
}

function formatDate(dateString: string) {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'short' });
    const year = date.getFullYear().toString().slice(-2);
    const time = date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
    return `${day} ${month} ${year} ${time}`;
}

export function HttpRequestLogsTable({ projectId, environment, filters }: HttpRequestLogsTableProps) {
    const [requests, setRequests] = useState<HttpRequestLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [selectedRequest, setSelectedRequest] = useState<{ id: string; kind: HttpLogKind } | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fetchLogs = useCallback(async () => {
        if (!projectId) {
            setLoading(true);
            return;
        }
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                per_page: '50',
                environment,
                ...(filters.kind && { kind: filters.kind }),
                ...(filters.status && { status: filters.status }),
                ...(filters.method && { method: filters.method }),
                ...(filters.time_range && { time_range: filters.time_range }),
                ...(filters.search && { search: filters.search }),
                ...(filters.api_key_id && { api_key_id: filters.api_key_id }),
            });

            const response = await fetch(`/api/projects/${projectId}/logs/http?${params}`);
            if (!response.ok) throw new Error('Failed to fetch HTTP traffic logs');

            const data = await response.json();
            setRequests((data.requests || []) as HttpRequestLog[]);
            setTotalPages(data.pagination?.total_pages || 1);
        } catch (error) {
            console.error('Error fetching HTTP traffic logs:', error);
            toast.error('Failed to load HTTP traffic logs');
        } finally {
            setLoading(false);
        }
    }, [projectId, environment, page, filters]);

    useEffect(() => {
        setPage(1);
    }, [filters]);

    useEffect(() => {
        if (projectId) void fetchLogs();
    }, [fetchLogs, projectId]);

    const handleRowClick = (requestId: string, kind: HttpLogKind) => {
        setSelectedRequest({ id: requestId, kind });
        setIsModalOpen(true);
    };

    if (loading && requests.length === 0) {
        return (
            <div className="bg-card border border-border/40 rounded-md overflow-hidden">
                <div className="hidden md:block">
                    <div className="border-b border-border/40 px-4 py-2">
                        <div className="grid grid-cols-8 gap-4">
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                                <Skeleton key={i} className="h-3 w-12" />
                            ))}
                        </div>
                    </div>
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="border-b border-border/40 px-4 py-3 last:border-b-0">
                            <div className="grid grid-cols-8 gap-4 items-center">
                                <Skeleton className="h-3 w-28" />
                                <Skeleton className="h-5 w-12" />
                                <Skeleton className="h-5 w-14" />
                                <Skeleton className="h-3 w-10" />
                                <Skeleton className="h-3 w-full" />
                                <Skeleton className="h-3 w-24" />
                                <Skeleton className="h-3 w-full" />
                                <Skeleton className="h-3 w-12 ml-auto" />
                            </div>
                        </div>
                    ))}
                </div>

                <div className="md:hidden divide-y divide-border/40">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="p-3">
                            <div className="flex items-start justify-between mb-1.5">
                                <div className="flex items-center gap-2">
                                    <Skeleton className="h-5 w-12" />
                                    <Skeleton className="h-5 w-12" />
                                </div>
                                <Skeleton className="h-3 w-20" />
                            </div>
                            <Skeleton className="h-3 w-full mb-1.5" />
                            <Skeleton className="h-3 w-32 mb-1.5" />
                            <Skeleton className="h-3 w-full" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (requests.length === 0) {
        const emptyTitle = filters.kind === 'api'
            ? 'No API requests found'
            : filters.kind === 'web'
                ? 'No web requests found'
                : 'No HTTP traffic found';

        return (
            <div className="text-center py-16 flex flex-col items-center justify-center">
                <div className="w-10 h-10 rounded-md bg-secondary flex items-center justify-center mb-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium mb-1">{emptyTitle}</p>
                <p className="text-xs text-muted-foreground max-w-sm">
                    Try adjusting the filters or send API and app traffic through this project to populate the unified HTTP plane.
                </p>
            </div>
        );
    }

    return (
        <>
            <div className="bg-card border border-border/40 rounded-md overflow-hidden">
                <div className="hidden md:block overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent border-b border-border/40">
                                <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider h-8 px-3 w-[170px]">Time</TableHead>
                                <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider h-8 w-[80px]">Type</TableHead>
                                <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider h-8 w-[72px]">Status</TableHead>
                                <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider h-8 w-[72px]">Method</TableHead>
                                <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider h-8">Request</TableHead>
                                <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider h-8 w-[190px]">Origin</TableHead>
                                <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider h-8 w-[220px]">Context</TableHead>
                                <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider h-8 text-right pr-3 w-[90px]">Latency</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {requests.map((request) => (
                                <TableRow
                                    key={`${request.kind}-${request.id}`}
                                    className="cursor-pointer hover:bg-muted/50 border-b border-border/40 last:border-b-0 transition-colors"
                                    onClick={() => handleRowClick(request.id, request.kind)}
                                >
                                    <TableCell className="py-2 px-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                                        {formatDate(request.created_at)}
                                    </TableCell>
                                    <TableCell className="py-2">
                                        <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-mono font-medium uppercase ${kindBadgeClass(request.kind)}`}>
                                            {request.kind}
                                        </span>
                                    </TableCell>
                                    <TableCell className="py-2">
                                        <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-mono font-medium ${statusBadgeClass(request.status_code)}`}>
                                            {request.status_code}
                                        </span>
                                    </TableCell>
                                    <TableCell className="py-2 font-mono text-xs text-muted-foreground uppercase">
                                        {request.method}
                                    </TableCell>
                                    <TableCell className="py-2 font-mono text-xs text-muted-foreground">
                                        <span className="truncate block max-w-[420px]" title={request.target}>
                                            {request.target}
                                        </span>
                                    </TableCell>
                                    <TableCell className="py-2 font-mono text-xs text-muted-foreground">
                                        <span className="truncate block max-w-[180px]" title={request.origin || '—'}>
                                            {request.origin || '—'}
                                        </span>
                                    </TableCell>
                                    <TableCell className="py-2 font-mono text-xs text-muted-foreground">
                                        <span className="truncate block max-w-[210px]" title={request.context || '—'}>
                                            {request.context || '—'}
                                        </span>
                                    </TableCell>
                                    <TableCell className="py-2 text-right text-xs font-mono text-muted-foreground pr-3">
                                        {request.latency_ms !== null ? `${request.latency_ms}ms` : '—'}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                <div className="md:hidden divide-y divide-border/40">
                    {requests.map((request) => (
                        <div
                            key={`${request.kind}-${request.id}`}
                            className="p-3 cursor-pointer hover:bg-secondary/30 active:bg-secondary/50 transition-colors"
                            onClick={() => handleRowClick(request.id, request.kind)}
                        >
                            <div className="flex items-start justify-between mb-1.5 gap-3">
                                <div className="flex items-center gap-2">
                                    <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-mono font-medium uppercase ${kindBadgeClass(request.kind)}`}>
                                        {request.kind}
                                    </span>
                                    <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-mono font-medium ${statusBadgeClass(request.status_code)}`}>
                                        {request.status_code}
                                    </span>
                                </div>
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                    {formatDate(request.created_at)}
                                </span>
                            </div>
                            <p className="text-xs font-mono truncate mb-1.5" title={`${request.method} ${request.target}`}>
                                {request.method} {request.target}
                            </p>
                            <div className="flex items-center justify-between gap-3 text-[10px] text-muted-foreground mb-1">
                                <span className="truncate">{request.origin || '—'}</span>
                                <span className="font-mono whitespace-nowrap">
                                    {request.latency_ms !== null ? `${request.latency_ms}ms` : '—'}
                                </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate" title={request.context || '—'}>
                                {request.context || '—'}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex items-center justify-between py-3">
                <p className="text-xs text-muted-foreground">
                    Page {page} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                        disabled={page === 1 || loading}
                    >
                        Previous
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
                        disabled={page === totalPages || loading}
                    >
                        Next
                    </Button>
                </div>
            </div>

            {projectId && selectedRequest?.kind === 'api' && (
                <ApiGatewayRequestDetailModal
                    projectId={projectId}
                    requestId={selectedRequest.id}
                    open={isModalOpen}
                    onOpenChange={setIsModalOpen}
                />
            )}

            {projectId && selectedRequest?.kind === 'web' && (
                <WebRequestDetailModal
                    projectId={projectId}
                    requestId={selectedRequest.id}
                    open={isModalOpen}
                    onOpenChange={setIsModalOpen}
                />
            )}
        </>
    );
}
