'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { Plus, Trash2, Webhook, Copy, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { normalizeWebhookResponse } from '@/lib/webhook-response';

interface SecurityWebhooksProps {
    projectId: string;
}

interface WebhookData {
    id: string;
    name: string;
    url: string;
    events: string[];
    is_active: boolean;
    created_at: string;
    last_triggered_at: string | null;
    failure_count: number;
    secret?: string;
}

const SECURITY_EVENTS = [
    { value: 'security.violation', label: 'Security Violation', desc: 'When content is blocked' },
    { value: 'security.critical', label: 'Critical Threat', desc: 'Critical severity incidents' },
    { value: 'security.high', label: 'High Threat', desc: 'High severity incidents' },
    { value: 'anomaly.detected', label: 'Anomaly Detected', desc: 'Cost, latency, or volume spikes vs. baseline' },
];

function useWebhooks(projectId: string) {
    return useQuery<unknown, Error, WebhookData[]>({
        queryKey: ['webhooks', projectId],
        queryFn: async () => {
            const response = await fetch(`/api/projects/${projectId}/webhooks`);
            if (!response.ok) throw new Error('Failed to fetch webhooks');
            return response.json();
        },
        select: normalizeWebhookResponse<WebhookData>,
        staleTime: 30 * 1000,
    });
}

function useCreateWebhook(projectId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: { name: string; url: string; events: string[] }) => {
            const response = await fetch(`/api/projects/${projectId}/webhooks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to create webhook');
            }
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['webhooks', projectId] });
            toast.success('Webhook created');
        },
        onError: (error: Error) => {
            toast.error(error.message);
        },
    });
}

function useDeleteWebhook(projectId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (webhookId: string) => {
            const response = await fetch(`/api/projects/${projectId}/webhooks/${webhookId}`, {
                method: 'DELETE',
            });
            if (!response.ok) throw new Error('Failed to delete webhook');
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['webhooks', projectId] });
            toast.success('Webhook deleted');
        },
        onError: () => {
            toast.error('Failed to delete webhook');
        },
    });
}

export function SecurityWebhooks({ projectId }: SecurityWebhooksProps) {
    const { data: webhooks, isLoading } = useWebhooks(projectId);
    const { mutate: createWebhook, isPending: isCreating } = useCreateWebhook(projectId);
    const { mutate: deleteWebhook } = useDeleteWebhook(projectId);

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [newWebhook, setNewWebhook] = useState({ name: '', url: '', events: ['security.violation'] });
    const [copiedSecret, setCopiedSecret] = useState<string | null>(null);

    const handleCreate = () => {
        if (!newWebhook.name || !newWebhook.url) {
            toast.error('Name and URL are required');
            return;
        }
        createWebhook(newWebhook, {
            onSuccess: () => {
                setIsDialogOpen(false);
                setNewWebhook({ name: '', url: '', events: ['security.violation'] });
            },
        });
    };

    const handleCopySecret = (secret: string) => {
        navigator.clipboard.writeText(secret);
        setCopiedSecret(secret);
        setTimeout(() => setCopiedSecret(null), 2000);
    };

    const toggleEvent = (event: string) => {
        setNewWebhook(prev => ({
            ...prev,
            events: prev.events.includes(event)
                ? prev.events.filter(e => e !== event)
                : [...prev.events, event],
        }));
    };

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-8 w-32" />
                </div>
                {[1, 2].map(i => (
                    <Skeleton key={i} className="h-24" />
                ))}
            </div>
        );
    }

    // Filter to security-related webhooks
    const securityWebhooks = webhooks?.filter(w =>
        w.events.some(e => e.startsWith('security.'))
    ) || [];

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-medium">Security Webhooks</h3>
                    <p className="text-[11px] text-muted-foreground">
                        Receive real-time notifications for security events
                    </p>
                </div>
                <Button size="sm" className="h-7 text-xs" onClick={() => setIsDialogOpen(true)}>
                    <Plus className="h-3 w-3 mr-1" />
                    Add Webhook
                </Button>
            </div>

            {/* Webhooks List */}
            {securityWebhooks.length === 0 ? (
                <div className="text-center py-12 rounded-lg border border-border/40 bg-card">
                    <div className="w-10 h-10 rounded-md bg-secondary flex items-center justify-center mx-auto mb-3">
                        <Webhook className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium mb-1">No security webhooks</p>
                    <p className="text-xs text-muted-foreground mb-4">
                        Add a webhook to receive security alerts
                    </p>
                    <Button size="sm" variant="outline" onClick={() => setIsDialogOpen(true)}>
                        <Plus className="h-3 w-3 mr-1" />
                        Add Webhook
                    </Button>
                </div>
            ) : (
                <div className="space-y-3">
                    {securityWebhooks.map((webhook) => (
                        <div
                            key={webhook.id}
                            className="rounded-lg border border-border/40 bg-card p-4"
                        >
                            <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${webhook.is_active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                                    <h4 className="text-xs font-medium">{webhook.name}</h4>
                                    {webhook.failure_count > 0 && (
                                        <Badge variant="destructive" className="text-[9px] h-4 gap-1">
                                            <AlertCircle className="h-2.5 w-2.5" />
                                            {webhook.failure_count} failures
                                        </Badge>
                                    )}
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-red-500"
                                    onClick={() => deleteWebhook(webhook.id)}
                                >
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            </div>
                            <p className="text-[11px] text-muted-foreground font-mono truncate mb-2">
                                {webhook.url}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {webhook.events.map(event => (
                                    <Badge key={event} variant="secondary" className="text-[9px] h-4">
                                        {event}
                                    </Badge>
                                ))}
                            </div>
                            {webhook.last_triggered_at && (
                                <p className="text-[10px] text-muted-foreground mt-2">
                                    Last triggered: {new Date(webhook.last_triggered_at).toLocaleDateString()}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Create Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-base">Create Security Webhook</DialogTitle>
                        <DialogDescription className="text-xs">
                            Configure a webhook endpoint to receive security alerts
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div>
                            <label className="text-xs font-medium mb-1.5 block">Name</label>
                            <Input
                                placeholder="Security Alerts"
                                value={newWebhook.name}
                                onChange={(e) => setNewWebhook(prev => ({ ...prev, name: e.target.value }))}
                                className="h-8 text-xs"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-medium mb-1.5 block">Webhook URL</label>
                            <Input
                                placeholder="https://your-server.com/webhook"
                                value={newWebhook.url}
                                onChange={(e) => setNewWebhook(prev => ({ ...prev, url: e.target.value }))}
                                className="h-8 text-xs"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-medium mb-1.5 block">Events</label>
                            <div className="space-y-2">
                                {SECURITY_EVENTS.map(event => (
                                    <label
                                        key={event.value}
                                        className={`flex items-center justify-between p-2 rounded border cursor-pointer transition-colors ${newWebhook.events.includes(event.value)
                                                ? 'border-primary bg-primary/5'
                                                : 'border-border/40 hover:bg-secondary/30'
                                            }`}
                                    >
                                        <div>
                                            <p className="text-xs font-medium">{event.label}</p>
                                            <p className="text-[10px] text-muted-foreground">{event.desc}</p>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={newWebhook.events.includes(event.value)}
                                            onChange={() => toggleEvent(event.value)}
                                            className="sr-only"
                                        />
                                        {newWebhook.events.includes(event.value) && (
                                            <CheckCircle className="h-4 w-4 text-primary" />
                                        )}
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="h-8 text-xs">
                            Cancel
                        </Button>
                        <Button onClick={handleCreate} disabled={isCreating} className="h-8 text-xs">
                            {isCreating ? 'Creating...' : 'Create Webhook'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
