"use client";

import React, { useState, use } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase as browserSupabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Key, Plus, Copy, Check, MoreVertical, Trash2, Globe, Lock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { GenerateKeyDialog } from "@/components/api-keys/GenerateKeyDialog";
import { useEnvironment } from "@/lib/contexts/EnvironmentContext";
import { maskApiKey } from "@/lib/api-keys";
import { toast } from "sonner";
import { queryKeys } from "@/lib/hooks/useQueries";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ApiKey {
    id: string;
    name: string;
    key_prefix: string;
    key_type?: 'secret' | 'publishable';
    allowed_domains?: string[] | null;
    created_at: string;
    last_used_at: string | null;
}

// Hook to get projectId from slugs (with caching)
function useProjectId(orgSlug: string, projectSlug: string) {
    return useQuery({
        queryKey: ["projectId", orgSlug, projectSlug],
        queryFn: async () => {
            const { data: { user }, error: userError } = await browserSupabase.auth.getUser();
            if (userError || !user) throw new Error("Not authenticated");

            const { data: orgData, error: orgError } = await browserSupabase
                .from("organizations")
                .select("id")
                .eq("slug", orgSlug)
                .eq("owner_id", user.id)
                .single();

            if (orgError || !orgData) throw new Error("Organization not found");

            const { data: projectData, error: projectError } = await browserSupabase
                .from("projects")
                .select("id")
                .eq("organization_id", orgData.id)
                .eq("slug", projectSlug)
                .single();

            if (projectError || !projectData) throw new Error("Project not found");
            return projectData.id;
        },
        staleTime: 5 * 60 * 1000, // IDs rarely change
    });
}

export default function ApiKeysPage({
    params,
}: {
    params: Promise<{ orgSlug: string; projectSlug: string }>;
}) {
    const { orgSlug, projectSlug } = use(params);
    const queryClient = useQueryClient();
    const { environment } = useEnvironment();
    const [showGenerateDialog, setShowGenerateDialog] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [showRevokeDialog, setShowRevokeDialog] = useState(false);
    const [keyToRevoke, setKeyToRevoke] = useState<ApiKey | null>(null);

    // Get projectId with caching
    const { data: projectId, isLoading: projectLoading } = useProjectId(orgSlug, projectSlug);

    // Fetch API keys with React Query - DATA IS CACHED!
    const { data: apiKeys = [], isLoading: keysLoading } = useQuery({
        queryKey: queryKeys.apiKeys(projectId || ''),
        queryFn: async () => {
            const response = await fetch(`/api/projects/${projectId}/api-keys?environment=${environment}`);
            if (!response.ok) throw new Error("Failed to fetch API keys");
            const data = await response.json();
            return data.apiKeys || [];
        },
        enabled: !!projectId,
        staleTime: 30 * 1000, // Cache for 30 seconds
    });

    // Revoke mutation with cache invalidation
    const revokeMutation = useMutation({
        mutationFn: async (keyId: string) => {
            const response = await fetch(`/api/projects/${projectId}/api-keys/${keyId}`, {
                method: "PATCH",
            });
            if (!response.ok) throw new Error("Failed to revoke API key");
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys(projectId!) });
            toast.success("API key revoked successfully");
            setShowRevokeDialog(false);
            setKeyToRevoke(null);
        },
        onError: () => toast.error("Failed to revoke API key"),
    });

    const handleKeyGenerated = () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys(projectId!) });
    };

    const handleCopy = async (key: ApiKey) => {
        const maskedKey = maskApiKey(key.key_prefix);
        await navigator.clipboard.writeText(maskedKey);
        setCopiedId(key.id);
        toast.success("Key prefix copied");
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleRevoke = () => {
        if (keyToRevoke) {
            revokeMutation.mutate(keyToRevoke.id);
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const day = date.getDate();
        const month = date.toLocaleString("en-US", { month: "short" });
        return `${month} ${day}, ${date.getFullYear()}`;
    };

    const loading = projectLoading || keysLoading;

    if (loading) {
        return (
            <div className="w-full max-w-5xl mx-auto px-6 py-8">
                <div className="mb-8">
                    <Skeleton className="h-5 w-20" />
                </div>
                <div className="flex items-center justify-end mb-6">
                    <Skeleton className="h-7 w-32" />
                </div>
                <div className="bg-card border border-border/40 rounded-md">
                    <div className="border-b border-border/40 px-4 py-2">
                        <div className="grid grid-cols-5 gap-4">
                            <Skeleton className="h-3 w-12" />
                            <Skeleton className="h-3 w-16" />
                            <Skeleton className="h-3 w-10" />
                            <Skeleton className="h-3 w-14" />
                            <Skeleton className="h-3 w-8 ml-auto" />
                        </div>
                    </div>
                    {[1, 2].map((i) => (
                        <div key={i} className="border-b border-border/40 px-4 py-3 last:border-b-0">
                            <div className="grid grid-cols-5 gap-4 items-center">
                                <Skeleton className="h-3.5 w-20" />
                                <Skeleton className="h-3 w-40" />
                                <Skeleton className="h-5 w-12" />
                                <Skeleton className="h-3 w-20" />
                                <Skeleton className="h-5 w-5 ml-auto" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-5xl mx-auto px-6 py-8">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-base font-medium">API Keys</h1>
                <p className="text-xs text-muted-foreground mt-1">Manage API keys for authenticating requests to your project.</p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end mb-6">
                <Button size="sm" className="h-7 text-xs px-3" onClick={() => setShowGenerateDialog(true)}>
                    <Plus size={12} className="mr-1.5" />
                    Generate key
                </Button>
            </div>

            {/* API Keys Table */}
            {apiKeys.length > 0 ? (
                <div className="bg-card border border-border/40 rounded-md overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent border-b border-border/40">
                                <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider h-8 px-4">Name</TableHead>
                                <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider h-8">API Key</TableHead>
                                <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider h-8">Type</TableHead>
                                <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider h-8">Status</TableHead>
                                <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider h-8">Created</TableHead>
                                <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider h-8 text-right pr-4">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {apiKeys.map((apiKey: ApiKey) => (
                                <TableRow
                                    key={apiKey.id}
                                    className="hover:bg-secondary/30 border-b border-border/40 last:border-b-0 transition-colors"
                                >
                                    <TableCell className="py-3 px-4">
                                        <span className="text-[13px] font-medium">{apiKey.name}</span>
                                    </TableCell>
                                    <TableCell className="py-3">
                                        <div className="flex items-center gap-1.5">
                                            <code className="text-[11px] text-muted-foreground font-mono">
                                                {maskApiKey(apiKey.key_prefix)}
                                            </code>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-5 w-5"
                                                onClick={() => handleCopy(apiKey)}
                                            >
                                                {copiedId === apiKey.id ? (
                                                    <Check className="h-2.5 w-2.5 text-emerald-500" />
                                                ) : (
                                                    <Copy className="h-2.5 w-2.5 text-muted-foreground" />
                                                )}
                                            </Button>
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-3">
                                        <Badge
                                            variant="outline"
                                            className={`gap-1 text-[10px] px-2 py-0.5 ${apiKey.key_type === 'publishable'
                                                ? 'border-blue-500/30 text-blue-600 dark:text-blue-400'
                                                : 'border-foreground/20 text-foreground'
                                                }`}
                                        >
                                            {apiKey.key_type === 'publishable' ? (
                                                <>
                                                    <Globe className="h-2.5 w-2.5" />
                                                    Publishable
                                                </>
                                            ) : (
                                                <>
                                                    <Lock className="h-2.5 w-2.5" />
                                                    Secret
                                                </>
                                            )}
                                        </Badge>
                                        {apiKey.key_type === 'publishable' && apiKey.allowed_domains && apiKey.allowed_domains.length > 0 && (
                                            <p className="text-[9px] text-muted-foreground mt-0.5 truncate max-w-[120px]" title={apiKey.allowed_domains.join(', ')}>
                                                {apiKey.allowed_domains.slice(0, 2).join(', ')}{apiKey.allowed_domains.length > 2 ? ` +${apiKey.allowed_domains.length - 2}` : ''}
                                            </p>
                                        )}
                                    </TableCell>
                                    <TableCell className="py-3">
                                        <Badge variant="outline" className="gap-1.5 text-[11px] px-2 py-0.5 border-foreground/20 text-foreground">
                                            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true"></span>
                                            Active
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="py-3 text-xs text-muted-foreground">
                                        {formatDate(apiKey.created_at)}
                                    </TableCell>
                                    <TableCell className="py-3 pr-4 text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                                    <MoreVertical className="h-3 w-3" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-40">
                                                <DropdownMenuItem
                                                    className="text-xs text-red-600 cursor-pointer"
                                                    onClick={() => {
                                                        setKeyToRevoke(apiKey);
                                                        setShowRevokeDialog(true);
                                                    }}
                                                >
                                                    <Trash2 className="h-3 w-3 mr-2" />
                                                    Revoke key
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            ) : (
                <div className="text-center py-16 flex flex-col items-center justify-center">
                    <div className="w-10 h-10 rounded-md bg-secondary flex items-center justify-center mb-3">
                        <Key className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium mb-1">No API keys</p>
                    <p className="text-xs text-muted-foreground mb-4">
                        Generate your first API key to authenticate requests
                    </p>
                    <Button size="sm" className="h-7 text-xs px-3" onClick={() => setShowGenerateDialog(true)}>
                        <Plus size={12} className="mr-1.5" />
                        Generate key
                    </Button>
                </div>
            )}

            {/* Generate Key Dialog */}
            {projectId && (
                <GenerateKeyDialog
                    projectId={projectId}
                    open={showGenerateDialog}
                    onOpenChange={setShowGenerateDialog}
                    onKeyGenerated={handleKeyGenerated}
                />
            )}

            {/* Revoke confirmation dialog */}
            <AlertDialog open={showRevokeDialog} onOpenChange={setShowRevokeDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-sm">Revoke API Key</AlertDialogTitle>
                        <AlertDialogDescription className="text-xs">
                            Are you sure you want to revoke &lsquo;{keyToRevoke?.name}&rsquo;? This action cannot be undone and any
                            applications using this key will stop working immediately.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="h-7 text-xs">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleRevoke}
                            disabled={revokeMutation.isPending}
                            className="h-7 text-xs bg-red-600 hover:bg-red-700"
                        >
                            {revokeMutation.isPending ? "Revoking..." : "Revoke"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
