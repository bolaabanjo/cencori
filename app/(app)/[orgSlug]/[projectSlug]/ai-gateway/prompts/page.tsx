'use client';

import { use, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Plus, FileText, MoreHorizontal, Trash2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { PromptEditor } from '@/components/prompts/PromptEditor';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface PageProps {
    params: Promise<{ orgSlug: string; projectSlug: string }>;
}

interface PromptEntry {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    tags: string[];
    active_version_id: string | null;
    created_at: string;
    updated_at: string;
    usage_count: number;
    active_version?: {
        id: string;
        version: number;
        content: string;
        model_hint: string | null;
        created_at: string;
    } | null;
}

function useProjectId(orgSlug: string, projectSlug: string) {
    return useQuery({
        queryKey: ['projectId', orgSlug, projectSlug],
        queryFn: async () => {
            const { data: org } = await supabase
                .from('organizations')
                .select('id')
                .eq('slug', orgSlug)
                .single();
            if (!org) return null;
            const { data: project } = await supabase
                .from('projects')
                .select('id')
                .eq('organization_id', org.id)
                .eq('slug', projectSlug)
                .single();
            return project?.id || null;
        },
    });
}

function timeAgo(date: string): string {
    const ms = Date.now() - new Date(date).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

export default function PromptsPage({ params }: PageProps) {
    const { orgSlug, projectSlug } = use(params);
    const pathname = usePathname();
    const queryClient = useQueryClient();
    const { data: projectId, isLoading: projectLoading } = useProjectId(orgSlug, projectSlug);
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [deleteTarget, setDeleteTarget] = useState<PromptEntry | null>(null);

    const { data, isLoading } = useQuery<{ prompts: PromptEntry[] }>({
        queryKey: ['prompts', projectId],
        queryFn: async () => {
            const res = await fetch(`/api/projects/${projectId}/prompts`);
            if (!res.ok) throw new Error('Failed to fetch prompts');
            return res.json();
        },
        enabled: !!projectId,
    });

    const createMutation = useMutation({
        mutationFn: async (payload: {
            name: string;
            description: string;
            content: string;
            model_hint: string | null;
            temperature: number | null;
            max_tokens: number | null;
            change_message: string;
        }) => {
            const res = await fetch(`/api/projects/${projectId}/prompts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to create prompt');
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['prompts', projectId] });
            setShowCreate(false);
            setNewName('');
            setNewDescription('');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (promptId: string) => {
            const res = await fetch(`/api/projects/${projectId}/prompts/${promptId}`, {
                method: 'DELETE',
            });
            if (!res.ok) throw new Error('Failed to delete');
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['prompts', projectId] });
        },
    });

    if (projectLoading || !projectId) {
        return (
            <div className="w-full max-w-[1100px] mx-auto px-6 py-8">
                <div className="h-5 w-28 bg-secondary rounded animate-pulse" />
            </div>
        );
    }

    const prompts = data?.prompts || [];
    const basePath = pathname;

    return (
        <div className="w-full max-w-[1100px] mx-auto px-6 py-8">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-base font-medium">Prompt Registry</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Version, deploy, and manage prompts across your AI gateway.
                    </p>
                </div>
                <Button
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => setShowCreate(!showCreate)}
                >
                    New Prompt
                </Button>
            </div>

            {/* Create form */}
            {showCreate && (
                <div className="rounded-xl border border-border/30 bg-card p-5 mb-6 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label className="text-xs text-muted-foreground mb-1.5 block">Prompt Name</Label>
                            <Input
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                className="h-8 text-sm"
                                placeholder="e.g. customer-support-agent"
                            />
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground mb-1.5 block">Description</Label>
                            <Input
                                value={newDescription}
                                onChange={(e) => setNewDescription(e.target.value)}
                                className="h-8 text-sm"
                                placeholder="What this prompt does (optional)"
                            />
                        </div>
                    </div>
                    <PromptEditor
                        saveLabel="Create Prompt"
                        saving={createMutation.isPending}
                        onSave={(editorData) => {
                            if (!newName.trim()) return;
                            createMutation.mutate({
                                name: newName.trim(),
                                description: newDescription.trim() || '',
                                ...editorData,
                            });
                        }}
                    />
                    {createMutation.isError && (
                        <p className="text-xs text-red-500">{createMutation.error.message}</p>
                    )}
                </div>
            )}

            {/* Prompt list */}
            {isLoading ? (
                <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="rounded-xl border border-border/20 p-4 animate-pulse">
                            <div className="h-4 w-40 bg-secondary rounded mb-2" />
                            <div className="h-3 w-64 bg-secondary/50 rounded" />
                        </div>
                    ))}
                </div>
            ) : prompts.length === 0 && !showCreate ? (
                <div className="rounded-xl border border-dashed border-border/30 p-12 text-center">
                    <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground mb-1">No prompts yet</p>
                    <p className="text-xs text-muted-foreground/60 mb-4">
                        Create a prompt to start versioning and deploying system prompts via your API.
                    </p>
                    <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setShowCreate(true)}>
                        Create First Prompt
                    </Button>
                </div>
            ) : (
                <div className="space-y-2">
                    


                    {prompts.map((p) => (
                        <Link
                            key={p.id}
                            href={`${basePath}/${p.id}`}
                            className={cn(
                                'block rounded-xl border border-border/20 bg-card p-4 transition-colors hover:border-border/40 group'
                            )}
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-sm font-medium truncate">{p.name}</span>
                                        <span className="text-[10px] font-mono text-muted-foreground/40 bg-secondary/50 px-1.5 py-0.5 rounded">
                                            {p.slug}
                                        </span>
                                        {p.active_version && (
                                            <span className="text-[10px] font-mono text-emerald-500">
                                                v{p.active_version.version}
                                            </span>
                                        )}
                                    </div>
                                    {p.description && (
                                        <p className="text-xs text-muted-foreground/60 truncate mb-2">{p.description}</p>
                                    )}
                                    {p.active_version?.content && (
                                        <p className="text-[11px] font-mono text-muted-foreground/40 truncate max-w-lg">
                                            {p.active_version.content.slice(0, 120)}{p.active_version.content.length > 120 ? '...' : ''}
                                        </p>
                                    )}
                                </div>
                                <div className="flex items-center gap-3 ml-4 shrink-0">
                                    <div className="text-right">
                                        <p className="text-[10px] text-muted-foreground/40">{p.usage_count} uses</p>
                                        <p className="text-[10px] text-muted-foreground/30">{timeAgo(p.updated_at)}</p>
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <MoreHorizontal className="h-3.5 w-3.5" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    window.open(`${basePath}/${p.id}`, '_self');
                                                }}
                                            >
                                                <ExternalLink className="h-3.5 w-3.5 mr-2" />
                                                Open
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                className="text-red-500"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    setDeleteTarget(p);
                                                }}
                                            >
                                                <Trash2 className="h-3.5 w-3.5 mr-2" />
                                                Delete
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                            {p.tags.length > 0 && (
                                <div className="flex items-center gap-1.5 mt-2">
                                    {p.tags.map((tag) => (
                                        <span
                                            key={tag}
                                            className="text-[10px] text-muted-foreground/50 bg-secondary/50 px-1.5 py-0.5 rounded"
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </Link>
                    ))}
                </div>
            )}

            {/* Delete confirmation dialog */}
            <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-sm">Delete prompt</AlertDialogTitle>
                        <AlertDialogDescription className="text-xs">
                            This will permanently delete <span className="font-medium text-foreground">{deleteTarget?.name}</span> and
                            all its versions, deployment history, and usage logs. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="h-8 text-xs">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="h-8 text-xs bg-red-600 hover:bg-red-700 text-white"
                            onClick={() => {
                                if (deleteTarget) {
                                    deleteMutation.mutate(deleteTarget.id);
                                    setDeleteTarget(null);
                                }
                            }}
                        >
                            Delete Prompt
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
