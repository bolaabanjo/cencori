'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { WebRequestDetailModal } from './WebRequestDetailModal';
import { FileText } from 'lucide-react';
import { toast } from '@/components/ui/toast';

interface WebRequestLog {
    id: string;
    request_id: string;
    created_at: string;
    host: string;
    method: string;
    path: string;
    query_string?: string | null;
    status_code: number;
    message?: string | null;
}

interface WebRequestLogsTableProps {
    projectId: string;
    filters: {
        status?: string;
        method?: string;
        time_range?: string;
        search?: string;
    };
}

function statusBadgeClass(statusCode: number): string {
    if (statusCode >= 200 && statusCode < 300) return 'bg-emerald-500/20 text-emerald-400';
    if (statusCode >= 300 && statusCode < 400) return 'bg-blue-500/20 text-blue-400';
    if (statusCode === 429) return 'bg-yellow-500/20 text-yellow-400';
    if (statusCode >= 400 && statusCode < 500) return 'bg-orange-500/20 text-orange-400';
    return 'bg-red-500/20 text-red-400';
}

export function WebRequestLogsTable({ projectId, filters }: WebRequestLogsTableProps) {
    const [requests, setRequests] = useState<WebRequestLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                per_page: '50',
                ...(filters.status && { status: filters.status }),
                ...(filters.method && { method: filters.method }),
                ...(filters.time_range && { time_range: filters.time_range }),
                ...(filters.search && { search: filters.search }),
            });

            const response = await fetch(`/api/projects/${projectId}/logs/web?${params}`);
            if (!response.ok) throw new Error('Failed to fetch web gateway logs');

            const data = await response.json();
            setRequests((data.requests || []) as WebRequestLog[]);
            setTotalPages(data.pagination?.total_pages || 1);
        } catch (error) {
            console.error('Error fetching web gateway logs:', error);
            toast.error('Failed to load web gateway logs');
        } finally {
            setLoading(false);
        }
    }, [projectId, page, filters]);

    useEffect(() => {
        setPage(1);
    }, [filters]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const formatDate = (dateString: string) => {
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
    };

    const formatRequestPath = (log: WebRequestLog) => {
        const query = log.query_string ? `?${log.query_string}` : '';
        return `${log.path}${query}`;
    };

    const handleRowClick = (requestId: string) => {
        setSelectedRequest(requestId);
        setIsModalOpen(true);
    };

    if (loading && requests.length === 0) {
        return (
            <div className="bg-card border border-border/40 rounded-md overflow-hidden">
                <div className="hidden md:block">
                    <div className="border-b border-border/40 px-4 py-2">
                        <div className="grid grid-cols-5 gap-4">
                            <Skeleton className="h-3 w-12" />
                            <Skeleton className="h-3 w-10" />
                            <Skeleton className="h-3 w-10" />
                            <Skeleton className="h-3 w-14" />
                            <Skeleton className="h-3 w-14" />
                        </div>
                    </div>
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="border-b border-border/40 px-4 py-3 last:border-b-0">
                            <div className="grid grid-cols-5 gap-4 items-center">
                                <Skeleton className="h-3 w-28" />
                                <Skeleton className="h-5 w-12" />
                                <Skeleton className="h-3 w-20" />
                                <Skeleton className="h-3 w-full" />
                                <Skeleton className="h-3 w-full" />
                            </div>
                        </div>
                    ))}
                </div>

                <div className="md:hidden divide-y divide-border/40">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="p-3">
                            <div className="flex items-start justify-between mb-1.5">
                                <Skeleton className="h-5 w-12" />
                                <Skeleton className="h-3 w-20" />
                            </div>
                            <Skeleton className="h-3 w-full mb-1.5" />
                            <Skeleton className="h-3 w-full" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (requests.length === 0) {
        return (
            <div className="text-center py-16 flex flex-col items-center justify-center">
                <div className="w-10 h-10 rounded-md bg-secondary flex items-center justify-center mb-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium mb-1">No web traffic logged yet</p>
                <p className="text-xs text-muted-foreground mb-4 max-w-sm">
                    Integrate the Cencori SDK in your app to see real web traffic from your domain here.
                </p>
                <code className="text-[11px] text-muted-foreground bg-secondary/60 rounded-md px-3 py-2 mb-4 block max-w-xs text-left">
                    {`await cencori.telemetry\n  .reportWebRequest({ ... })`}
                </code>
                <a
                    href="https://cencori.com/docs/ai/observability#web-telemetry"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                >
                    View integration guide →
                </a>
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
                                <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider h-8 w-[85px]">Status</TableHead>
                                <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider h-8 w-[170px]">Host</TableHead>
                                <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider h-8">Request</TableHead>
                                <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider h-8">Messages</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {requests.map((request) => (
                                <TableRow
                                    key={request.id}
                                    className="cursor-pointer hover:bg-muted/50 border-b border-border/40 last:border-b-0 transition-colors"
                                    onClick={() => handleRowClick(request.id)}
                                >
                                    <TableCell className="py-2 px-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                                        {formatDate(request.created_at)}
                                    </TableCell>
                                    <TableCell className="py-2">
                                        <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-mono font-medium ${statusBadgeClass(request.status_code)}`}>
                                            {request.status_code}
                                        </span>
                                    </TableCell>
                                    <TableCell className="py-2 font-mono text-xs text-muted-foreground">
                                        <span className="truncate block max-w-[150px]" title={request.host}>
                                            {request.host}
                                        </span>
                                    </TableCell>
                                    <TableCell className="py-2 font-mono text-xs text-muted-foreground">
                                        <span className="truncate block max-w-[420px]" title={`${request.method} ${formatRequestPath(request)}`}>
                                            {request.method} {formatRequestPath(request)}
                                        </span>
                                    </TableCell>
                                    <TableCell className="py-2 font-mono text-xs text-muted-foreground">
                                        <span className="truncate block max-w-[380px]" title={request.message || '-'}>
                                            {request.message || '-'}
                                        </span>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                <div className="md:hidden divide-y divide-border/40">
                    {requests.map((request) => (
                        <div
                            key={request.id}
                            className="p-3 cursor-pointer hover:bg-secondary/30 active:bg-secondary/50 transition-colors"
                            onClick={() => handleRowClick(request.id)}
                        >
                            <div className="flex items-start justify-between mb-1.5">
                                <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-mono font-medium ${statusBadgeClass(request.status_code)}`}>
                                    {request.status_code}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                    {formatDate(request.created_at)}
                                </span>
                            </div>
                            <p className="text-xs font-mono truncate mb-1.5" title={`${request.method} ${formatRequestPath(request)}`}>
                                {request.method} {formatRequestPath(request)}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate mb-1" title={request.host}>
                                {request.host}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate" title={request.message || '-'}>
                                {request.message || '-'}
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
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1 || loading}
                    >
                        Previous
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages || loading}
                    >
                        Next
                    </Button>
                </div>
            </div>

            {selectedRequest && (
                <WebRequestDetailModal
                    projectId={projectId}
                    requestId={selectedRequest}
                    open={isModalOpen}
                    onOpenChange={setIsModalOpen}
                />
            )}
        </>
    );
}
