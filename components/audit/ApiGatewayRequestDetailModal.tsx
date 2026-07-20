'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Check, Copy } from 'lucide-react';
import { toast } from '@/components/ui/toast';

interface ApiKeyInfo {
    id: string;
    name: string;
    key_prefix: string;
    environment: string | null;
    created_at: string | null;
    revoked_at: string | null;
}

interface ApiGatewayRequestDetail {
    id: string;
    project_id: string;
    api_key_id: string;
    request_id: string;
    endpoint: string;
    method: string;
    status_code: number;
    latency_ms: number;
    environment: string | null;
    caller_origin: string | null;
    client_app: string | null;
    ip_address: string | null;
    country_code: string | null;
    user_agent: string | null;
    error_code: string | null;
    error_message: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
    api_key: ApiKeyInfo | null;
}

interface ApiGatewayRequestDetailModalProps {
    projectId: string;
    requestId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

function statusBadgeClass(statusCode: number): string {
    if (statusCode >= 200 && statusCode < 300) return 'bg-emerald-500/20 text-emerald-400';
    if (statusCode >= 300 && statusCode < 400) return 'bg-blue-500/20 text-blue-400';
    if (statusCode === 429) return 'bg-yellow-500/20 text-yellow-400';
    if (statusCode >= 400 && statusCode < 500) return 'bg-orange-500/20 text-orange-400';
    return 'bg-red-500/20 text-red-400';
}

function formatDate(dateString: string | null | undefined): string {
    if (!dateString) return '—';
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleString('en-US', { month: 'short' });
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `${month} ${day}, ${date.getFullYear()} ${time}`;
}

function FieldRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-4 py-1.5">
            <span className="text-[11px] text-muted-foreground">{label}</span>
            <span className="text-[11px] font-mono text-right break-all">{value}</span>
        </div>
    );
}

export function ApiGatewayRequestDetailModal({
    projectId,
    requestId,
    open,
    onOpenChange,
}: ApiGatewayRequestDetailModalProps) {
    const [detail, setDetail] = useState<ApiGatewayRequestDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [copiedField, setCopiedField] = useState<string | null>(null);

    const fetchDetail = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/logs/gateway/${requestId}`);
            if (!response.ok) throw new Error('Failed to fetch gateway request details');

            const data = (await response.json()) as ApiGatewayRequestDetail;
            setDetail(data);
        } catch (error) {
            console.error('Error fetching gateway request details:', error);
            toast.error('Failed to load API gateway request details');
        } finally {
            setLoading(false);
        }
    }, [projectId, requestId]);

    useEffect(() => {
        if (open && requestId) {
            void fetchDetail();
        }
    }, [open, requestId, fetchDetail]);

    const handleCopy = async (text: string, field: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedField(field);
            toast.success('Copied to clipboard');
            setTimeout(() => setCopiedField(null), 1500);
        } catch {
            toast.error('Failed to copy');
        }
    };

    const metadataText = useMemo(
        () => JSON.stringify(detail?.metadata ?? {}, null, 2),
        [detail?.metadata]
    );

    const rawPayloadText = useMemo(
        () => JSON.stringify(detail, null, 2),
        [detail]
    );

    if (loading || !detail) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-[640px] p-0 top-[8%] translate-y-0">
                    <div className="px-4 pt-4 pb-3 border-b border-border/40">
                        <div className="h-4 w-40 bg-secondary/80 rounded animate-pulse" />
                        <div className="h-3 w-64 bg-secondary/60 rounded animate-pulse mt-1.5" />
                    </div>
                    <div className="px-4 py-3 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="rounded-md border border-border/40 p-2.5">
                                    <div className="h-2.5 w-16 bg-secondary/60 rounded animate-pulse mb-1.5" />
                                    <div className="h-4 w-20 bg-secondary/80 rounded animate-pulse" />
                                </div>
                            ))}
                        </div>
                        <div className="h-36 rounded-md bg-secondary/40 animate-pulse" />
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[700px] p-0 top-[6%] translate-y-0 max-h-[86vh] overflow-hidden flex flex-col">
                <DialogHeader className="px-4 pt-4 pb-3 border-b border-border/40 shrink-0">
                    <DialogTitle className="flex items-center gap-2 text-sm font-medium">
                        API Gateway Request
                        <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-mono font-medium ${statusBadgeClass(detail.status_code)}`}>
                            {detail.status_code}
                        </span>
                    </DialogTitle>
                    <p className="text-[11px] text-muted-foreground font-mono truncate">
                        {formatDate(detail.created_at)} • {detail.method} {detail.endpoint}
                    </p>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                        <div className="rounded-md border border-border/40 p-2.5">
                            <p className="text-[10px] text-muted-foreground mb-0.5">Latency</p>
                            <p className="text-sm font-medium font-mono">{detail.latency_ms}ms</p>
                        </div>
                        <div className="rounded-md border border-border/40 p-2.5">
                            <p className="text-[10px] text-muted-foreground mb-0.5">Environment</p>
                            <p className="text-sm font-medium">{detail.environment || detail.api_key?.environment || '—'}</p>
                        </div>
                        <div className="rounded-md border border-border/40 p-2.5">
                            <p className="text-[10px] text-muted-foreground mb-0.5">Caller</p>
                            <p className="text-sm font-medium font-mono truncate" title={detail.client_app || detail.caller_origin || '—'}>
                                {detail.client_app || detail.caller_origin || '—'}
                            </p>
                        </div>
                        <div className="rounded-md border border-border/40 p-2.5">
                            <p className="text-[10px] text-muted-foreground mb-0.5">API Key</p>
                            <p className="text-sm font-medium font-mono truncate" title={`${detail.api_key?.name || 'Unknown'} (${detail.api_key?.key_prefix || 'unknown'}...)`}>
                                {detail.api_key?.key_prefix || 'unknown'}...
                            </p>
                        </div>
                    </div>

                    <Tabs defaultValue="overview" className="w-full">
                        <TabsList className="h-10 w-full justify-start gap-4 rounded-none border-b border-border/40 bg-transparent p-0">
                            <TabsTrigger
                                value="overview"
                                className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-4 text-xs font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                            >
                                Overview
                            </TabsTrigger>
                            <TabsTrigger
                                value="client"
                                className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-4 text-xs font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                            >
                                Client
                            </TabsTrigger>
                            <TabsTrigger
                                value="diagnostics"
                                className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-4 text-xs font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                            >
                                Diagnostics
                            </TabsTrigger>
                            <TabsTrigger
                                value="raw"
                                className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-4 text-xs font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                            >
                                Raw
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="overview" className="mt-3">
                            <div className="rounded-md border border-border/40 px-3 py-2">
                                <FieldRow label="Log ID" value={detail.id} />
                                <FieldRow label="Request ID" value={detail.request_id} />
                                <FieldRow label="Project ID" value={detail.project_id} />
                                <FieldRow label="Endpoint" value={detail.endpoint} />
                                <FieldRow label="Method" value={detail.method} />
                                <FieldRow label="Status Code" value={String(detail.status_code)} />
                                <FieldRow label="Latency" value={`${detail.latency_ms}ms`} />
                                <FieldRow label="Created At" value={detail.created_at} />
                                <FieldRow label="API Key ID" value={detail.api_key_id} />
                                <FieldRow label="API Key Name" value={detail.api_key?.name || 'Unknown'} />
                                <FieldRow label="API Key Prefix" value={detail.api_key?.key_prefix || 'unknown'} />
                                <FieldRow label="API Key Environment" value={detail.api_key?.environment || detail.environment || '—'} />
                                <FieldRow label="API Key Created At" value={formatDate(detail.api_key?.created_at)} />
                                <FieldRow label="API Key Revoked At" value={formatDate(detail.api_key?.revoked_at)} />
                            </div>
                        </TabsContent>

                        <TabsContent value="client" className="mt-3">
                            <div className="rounded-md border border-border/40 px-3 py-2">
                                <FieldRow label="Caller Origin" value={detail.caller_origin || '—'} />
                                <FieldRow label="Client App (X-Cencori-App)" value={detail.client_app || '—'} />
                                <FieldRow label="IP Address" value={detail.ip_address || '—'} />
                                <FieldRow label="Country Code" value={detail.country_code || '—'} />
                                <FieldRow label="User Agent" value={detail.user_agent || '—'} />
                            </div>
                        </TabsContent>

                        <TabsContent value="diagnostics" className="mt-3 space-y-3">
                            <div className="rounded-md border border-border/40 px-3 py-2">
                                <FieldRow label="Error Code" value={detail.error_code || '—'} />
                                <FieldRow label="Error Message" value={detail.error_message || '—'} />
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-medium">Metadata</h4>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => handleCopy(metadataText, 'metadata')}
                                    >
                                        {copiedField === 'metadata' ? (
                                            <Check className="h-3 w-3 text-emerald-500" />
                                        ) : (
                                            <Copy className="h-3 w-3" />
                                        )}
                                    </Button>
                                </div>
                                <pre className="rounded-md bg-secondary/50 p-3 text-[11px] font-mono whitespace-pre-wrap break-words max-h-[220px] overflow-y-auto">
                                    {metadataText}
                                </pre>
                            </div>
                        </TabsContent>

                        <TabsContent value="raw" className="mt-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-medium">Raw Log</h4>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => handleCopy(rawPayloadText, 'raw')}
                                >
                                    {copiedField === 'raw' ? (
                                        <Check className="h-3 w-3 text-emerald-500" />
                                    ) : (
                                        <Copy className="h-3 w-3" />
                                    )}
                                </Button>
                            </div>
                            <pre className="rounded-md bg-secondary/50 p-3 text-[11px] font-mono whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto">
                                {rawPayloadText}
                            </pre>
                        </TabsContent>
                    </Tabs>
                </div>
            </DialogContent>
        </Dialog>
    );
}
