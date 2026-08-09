'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Network, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { MemoryUserPicker } from '@/components/memory/MemoryUserPicker';

interface MemoryGraphExplorerProps {
    projectId: string;
}

interface GraphEntity {
    id: string;
    name: string;
    type: string;
    aliases: string[];
    mentionCount: number;
    facts: number;
    hops?: number;
    path?: string[];
}

interface GraphResponse {
    /** Users matching the current search, before the page limit. */
    totalUsers?: number;
    seed: GraphEntity | null;
    entities: GraphEntity[];
    edges: { source: string; relation: string; target: string }[];
}

const TYPE_TONE: Record<string, string> = {
    person: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
    org: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
    place: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    project: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
};

export function MemoryGraphExplorer({ projectId }: MemoryGraphExplorerProps) {
    const [scopeKey, setScopeKey] = useState('');
    const [focus, setFocus] = useState('');
    const [hops, setHops] = useState('2');

    // How many end-users have a graph at all — so the empty state can tell
    // "nothing extracted yet" apart from "you haven't picked anyone".
    const { data: userSummary, isLoading: summaryLoading } = useQuery({
        queryKey: ['memoryGraphUsers', projectId, ''],
        queryFn: async (): Promise<GraphResponse> => {
            const response = await fetch(`/api/projects/${projectId}/memory/graph`);
            if (!response.ok) throw new Error('We could not load the entity graph.');
            return response.json();
        },
        staleTime: 30_000,
    });

    const params = new URLSearchParams();
    if (scopeKey) params.set('userId', scopeKey);
    if (focus) { params.set('entity', focus); params.set('hops', hops); }

    const { data, isLoading, error } = useQuery({
        queryKey: ['memoryGraph', projectId, scopeKey, focus, hops],
        queryFn: async (): Promise<GraphResponse> => {
            const response = await fetch(`/api/projects/${projectId}/memory/graph?${params.toString()}`);
            if (!response.ok) {
                const body = await response.json().catch(() => null);
                throw new Error(body?.error || 'We could not load the entity graph.');
            }
            return response.json();
        },
        enabled: Boolean(scopeKey),
        staleTime: 30_000,
    });

    const totalUsers = userSummary?.totalUsers ?? 0;
    const entities = data?.entities ?? [];
    const edges = data?.edges ?? [];
    const hasNoGraph = !summaryLoading && totalUsers === 0;

    const selectUser = (value: string) => {
        setScopeKey(value);
        setFocus('');
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-sm font-medium tracking-[-0.01em]">Entity graph</h2>
                <p className="mt-1 max-w-[64ch] text-[11px] leading-4 text-muted-foreground">
                    What recall can walk. Facts become entities and typed relations, so a question about
                    one thing can reach what it is connected to — the second hop that similarity alone
                    never returns. This is the same traversal the model gets.
                </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <MemoryUserPicker
                    projectId={projectId}
                    value={scopeKey}
                    onChange={selectUser}
                    source="graph"
                    placeholder="Search end-users…"
                    emptyLabel="No end-user has a graph yet."
                />

                {scopeKey && (
                    <Button
                        variant="ghost" size="sm"
                        onClick={() => { setScopeKey(''); setFocus(''); }}
                        className="h-8 px-2 text-[11px] text-muted-foreground"
                    >
                        <X className="mr-1 h-3 w-3" />
                        Clear user
                    </Button>
                )}

                {focus && (
                    <>
                        <Select value={hops} onValueChange={setHops}>
                            <SelectTrigger className="h-8 w-auto min-w-[92px] gap-2 border-border/30 bg-transparent px-3 text-xs shadow-none">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {['1', '2', '3', '4'].map(value => (
                                    <SelectItem key={value} value={value} className="text-xs">{value} hops</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Button
                            variant="ghost" size="sm"
                            onClick={() => setFocus('')}
                            className="h-8 px-2 text-[11px] text-muted-foreground"
                        >
                            <X className="mr-1 h-3 w-3" />
                            Clear focus on {focus}
                        </Button>
                    </>
                )}
            </div>

            {!scopeKey ? (
                <div className="flex flex-col items-center py-16 text-center">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                        <Network className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">
                        {hasNoGraph ? 'No graph yet' : 'Pick an end-user to explore'}
                    </p>
                    <p className="mt-0.5 max-w-[46ch] text-xs text-muted-foreground">
                        {hasNoGraph
                            ? 'Entities and relations are extracted on every memory writeback. They will appear here as your users talk.'
                            : `${totalUsers.toLocaleString()} end-user${totalUsers === 1 ? ' has' : 's have'} a graph. Each one is separate — memories never cross that boundary.`}
                    </p>
                </div>
            ) : isLoading ? (
                <div className="grid gap-4 lg:grid-cols-2">
                    <Skeleton className="h-72 w-full rounded-xl" />
                    <Skeleton className="h-72 w-full rounded-xl" />
                </div>
            ) : error ? (
                <p className="py-16 text-center text-xs text-muted-foreground">
                    {error instanceof Error ? error.message : 'Could not load the entity graph.'}
                </p>
            ) : entities.length === 0 ? (
                <p className="py-14 text-center text-xs text-muted-foreground">
                    Nothing in this user&apos;s graph{focus ? ` reachable from “${focus}”` : ''} yet.
                </p>
            ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                    <section className="overflow-hidden rounded-xl border border-border/30">
                        <header className="border-b border-border/30 px-4 py-3">
                            <p className="text-[13px] font-medium text-foreground/80">
                                {focus ? 'Reachable entities' : 'Entities'}
                            </p>
                            <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                                {focus
                                    ? `Within ${hops} hops of ${focus}, nearest first.`
                                    : 'Most mentioned first. Select one to walk out from it.'}
                            </p>
                        </header>

                        <ul className="max-h-[26rem] overflow-y-auto">
                            {entities.map(entity => (
                                <li key={entity.id}>
                                    <button
                                        type="button"
                                        onClick={() => setFocus(entity.name)}
                                        className="flex w-full items-center gap-3 border-b border-border/30 px-4 py-2.5 text-left last:border-b-0 hover:bg-muted/40"
                                    >
                                        <span className="min-w-0 flex-1 truncate text-xs text-foreground/90">{entity.name}</span>

                                        {entity.hops != null && (
                                            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                                                {entity.hops === 0 ? 'seed' : `${entity.hops} hop${entity.hops > 1 ? 's' : ''}`}
                                            </span>
                                        )}

                                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_TONE[entity.type] ?? 'bg-muted text-muted-foreground'}`}>
                                            {entity.type}
                                        </span>

                                        <span className="w-16 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                                            {entity.facts} fact{entity.facts === 1 ? '' : 's'}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section className="overflow-hidden rounded-xl border border-border/30">
                        <header className="border-b border-border/30 px-4 py-3">
                            <p className="text-[13px] font-medium text-foreground/80">Relations</p>
                            <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                                {edges.length === 0
                                    ? 'No relations extracted yet — entities without edges still link to their facts.'
                                    : 'Typed edges the walk follows in either direction.'}
                            </p>
                        </header>

                        <ul className="max-h-[26rem] overflow-y-auto">
                            {edges.map((edge, index) => (
                                <li
                                    key={`${edge.source}-${edge.relation}-${edge.target}-${index}`}
                                    className="flex items-center gap-2 border-b border-border/30 px-4 py-2.5 text-xs last:border-b-0"
                                >
                                    <span className="min-w-0 flex-1 truncate text-right text-foreground/90">{edge.source}</span>
                                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                        {edge.relation}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-foreground/90">{edge.target}</span>
                                </li>
                            ))}
                        </ul>
                    </section>
                </div>
            )}
        </div>
    );
}
