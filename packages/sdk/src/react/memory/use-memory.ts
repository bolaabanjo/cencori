/**
 * useMemory
 *
 * Client hook over the scoped memory API (`/v1/memory/*`) for building custom
 * "what we remember about you" UI — GDPR panels, preference editors, profile
 * pages. Mirrors the roadmap sketch:
 *
 *   const { memories, write, forget, search, exportAll } = useMemory({ userId });
 *
 * Reads on mount and after every mutation. Zero external state.
 *
 * Deps: react.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

// ── Public types ────────────────────────────────────────────────

export type MemoryScope = 'session' | 'user';

export interface UseMemoryOptions {
    /** End-user id — scope defaults to `user`. */
    userId?: string;
    /** Session id — pass with `scope: 'session'`. */
    sessionId?: string;
    /** Which scope to read/write. Default: `user`. */
    scope?: MemoryScope;
    /** Optional sub-scope partition (e.g. per-project). */
    namespace?: string;
    /** Cencori API key. Sent as `CENCORI_API_KEY`. */
    apiKey?: string;
    /** Gateway base URL. Default: `https://cencori.com`. */
    baseUrl?: string;
    /** How many memories to list. Default: 50. */
    limit?: number;
    /** Skip the initial list on mount. Default: false. */
    manual?: boolean;
}

export interface UserMemory {
    id: string;
    content: string;
    namespace?: string | null;
    importance: number;
    createdAt: string | null;
}

export interface UseMemoryResult {
    /** The user's memories, most recent first. */
    memories: UserMemory[];
    /** True during the initial load or a refresh. */
    loading: boolean;
    /** Last error message, if any. */
    error: string | null;
    /** Re-fetch the list. */
    refresh: () => Promise<void>;
    /** Write a new memory for this user. */
    write: (content: string, opts?: { importance?: number; metadata?: Record<string, unknown> }) => Promise<void>;
    /** Semantic search over this user's memories (does not mutate the list). */
    search: (query: string, topK?: number) => Promise<UserMemory[]>;
    /** Hard-delete a memory by id. */
    forget: (id: string) => Promise<void>;
    /** Download every memory as a JSON file (client-side GDPR export). */
    exportAll: () => Promise<void>;
}

const DEFAULT_BASE_URL = 'https://cencori.com';

export function useMemory(options: UseMemoryOptions): UseMemoryResult {
    const {
        userId,
        sessionId,
        scope = 'user',
        namespace,
        apiKey,
        baseUrl = DEFAULT_BASE_URL,
        limit = 50,
        manual = false,
    } = options;

    const [memories, setMemories] = useState<UserMemory[]>([]);
    const [loading, setLoading] = useState(!manual);
    const [error, setError] = useState<string | null>(null);

    const base = useMemo(() => baseUrl.replace(/\/$/, ''), [baseUrl]);

    const headers = useMemo(() => {
        const h: Record<string, string> = { 'Content-Type': 'application/json' };
        if (apiKey) h['CENCORI_API_KEY'] = apiKey;
        return h;
    }, [apiKey]);

    const scopeBody = useCallback(
        () => ({ userId, sessionId, scope, namespace }),
        [userId, sessionId, scope, namespace]
    );

    const request = useCallback(
        async <T,>(path: string, init: RequestInit): Promise<T> => {
            const res = await fetch(`${base}${path}`, { ...init, headers });
            if (!res.ok) {
                const data = (await res.json().catch(() => ({}))) as { message?: string; error?: { message?: string } };
                throw new Error(data.error?.message || data.message || `Request failed (${res.status})`);
            }
            return res.json() as Promise<T>;
        },
        [base, headers]
    );

    const refresh = useCallback(async () => {
        if (!userId && !sessionId) return;
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (userId) params.set('userId', userId);
            if (sessionId) params.set('sessionId', sessionId);
            params.set('scope', scope);
            if (namespace) params.set('namespace', namespace);
            params.set('limit', String(limit));
            const data = await request<{ memories: UserMemory[] }>(
                `/v1/memory/list?${params.toString()}`,
                { method: 'GET' }
            );
            setMemories(data.memories ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }, [userId, sessionId, scope, namespace, limit, request]);

    useEffect(() => {
        if (!manual) void refresh();
    }, [manual, refresh]);

    const write = useCallback<UseMemoryResult['write']>(
        async (content, opts) => {
            setError(null);
            try {
                await request('/v1/memory/write', {
                    method: 'POST',
                    body: JSON.stringify({ ...scopeBody(), content, ...opts }),
                });
                await refresh();
            } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
                throw err;
            }
        },
        [request, scopeBody, refresh]
    );

    const search = useCallback<UseMemoryResult['search']>(
        async (query, topK = 5) => {
            const data = await request<{ results: UserMemory[] }>('/v1/memory/search', {
                method: 'POST',
                body: JSON.stringify({ ...scopeBody(), query, topK }),
            });
            return data.results ?? [];
        },
        [request, scopeBody]
    );

    const forget = useCallback<UseMemoryResult['forget']>(
        async (id) => {
            setError(null);
            // Optimistic removal, rolled back on failure via refresh.
            setMemories((prev) => prev.filter((m) => m.id !== id));
            try {
                await request(`/v1/memory/${id}`, { method: 'DELETE' });
            } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
                await refresh();
                throw err;
            }
        },
        [request, refresh]
    );

    const exportAll = useCallback<UseMemoryResult['exportAll']>(async () => {
        // No server export endpoint in Phase 1 — assemble from the list client-side.
        const params = new URLSearchParams();
        if (userId) params.set('userId', userId);
        if (sessionId) params.set('sessionId', sessionId);
        params.set('scope', scope);
        if (namespace) params.set('namespace', namespace);
        params.set('limit', '1000');
        const data = await request<{ memories: UserMemory[] }>(
            `/v1/memory/list?${params.toString()}`,
            { method: 'GET' }
        );
        const blob = new Blob([JSON.stringify(data.memories ?? [], null, 2)], {
            type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cencori-memory-${userId ?? sessionId ?? 'export'}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [request, userId, sessionId, scope, namespace]);

    return { memories, loading, error, refresh, write, search, forget, exportAll };
}
