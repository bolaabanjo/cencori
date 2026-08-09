'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/**
 * End-user picker for a project's memory.
 *
 * Never a preloaded list: a project can hold memories for far more end-users
 * than a dropdown could ever show, so this searches server-side and displays a
 * bounded page — plus a "use as-is" path for an operator who already knows the
 * id they want.
 */

export interface MemoryUser {
    scopeKey: string;
    /** Memories (source="memories") or entities (source="graph") for this user. */
    count: number;
}

interface MemoryUserPickerProps {
    projectId: string;
    value: string;
    onChange: (scopeKey: string) => void;
    /** Which population to search: everyone with memories, or with a graph. */
    source: 'memories' | 'graph';
    placeholder?: string;
    /** Shown when the project has no users in this population at all. */
    emptyLabel?: string;
    className?: string;
}

interface UserListResponse {
    users?: { scopeKey: string; entities?: number; memories?: number }[];
    totalUsers?: number;
}

function useDebounced<T>(value: T, delay = 250): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);
    return debounced;
}

export function MemoryUserPicker({
    projectId,
    value,
    onChange,
    source,
    placeholder = 'Search end-users…',
    emptyLabel = 'No end-user found.',
    className = 'w-[264px]',
}: MemoryUserPickerProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounced(search);

    const { data, isLoading } = useQuery({
        queryKey: ['memoryUsers', projectId, source, debouncedSearch],
        queryFn: async (): Promise<UserListResponse> => {
            const params = new URLSearchParams();
            if (debouncedSearch) params.set('userSearch', debouncedSearch);
            const path = source === 'graph'
                ? `memory/graph?${params.toString()}`
                : `memory/entries?users=1&${params.toString()}`;

            const response = await fetch(`/api/projects/${projectId}/${path}`);
            if (!response.ok) {
                const body = await response.json().catch(() => null);
                throw new Error(body?.error || 'We could not load end-users.');
            }
            return response.json();
        },
        staleTime: 30_000,
    });

    const users: MemoryUser[] = (data?.users ?? []).map(user => ({
        scopeKey: user.scopeKey,
        count: Number(user.entities ?? user.memories ?? 0),
    }));
    const totalUsers = data?.totalUsers ?? users.length;
    const trimmedSearch = search.trim();
    const canUseRaw = trimmedSearch.length > 0 && !users.some(user => user.scopeKey === trimmedSearch);

    const select = (scopeKey: string) => {
        onChange(scopeKey);
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={`h-8 justify-between border-border/30 bg-transparent px-3 text-xs font-normal shadow-none ${className}`}
                >
                    <span className={`truncate ${value ? 'font-mono' : 'text-muted-foreground'}`}>
                        {value || placeholder}
                    </span>
                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>

            <PopoverContent className="w-[320px] p-0" align="start">
                {/* Matching happens server-side, so this list is a page of
                    results rather than a filterable local set. */}
                <Command shouldFilter={false}>
                    <CommandInput
                        value={search}
                        onValueChange={setSearch}
                        placeholder="Search by user id…"
                        className="text-xs"
                    />
                    <CommandList>
                        {isLoading ? (
                            <div className="px-3 py-6 text-center text-[11px] text-muted-foreground">Searching…</div>
                        ) : (
                            <>
                                <CommandEmpty className="px-3 py-6 text-center text-[11px] text-muted-foreground">
                                    {/* "Nothing here yet" and "your search found
                                        nothing" are different problems. */}
                                    {debouncedSearch ? 'No end-user matches that.' : emptyLabel}
                                </CommandEmpty>

                                {users.length > 0 && (
                                    <CommandGroup
                                        heading={
                                            debouncedSearch
                                                ? `${users.length} of ${totalUsers.toLocaleString()} matches`
                                                : totalUsers > users.length
                                                    ? `Largest first — ${users.length} of ${totalUsers.toLocaleString()} users`
                                                    : 'End-users'
                                        }
                                    >
                                        {users.map(user => (
                                            <CommandItem
                                                key={user.scopeKey}
                                                value={user.scopeKey}
                                                onSelect={select}
                                                className="gap-2 text-xs"
                                            >
                                                <Check className={`h-3 w-3 shrink-0 ${value === user.scopeKey ? 'opacity-100' : 'opacity-0'}`} />
                                                <span className="min-w-0 flex-1 truncate font-mono">{user.scopeKey}</span>
                                                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                                                    {user.count}
                                                </span>
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                )}

                                {canUseRaw && (
                                    <CommandGroup heading="Exact id">
                                        <CommandItem value={trimmedSearch} onSelect={select} className="gap-2 text-xs">
                                            <span className="truncate font-mono">{trimmedSearch}</span>
                                            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">use as-is</span>
                                        </CommandItem>
                                    </CommandGroup>
                                )}
                            </>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
