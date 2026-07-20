'use client';

import { useState, useEffect, useCallback } from 'react';
import { SeverityBadge } from './SeverityBadge';
import { IncidentDetailModal } from './IncidentDetailModal';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, ShieldAlert } from 'lucide-react';
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

    const fetchIncidents = useCallback(async () => {
        setLoading(true);
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
            if (!response.ok) throw new Error('Failed to fetch incidents');

            const data = await response.json();
            setIncidents(data.incidents);
            setSummary(data.summary);
            setTotalPages(data.pagination.total_pages);
        } catch (error) {
            console.error('Error fetching incidents:', error);
            toast.error('Failed to load security incidents');
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

    if (loading && incidents.length === 0) {
        return (
            <div className="space-y-4">
                {/* Summary skeleton */}
                <div className="rounded-md border border-border/40 bg-card overflow-hidden">
                    <div className="grid grid-cols-4 divide-x divide-border/30">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="px-5 py-4">
                                <Skeleton className="h-3 w-14 mb-2.5" />
                                <Skeleton className="h-6 w-10" />
                            </div>
                        ))}
                    </div>
                </div>
                {/* Table skeleton */}
                <div className="bg-card border border-border/40 rounded-md overflow-hidden">
                    <div className="border-b border-border/40 px-4 py-2">
                        <div className="grid grid-cols-6 gap-4">
                            {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-3 w-14" />)}
                        </div>
                    </div>
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="border-b border-border/40 px-4 py-3 last:border-b-0">
                            <div className="grid grid-cols-6 gap-4 items-center">
                                <Skeleton className="h-5 w-16" />
                                <Skeleton className="h-3 w-24" />
                                <Skeleton className="h-3 w-16" />
                                <Skeleton className="h-4 w-12" />
                                <Skeleton className="h-3 w-10 ml-auto" />
                                <Skeleton className="h-4 w-16 ml-auto" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <>
            {/* Summary */}
            <div className="rounded-md border border-border/40 bg-card overflow-hidden mb-4">
                <div className="grid grid-cols-4 divide-x divide-border/30">
                    <div className="px-5 py-4">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Critical</span>
                        <p className="text-xl font-semibold font-mono tracking-tight mt-1 text-red-500">{summary.critical}</p>
                    </div>
                    <div className="px-5 py-4">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">High</span>
                        <p className="text-xl font-semibold font-mono tracking-tight mt-1 text-amber-500">{summary.high}</p>
                    </div>
                    <div className="px-5 py-4">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Medium</span>
                        <p className="text-xl font-semibold font-mono tracking-tight mt-1 text-yellow-500">{summary.medium}</p>
                    </div>
                    <div className="px-5 py-4">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Low</span>
                        <p className="text-xl font-semibold font-mono tracking-tight mt-1">{summary.low}</p>
                    </div>
                </div>
            </div>

            {incidents.length === 0 ? (
                <div className="text-center py-16 flex flex-col items-center rounded-md border border-border/40 bg-card">
                    <div className="w-10 h-10 rounded-md bg-secondary flex items-center justify-center mb-3">
                        <ShieldAlert className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium mb-1">No incidents found</p>
                    <p className="text-xs text-muted-foreground">
                        {filters.severity !== 'all' || filters.type !== 'all'
                            ? 'Try adjusting your filters'
                            : 'Your project is secure!'
                        }
                    </p>
                </div>
            ) : (
                <>
                    <div className="bg-card border border-border/40 rounded-md overflow-hidden">
                        {/* Desktop view */}
                        <div className="hidden md:block overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent border-b border-border/40">
                                        <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider h-8 px-4">Severity</TableHead>
                                        <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider h-8">Type</TableHead>
                                        <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider h-8">Time</TableHead>
                                        <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider h-8">Blocked At</TableHead>
                                        <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider h-8 text-right">Risk</TableHead>
                                        <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider h-8 text-right pr-4">Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {incidents.map((incident) => (
                                        <TableRow
                                            key={incident.id}
                                            className="cursor-pointer hover:bg-secondary/30 border-b border-border/40 last:border-b-0 transition-colors"
                                            onClick={() => handleRowClick(incident.id)}
                                        >
                                            <TableCell className="py-2.5 px-4">
                                                <SeverityBadge severity={incident.severity} />
                                            </TableCell>
                                            <TableCell className="py-2.5 text-xs">
                                                {formatIncidentType(incident.incident_type)}
                                            </TableCell>
                                            <TableCell className="py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                                                {formatDate(incident.created_at)}
                                            </TableCell>
                                            <TableCell className="py-2.5">
                                                {incident.blocked_at ? (
                                                    <Badge variant="outline" className="text-[10px] h-5">
                                                        {incident.blocked_at}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="py-2.5 text-right text-xs font-mono text-muted-foreground">
                                                {(incident.risk_score * 100).toFixed(0)}%
                                            </TableCell>
                                            <TableCell className="py-2.5 text-right pr-4">
                                                {incident.reviewed ? (
                                                    <Badge variant="outline" className="text-[10px] h-5 text-emerald-500 border-emerald-500/20 gap-1">
                                                        <CheckCircle className="h-2.5 w-2.5" />
                                                        Reviewed
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-[10px] h-5 text-muted-foreground">
                                                        Pending
                                                    </Badge>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>

                        {/* Mobile view */}
                        <div className="md:hidden divide-y divide-border/40">
                            {incidents.map((incident) => (
                                <div
                                    key={incident.id}
                                    className="p-3 cursor-pointer hover:bg-secondary/30 transition-colors"
                                    onClick={() => handleRowClick(incident.id)}
                                >
                                    <div className="flex items-start justify-between mb-1.5">
                                        <div className="flex items-center gap-2">
                                            <SeverityBadge severity={incident.severity} />
                                            {incident.reviewed && (
                                                <Badge variant="outline" className="text-[9px] h-4 text-emerald-500">✓</Badge>
                                            )}
                                        </div>
                                        <span className="text-[10px] text-muted-foreground">
                                            {formatDate(incident.created_at)}
                                        </span>
                                    </div>
                                    <p className="text-xs mb-1.5">{formatIncidentType(incident.incident_type)}</p>
                                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                        <span>{incident.blocked_at ? `${incident.blocked_at} block` : '—'}</span>
                                        <span className="font-mono">Risk: {(incident.risk_score * 100).toFixed(0)}%</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Pagination */}
                    <div className="flex items-center justify-between py-3">
                        <p className="text-xs text-muted-foreground">
                            Page {page} of {totalPages}
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1 || loading}
                            >
                                Previous
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages || loading}
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                </>
            )}

            {/* Detail Modal */}
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
