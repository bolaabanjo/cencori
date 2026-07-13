"use client";

import React, { useState, use } from 'react';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Power, PowerOff, Server, Zap } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/hooks/useQueries';

interface CustomProvider {
    id: string;
    name: string;
    base_url: string;
    api_format: 'openai' | 'anthropic';
    is_active: boolean;
    created_at: string;
    custom_models?: { id: string; model_name: string; display_name: string }[];
}

interface PageProps {
    params: Promise<{
        orgSlug: string;
        projectSlug: string;
    }>;
}

// Hook to get projectId from slugs (with caching)
function useProjectId(orgSlug: string, projectSlug: string) {
    return useQuery({
        queryKey: ["projectId", orgSlug, projectSlug],
        queryFn: async () => {
            const { data: orgData } = await supabase
                .from('organizations')
                .select('id')
                .eq('slug', orgSlug)
                .single();

            if (!orgData) throw new Error("Organization not found");

            const { data: projectData } = await supabase
                .from('projects')
                .select('id')
                .eq('slug', projectSlug)
                .eq('organization_id', orgData.id)
                .single();

            if (!projectData) throw new Error("Project not found");
            return projectData.id;
        },
        staleTime: 5 * 60 * 1000, // IDs rarely change, cache for 5 min
    });
}

export default function ProvidersPage({ params }: PageProps) {
    const { orgSlug, projectSlug } = use(params);
    const queryClient = useQueryClient();
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [formData, setFormData] = useState({ name: '', baseUrl: '', apiKey: '', format: 'openai' });

    // Get projectId with caching
    const { data: projectId, isLoading: projectLoading } = useProjectId(orgSlug, projectSlug);

    // Fetch providers with React Query - DATA IS CACHED!
    const { data: providers = [], isLoading: providersLoading } = useQuery({
        queryKey: queryKeys.providers(projectId || ''),
        queryFn: async () => {
            const res = await fetch(`/api/projects/${projectId}/providers`);
            if (!res.ok) throw new Error("Failed to fetch providers");
            const data = await res.json();
            return data.providers || [];
        },
        enabled: !!projectId,
        staleTime: 30 * 1000, // Cache for 30 seconds
    });

    // Create mutation with cache invalidation
    const createMutation = useMutation({
        mutationFn: async (data: typeof formData) => {
            const res = await fetch(`/api/projects/${projectId}/providers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error('Failed to create provider');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.providers(projectId!) });
            setShowAddDialog(false);
            setFormData({ name: '', baseUrl: '', apiKey: '', format: 'openai' });
            toast.success('Provider created');
        },
        onError: () => toast.error('Failed to create provider'),
    });

    // Toggle mutation
    const toggleMutation = useMutation({
        mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
            await fetch(`/api/projects/${projectId}/providers/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !isActive }),
            });
        },
        onSuccess: (_, { isActive }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.providers(projectId!) });
            toast.success(isActive ? 'Provider disabled' : 'Provider enabled');
        },
        onError: () => toast.error('Failed to update provider'),
    });

    // Delete mutation
    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            await fetch(`/api/projects/${projectId}/providers/${id}`, { method: 'DELETE' });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.providers(projectId!) });
            toast.success('Provider deleted');
        },
        onError: () => toast.error('Failed to delete provider'),
    });

    // Test connection mutation
    const testMutation = useMutation({
        mutationFn: async (providerId: string) => {
            const res = await fetch(`/api/projects/${projectId}/custom-providers/test`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider_id: providerId }),
            });
            return res.json();
        },
        onSuccess: (data) => {
            if (data.success) {
                toast.success(`Connection successful (${data.latency_ms}ms)`);
            } else {
                toast.error(data.error || 'Connection failed');
            }
        },
        onError: () => toast.error('Failed to test connection'),
    });

    const handleDelete = (id: string) => {
        if (!confirm('Delete this provider?')) return;
        deleteMutation.mutate(id);
    };

    const loading = projectLoading || providersLoading;

    if (loading) {
        return (
            <div className="w-full max-w-5xl mx-auto px-6 py-8">
                <Skeleton className="h-5 w-32 mb-6" />
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
                </div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-5xl mx-auto px-6 py-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-base font-medium">Providers</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">Configure custom AI provider endpoints</p>
                </div>
                <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                    <DialogTrigger asChild>
                        <Button size="sm" className="h-7 text-xs">
                            Add Provider
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[520px]">
                        <DialogHeader className="pb-2">
                            <DialogTitle className="text-sm">Add Custom Provider</DialogTitle>
                            <DialogDescription className="text-xs">Configure a new AI provider endpoint</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs">Name</Label>
                                <Input
                                    placeholder="e.g. My Local LLM"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="h-8 text-xs"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Base URL</Label>
                                <Input
                                    placeholder="https://api.provider.com"
                                    value={formData.baseUrl}
                                    onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                                    className="h-8 text-xs font-mono"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">API Key (optional)</Label>
                                <Input
                                    placeholder="sk-..."
                                    type="password"
                                    value={formData.apiKey}
                                    onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                                    className="h-8 text-xs font-mono"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Format</Label>
                                <Select value={formData.format} onValueChange={(v) => setFormData({ ...formData, format: v })}>
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="openai" className="text-xs">OpenAI Compatible</SelectItem>
                                        <SelectItem value="anthropic" className="text-xs">Anthropic Compatible</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <DialogFooter className="pt-3 gap-2">
                            <DialogClose asChild>
                                <Button variant="outline" size="sm" className="h-7 text-xs">Cancel</Button>
                            </DialogClose>
                            <Button
                                onClick={() => createMutation.mutate(formData)}
                                disabled={createMutation.isPending || !formData.name || !formData.baseUrl}
                                size="sm"
                                className="h-7 text-xs"
                            >
                                {createMutation.isPending ? 'Creating...' : 'Create'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Provider Cards */}
            {providers.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {providers.map((provider: CustomProvider) => (
                        <div
                            key={provider.id}
                            className="rounded-md border border-border/40 bg-card p-4"
                        >
                            <div className="flex items-start justify-between mb-2">
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-sm font-medium truncate">{provider.name}</h3>
                                    <p className="text-[10px] text-muted-foreground font-mono truncate">{provider.base_url}</p>
                                </div>
                                <Badge variant={provider.is_active ? 'outline' : 'secondary'} className="text-[9px] h-4 ml-2 shrink-0 gap-1">
                                    <span className={`size-1.5 rounded-full ${provider.is_active ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
                                    {provider.is_active ? 'Active' : 'Inactive'}
                                </Badge>
                            </div>

                            <div className="text-[10px] text-muted-foreground mb-3">
                                Format: <span className="font-medium">{provider.api_format}</span>
                                {provider.custom_models && provider.custom_models.length > 0 && (
                                    <> • {provider.custom_models.length} model{provider.custom_models.length !== 1 ? 's' : ''}</>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-[10px] flex-1"
                                    onClick={() => testMutation.mutate(provider.id)}
                                    disabled={testMutation.isPending}
                                >
                                    <Zap className="h-3 w-3 mr-1" />
                                    {testMutation.isPending ? 'Testing...' : 'Test'}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-[10px] flex-1"
                                    onClick={() => toggleMutation.mutate({ id: provider.id, isActive: provider.is_active })}
                                    disabled={toggleMutation.isPending}
                                >
                                    {provider.is_active ? <PowerOff className="h-3 w-3 mr-1" /> : <Power className="h-3 w-3 mr-1" />}
                                    {provider.is_active ? 'Disable' : 'Enable'}
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-[10px] text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                                    onClick={() => handleDelete(provider.id)}
                                    disabled={deleteMutation.isPending}
                                >
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-16 flex flex-col items-center rounded-md border border-border/40 bg-card">
                    <div className="w-10 h-10 rounded-md bg-secondary flex items-center justify-center mb-3">
                        <Server className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium mb-1">No providers configured</p>
                    <p className="text-xs text-muted-foreground">Add a custom provider to get started</p>
                </div>
            )}
        </div>
    );
}
