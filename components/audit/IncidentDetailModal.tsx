'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { SeverityBadge } from './SeverityBadge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, RotateCw, Clock } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import Link from 'next/link';

interface IncidentDetail {
    id: string;
    created_at: string;
    incident_type: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    blocked_at: 'input' | 'output' | 'both';
    risk_score: number;
    confidence: number;
    reviewed: boolean;
    review_notes?: string;
    reviewed_at?: string;
    details: {
        patterns_detected?: string[];
        blocked_content?: {
            type: string;
            examples: string[];
        };
        reasons?: string[];
    };
    related_request?: {
        id: string;
        created_at: string;
        status: string;
        model: string;
        preview: string;
    };
}

interface IncidentDetailModalProps {
    projectId: string;
    incidentId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onReviewed?: () => void;
}

export function IncidentDetailModal({ projectId, incidentId, open, onOpenChange, onReviewed }: IncidentDetailModalProps) {
    const [incident, setIncident] = useState<IncidentDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [reviewNotes, setReviewNotes] = useState('');
    const [reviewing, setReviewing] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [reviewError, setReviewError] = useState<string | null>(null);

    const fetchIncidentDetail = useCallback(async (resetIncident = false) => {
        setLoading(true);
        setLoadError(null);
        if (resetIncident) setIncident(null);

        try {
            const response = await fetch(`/api/projects/${projectId}/security/incidents/${incidentId}`);
            if (!response.ok) {
                const body = await response.json().catch(() => null);
                throw new Error(body?.error || 'We could not load this incident.');
            }

            const data = await response.json();
            setIncident(data);
            setReviewNotes(data.review_notes || '');
        } catch (error) {
            console.error('Error fetching incident details:', error);
            const message = error instanceof Error ? error.message : 'We could not load this incident.';
            setLoadError(message);
        } finally {
            setLoading(false);
        }
    }, [incidentId, projectId]);

    useEffect(() => {
        if (open && incidentId) {
            void fetchIncidentDetail(true);
        }
    }, [open, incidentId, fetchIncidentDetail]);

    const handleMarkReviewed = async () => {
        if (!incident) return;

        setReviewing(true);
        setReviewError(null);
        try {
            const response = await fetch(`/api/projects/${projectId}/security/incidents/${incidentId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reviewed: !incident.reviewed,
                    review_notes: reviewNotes,
                }),
            });

            if (!response.ok) {
                const body = await response.json().catch(() => null);
                throw new Error(body?.error || 'We could not update this incident.');
            }

            toast.success(incident.reviewed ? 'Marked as unreviewed' : 'Marked as reviewed');
            onReviewed?.();
            await fetchIncidentDetail();
        } catch (error) {
            console.error('Error updating incident:', error);
            const message = error instanceof Error ? error.message : 'We could not update this incident.';
            setReviewError(message);
        } finally {
            setReviewing(false);
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    };

    const formatIncidentType = (type: string) => {
        return type.split('_').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    };

    if (loading && !incident) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden border-border/25 bg-[#f3f3f1] p-0 shadow-none dark:bg-[#111111] sm:max-w-2xl">
                    <IncidentDetailSkeleton />
                </DialogContent>
            </Dialog>
        );
    }

    if (loadError || !incident) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden border-border/25 bg-[#f3f3f1] p-0 shadow-none dark:bg-[#111111] sm:max-w-xl">
                    <DialogHeader className="border-b border-border/25 px-6 py-6 pr-14 text-left">
                        <DialogTitle className="text-lg font-medium tracking-[-0.025em]">Incident unavailable</DialogTitle>
                        <DialogDescription className="mt-1 text-xs leading-5">
                            The incident detail could not be retrieved.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex min-h-56 flex-col items-center justify-center px-8 py-12 text-center">
                        <span className="mb-5 h-px w-10 bg-red-500/70" />
                        <p className="max-w-sm text-xs leading-5 text-muted-foreground">{loadError}</p>
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-5 h-8 gap-2 border-border/30 bg-transparent text-xs shadow-none"
                            onClick={() => void fetchIncidentDetail(true)}
                        >
                            <RotateCw className="size-3" />
                            Try again
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    const riskPercent = Math.round((incident.risk_score || 0) * 100);
    const hasPatterns = incident.details?.patterns_detected && incident.details.patterns_detected.length > 0;
    const hasReasons = incident.details?.reasons && incident.details.reasons.length > 0;
    const blockedExamples = incident.details?.blocked_content?.examples || [];
    const hasEvidence = hasPatterns || hasReasons || blockedExamples.length > 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden border-border/25 bg-[#f3f3f1] p-0 shadow-none dark:bg-[#111111] sm:max-w-2xl">
                <DialogHeader className="border-b border-border/25 px-6 py-6 pr-14 text-left sm:px-7 sm:py-7 sm:pr-14">
                    <div className="flex items-start justify-between gap-6">
                        <div className="min-w-0">
                            <p className="mb-2 text-[10px] font-medium tracking-[0.14em] text-muted-foreground">INCIDENT DETAIL</p>
                            <DialogTitle className="text-xl font-medium leading-tight tracking-[-0.035em] text-balance">
                                {formatIncidentType(incident.incident_type)}
                            </DialogTitle>
                            <DialogDescription className="mt-2 font-mono text-[10px] tabular-nums">
                                {formatDate(incident.created_at)} · {incident.id.slice(0, 8)}
                            </DialogDescription>
                        </div>
                        <SeverityBadge severity={incident.severity} className="mt-0.5 shrink-0" />
                    </div>
                </DialogHeader>

                <dl className="grid grid-cols-2 border-b border-border/25 sm:grid-cols-4">
                    <IncidentMetric label="Risk score" value={`${riskPercent}%`} mono />
                    <IncidentMetric label="Confidence" value={`${Math.round((incident.confidence || 0) * 100)}%`} mono />
                    <IncidentMetric label="Enforcement" value={incident.blocked_at ? `${incident.blocked_at} block` : 'Observed'} />
                    <IncidentMetric
                        label="Review status"
                        value={incident.reviewed ? 'Reviewed' : 'Pending review'}
                        tone={incident.reviewed ? 'success' : 'warning'}
                    />
                </dl>

                <div className="max-h-[58vh] overflow-y-auto">
                    <section className="border-b border-border/25 px-6 py-6 sm:px-7">
                        <div className="mb-4">
                            <h3 className="text-sm font-medium tracking-[-0.01em]">Detection evidence</h3>
                            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                                Signals and content that contributed to this security decision.
                            </p>
                        </div>

                        {hasEvidence ? (
                            <div className="overflow-hidden rounded-md border border-border/20 bg-background/30">
                                {hasPatterns && incident.details.patterns_detected!.map((pattern, index) => (
                                    <EvidenceRow key={`pattern-${index}`} label="Pattern" value={pattern} />
                                ))}
                                {hasReasons && incident.details.reasons!.map((reason, index) => (
                                    <EvidenceRow key={`reason-${index}`} label="Reason" value={reason} />
                                ))}
                                {blockedExamples.map((example, index) => (
                                    <EvidenceRow key={`example-${index}`} label="Excerpt" value={example} mono />
                                ))}
                            </div>
                        ) : (
                            <div className="flex min-h-28 items-center justify-center rounded-md border border-border/20 bg-background/25 px-6 text-center">
                                <p className="text-[11px] leading-5 text-muted-foreground">
                                    The detector did not attach additional evidence to this incident.
                                </p>
                            </div>
                        )}
                    </section>

                    {incident.related_request && (
                        <section className="border-b border-border/25 px-6 py-6 sm:px-7">
                            <div className="mb-4 flex items-start justify-between gap-5">
                                <div>
                                    <h3 className="text-sm font-medium tracking-[-0.01em]">Related request</h3>
                                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                                        The AI request associated with this detection.
                                    </p>
                                </div>
                                <Link
                                    href={`?view=logs&request=${incident.related_request.id}`}
                                    className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-sky-500 transition-opacity hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    Open request <ExternalLink className="size-3" />
                                </Link>
                            </div>

                            <div className="overflow-hidden rounded-md border border-border/20 bg-background/30">
                                <div className="grid grid-cols-2 border-b border-border/20 sm:grid-cols-3">
                                    <RequestMeta label="Model" value={incident.related_request.model} />
                                    <RequestMeta label="Status" value={incident.related_request.status} />
                                    <RequestMeta label="Observed" value={formatDate(incident.related_request.created_at)} className="col-span-2 sm:col-span-1" />
                                </div>
                                <p className="px-4 py-4 text-xs leading-5 text-muted-foreground">
                                    {incident.related_request.preview || 'No request preview is available.'}
                                </p>
                            </div>
                        </section>
                    )}

                    <section className="px-6 py-6 sm:px-7">
                        <div className="mb-4">
                            <h3 className="text-sm font-medium tracking-[-0.01em]">Review decision</h3>
                            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                                Record operator context and update this incident&apos;s review state.
                            </p>
                        </div>
                        <Textarea
                            placeholder="Add review notes…"
                            value={reviewNotes}
                            onChange={(e) => setReviewNotes(e.target.value)}
                            rows={3}
                            className="resize-none border-border/25 bg-background/35 text-xs shadow-none focus-visible:ring-1"
                        />
                        {reviewError && (
                            <p className="mt-2 text-[11px] leading-4 text-red-500" role="alert">{reviewError}</p>
                        )}
                        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-h-4 items-center gap-1.5 text-[10px] text-muted-foreground">
                                {incident.reviewed && incident.reviewed_at && (
                                    <>
                                        <Clock className="size-3" />
                                        <span>Reviewed {formatDate(incident.reviewed_at)}</span>
                                    </>
                                )}
                            </div>
                            <Button
                                onClick={handleMarkReviewed}
                                disabled={reviewing}
                                size="sm"
                                variant={incident.reviewed ? 'outline' : 'default'}
                                className="h-9 min-w-32 text-xs shadow-none active:translate-y-px"
                            >
                                {reviewing ? 'Saving…' : incident.reviewed ? 'Mark unreviewed' : 'Mark reviewed'}
                            </Button>
                        </div>
                    </section>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function IncidentMetric({
    label,
    value,
    mono = false,
    tone,
}: {
    label: string;
    value: string;
    mono?: boolean;
    tone?: 'success' | 'warning';
}) {
    const toneClass = tone === 'success' ? 'text-emerald-500' : tone === 'warning' ? 'text-amber-500' : 'text-foreground';

    return (
        <div className="min-w-0 border-b border-border/25 px-5 py-4 even:border-l sm:border-b-0 sm:border-l sm:first:border-l-0">
            <dt className="text-[10px] text-muted-foreground">{label}</dt>
            <dd className={`mt-2 truncate text-xs font-medium capitalize ${mono ? 'font-mono tabular-nums' : ''} ${toneClass}`}>
                {value}
            </dd>
        </div>
    );
}

function EvidenceRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="grid grid-cols-[5rem_1fr] gap-4 border-b border-border/20 px-4 py-3 last:border-b-0">
            <p className="text-[10px] text-muted-foreground">{label}</p>
            <p className={`min-w-0 text-xs leading-5 text-foreground/85 ${mono ? 'font-mono text-[11px]' : ''}`}>{value}</p>
        </div>
    );
}

function RequestMeta({ label, value, className = '' }: { label: string; value: string; className?: string }) {
    return (
        <div className={`min-w-0 border-r border-border/20 px-4 py-3 last:border-r-0 ${className}`}>
            <p className="text-[10px] text-muted-foreground">{label}</p>
            <p className="mt-1 truncate font-mono text-[10px] text-foreground/85">{value || '—'}</p>
        </div>
    );
}

function IncidentDetailSkeleton() {
    return (
        <div>
            <div className="border-b border-border/25 px-6 py-7 sm:px-7">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-3 h-6 w-52" />
                <Skeleton className="mt-3 h-3 w-40" />
            </div>
            <div className="grid grid-cols-2 border-b border-border/25 sm:grid-cols-4">
                {[1, 2, 3, 4].map((item) => (
                    <div key={item} className="border-b border-border/25 px-5 py-4 even:border-l sm:border-b-0 sm:border-l sm:first:border-l-0">
                        <Skeleton className="h-3 w-14" />
                        <Skeleton className="mt-2 h-4 w-20" />
                    </div>
                ))}
            </div>
            <div className="px-6 py-7 sm:px-7">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-2 h-3 w-72 max-w-full" />
                <Skeleton className="mt-5 h-32 w-full rounded-md" />
            </div>
        </div>
    );
}
