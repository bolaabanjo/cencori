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

interface WebRequestDetail {
    id: string;
    project_id: string;
    organization_id: string;
    request_id: string;
    host: string;
    method: string;
    path: string;
    query_string: string | null;
    status_code: number;
    message: string | null;
    user_agent: string | null;
    referer: string | null;
    ip_address: string | null;
    country_code: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
    derived: {
        full_url: string;
        org_slug: string | null;
        project_slug: string | null;
        query_params: Array<{ key: string; value: string }>;
        query_count: number;
        protocol: string | null;
        runtime_source: string | null;
        runtime_env: string | null;
        accept: string | null;
        accept_language: string | null;
        sec_fetch_site: string | null;
        sec_fetch_mode: string | null;
        sec_fetch_dest: string | null;
        vercel_request_id: string | null;
        vercel_deployment_url: string | null;
        vercel_ip_city: string | null;
        vercel_ip_region: string | null;
        vercel_ip_continent: string | null;
    };
}

interface WebRequestDetailModalProps {
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
    return date.toLocaleString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZoneName: 'short',
    });
}

function DenseRow({
    label,
    value,
    monospace = true,
}: {
    label: string;
    value: string;
    monospace?: boolean;
}) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-[170px_minmax(0,1fr)] gap-1.5 md:gap-3 px-3 py-2 border-b border-border/40 last:border-b-0">
            <span className="text-[11px] text-muted-foreground">{label}</span>
            <span className={`text-[11px] break-words ${monospace ? 'font-mono' : ''}`}>{value || '—'}</span>
        </div>
    );
}

function hasValue(value: string | null | undefined): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

export function WebRequestDetailModal({
    projectId,
    requestId,
    open,
    onOpenChange,
}: WebRequestDetailModalProps) {
    const [detail, setDetail] = useState<WebRequestDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [copiedField, setCopiedField] = useState<string | null>(null);

    const fetchDetail = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/logs/web/${requestId}`);
            if (!response.ok) throw new Error('Failed to fetch web request details');

            const data = (await response.json()) as WebRequestDetail;
            setDetail(data);
        } catch (error) {
            console.error('Error fetching web request details:', error);
            toast.error('Failed to load Web Gateway request details');
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

    const requestSummary = useMemo(() => {
        if (!detail) return null;

        return {
            request_id: detail.request_id,
            method: detail.method,
            status_code: detail.status_code,
            host: detail.host,
            path: detail.path,
            query_string: detail.query_string,
            full_url: detail.derived.full_url,
            message: detail.message,
            user_agent: detail.user_agent,
            referer: detail.referer,
            ip_address: detail.ip_address,
            country_code: detail.country_code,
            created_at: detail.created_at,
            runtime: {
                source: detail.derived.runtime_source,
                env: detail.derived.runtime_env,
                protocol: detail.derived.protocol,
            },
            scope: {
                org_slug: detail.derived.org_slug,
                project_slug: detail.derived.project_slug,
                query_count: detail.derived.query_count,
            },
            vercel: {
                request_id: detail.derived.vercel_request_id,
                deployment_url: detail.derived.vercel_deployment_url,
                ip_city: detail.derived.vercel_ip_city,
                ip_region: detail.derived.vercel_ip_region,
                ip_continent: detail.derived.vercel_ip_continent,
            },
            headers: {
                accept: detail.derived.accept,
                accept_language: detail.derived.accept_language,
                sec_fetch_site: detail.derived.sec_fetch_site,
                sec_fetch_mode: detail.derived.sec_fetch_mode,
                sec_fetch_dest: detail.derived.sec_fetch_dest,
            },
            query_params: detail.derived.query_params,
        };
    }, [detail]);

    const summaryText = useMemo(
        () => JSON.stringify(requestSummary ?? {}, null, 2),
        [requestSummary]
    );

    const rawText = useMemo(
        () => JSON.stringify(detail ?? {}, null, 2),
        [detail]
    );

    const platformRows = useMemo(() => {
        if (!detail) return [];

        return [
            { label: 'Request ID', value: detail.derived.vercel_request_id },
            { label: 'Deployment URL', value: detail.derived.vercel_deployment_url },
            { label: 'Edge City', value: detail.derived.vercel_ip_city },
            { label: 'Edge Region', value: detail.derived.vercel_ip_region },
            { label: 'Edge Continent', value: detail.derived.vercel_ip_continent },
        ].filter((row) => hasValue(row.value));
    }, [detail]);

    if (loading || !detail) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-[920px] p-0 top-[4%] translate-y-0">
                    <div className="px-4 pt-4 pb-3 border-b border-border/40">
                        <div className="h-4 w-56 bg-secondary/80 rounded animate-pulse" />
                        <div className="h-3 w-80 bg-secondary/60 rounded animate-pulse mt-1.5" />
                    </div>
                    <div className="px-4 py-3 space-y-3">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="rounded-md border border-border/40">
                                <div className="h-8 border-b border-border/40 px-3 flex items-center">
                                    <div className="h-3 w-24 bg-secondary/60 rounded animate-pulse" />
                                </div>
                                <div className="p-3 space-y-2">
                                    {[1, 2, 3].map((row) => (
                                        <div key={row} className="h-3 bg-secondary/40 rounded animate-pulse" />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[980px] p-0 top-[4%] translate-y-0 max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader className="px-4 pt-4 pb-3 border-b border-border/40 shrink-0">
                    <DialogTitle className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        <span className="inline-flex items-center gap-2 font-mono">
                            {detail.method}
                            <span className="max-w-[640px] truncate">{detail.path}</span>
                        </span>
                        <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-mono font-medium ${statusBadgeClass(detail.status_code)}`}>
                            {detail.status_code}
                        </span>
                    </DialogTitle>
                    <p className="text-[11px] text-muted-foreground font-mono truncate">
                        {formatDate(detail.created_at)} • {detail.host}
                    </p>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                    <section className="rounded-md border border-border/40 overflow-hidden">
                        <div className="h-8 px-3 border-b border-border/40 bg-secondary/10 flex items-center justify-between">
                            <h3 className="text-xs font-medium">Request Started</h3>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleCopy(summaryText, 'summary')}
                            >
                                {copiedField === 'summary' ? (
                                    <Check className="h-3 w-3 text-emerald-500" />
                                ) : (
                                    <Copy className="h-3 w-3" />
                                )}
                            </Button>
                        </div>
                        <DenseRow label="Request ID" value={detail.request_id} />
                        <DenseRow label="Full URL" value={detail.derived.full_url} />
                        <DenseRow label="Path" value={detail.path} />
                        <DenseRow label="Host" value={detail.host} />
                        <DenseRow label="Method" value={detail.method} />
                        <DenseRow label="Query String" value={detail.query_string || '—'} />
                        <DenseRow label="Message" value={detail.message || '—'} monospace={false} />

                        <div className="px-3 py-2 border-t border-border/40">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] text-muted-foreground">Search Params</span>
                                <span className="text-[10px] font-mono text-muted-foreground">
                                    {detail.derived.query_count} param{detail.derived.query_count === 1 ? '' : 's'}
                                </span>
                            </div>

                            {detail.derived.query_params.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                    {detail.derived.query_params.map((param, index) => (
                                        <span
                                            key={`${param.key}-${index}`}
                                            className="inline-flex items-center rounded border border-border/60 bg-secondary/40 px-2 py-1 text-[11px] font-mono"
                                        >
                                            <span className="text-muted-foreground">{param.key}</span>
                                            <span className="mx-1 text-muted-foreground/60">=</span>
                                            <span>{param.value}</span>
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-[11px] text-muted-foreground">No query parameters</p>
                            )}
                        </div>
                    </section>

                    <section className="rounded-md border border-border/40 overflow-hidden">
                        <div className="h-8 px-3 border-b border-border/40 bg-secondary/10 flex items-center">
                            <h3 className="text-xs font-medium">Client & Network</h3>
                        </div>
                        <DenseRow label="User Agent" value={detail.user_agent || '—'} />
                        <DenseRow label="Referer" value={detail.referer || '—'} />
                        <DenseRow label="IP Address" value={detail.ip_address || '—'} />
                        <DenseRow label="Country" value={detail.country_code || '—'} />
                        <DenseRow label="Protocol" value={detail.derived.protocol || '—'} />
                        <DenseRow label="Accept-Language" value={detail.derived.accept_language || '—'} />
                        <DenseRow label="Sec-Fetch-Site" value={detail.derived.sec_fetch_site || '—'} />
                        <DenseRow label="Sec-Fetch-Mode" value={detail.derived.sec_fetch_mode || '—'} />
                        <DenseRow label="Sec-Fetch-Dest" value={detail.derived.sec_fetch_dest || '—'} />
                    </section>

                    <section className="rounded-md border border-border/40 overflow-hidden">
                        <div className="h-8 px-3 border-b border-border/40 bg-secondary/10 flex items-center">
                            <h3 className="text-xs font-medium">Routing & Runtime</h3>
                        </div>
                        <DenseRow label="Organization Slug" value={detail.derived.org_slug || '—'} />
                        <DenseRow label="Project Slug" value={detail.derived.project_slug || '—'} />
                        <DenseRow label="Runtime Source" value={detail.derived.runtime_source || '—'} />
                        <DenseRow label="Runtime Env" value={detail.derived.runtime_env || '—'} />
                        {platformRows.map((row) => (
                            <DenseRow key={row.label} label={row.label} value={row.value || '—'} />
                        ))}
                    </section>

                    <section className="rounded-md border border-border/40 overflow-hidden">
                        <Tabs defaultValue="summary" className="w-full">
                            <TabsList className="h-10 w-full justify-start gap-4 rounded-none border-b border-border/40 bg-transparent p-0 px-3">
                                <TabsTrigger
                                    value="summary"
                                    className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-4 text-xs font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                                >
                                    Summary JSON
                                </TabsTrigger>
                                <TabsTrigger
                                    value="metadata"
                                    className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-4 text-xs font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                                >
                                    Metadata JSON
                                </TabsTrigger>
                                <TabsTrigger
                                    value="raw"
                                    className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-4 text-xs font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                                >
                                    Raw Log
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="summary" className="mt-3 px-3 pb-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-medium">Summary JSON</h4>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => handleCopy(summaryText, 'summary-json')}
                                    >
                                        {copiedField === 'summary-json' ? (
                                            <Check className="h-3 w-3 text-emerald-500" />
                                        ) : (
                                            <Copy className="h-3 w-3" />
                                        )}
                                    </Button>
                                </div>
                                <pre className="rounded-md bg-secondary/50 p-3 text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-words max-h-[280px] overflow-y-auto">
                                    {summaryText}
                                </pre>
                            </TabsContent>

                            <TabsContent value="metadata" className="mt-3 px-3 pb-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-medium">Metadata JSON</h4>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => handleCopy(metadataText, 'metadata-json')}
                                    >
                                        {copiedField === 'metadata-json' ? (
                                            <Check className="h-3 w-3 text-emerald-500" />
                                        ) : (
                                            <Copy className="h-3 w-3" />
                                        )}
                                    </Button>
                                </div>
                                <pre className="rounded-md bg-secondary/50 p-3 text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-words max-h-[280px] overflow-y-auto">
                                    {metadataText}
                                </pre>
                            </TabsContent>

                            <TabsContent value="raw" className="mt-3 px-3 pb-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-medium">Raw Log</h4>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => handleCopy(rawText, 'raw-json')}
                                    >
                                        {copiedField === 'raw-json' ? (
                                            <Check className="h-3 w-3 text-emerald-500" />
                                        ) : (
                                            <Copy className="h-3 w-3" />
                                        )}
                                    </Button>
                                </div>
                                <pre className="rounded-md bg-secondary/50 p-3 text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-words max-h-[280px] overflow-y-auto">
                                    {rawText}
                                </pre>
                            </TabsContent>
                        </Tabs>
                    </section>
                </div>
            </DialogContent>
        </Dialog>
    );
}
