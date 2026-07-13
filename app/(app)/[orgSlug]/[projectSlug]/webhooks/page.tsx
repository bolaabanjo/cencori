"use client";

import { useState, use } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Loader2, Globe, Copy, Trash2, MoreHorizontal, Check, X, Zap } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

interface PageProps {
    params: Promise<{
        orgSlug: string;
        projectSlug: string;
    }>;
}

interface Webhook {
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

const WEBHOOK_EVENTS = [
    { id: "request.completed", label: "Request Completed", description: "When an AI request completes successfully" },
    { id: "request.failed", label: "Request Failed", description: "When an AI request fails" },
    { id: "security.incident", label: "Security Incident", description: "When a security incident is detected" },
    { id: "quota.warning", label: "Quota Warning", description: "When usage reaches 80% of quota" },
    { id: "quota.exceeded", label: "Quota Exceeded", description: "When usage exceeds the monthly quota" },
];

function useProjectId(orgSlug: string, projectSlug: string) {
    return useQuery({
        queryKey: ["projectId", orgSlug, projectSlug],
        queryFn: async () => {
            const { data: orgData } = await supabase
                .from("organizations")
                .select("id")
                .eq("slug", orgSlug)
                .single();
            if (!orgData) throw new Error("Organization not found");

            const { data: projectData } = await supabase
                .from("projects")
                .select("id")
                .eq("slug", projectSlug)
                .eq("organization_id", orgData.id)
                .single();
            if (!projectData) throw new Error("Project not found");
            return projectData.id;
        },
        staleTime: 5 * 60 * 1000,
    });
}

export default function WebhooksPage({ params }: PageProps) {
    const { orgSlug, projectSlug } = use(params);
    const queryClient = useQueryClient();
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [newWebhook, setNewWebhook] = useState({
        name: "",
        url: "",
        events: ["request.completed"] as string[],
    });
    const [copiedSecret, setCopiedSecret] = useState<string | null>(null);
    const [testingWebhook, setTestingWebhook] = useState<string | null>(null);

    const { data: projectId, isLoading: projectLoading } = useProjectId(orgSlug, projectSlug);

    const { data: webhooksData, isLoading: webhooksLoading } = useQuery({
        queryKey: ["webhooks", projectId],
        queryFn: async () => {
            const res = await fetch(`/api/projects/${projectId}/webhooks`);
            if (!res.ok) throw new Error("Failed to fetch webhooks");
            return res.json();
        },
        enabled: !!projectId,
    });

    const webhooks: Webhook[] = webhooksData?.webhooks || [];

    const createMutation = useMutation({
        mutationFn: async (data: { name: string; url: string; events: string[] }) => {
            const res = await fetch(`/api/projects/${projectId}/webhooks`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || "Failed to create webhook");
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["webhooks", projectId] });
            setCreateDialogOpen(false);
            setNewWebhook({ name: "", url: "", events: ["request.completed"] });
            toast.success("Webhook created");
        },
        onError: (error: Error) => {
            toast.error(error.message);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (webhookId: string) => {
            const res = await fetch(`/api/projects/${projectId}/webhooks/${webhookId}`, {
                method: "DELETE",
            });
            if (!res.ok) throw new Error("Failed to delete webhook");
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["webhooks", projectId] });
            toast.success("Webhook deleted");
        },
        onError: () => {
            toast.error("Failed to delete webhook");
        },
    });

    const handleTestWebhook = async (webhookId: string) => {
        setTestingWebhook(webhookId);
        try {
            const res = await fetch(`/api/projects/${projectId}/webhooks/${webhookId}/test`, {
                method: "POST",
            });
            const data = await res.json();
            if (data.success) {
                toast.success("Test webhook delivered successfully!");
            } else {
                toast.error(data.message || "Test webhook failed");
            }
        } catch {
            toast.error("Failed to send test webhook");
        } finally {
            setTestingWebhook(null);
        }
    };

    const handleCopySecret = (secret: string, id: string) => {
        navigator.clipboard.writeText(secret);
        setCopiedSecret(id);
        setTimeout(() => setCopiedSecret(null), 2000);
    };

    const handleEventToggle = (eventId: string) => {
        setNewWebhook(prev => ({
            ...prev,
            events: prev.events.includes(eventId)
                ? prev.events.filter(e => e !== eventId)
                : [...prev.events, eventId],
        }));
    };

    if (projectLoading || webhooksLoading) {
        return (
            <div className="w-full max-w-4xl mx-auto px-6 py-8">
                <div className="mb-6">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-3 w-64 mt-1" />
                </div>
                <div className="space-y-3">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}
                </div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-4xl mx-auto px-6 py-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-lg font-semibold">Webhooks</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Send real-time notifications to your endpoints when events occur
                    </p>
                </div>
                <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm" className="h-8 text-xs">
                            Add webhook
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                            <DialogTitle className="text-base">Create Webhook</DialogTitle>
                            <DialogDescription className="text-xs">
                                Configure a new webhook endpoint to receive event notifications
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-xs">Name</Label>
                                <Input
                                    id="name"
                                    placeholder="My Webhook"
                                    className="h-8 text-xs"
                                    value={newWebhook.name}
                                    onChange={e => setNewWebhook(prev => ({ ...prev, name: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="url" className="text-xs">Endpoint URL</Label>
                                <Input
                                    id="url"
                                    placeholder="https://your-server.com/webhook"
                                    className="h-8 text-xs"
                                    value={newWebhook.url}
                                    onChange={e => setNewWebhook(prev => ({ ...prev, url: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs">Events</Label>
                                <div className="space-y-2 border border-border/40 rounded-md p-3">
                                    {WEBHOOK_EVENTS.map(event => (
                                        <div key={event.id} className="flex items-start gap-2">
                                            <Checkbox
                                                id={event.id}
                                                checked={newWebhook.events.includes(event.id)}
                                                onCheckedChange={() => handleEventToggle(event.id)}
                                                className="mt-0.5"
                                            />
                                            <div className="flex-1">
                                                <label htmlFor={event.id} className="text-xs font-medium cursor-pointer">
                                                    {event.label}
                                                </label>
                                                <p className="text-[10px] text-muted-foreground">{event.description}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => setCreateDialogOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => createMutation.mutate(newWebhook)}
                                disabled={createMutation.isPending || !newWebhook.name || !newWebhook.url}
                            >
                                {createMutation.isPending ? (
                                    <>
                                        <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                                        Creating...
                                    </>
                                ) : (
                                    "Create webhook"
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Webhooks List */}
            {webhooks.length === 0 ? (
                <div className="text-center py-16 border border-border/40 rounded-lg bg-card">
                    <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center mx-auto mb-4">
                        <Globe className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium mb-1">No webhooks configured</p>
                    <p className="text-xs text-muted-foreground max-w-[280px] mx-auto">
                        Create a webhook to start receiving real-time notifications for your project events
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {webhooks.map(webhook => (
                        <div
                            key={webhook.id}
                            className="border border-border/40 rounded-lg bg-card p-4"
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex items-start gap-3">
                                    <div className={`w-2 h-2 rounded-full mt-1.5 ${webhook.is_active ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                                    <div>
                                        <p className="text-sm font-medium">{webhook.name}</p>
                                        <p className="text-xs text-muted-foreground font-mono mt-0.5">
                                            {webhook.url}
                                        </p>
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {webhook.events.map(event => (
                                                <span
                                                    key={event}
                                                    className="px-1.5 py-0.5 text-[10px] bg-secondary rounded"
                                                >
                                                    {event}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem
                                            className="text-xs cursor-pointer"
                                            onClick={() => handleTestWebhook(webhook.id)}
                                            disabled={testingWebhook === webhook.id}
                                        >
                                            {testingWebhook === webhook.id ? (
                                                <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                            ) : (
                                                <Zap className="h-3 w-3 mr-2" />
                                            )}
                                            Send Test
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            className="text-xs cursor-pointer text-red-500"
                                            onClick={() => deleteMutation.mutate(webhook.id)}
                                        >
                                            <Trash2 className="h-3 w-3 mr-2" />
                                            Delete
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                            {webhook.failure_count > 0 && (
                                <p className="text-[10px] text-amber-500 mt-2">
                                    {webhook.failure_count} failed deliveries
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
