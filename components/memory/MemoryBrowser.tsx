'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Brain, Search, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { MemoryUserPicker } from '@/components/memory/MemoryUserPicker';
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

interface MemoryBrowserProps {
    projectId: string;
}

interface MemoryEntry {
    id: string;
    content: string;
    scope: string;
    scopeKey: string;
    namespace: string | null;
    importance: number;
    accessCount: number;
    status: string;
    createdAt: string | null;
    lastAccessedAt: string | null;
}

interface EntriesResponse {
    memories: MemoryEntry[];
    total: number;
    limit: number;
    offset: number;
}

const PAGE_SIZE = 25;

function relativeDay(iso: string | null): string {
    if (!iso) return 'never';
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days}d ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
}

export function MemoryBrowser({ projectId }: MemoryBrowserProps) {
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [appliedSearch, setAppliedSearch] = useState('');
    const [status, setStatus] = useState('active');
    const [sort, setSort] = useState('recent');
    const [userId, setUserId] = useState('');
    const [offset, setOffset] = useState(0);
    const [pendingDelete, setPendingDelete] = useState<MemoryEntry | null>(null);

    const params = new URLSearchParams({
        status,
        sort,
        limit: String(PAGE_SIZE),
        offset: String(offset),
    });
    if (appliedSearch) params.set('q', appliedSearch);
    if (userId) params.set('userId', userId);

    const { data, isLoading, error } = useQuery({
        queryKey: ['memoryEntries', projectId, appliedSearch, status, sort, userId, offset],
        queryFn: async (): Promise<EntriesResponse> => {
            const response = await fetch(`/api/projects/${projectId}/memory/entries?${params.toString()}`);
            if (!response.ok) {
                const body = await response.json().catch(() => null);
                throw new Error(body?.error || 'We could not load memories.');
            }
            return response.json();
        },
        staleTime: 15_000,
    });

    const forget = useMutation({
        mutationFn: async (memoryId: string) => {
            const response = await fetch(`/api/projects/${projectId}/memory/entries/${memoryId}`, { method: 'DELETE' });
            if (!response.ok) {
                const body = await response.json().catch(() => null);
                throw new Error(body?.error || 'We could not forget that memory.');
            }
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['memoryEntries', projectId] });
            queryClient.invalidateQueries({ queryKey: ['memoryOverview', projectId] });
            queryClient.invalidateQueries({ queryKey: ['memoryForgetSuggestions', projectId] });
            setPendingDelete(null);
        },
    });

    const applySearch = () => {
        setOffset(0);
        setAppliedSearch(search.trim());
    };

    const total = data?.total ?? 0;
    const pageCount = data?.memories.length ?? 0;
    const showingTo = offset + pageCount;
    // The server returns a planner estimate for large result sets, so paging is
    // driven by whether the page came back full — never by the count.
    const hasNextPage = pageCount === PAGE_SIZE;
    const isEstimate = total >= 1000;

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        onKeyDown={(event) => { if (event.key === 'Enter') applySearch(); }}
                        onBlur={applySearch}
                        placeholder="Find a stored fact…"
                        className="h-8 border-border/30 bg-transparent pl-8 text-xs shadow-none"
                    />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <MemoryUserPicker
                        projectId={projectId}
                        value={userId}
                        onChange={(value) => { setUserId(value); setOffset(0); }}
                        source="memories"
                        placeholder="All end-users"
                        emptyLabel="No end-user has memories yet."
                        className="w-[180px]"
                    />

                    {userId && (
                        <Button
                            variant="ghost" size="sm"
                            onClick={() => { setUserId(''); setOffset(0); }}
                            className="h-8 px-2 text-[11px] text-muted-foreground"
                        >
                            <X className="mr-1 h-3 w-3" />
                            All users
                        </Button>
                    )}

                    <Select value={status} onValueChange={(value) => { setStatus(value); setOffset(0); }}>
                        <SelectTrigger className="h-8 w-auto min-w-[112px] gap-2 border-border/30 bg-transparent px-3 text-xs shadow-none">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="active" className="text-xs">Active</SelectItem>
                            <SelectItem value="superseded" className="text-xs">Superseded</SelectItem>
                            <SelectItem value="all" className="text-xs">All</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={sort} onValueChange={(value) => { setSort(value); setOffset(0); }}>
                        <SelectTrigger className="h-8 w-auto min-w-[128px] gap-2 border-border/30 bg-transparent px-3 text-xs shadow-none">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="recent" className="text-xs">Newest first</SelectItem>
                            <SelectItem value="importance" className="text-xs">Most important</SelectItem>
                            <SelectItem value="recalled" className="text-xs">Most recalled</SelectItem>
                            <SelectItem value="stale" className="text-xs">Least used</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {isLoading ? (
                <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-14 w-full rounded-lg" />)}
                </div>
            ) : error ? (
                <p className="py-16 text-center text-xs text-muted-foreground">
                    {error instanceof Error ? error.message : 'Could not load memories.'}
                </p>
            ) : !data || data.memories.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                        <Brain className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">
                        {appliedSearch ? 'Nothing matches that' : 'No memories stored yet'}
                    </p>
                    <p className="mt-0.5 max-w-[42ch] text-xs text-muted-foreground">
                        {appliedSearch
                            ? 'Try a different phrase — this searches stored text, not meaning.'
                            : 'Memories appear here once a request carries a memory field.'}
                    </p>
                </div>
            ) : (
                <div className="overflow-hidden rounded-xl border border-border/30">
                    {data.memories.map((memory) => (
                        <article
                            key={memory.id}
                            className="group flex items-start gap-4 border-b border-border/30 px-4 py-3.5 last:border-b-0 hover:bg-muted/40"
                        >
                            <div className="min-w-0 flex-1">
                                <p className="text-xs leading-5 text-foreground/90">{memory.content}</p>
                                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-4 text-muted-foreground">
                                    <span className="font-mono">{memory.scopeKey}</span>
                                    {memory.namespace && <span className="font-mono">ns:{memory.namespace}</span>}
                                    <span>importance {memory.importance.toFixed(2)}</span>
                                    <span>
                                        {memory.accessCount === 0
                                            ? 'never recalled'
                                            : `recalled ${memory.accessCount}×`}
                                    </span>
                                    <span>written {relativeDay(memory.createdAt)}</span>
                                    {memory.status !== 'active' && (
                                        <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground/70">
                                            {memory.status}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setPendingDelete(memory)}
                                className="h-7 shrink-0 px-2 text-[11px] text-muted-foreground opacity-0 transition-opacity hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100"
                            >
                                <Trash2 className="mr-1 h-3 w-3" />
                                Forget
                            </Button>
                        </article>
                    ))}
                </div>
            )}

            {(offset > 0 || hasNextPage) && (
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>
                        Showing {offset + 1}–{showingTo} of {isEstimate ? '~' : ''}
                        {total.toLocaleString()}
                    </span>
                    <div className="flex gap-2">
                        <Button
                            variant="outline" size="sm"
                            className="h-7 px-2 text-[11px]"
                            disabled={offset === 0}
                            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline" size="sm"
                            className="h-7 px-2 text-[11px]"
                            disabled={!hasNextPage}
                            onClick={() => setOffset(offset + PAGE_SIZE)}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}

            <AlertDialog open={pendingDelete != null} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-sm">Forget this memory?</AlertDialogTitle>
                        <AlertDialogDescription className="text-xs">
                            This is a real deletion, not a hidden flag — the row is removed and the model
                            can never recall it again. The audit log records that it happened; the content
                            does not survive. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    {pendingDelete && (
                        <p className="rounded-md bg-muted px-3 py-2 text-xs leading-5 text-foreground/80">
                            {pendingDelete.content}
                        </p>
                    )}

                    {forget.error && (
                        <p className="text-xs text-red-600">
                            {forget.error instanceof Error ? forget.error.message : 'Could not forget that memory.'}
                        </p>
                    )}

                    <AlertDialogFooter>
                        <AlertDialogCancel className="h-8 text-xs">Keep it</AlertDialogCancel>
                        <AlertDialogAction
                            className="h-8 bg-red-600 text-xs hover:bg-red-600/90"
                            disabled={forget.isPending}
                            onClick={(event) => {
                                event.preventDefault();
                                if (pendingDelete) forget.mutate(pendingDelete.id);
                            }}
                        >
                            {forget.isPending ? 'Forgetting…' : 'Forget permanently'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
