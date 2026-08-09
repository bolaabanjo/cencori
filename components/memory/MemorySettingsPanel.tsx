'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

interface MemorySettingsPanelProps {
    projectId: string;
}

interface MemorySettings {
    enabled: boolean;
    graphEnabled: boolean;
    extractionModel: string;
    extractionPrompt: string | null;
    minImportance: number;
    maxMemoriesPerExchange: number;
    sessionTtlSeconds: number;
}

interface SettingsResponse {
    settings: MemorySettings;
    modelChoices: { value: string; label: string; hint: string }[];
}

function Row({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-3 border-b border-border/30 px-6 py-5 last:border-b-0 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-[52ch]">
                <p className="text-xs font-medium text-foreground/90">{title}</p>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{description}</p>
            </div>
            <div className="shrink-0 sm:pt-0.5">{children}</div>
        </div>
    );
}

export function MemorySettingsPanel({ projectId }: MemorySettingsPanelProps) {
    const queryClient = useQueryClient();
    const [draft, setDraft] = useState<MemorySettings | null>(null);

    const { data, isLoading, error } = useQuery({
        queryKey: ['memorySettings', projectId],
        queryFn: async (): Promise<SettingsResponse> => {
            const response = await fetch(`/api/projects/${projectId}/memory/settings`);
            if (!response.ok) {
                const body = await response.json().catch(() => null);
                throw new Error(body?.error || 'We could not load memory settings.');
            }
            return response.json();
        },
    });

    useEffect(() => {
        if (data?.settings && !draft) setDraft(data.settings);
    }, [data, draft]);

    const save = useMutation({
        mutationFn: async (settings: MemorySettings) => {
            const response = await fetch(`/api/projects/${projectId}/memory/settings`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => null);
                throw new Error(body?.error || 'We could not save memory settings.');
            }
            return response.json() as Promise<SettingsResponse>;
        },
        onSuccess: (result) => {
            setDraft(result.settings);
            queryClient.setQueryData(['memorySettings', projectId], (previous: SettingsResponse | undefined) =>
                previous
                    ? { settings: result.settings, modelChoices: result.modelChoices ?? previous.modelChoices }
                    : previous
            );
            queryClient.invalidateQueries({ queryKey: ['memoryOverview', projectId] });
        },
    });

    if (isLoading || !draft) {
        return <Skeleton className="h-96 w-full rounded-xl" />;
    }

    if (error) {
        return (
            <p className="py-16 text-center text-xs text-muted-foreground">
                {error instanceof Error ? error.message : 'Could not load memory settings.'}
            </p>
        );
    }

    const saved = data?.settings;
    const isDirty = saved ? JSON.stringify(saved) !== JSON.stringify(draft) : false;
    const patch = (changes: Partial<MemorySettings>) => setDraft(current => (current ? { ...current, ...changes } : current));

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-sm font-medium tracking-[-0.01em]">Controls</h2>
                <p className="mt-1 max-w-[64ch] text-[11px] leading-4 text-muted-foreground">
                    Memory is opt-in per request — a call only remembers when it carries a{' '}
                    <span className="font-mono">memory</span> field. These settings govern what happens
                    when it does.
                </p>
            </div>

            <div className="overflow-hidden rounded-xl border border-border/30">
                <Row
                    title="Memory enabled"
                    description="The kill switch. Off rejects every memory request for this project — stored memories are kept, not deleted."
                >
                    <Switch checked={draft.enabled} onCheckedChange={(value) => patch({ enabled: value })} />
                </Row>

                <Row
                    title="Entity graph"
                    description="Extract entities and relations on write so recall can walk from one thing to what it's connected to. Costs a second extraction call per exchange; off leaves memory a semantic store."
                >
                    <Switch checked={draft.graphEnabled} onCheckedChange={(value) => patch({ graphEnabled: value })} />
                </Row>

                <Row
                    title="Extraction model"
                    description="Runs on Cencori's managed keys, never your provider keys — a memory call must not cascade into a paid provider you didn't budget for."
                >
                    <Select value={draft.extractionModel} onValueChange={(value) => patch({ extractionModel: value })}>
                        <SelectTrigger className="h-8 w-[200px] gap-2 border-border/30 bg-transparent px-3 text-xs shadow-none">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {(data?.modelChoices ?? []).map(choice => (
                                <SelectItem key={choice.value} value={choice.value} className="text-xs">
                                    {choice.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Row>

                <Row
                    title="Minimum importance"
                    description="Facts scoring below this are dropped rather than stored. Higher means a smaller, sharper store."
                >
                    <Input
                        type="number" min={0} max={1} step={0.05}
                        value={draft.minImportance}
                        onChange={(event) => patch({ minImportance: Number(event.target.value) })}
                        className="h-8 w-[92px] border-border/30 bg-transparent text-xs shadow-none"
                    />
                </Row>

                <Row
                    title="Max memories per exchange"
                    description="Ceiling on how many facts one turn can produce. Keeps a long message from flooding the store."
                >
                    <Input
                        type="number" min={1} max={20} step={1}
                        value={draft.maxMemoriesPerExchange}
                        onChange={(event) => patch({ maxMemoriesPerExchange: Number(event.target.value) })}
                        className="h-8 w-[92px] border-border/30 bg-transparent text-xs shadow-none"
                    />
                </Row>

                <Row
                    title="Session memory lifetime"
                    description="How long session-scope memories live in Redis. User-scope memories are unaffected — those survive new chats and new devices by design."
                >
                    <Select
                        value={String(draft.sessionTtlSeconds)}
                        onValueChange={(value) => patch({ sessionTtlSeconds: Number(value) })}
                    >
                        <SelectTrigger className="h-8 w-[132px] gap-2 border-border/30 bg-transparent px-3 text-xs shadow-none">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="3600" className="text-xs">1 hour</SelectItem>
                            <SelectItem value="86400" className="text-xs">24 hours</SelectItem>
                            <SelectItem value="604800" className="text-xs">7 days</SelectItem>
                            <SelectItem value="2592000" className="text-xs">30 days</SelectItem>
                        </SelectContent>
                    </Select>
                </Row>
            </div>

            <div className="overflow-hidden rounded-xl border border-border/30 px-6 py-5">
                <Label htmlFor="extraction-prompt" className="text-xs font-medium text-foreground/90">
                    Extraction prompt
                </Label>
                <p className="mt-1 max-w-[64ch] text-[11px] leading-4 text-muted-foreground">
                    Override what counts as worth remembering. Leave empty for the default, which favours
                    durable preferences and facts over conversational chatter.
                </p>
                <Textarea
                    id="extraction-prompt"
                    value={draft.extractionPrompt ?? ''}
                    onChange={(event) => patch({ extractionPrompt: event.target.value })}
                    placeholder="Default extraction prompt"
                    rows={5}
                    className="mt-3 border-border/30 bg-transparent text-xs shadow-none"
                />
            </div>

            <div className="flex items-center justify-between gap-4">
                <p className="text-[11px] leading-4 text-muted-foreground">
                    {save.isSuccess && !isDirty
                        ? 'Saved. The gateway picks this up immediately.'
                        : save.error
                            ? (save.error instanceof Error ? save.error.message : 'Could not save settings.')
                            : isDirty ? 'Unsaved changes' : ' '}
                </p>

                <div className="flex gap-2">
                    <Button
                        variant="outline" size="sm"
                        className="h-8 px-3 text-xs"
                        disabled={!isDirty || save.isPending}
                        onClick={() => saved && setDraft(saved)}
                    >
                        Discard
                    </Button>
                    <Button
                        size="sm"
                        className="h-8 px-3 text-xs"
                        disabled={!isDirty || save.isPending}
                        onClick={() => draft && save.mutate(draft)}
                    >
                        {save.isPending ? 'Saving…' : 'Save changes'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
