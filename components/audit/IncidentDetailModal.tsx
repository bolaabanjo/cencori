'use client';

import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { SeverityBadge } from './SeverityBadge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, ExternalLink, CheckCircle2, XCircle, ShieldAlert, Clock } from 'lucide-react';
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

    useEffect(() => {
        if (open && incidentId) {
            fetchIncidentDetail();
        }
    }, [open, incidentId]);

    const fetchIncidentDetail = async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/security/incidents/${incidentId}`);
            if (!response.ok) throw new Error('Failed to fetch incident details');

            const data = await response.json();
            setIncident(data);
            setReviewNotes(data.review_notes || '');
        } catch (error) {
            console.error('Error fetching incident details:', error);
            toast.error('Failed to load incident details');
        } finally {
            setLoading(false);
        }
    };

    const handleMarkReviewed = async () => {
        if (!incident) return;

        setReviewing(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/security/incidents/${incidentId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reviewed: !incident.reviewed,
                    review_notes: reviewNotes,
                }),
            });

            if (!response.ok) throw new Error('Failed to update incident');

            toast.success(incident.reviewed ? 'Marked as unreviewed' : 'Marked as reviewed');
            onReviewed?.();
            fetchIncidentDetail();
        } catch (error) {
            console.error('Error updating incident:', error);
            toast.error('Failed to update incident');
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

    if (loading || !incident) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-lg">
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    const riskPercent = Math.round((incident.risk_score || 0) * 100);
    const hasPatterns = incident.details?.patterns_detected && incident.details.patterns_detected.length > 0;
    const hasReasons = incident.details?.reasons && incident.details.reasons.length > 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
                {/* Header */}
                <DialogHeader className="px-5 pt-5 pb-4 pr-12 border-b border-border/40">
                    <div className="flex items-start justify-between">
                        <div className="space-y-1">
                            <DialogTitle className="text-base font-semibold flex items-center gap-2">
                                Security Incident
                            </DialogTitle>
                            <p className="text-xs text-muted-foreground">
                                {formatDate(incident.created_at)}
                            </p>
                        </div>
                        <SeverityBadge severity={incident.severity} />
                    </div>
                </DialogHeader>

                <div className="px-5 py-4 space-y-4">
                    {/* Metrics Grid */}
                    <div className="grid grid-cols-4 gap-2">
                        <div className="bg-secondary/50 rounded-md p-2.5 text-center">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Risk</p>
                            <p className="text-lg font-semibold font-mono">{riskPercent}%</p>
                        </div>
                        <div className="bg-secondary/50 rounded-md p-2.5 text-center">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Type</p>
                            <p className="text-xs font-medium capitalize truncate">{incident.incident_type}</p>
                        </div>
                        <div className="bg-secondary/50 rounded-md p-2.5 text-center">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Blocked</p>
                            <p className="text-xs font-medium capitalize">{incident.blocked_at || '—'}</p>
                        </div>
                        <div className="bg-secondary/50 rounded-md p-2.5 text-center">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Status</p>
                            <p className={`text-xs font-medium ${incident.reviewed ? 'text-emerald-500' : 'text-amber-500'}`}>
                                {incident.reviewed ? 'Reviewed' : 'Pending'}
                            </p>
                        </div>
                    </div>

                    {/* Detection Details */}
                    {(hasPatterns || hasReasons) && (
                        <div className="rounded-md border border-border/40 bg-card overflow-hidden">
                            <div className="px-3 py-2 border-b border-border/40 bg-secondary/30">
                                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Detection Details</p>
                            </div>
                            <div className="p-3 space-y-2">
                                {hasPatterns && incident.details.patterns_detected!.map((pattern, i) => (
                                    <div key={i} className="flex items-start gap-2">
                                        <XCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                                        <span className="text-xs text-muted-foreground">{pattern}</span>
                                    </div>
                                ))}
                                {hasReasons && incident.details.reasons!.map((reason, i) => (
                                    <div key={`reason-${i}`} className="flex items-start gap-2">
                                        <XCircle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                                        <span className="text-xs text-muted-foreground">{reason}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Related Request */}
                    {incident.related_request && (
                        <div className="rounded-md border border-border/40 bg-card p-3">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-[10px] h-5">{incident.related_request.model}</Badge>
                                    <span className="text-[10px] text-muted-foreground">{formatDate(incident.related_request.created_at)}</span>
                                </div>
                                <Link
                                    href={`?view=logs&request=${incident.related_request.id}`}
                                    className="text-[10px] text-primary hover:underline flex items-center gap-1"
                                >
                                    View <ExternalLink className="h-2.5 w-2.5" />
                                </Link>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">{incident.related_request.preview || 'No preview'}</p>
                        </div>
                    )}

                    {/* Review Section */}
                    <div className="space-y-3 pt-2 border-t border-border/40">
                        <Textarea
                            placeholder="Add review notes (optional)..."
                            value={reviewNotes}
                            onChange={(e) => setReviewNotes(e.target.value)}
                            rows={2}
                            className="text-xs resize-none"
                        />
                        <div className="flex items-center justify-between">
                            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                {incident.reviewed && incident.reviewed_at && (
                                    <>
                                        <Clock className="h-3 w-3" />
                                        <span>Reviewed {formatDate(incident.reviewed_at)}</span>
                                    </>
                                )}
                            </div>
                            <Button
                                onClick={handleMarkReviewed}
                                disabled={reviewing}
                                size="sm"
                                variant={incident.reviewed ? 'outline' : 'default'}
                                className="h-8 text-xs gap-1.5"
                            >
                                {reviewing ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                )}
                                {reviewing ? 'Saving...' : incident.reviewed ? 'Mark Unreviewed' : 'Mark Reviewed'}
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
