'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

interface MemoryForgetSuggestionsProps {
    projectId: string;
}

interface Suggestion {
    id: string;
    content: string;
    scopeKey: string;
    namespace: string | null;
    importance: number;
    accessCount: number;
    strength: number;
    idleDays: number;
}

interface SuggestionsResponse {
    suggestions: Suggestion[];
    bands: { strong: number; weak: number; stale: number };
    scanned: number;
    scanCapped: boolean;
    minIdleDays: number;
}

const IDLE_CHOICES = [
    { value: '30', label: 'Idle 30+ days' },
    { value: '60', label: 'Idle 60+ days' },
    { value: '90', label: 'Idle 90+ days' },
    { value: '180', label: 'Idle 180+ days' },
];

function Band({ label, count, total, tone }: { label: string; count: number; total: number; tone: string }) {
    const share = total > 0 ? Math.round((count / total) * 100) : 0;
    return (
        <div className="border-b border-border/30 px-6 py-5 md:border-b-0 md:border-r last:md:border-r-0">
            <p className="text-[11px] leading-4 text-muted-foreground">{label}</p>
            <p className="mt-2 font-mono text-lg font-medium leading-none tracking-[-0.03em] tabular-nums">{count}</p>
            <span className="mt-3 block h-1 w-full overflow-hidden rounded-full bg-muted">
                <span className={`block h-full rounded-full ${tone}`} style={{ width: `${share}%` }} />
            </span>
        </div>
    );
}

export function MemoryForgetSuggestions({ projectId }: MemoryForgetSuggestionsProps) {
    const queryClient = useQueryClient();
    const [minIdleDays, setMinIdleDays] = useState('60');
    const [forgotten, setForgotten] = useState<Set<string>>(new Set());

    const { data, isLoading, error } = useQuery({
        queryKey: ['memoryForgetSuggestions', projectId, minIdleDays],
        queryFn: async (): Promise<SuggestionsResponse> => {
            const response = await fetch(
                `/api/projects/${projectId}/memory/forget-suggestions?minIdleDays=${minIdleDays}`
            );
            if (!response.ok) {
                const body = await response.json().catch(() => null);
                throw new Error(body?.error || 'We could not evaluate memory strength.');
            }
            return response.json();
        },
        staleTime: 30_000,
    });

    const forget = useMutation({
        mutationFn: async (memoryId: string) => {
            const response = await fetch(`/api/projects/${projectId}/memory/entries/${memoryId}`, { method: 'DELETE' });
            if (!response.ok) {
                const body = await response.json().catch(() => null);
                throw new Error(body?.error || 'We could not forget that memory.');
            }
            return memoryId;
        },
        onSuccess: (memoryId) => {
            setForgotten(prev => new Set(prev).add(memoryId));
            queryClient.invalidateQueries({ queryKey: ['memoryOverview', projectId] });
            queryClient.invalidateQueries({ queryKey: ['memoryEntries', projectId] });
        },
    });

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-64 w-full rounded-xl" />
            </div>
        );
    }

    if (error || !data) {
        return (
            <p className="py-16 text-center text-xs text-muted-foreground">
                {error instanceof Error ? error.message : 'Could not evaluate memory strength.'}
            </p>
        );
    }

    const { bands, suggestions, scanned } = data;

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-sm font-medium tracking-[-0.01em]">Forgetting</h2>
                <p className="mt-1 max-w-[64ch] text-[11px] leading-4 text-muted-foreground">
                    A memory system gets worse the moment it remembers everything. Strength weighs
                    importance, how recently a memory was used, and how often it has proven useful —
                    decay keys on last use, so a fact recalled yesterday stays strong however old it is.
                    Nothing here is deleted automatically; these are candidates for a human to confirm.
                </p>
            </div>

            <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-border/30 md:grid-cols-3">
                <Band label="Strong" count={bands.strong} total={scanned} tone="bg-foreground" />
                <Band label="Weak" count={bands.weak} total={scanned} tone="bg-amber-500" />
                <Band label="Stale" count={bands.stale} total={scanned} tone="bg-red-500" />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] leading-4 text-muted-foreground">
                    {suggestions.length === 0
                        ? `${scanned.toLocaleString()} memories evaluated.`
                        : `${suggestions.length} candidates, weakest first.`}
                    {data.scanCapped && ' Evaluation is capped at the weakest 2,000.'}
                </p>

                <Select value={minIdleDays} onValueChange={setMinIdleDays}>
                    <SelectTrigger className="h-8 w-auto min-w-[132px] gap-2 border-border/30 bg-transparent px-3 text-xs shadow-none">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {IDLE_CHOICES.map(choice => (
                            <SelectItem key={choice.value} value={choice.value} className="text-xs">
                                {choice.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {suggestions.length === 0 ? (
                <div className="flex flex-col items-center py-14 text-center">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                        <Sparkles className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">Nothing stale enough to suggest</p>
                    <p className="mt-0.5 max-w-[46ch] text-xs text-muted-foreground">
                        Everything stored is still earning its place. Lower the idle threshold to
                        see weaker candidates.
                    </p>
                </div>
            ) : (
                <div className="overflow-hidden rounded-xl border border-border/30">
                    {suggestions.map(suggestion => {
                        const isGone = forgotten.has(suggestion.id);
                        return (
                            <article
                                key={suggestion.id}
                                className={`flex items-start gap-4 border-b border-border/30 px-4 py-3.5 last:border-b-0 ${isGone ? 'opacity-40' : 'hover:bg-muted/40'}`}
                            >
                                <div className="min-w-0 flex-1">
                                    <p className={`text-xs leading-5 ${isGone ? 'line-through text-muted-foreground' : 'text-foreground/90'}`}>
                                        {suggestion.content}
                                    </p>
                                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-4 text-muted-foreground">
                                        <span className="font-mono">{suggestion.scopeKey}</span>
                                        <span>strength {suggestion.strength.toFixed(2)}</span>
                                        <span>idle {suggestion.idleDays}d</span>
                                        <span>
                                            {suggestion.accessCount === 0
                                                ? 'never recalled'
                                                : `recalled ${suggestion.accessCount}×`}
                                        </span>
                                    </div>
                                </div>

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={isGone || forget.isPending}
                                    onClick={() => forget.mutate(suggestion.id)}
                                    className="h-7 shrink-0 px-2 text-[11px] text-muted-foreground hover:text-red-600"
                                >
                                    <Trash2 className="mr-1 h-3 w-3" />
                                    {isGone ? 'Forgotten' : 'Forget'}
                                </Button>
                            </article>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
