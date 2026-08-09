'use client';

import { useState, useEffect, useCallback } from 'react';
import { SeverityBadge } from './SeverityBadge';
import { IncidentDetailModal } from './IncidentDetailModal';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RotateCw } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';

interface SecurityIncident {
    id: string;
    created_at: string;
    incident_type: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    blocked_at: 'input' | 'output' | 'both';
    risk_score: number;
    confidence: number;
    reviewed: boolean;
    details: Record<string, unknown>;
}

interface SecurityIncidentsTableProps {
    projectId: string;
    environment: 'production' | 'test';
    filters: {
        severity?: string;
        type?: string;
        reviewed?: string;
        time_range?: string;
    };
}

export function SecurityIncidentsTable({ projectId, environment, filters }: SecurityIncidentsTableProps) {
    const [incidents, setIncidents] = useState<SecurityIncident[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [selectedIncident, setSelectedIncident] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [summary, setSummary] = useState({ critical: 0, high: 0, medium: 0, low: 0 });
    const [loadError, setLoadError] = useState<string | null>(null);

    const fetchIncidents = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                per_page: '50',
                environment,
                ...(filters.severity && { severity: filters.severity }),
                ...(filters.type && { type: filters.type }),
                ...(filters.reviewed && { reviewed: filters.reviewed }),
                ...(filters.time_range && { time_range: filters.time_range }),
            });

            const response = await fetch(`/api/projects/${projectId}/security/incidents?${params}`);
            if (!response.ok) {
                const body = await response.json().catch(() => null);
                throw new Error(body?.error || 'We could not load security incidents.');
            }

            const data = await response.json();
            setIncidents(data.incidents);
            setSummary(data.summary);
            setTotalPages(data.pagination.total_pages);
        } catch (error) {
            console.error('Error fetching incidents:', error);
            const message = error instanceof Error ? error.message : 'We could not load security incidents.';
            setLoadError(message);
            toast.error(message);
        } finally {
            setLoading(false);
        }
    }, [projectId, environment, page, filters]);

    useEffect(() => {
        setPage(1);
    }, [filters]);

    useEffect(() => {
        fetchIncidents();
    }, [fetchIncidents]);

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now.getTime() - date.getTime();

        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

        const day = date.getDate();
        const month = date.toLocaleString("en-US", { month: "short" });
        return `${month} ${day}`;
    };

    const formatIncidentType = (type: string) => {
        return type.split('_').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    };

    const handleRowClick = (incidentId: string) => {
        setSelectedIncident(incidentId);
        setIsModalOpen(true);
    };

    const handleIncidentReviewed = () => {
        fetchIncidents();
    };

    const totalIncidents = Object.values(summary).reduce((total, count) => total + count, 0);
    const severitySummary = [
        { key: 'critical', label: 'Critical', count: summary.critical, color: 'bg-red-500', text: 'text-red-500' },
        { key: 'high', label: 'High', count: summary.high, color: 'bg-orange-500', text: 'text-orange-500' },
        { key: 'medium', label: 'Medium', count: summary.medium, color: 'bg-amber-400', text: 'text-amber-500' },
        { key: 'low', label: 'Low', count: summary.low, color: 'bg-foreground/30', text: 'text-foreground' },
    ];
    const hasNarrowingFilters =
        (!!filters.severity && filters.severity !== 'all') ||
        (!!filters.type && filters.type !== 'all') ||
        (!!filters.reviewed && filters.reviewed !== 'all');

    if (loading && incidents.length === 0) {
        return <SecurityIncidentsSkeleton />;
    }

    return (
        <>
            <section className="overflow-hidden rounded-lg border border-border/25 bg-[#f3f3f1] dark:bg-[#111111]">
                <header className="border-b border-border/25 px-5 py-6 sm:px-7 sm:py-7">
                    <div className="flex items-start justify-between gap-6">
                        <div>
                            <h3 className="text-sm font-medium tracking-[-0.01em]">Severity distribution</h3>
                            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                                Incident exposure within the selected time range.
                            </p>
                        </div>
                        <div className="shrink-0 text-right">
                            <p className="font-mono text-[2rem] font-medium leading-none tracking-[-0.05em] tabular-nums">
                                {totalIncidents}
                            </p>
                            <p className="mt-2 text-[10px] text-muted-foreground">total incidents</p>
                        </div>
                    </div>

                    <div className="mt-7 flex h-2 overflow-hidden rounded-[2px] bg-foreground/[0.07]" aria-label={`${totalIncidents} incidents grouped by severity`}>
                        {totalIncidents > 0 && severitySummary.map((item) => item.count > 0 && (
                            <span
                                key={item.key}
                                className={item.color}
                                style={{ width: `${(item.count / totalIncidents) * 100}%` }}
                                title={`${item.label}: ${item.count}`}
                            />
                        ))}
                    </div>

                    <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
                        {severitySummary.map((item) => (
                            <div key={item.key} className="flex min-w-0 items-center justify-between gap-3 sm:block">
                                <dt className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                    <span className={`size-1.5 rounded-full ${item.color}`} />
                                    {item.label}
                                </dt>
                                <dd className={`font-mono text-sm font-medium tabular-nums sm:mt-2 ${item.text}`}>{item.count}</dd>
                            </div>
                        ))}
                    </dl>
                </header>

                {loadError ? (
                    <div className="flex min-h-72 flex-col items-center justify-center px-6 py-14 text-center">
                        <p className="text-sm font-medium">Incident data is unavailable</p>
                        <p className="mt-1 max-w-sm text-[11px] leading-5 text-muted-foreground">{loadError}</p>
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-5 h-8 gap-2 text-xs"
                            onClick={() => void fetchIncidents()}
                        >
                            <RotateCw className="size-3" />
                            Try again
                        </Button>
                    </div>
                ) : incidents.length === 0 ? (
                    <div className="flex min-h-72 flex-col items-center justify-center px-6 py-14 text-center">
                        <span className="mb-5 h-px w-10 bg-emerald-500/70" />
                        <p className="text-sm font-medium">
                            {hasNarrowingFilters ? 'No incidents match these filters' : 'No incidents in this period'}
                        </p>
                        <p className="mt-1 max-w-sm text-[11px] leading-5 text-muted-foreground">
                            {hasNarrowingFilters
                                ? 'Adjust the severity, type, or review status to widen the incident queue.'
                                : 'New security detections will appear here with their enforcement and review status.'}
                        </p>
                    </div>
                ) : (
                    <div className={loading ? 'opacity-55 transition-opacity' : 'transition-opacity'}>
                        <div className="hidden overflow-x-auto md:block">
                            <Table>
                                <TableHeader>
                                    <TableRow className="h-10 border-b border-border/25 hover:bg-transparent">
                                        <TableHead className="px-5 text-[10px] font-medium text-muted-foreground sm:px-7">Severity</TableHead>
                                        <TableHead className="text-[10px] font-medium text-muted-foreground">Detection</TableHead>
                                        <TableHead className="text-[10px] font-medium text-muted-foreground">Observed</TableHead>
                                        <TableHead className="text-[10px] font-medium text-muted-foreground">Enforcement</TableHead>
                                        <TableHead className="text-right text-[10px] font-medium text-muted-foreground">Risk</TableHead>
                                        <TableHead className="pr-7 text-right text-[10px] font-medium text-muted-foreground">Review status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {incidents.map((incident) => (
                                        <TableRow
                                            key={incident.id}
                                            tabIndex={0}
                                            className="cursor-pointer border-b border-border/20 transition-colors last:border-b-0 hover:bg-muted/65 focus-visible:bg-muted/65 focus-visible:outline-none"
                                            onClick={() => handleRowClick(incident.id)}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter' || event.key === ' ') {
                                                    event.preventDefault();
                                                    handleRowClick(incident.id);
                                                }
                                            }}
                                        >
                                            <TableCell className="px-5 py-3.5 sm:px-7">
                                                <SeverityBadge severity={incident.severity} />
                                            </TableCell>
                                            <TableCell className="py-3.5 text-xs font-medium">
                                                {formatIncidentType(incident.incident_type)}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap py-3.5 text-[11px] text-muted-foreground">
                                                {formatDate(incident.created_at)}
                                            </TableCell>
                                            <TableCell className="py-3.5 font-mono text-[10px] capitalize text-muted-foreground">
                                                {incident.blocked_at ? `${incident.blocked_at} block` : 'Observed'}
                                            </TableCell>
                                            <TableCell className="py-3.5 text-right">
                                                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                                                    {(incident.risk_score * 100).toFixed(0)}%
                                                </span>
                                            </TableCell>
                                            <TableCell className="py-3.5 pr-7 text-right">
                                                <span className={`inline-flex items-center gap-2 text-[11px] ${incident.reviewed ? 'text-emerald-500' : 'text-amber-500'}`}>
                                                    <span className="size-1.5 rounded-full bg-current" />
                                                    {incident.reviewed ? 'Reviewed' : 'Pending'}
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>

                        <div className="divide-y divide-border/20 md:hidden">
                            {incidents.map((incident) => (
                                <button
                                    type="button"
                                    key={incident.id}
                                    className="w-full p-4 text-left transition-colors hover:bg-muted/65 focus-visible:bg-muted/65 focus-visible:outline-none"
                                    onClick={() => handleRowClick(incident.id)}
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <SeverityBadge severity={incident.severity} />
                                        <span className="text-[10px] text-muted-foreground">
                                            {formatDate(incident.created_at)}
                                        </span>
                                    </div>
                                    <p className="mt-3 text-xs font-medium">{formatIncidentType(incident.incident_type)}</p>
                                    <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                                        <span>{incident.blocked_at ? `${incident.blocked_at} block` : '—'}</span>
                                        <span className="font-mono">Risk: {(incident.risk_score * 100).toFixed(0)}%</span>
                                    </div>
                                </button>
                            ))}
                        </div>

                        <footer className="flex items-center justify-between border-t border-border/25 px-5 py-3.5 sm:px-7">
                            <p className="text-[11px] text-muted-foreground">
                                Page <span className="font-mono tabular-nums text-foreground">{page}</span> of{' '}
                                <span className="font-mono tabular-nums text-foreground">{totalPages}</span>
                            </p>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 border-border/30 bg-transparent px-3 text-xs shadow-none"
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1 || loading}
                                >
                                    Previous
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 border-border/30 bg-transparent px-3 text-xs shadow-none"
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page === totalPages || loading}
                                >
                                    Next
                                </Button>
                            </div>
                        </footer>
                    </div>
                )}
            </section>

            {selectedIncident && (
                <IncidentDetailModal
                    projectId={projectId}
                    incidentId={selectedIncident}
                    open={isModalOpen}
                    onOpenChange={setIsModalOpen}
                    onReviewed={handleIncidentReviewed}
                />
            )}
        </>
    );
}

function SecurityIncidentsSkeleton() {
    return (
        <div className="overflow-hidden rounded-lg border border-border/25 bg-[#f3f3f1] dark:bg-[#111111]">
            <div className="border-b border-border/25 px-5 py-6 sm:px-7 sm:py-7">
                <div className="flex items-start justify-between gap-6">
                    <div>
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="mt-2 h-3 w-52" />
                    </div>
                    <Skeleton className="h-10 w-16" />
                </div>
                <Skeleton className="mt-7 h-2 w-full rounded-sm" />
                <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {[1, 2, 3, 4].map((item) => (
                        <div key={item}>
                            <Skeleton className="h-3 w-16" />
                            <Skeleton className="mt-2 h-5 w-8" />
                        </div>
                    ))}
                </div>
            </div>
            <div className="border-b border-border/25 px-5 py-3 sm:px-7">
                <div className="grid grid-cols-6 gap-5">
                    {[1, 2, 3, 4, 5, 6].map((item) => <Skeleton key={item} className="h-3 w-14" />)}
                </div>
            </div>
            {[1, 2, 3, 4, 5].map((item) => (
                <div key={item} className="border-b border-border/20 px-5 py-4 last:border-b-0 sm:px-7">
                    <div className="grid grid-cols-6 items-center gap-5">
                        <Skeleton className="h-5 w-16" />
                        <Skeleton className="h-3 w-28" />
                        <Skeleton className="h-3 w-14" />
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="ml-auto h-3 w-10" />
                        <Skeleton className="ml-auto h-3 w-16" />
                    </div>
                </div>
            ))}
        </div>
    );
}
