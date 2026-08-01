'use client';

import { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface CacheSettingsPanelProps {
    projectId?: string;
}

interface CacheSettings {
    cache_enabled: boolean;
    exact_match_enabled: boolean;
    semantic_match_enabled: boolean;
    ttl_seconds: number;
    similarity_threshold: number;
    max_entries: number;
    excluded_models: string[];
    max_cacheable_temperature: number;
}

function formatTTL(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
    return `${(seconds / 86400).toFixed(1)}d`;
}

export function CacheSettingsPanel({ projectId }: CacheSettingsPanelProps) {
    const queryClient = useQueryClient();
    const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});
    const [excludedInput, setExcludedInput] = useState('');

    const { data: settings, isLoading } = useQuery<CacheSettings>({
        queryKey: ['cacheSettings', projectId],
        queryFn: async () => {
            const res = await fetch(`/api/projects/${projectId}/cache/settings`);
            if (!res.ok) throw new Error('Failed to fetch cache settings');
            return res.json();
        },
        staleTime: 60 * 1000,
        enabled: !!projectId,
    });

    const mutation = useMutation({
        mutationFn: async (updates: Partial<CacheSettings>) => {
            const res = await fetch(`/api/projects/${projectId}/cache/settings`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });
            if (!res.ok) throw new Error('Failed to update cache settings');
            return res.json();
        },
        onMutate: async (updates) => {
            // Optimistic update - cancel outgoing refetches
            await queryClient.cancelQueries({ queryKey: ['cacheSettings', projectId] });

            // Snapshot previous value
            const previous = queryClient.getQueryData<CacheSettings>(['cacheSettings', projectId]);

            // Optimistically update
            queryClient.setQueryData(['cacheSettings', projectId], (old: CacheSettings | undefined) => ({
                ...old,
                ...updates,
            }));

            return { previous };
        },
        onError: (_err, _vars, context) => {
            // Rollback on error
            if (context?.previous) {
                queryClient.setQueryData(['cacheSettings', projectId], context.previous);
            }
        },
        onSettled: () => {
            // Don't invalidate - data is already optimistically updated
        },
    });

    const update = useCallback(<K extends keyof CacheSettings,>(field: K, value: CacheSettings[K]) => {
        if (debounceTimers.current[field]) {
            clearTimeout(debounceTimers.current[field]);
        }

        if (field === 'ttl_seconds' || field === 'similarity_threshold' || field === 'max_entries' || field === 'max_cacheable_temperature') {
            debounceTimers.current[field] = setTimeout(() => {
                mutation.mutate({ [field]: value });
                delete debounceTimers.current[field];
            }, 300);
        } else {
            mutation.mutate({ [field]: value });
        }
    }, [mutation]);

    if (!projectId || isLoading || !settings) {
        return (
            <div className="space-y-6">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Master toggle */}
            <div className="rounded-xl border border-border/30 bg-card p-5">
                <div className="flex items-center justify-between">
                    <div>
                        <Label className="text-sm font-medium">Enable Prompt Cache</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Cache AI responses to reduce latency and cost for repeated prompts.
                        </p>
                    </div>
                    <Switch
                        checked={settings.cache_enabled}
                        onCheckedChange={(v) => update('cache_enabled', v)}
                    />
                </div>
            </div>

            <div className={cn(!settings.cache_enabled && 'opacity-50 pointer-events-none')}>
                {/* Cache modes */}
                <div className="rounded-xl border border-border/30 bg-card p-5 space-y-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cache Modes</p>

                    <div className="flex items-center justify-between">
                        <div>
                            <Label className="text-sm">Exact Match</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Returns cached response when the prompt is identical.
                            </p>
                        </div>
                        <Switch
                            checked={settings.exact_match_enabled}
                            onCheckedChange={(v) => update('exact_match_enabled', v)}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <Label className="text-sm">Semantic Match</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Returns cached response when the prompt is semantically similar.
                            </p>
                        </div>
                        <Switch
                            checked={settings.semantic_match_enabled}
                            onCheckedChange={(v) => update('semantic_match_enabled', v)}
                        />
                    </div>

                    {settings.semantic_match_enabled && (
                        <div className="pt-2">
                            <div className="flex items-center justify-between mb-2">
                                <Label className="text-xs text-muted-foreground">Similarity Threshold</Label>
                                <span className="text-xs font-mono tabular-nums">{(settings.similarity_threshold * 100).toFixed(0)}%</span>
                            </div>
                            <Slider
                                value={settings.similarity_threshold * 100}
                                min={80}
                                max={100}
                                step={1}
                                showValue={false}
                                onChange={(v) => update('similarity_threshold', v / 100)}
                            />
                            <p className="text-[10px] text-muted-foreground/50 mt-1">
                                Higher = stricter matching. 95%+ recommended for production.
                            </p>
                        </div>
                    )}
                </div>

                {/* TTL */}
                <div className="rounded-xl border border-border/30 bg-card p-5 mt-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Cache Duration</p>
                    <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs text-muted-foreground">Time-to-Live (TTL)</Label>
                        <span className="text-xs font-mono tabular-nums">{formatTTL(settings.ttl_seconds)}</span>
                    </div>
                    <Slider
                        value={settings.ttl_seconds}
                        min={60}
                        max={86400}
                        step={60}
                        showValue={false}
                        onChange={(v) => update('ttl_seconds', v)}
                    />
                    <div className="flex justify-between mt-1">
                        <span className="text-[10px] text-muted-foreground/40">1 min</span>
                        <span className="text-[10px] text-muted-foreground/40">24 hours</span>
                    </div>
                </div>

                {/* Limits */}
                <div className="rounded-xl border border-border/30 bg-card p-5 mt-4 space-y-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Limits</p>

                    <div>
                        <Label className="text-xs text-muted-foreground">Max Cacheable Temperature</Label>
                        <p className="text-[10px] text-muted-foreground/50 mb-2">
                            Only cache responses when temperature is at or below this value.
                        </p>
                        <Input
                            type="number"
                            value={settings.max_cacheable_temperature}
                            min={0}
                            max={2}
                            step={0.1}
                            className="w-24 h-8 text-sm"
                            onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                if (!isNaN(v)) update('max_cacheable_temperature', v);
                            }}
                        />
                    </div>

                    <div>
                        <Label className="text-xs text-muted-foreground">Max Cache Entries</Label>
                        <p className="text-[10px] text-muted-foreground/50 mb-2">
                            Maximum number of cached prompts per project.
                        </p>
                        <Input
                            type="number"
                            value={settings.max_entries}
                            min={100}
                            max={100000}
                            step={100}
                            className="w-32 h-8 text-sm"
                            onChange={(e) => {
                                const v = parseInt(e.target.value);
                                if (!isNaN(v)) update('max_entries', v);
                            }}
                        />
                    </div>
                </div>

                {/* Excluded models */}
                <div className="rounded-xl border border-border/30 bg-card p-5 mt-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Excluded Models</p>
                    <p className="text-[10px] text-muted-foreground/50 mb-3">
                        Models that should never be cached (e.g., reasoning models).
                    </p>

                    {settings.excluded_models.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                            {settings.excluded_models.map(m => (
                                <button
                                    key={m}
                                    onClick={() => update('excluded_models', settings.excluded_models.filter(x => x !== m))}
                                    className="inline-flex items-center gap-1 text-xs bg-secondary px-2 py-0.5 rounded-md hover:bg-destructive/20 transition-colors"
                                >
                                    {m}
                                    <span className="text-muted-foreground/40">&times;</span>
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="flex gap-2">
                        <Input
                            placeholder="e.g. o3-mini"
                            value={excludedInput}
                            onChange={(e) => setExcludedInput(e.target.value)}
                            className="h-8 text-sm flex-1"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && excludedInput.trim()) {
                                    update('excluded_models', [...settings.excluded_models, excludedInput.trim()]);
                                    setExcludedInput('');
                                }
                            }}
                        />
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            disabled={!excludedInput.trim()}
                            onClick={() => {
                                if (excludedInput.trim()) {
                                    update('excluded_models', [...settings.excluded_models, excludedInput.trim()]);
                                    setExcludedInput('');
                                }
                            }}
                        >
                            Add
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
