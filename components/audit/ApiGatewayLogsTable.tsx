'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiGatewayRequestDetailModal } from './ApiGatewayRequestDetailModal';
import { FileText } from 'lucide-react';
import { toast } from '@/components/ui/toast';

interface ApiGatewayRequestLog {
    id: string;
    request_id: string;
    created_at: string;
    endpoint: string;
    method: string;
    status_code: number;
    latency_ms: number;
    caller_origin?: string | null;
    client_app?: string | null;
    error_code?: string | null;
    error_message?: string | null;
    api_key_id: string;
    api_key_name: string;
    api_key_prefix: string;
}

interface ApiGatewayLogsTableProps {
    projectId: string;
    environment: 'production' | 'test';
    filters: {
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

function getDisplayDomain(value: string | null | undefined): string | null {
    if (!value) return null;

    const trimmed = value.trim();
    if (!trimmed) return null;

    try {
        const withScheme = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
        return new URL(withScheme).hostname;
    } catch {
        return trimmed.replace(/^https?:\/\//i, '').split('/')[0] || trimmed;
    }
}

function getFormattedErrorPart(request: ApiGatewayRequestLog): string | null {
    const errorCode = request.error_code?.trim();
    const errorMessage = request.error_message?.trim();

    if (!errorCode && !errorMessage) return null;

    const errorPart = `${errorCode || 'error'}: ${errorMessage || 'Request failed'}`;
    const maxErrorLength = 140;
    const trimmed =
        errorPart.length > maxErrorLength
            ? `${errorPart.slice(0, maxErrorLength).trimEnd()}...`
            : errorPart;

    return trimmed;
}

export function ApiGatewayLogsTable({ projectId, environment, filters }: ApiGatewayLogsTableProps) {
    const [requests, setRequests] = useState<ApiGatewayRequestLog[]>([]);
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
                environment,
                ...(filters.status && { status: filters.status }),
                ...(filters.method && { method: filters.method }),
                ...(filters.time_range && { time_range: filters.time_range }),
                ...(filters.search && { search: filters.search }),
                ...(filters.api_key_id && { api_key_id: filters.api_key_id }),
            });

            const response = await fetch(`/api/projects/${projectId}/logs/gateway?${params}`);
            if (!response.ok) throw new Error('Failed to fetch API gateway logs');

            const data = await response.json();
            setRequests((data.requests || []) as ApiGatewayRequestLog[]);
            setTotalPages(data.pagination?.total_pages || 1);
        } catch (error) {
            console.error('Error fetching API gateway logs:', error);
            toast.error('Failed to load API gateway logs');
        } finally {
            setLoading(false);
        }
    }, [projectId, environment, page, filters]);

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

    const handleRowClick = (requestId: string) => {
        setSelectedRequest(requestId);
        setIsModalOpen(true);
    };

    if (loading && requests.length === 0) {
        return (
            <div className="bg-card border border-border/40 rounded-md overflow-hidden">
                <div className="hidden md:block">
                    <div className="border-b border-border/40 px-4 py-2">
                        <div className="grid grid-cols-7 gap-4">
                            <Skeleton className="h-3 w-12" />
                            <Skeleton className="h-3 w-10" />
                            <Skeleton className="h-3 w-12" />
                            <Skeleton className="h-3 w-12" />
                            <Skeleton className="h-3 w-12" />
                            <Skeleton className="h-3 w-14" />
                            <Skeleton className="h-3 w-12 ml-auto" />
                        </div>
                    </div>
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="border-b border-border/40 px-4 py-3 last:border-b-0">
                            <div className="grid grid-cols-7 gap-4 items-center">
                                <Skeleton className="h-3 w-24" />
                                <Skeleton className="h-5 w-12" />
                                <Skeleton className="h-3 w-8" />
                                <Skeleton className="h-3 w-full" />
                                <Skeleton className="h-3 w-20" />
                                <Skeleton className="h-3 w-20" />
                                <Skeleton className="h-3 w-12 ml-auto" />
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
                            <div className="flex items-center justify-between">
                                <Skeleton className="h-3 w-16" />
                                <Skeleton className="h-3 w-24" />
                            </div>
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
                <p className="text-sm font-medium mb-1">No API gateway requests found</p>
                <p className="text-xs text-muted-foreground">
                    Try adjusting filters or call a `/v1/*` endpoint using your project API key
                    (`CENCORI_API_KEY` or `Authorization: Bearer ...`).
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
                                <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider h-8 px-3 w-[180px]">Timestamp</TableHead>
                                <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider h-8 w-[72px]">Status</TableHead>
                                <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider h-8 w-[72px]">Method</TableHead>
                                <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider h-8">Path</TableHead>
                                <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider h-8 w-[180px]">Caller</TableHead>
                                <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider h-8 w-[170px]">API Key</TableHead>
                                <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider h-8 text-right pr-3 w-[90px]">Latency</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {requests.map((request) => {
                                const callerRaw = request.client_app || request.caller_origin;
                                const callerDomain = getDisplayDomain(callerRaw);
                                const errorPart = getFormattedErrorPart(request);
                                const pathWithError = errorPart
                                    ? `${request.endpoint} | ${errorPart}`
                                    : request.endpoint;

                                return (
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
                                    <TableCell className="py-2 font-mono text-xs text-muted-foreground uppercase">
                                        {request.method}
                                    </TableCell>
                                    <TableCell className="py-2 font-mono text-xs text-muted-foreground">
                                        <span className="truncate block max-w-[520px]" title={pathWithError}>
                                            <span>{request.endpoint}</span>
                                            {errorPart && (
                                                <span className="text-destructive"> | {errorPart}</span>
                                            )}
                                        </span>
                                    </TableCell>
                                    <TableCell className="py-2 font-mono text-xs text-muted-foreground">
                                        <span className="truncate block max-w-[160px]" title={callerRaw || 'unknown'}>
                                            {callerDomain || '—'}
                                        </span>
                                    </TableCell>
                                    <TableCell className="py-2 font-mono text-xs text-muted-foreground">
                                        <span className="truncate block max-w-[150px]" title={`${request.api_key_name} (${request.api_key_prefix}...)`}>
                                            {request.api_key_name} ({request.api_key_prefix}...)
                                        </span>
                                    </TableCell>
                                    <TableCell className="py-2 text-right text-xs font-mono text-muted-foreground pr-3">
                                        {request.latency_ms}ms
                                    </TableCell>
                                </TableRow>
                            )})}
                        </TableBody>
                    </Table>
                </div>

                <div className="md:hidden divide-y divide-border/40">
                    {requests.map((request) => {
                        const callerRaw = request.client_app || request.caller_origin;
                        const callerDomain = getDisplayDomain(callerRaw);
                        const errorPart = getFormattedErrorPart(request);
                        const pathWithError = errorPart
                            ? `${request.endpoint} | ${errorPart}`
                            : request.endpoint;

                        return (
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
                            <p className="text-xs font-mono truncate mb-1.5" title={`${request.method} ${pathWithError}`}>
                                <span>{request.method} {request.endpoint}</span>
                                {errorPart && (
                                    <span className="text-destructive"> | {errorPart}</span>
                                )}
                            </p>
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                <span className="truncate max-w-[55%]">{callerDomain || request.api_key_name}</span>
                                <span className="font-mono">{request.latency_ms}ms</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate mt-1" title={`${request.api_key_name} (${request.api_key_prefix}...)`}>
                                {request.api_key_name} ({request.api_key_prefix}...)
                            </p>
                        </div>
                    )})}
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
                <ApiGatewayRequestDetailModal
                    projectId={projectId}
                    requestId={selectedRequest}
                    open={isModalOpen}
                    onOpenChange={setIsModalOpen}
                />
            )}
        </>
    );
}
