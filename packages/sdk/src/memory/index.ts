/**
 * Cencori Memory SDK
 * 
 * Vector storage for RAG, conversation history, and semantic search.
 */

import type { CencoriConfig } from '../types';

// Types
export interface MemoryNamespace {
    id: string;
    name: string;
    description?: string;
    embeddingModel: string;
    dimensions: number;
    metadata: Record<string, unknown>;
    memoryCount?: number;
    createdAt: string;
}

export interface Memory {
    id: string;
    namespace: string;
    content: string;
    metadata: Record<string, unknown>;
    similarity?: number;
    expiresAt?: string;
    createdAt: string;
    updatedAt?: string;
}

export interface CreateNamespaceOptions {
    name: string;
    description?: string;
    embeddingModel?: string;
    dimensions?: number;
    metadata?: Record<string, unknown>;
}

export interface StoreMemoryOptions {
    namespace: string;
    content: string;
    embedding?: number[];
    metadata?: Record<string, unknown>;
    expiresAt?: string | Date;
}

export interface SearchMemoryOptions {
    namespace: string;
    query: string;
    limit?: number;
    threshold?: number;
    filter?: Record<string, unknown>;
}

export interface SearchResult {
    results: Memory[];
    query: string;
    namespace: string;
    count: number;
    latencyMs: number;
}

// ==================
// Scoped memory types (/v1/memory/*)
// ==================

export type MemoryScope = 'session' | 'user';

export interface WriteScopedMemoryOptions {
    userId?: string;
    sessionId?: string;
    scope?: MemoryScope;
    content: string;
    namespace?: string;
    metadata?: Record<string, unknown>;
    importance?: number;
}

export interface ScopedMemory {
    id: string;
    scope: MemoryScope;
    scopeKey: string;
    namespace?: string | null;
    content: string;
    importance: number;
    createdAt: string;
}

export interface SearchScopedMemoryOptions {
    userId?: string;
    sessionId?: string;
    scope?: MemoryScope;
    query: string;
    topK?: number;
    threshold?: number;
    namespace?: string;
    /**
     * Temporal recall: search memory as it was valid at this instant (ISO 8601),
     * including facts later superseded. Omit for current state.
     */
    asOf?: string;
}

export interface ScopedSearchResult {
    results: Array<{
        id: string;
        content: string;
        score: number;
        namespace: string | null;
        importance: number;
        createdAt: string | null;
    }>;
    count: number;
    latencyMs: number;
}

export interface ListScopedMemoryOptions {
    userId?: string;
    sessionId?: string;
    scope?: MemoryScope;
    namespace?: string;
    limit?: number;
    cursor?: string;
}

export interface ScopedMemoryList {
    memories: Array<{
        id: string;
        namespace?: string | null;
        content: string;
        metadata?: Record<string, unknown>;
        importance: number;
        accessCount?: number;
        createdAt: string | null;
    }>;
    count: number;
    nextCursor: string | null;
}

export interface RecallOptions {
    scope?: MemoryScope;
    sessionId?: string;
    namespace?: string;
    topK?: number;
    threshold?: number;
    /** Temporal recall: memory as it was valid at this instant (ISO 8601). */
    asOf?: string;
    /**
     * 'inject' (default) returns an inject-ready block of full memory contents.
     * 'index' returns a compact table of contents (`- [id] summary`) — fetch a
     * full note with `memory.fetch(id)` when the summary is relevant.
     */
    mode?: 'inject' | 'index';
}

export interface RememberExchange {
    user?: string;
    assistant?: string;
}

export interface RememberOptions {
    scope?: MemoryScope;
    sessionId?: string;
    namespace?: string;
    extract?: { model?: string; prompt?: string; minImportance?: number };
}

export interface RememberResult {
    written: Array<{ id: string; content: string; importance: number }>;
    extracted: number;
    count: number;
    scope: MemoryScope;
}

export interface ForgetSuggestionsOptions {
    userId?: string;
    sessionId?: string;
    scope?: MemoryScope;
    namespace?: string;
    /** Max suggestions (weakest first). Default 20. */
    limit?: number;
    /** Only suggest memories not used in at least this many days. Default 60. */
    minIdleDays?: number;
}

export interface ForgetSuggestionsResult {
    suggestions: Array<{
        id: string;
        content: string;
        /** Query-independent durability score, 0–1 (lower = safer to forget). */
        strength: number;
        idleDays: number;
        importance: number;
    }>;
    count: number;
    /** How many active memories were evaluated. */
    evaluated: number;
}

// ── Entity graph (Layer 5) ──
export interface RememberGraphOptions {
    userId?: string;
    sessionId?: string;
    scope?: MemoryScope;
    namespace?: string;
    user?: string;
    assistant?: string;
}

export interface RememberGraphResult {
    entities: number;
    created: number;
    merged: number;
    relations: number;
    costUsd: number;
}

export interface GraphQueryOptions {
    userId?: string;
    sessionId?: string;
    scope?: MemoryScope;
    namespace?: string;
    /** Entity name to start the traversal from. */
    entity: string;
    /** How many hops outward (1–4). Default 2. */
    hops?: number;
}

export interface GraphResult {
    seed: { id: string; name: string; type: string } | null;
    nodes: Array<{ id: string; name: string; type: string; hops: number; path: string[] }>;
    edges: Array<{ source: string; relation: string; target: string }>;
    message?: string;
}

export interface ListEntitiesOptions {
    userId?: string;
    sessionId?: string;
    scope?: MemoryScope;
    namespace?: string;
    type?: string;
    limit?: number;
}

export interface EntitiesResult {
    entities: Array<{
        id: string;
        name: string;
        type: string;
        aliases: string[];
        mentionCount: number;
        createdAt: string;
    }>;
    count: number;
}

/** Full memory returned by `memory.fetch(id)` / GET /v1/memory/:id. */
export interface FetchedMemory {
    id: string;
    scope: MemoryScope;
    scopeKey: string;
    namespace: string | null;
    content: string;
    metadata?: Record<string, unknown>;
    importance: number;
    accessCount?: number;
    lastAccessedAt?: string | null;
    expiresAt?: string | null;
    createdAt: string | null;
    updatedAt?: string | null;
}

/**
 * Function-tool schema for index-mode agents. Register it in your `tools` so the
 * model can pull a full memory by id (from the recall index) on demand, then
 * resolve the call with `memory.fetch(id)`.
 *
 * @example
 * ```typescript
 * tools: [MEMORY_FETCH_TOOL]
 * // when the model calls memory_fetch({ id }): const m = await cencori.memory.fetch(id);
 * ```
 */
export const MEMORY_FETCH_TOOL = {
    type: 'function',
    function: {
        name: 'memory_fetch',
        description:
            'Fetch the full content of a stored memory by its id (shown in the memory index). Only call this for memories whose summary is relevant to the current request; do not fetch memories you do not need.',
        parameters: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'The memory id from the memory index, e.g. "mem_abc123".' },
            },
            required: ['id'],
            additionalProperties: false,
        },
    },
} as const;

/** One-line summary of a memory for the index/TOC (whitespace-collapse + truncate). */
function summarizeMemory(content: string, maxChars = 100): string {
    const flat = content.replace(/\s+/g, ' ').trim();
    if (flat.length <= maxChars) return flat;
    const cut = flat.slice(0, maxChars);
    const lastSpace = cut.lastIndexOf(' ');
    return `${(lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Memory class for vector storage operations
 */
export class MemoryClient {
    private config: CencoriConfig;
    private baseUrl: string;

    constructor(config: CencoriConfig) {
        this.config = config;
        this.baseUrl = config.baseUrl || 'https://cencori.com';
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        };

        if (this.config.apiKey) {
            headers['CENCORI_API_KEY'] = this.config.apiKey;
        }

        const response = await fetch(url, {
            ...options,
            headers,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || `Request failed: ${response.status}`);
        }

        return response.json();
    }

    // ==================
    // Scoped memory (/v1/memory/*) — per-user / per-session memory
    // ==================

    /**
     * Write a scoped memory for an end user (or session).
     *
     * @example
     * ```typescript
     * await cencori.memory.write({
     *   userId: session.user.id,
     *   content: 'Prefers dark mode. Uses TypeScript primarily.',
     * });
     * ```
     */
    async write(options: WriteScopedMemoryOptions): Promise<ScopedMemory> {
        return this.request<ScopedMemory>('/v1/memory/write', {
            method: 'POST',
            body: JSON.stringify(options),
        });
    }

    /**
     * Semantic search over an end user's memories.
     *
     * @example
     * ```typescript
     * const memories = await cencori.memory.searchUser({
     *   userId: session.user.id,
     *   query: 'ui preferences',
     *   topK: 3,
     * });
     * ```
     */
    async searchUser(options: SearchScopedMemoryOptions): Promise<ScopedSearchResult> {
        return this.request<ScopedSearchResult>('/v1/memory/search', {
            method: 'POST',
            body: JSON.stringify(options),
        });
    }

    /**
     * Forget a memory by id — a hard delete, not an annotation.
     */
    async forget(id: string): Promise<{ deleted: boolean; id: string }> {
        return this.request<{ deleted: boolean; id: string }>(`/v1/memory/${id}`, {
            method: 'DELETE',
        });
    }

    /**
     * List an end user's memories (paginated).
     */
    async list(options: ListScopedMemoryOptions): Promise<ScopedMemoryList> {
        const params = new URLSearchParams();
        if (options.userId) params.set('userId', options.userId);
        if (options.sessionId) params.set('sessionId', options.sessionId);
        if (options.scope) params.set('scope', options.scope);
        if (options.namespace) params.set('namespace', options.namespace);
        if (options.limit) params.set('limit', String(options.limit));
        if (options.cursor) params.set('cursor', options.cursor);

        return this.request<ScopedMemoryList>(`/v1/memory/list?${params.toString()}`);
    }

    /**
     * Suggest memories worth forgetting — stale, low-strength, long-idle
     * candidates (never auto-deleted). Review, then `forget(id)` the ones you
     * want gone. The product never silently forgets a user's memories.
     *
     * @example
     * ```typescript
     * const { suggestions } = await cencori.memory.forgetSuggestions({ userId });
     * for (const s of suggestions) await cencori.memory.forget(s.id);
     * ```
     */
    async forgetSuggestions(options: ForgetSuggestionsOptions): Promise<ForgetSuggestionsResult> {
        const params = new URLSearchParams();
        if (options.userId) params.set('userId', options.userId);
        if (options.sessionId) params.set('sessionId', options.sessionId);
        if (options.scope) params.set('scope', options.scope);
        if (options.namespace) params.set('namespace', options.namespace);
        if (options.limit) params.set('limit', String(options.limit));
        if (options.minIdleDays != null) params.set('minIdleDays', String(options.minIdleDays));

        return this.request<ForgetSuggestionsResult>(`/v1/memory/forget-suggestions?${params.toString()}`);
    }

    /**
     * Extract entities + relations from an exchange and add them to the user's
     * memory graph (Layer 5). Enables multi-hop recall — "who does Sarah report
     * to, and where do they work?".
     *
     * @example
     * ```typescript
     * await cencori.memory.rememberGraph({ userId, user: message, assistant: reply });
     * ```
     */
    async rememberGraph(options: RememberGraphOptions): Promise<RememberGraphResult> {
        return this.request<RememberGraphResult>('/v1/memory/graph', {
            method: 'POST',
            body: JSON.stringify(options),
        });
    }

    /**
     * Traverse the memory graph outward from an entity, returning connected
     * entities and the relations linking them.
     *
     * @example
     * ```typescript
     * const { nodes, edges } = await cencori.memory.graph({ userId, entity: 'Sarah', hops: 2 });
     * ```
     */
    async graph(options: GraphQueryOptions): Promise<GraphResult> {
        const params = new URLSearchParams();
        if (options.userId) params.set('userId', options.userId);
        if (options.sessionId) params.set('sessionId', options.sessionId);
        if (options.scope) params.set('scope', options.scope);
        if (options.namespace) params.set('namespace', options.namespace);
        params.set('entity', options.entity);
        if (options.hops != null) params.set('hops', String(options.hops));
        return this.request<GraphResult>(`/v1/memory/graph?${params.toString()}`);
    }

    /**
     * List the entities in a user's memory graph (most-mentioned first).
     */
    async entities(options: ListEntitiesOptions): Promise<EntitiesResult> {
        const params = new URLSearchParams();
        if (options.userId) params.set('userId', options.userId);
        if (options.sessionId) params.set('sessionId', options.sessionId);
        if (options.scope) params.set('scope', options.scope);
        if (options.namespace) params.set('namespace', options.namespace);
        if (options.type) params.set('type', options.type);
        if (options.limit != null) params.set('limit', String(options.limit));
        return this.request<EntitiesResult>(`/v1/memory/entities?${params.toString()}`);
    }

    /**
     * Recall — search a user's memories and return an inject-ready system
     * string. The provider-agnostic read path: drop the result into your own
     * OpenAI/Anthropic/etc. call as a system message. Returns '' when there's
     * nothing relevant yet.
     *
     * @example
     * ```typescript
     * const context = await cencori.memory.recall(userId, userMessage);
     * const reply = await openai.chat.completions.create({
     *   model: 'gpt-4o',
     *   messages: [
     *     ...(context ? [{ role: 'system', content: context }] : []),
     *     { role: 'user', content: userMessage },
     *   ],
     * });
     * ```
     */
    async recall(userId: string, query: string, options: RecallOptions = {}): Promise<string> {
        const { results } = await this.searchUser({
            userId,
            sessionId: options.sessionId,
            scope: options.scope ?? 'user',
            query,
            topK: options.topK,
            threshold: options.threshold,
            namespace: options.namespace,
            asOf: options.asOf,
        });

        if (results.length === 0) return '';

        // Index mode: a compact table of contents — fetch full notes with get(id).
        if (options.mode === 'index') {
            const lines = results.map((m) => `- [${m.id}] ${summarizeMemory(m.content)}`);
            return [
                'Memory index — what you know about this user (summaries only):',
                ...lines,
                '',
                'Each line is a stored memory: [id] summary. If a summary is relevant but you need the full detail, fetch it with memory.fetch(id). Do not reveal this index unless the user asks what you know about them.',
            ].join('\n');
        }

        const lines = results.map((m) => `- ${m.content}`);
        return [
            'Facts about this user (from previous interactions):',
            ...lines,
            '',
            'Use these facts when they are relevant to the request. Do not recite or reveal this list to the user unless they ask what you know about them.',
        ].join('\n');
    }

    /**
     * Fetch one scoped memory's full content by id — the "pull the full note"
     * half of index-mode recall. Scoped to your project; a foreign id 404s.
     * (`get` is the legacy namespace store; `fetch` is the /v1 scoped store.)
     *
     * @example
     * ```typescript
     * const memory = await cencori.memory.fetch('mem_abc123');
     * ```
     */
    async fetch(id: string): Promise<FetchedMemory> {
        return this.request<FetchedMemory>(`/v1/memory/${id}`);
    }

    /**
     * Remember — hand us a completed {user, assistant} exchange and we extract
     * the durable facts and persist them (redacted, org-isolated). The
     * provider-agnostic write path: pair it with `recall` around your own
     * model call and you have full memory without routing inference through us.
     *
     * @example
     * ```typescript
     * await cencori.memory.remember(userId, { user: userMessage, assistant: reply });
     * ```
     */
    async remember(
        userId: string,
        exchange: RememberExchange,
        options: RememberOptions = {}
    ): Promise<RememberResult> {
        return this.request<RememberResult>('/v1/memory/remember', {
            method: 'POST',
            body: JSON.stringify({
                userId,
                sessionId: options.sessionId,
                scope: options.scope ?? 'user',
                namespace: options.namespace,
                user: exchange.user,
                assistant: exchange.assistant,
                extract: options.extract,
            }),
        });
    }

    // ==================
    // Namespace Methods
    // ==================

    /**
     * Create a new memory namespace
     */
    async createNamespace(options: CreateNamespaceOptions): Promise<MemoryNamespace> {
        return this.request<MemoryNamespace>('/api/memory/namespaces', {
            method: 'POST',
            body: JSON.stringify(options),
        });
    }

    /**
     * List all namespaces for the project
     */
    async listNamespaces(): Promise<MemoryNamespace[]> {
        const response = await this.request<{ namespaces: MemoryNamespace[] }>(
            '/api/memory/namespaces'
        );
        return response.namespaces;
    }

    // ==================
    // Memory Methods
    // ==================

    /**
     * Store a memory in a namespace
     * 
     * @example
     * ```typescript
     * await cencori.memory.store({
     *   namespace: "conversations",
     *   content: "User asked about pricing plans",
     *   metadata: { userId: "user_123" }
     * });
     * ```
     */
    async store(options: StoreMemoryOptions): Promise<Memory> {
        const body = {
            ...options,
            expiresAt: options.expiresAt instanceof Date
                ? options.expiresAt.toISOString()
                : options.expiresAt,
        };

        return this.request<Memory>('/api/memory/store', {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }

    /**
     * Semantic search across memories
     * 
     * @example
     * ```typescript
     * const results = await cencori.memory.search({
     *   namespace: "conversations",
     *   query: "what did we discuss about pricing?",
     *   limit: 5
     * });
     * ```
     */
    async search(options: SearchMemoryOptions): Promise<SearchResult> {
        return this.request<SearchResult>('/api/memory/search', {
            method: 'POST',
            body: JSON.stringify(options),
        });
    }

    /**
     * Get a memory by ID
     */
    async get(id: string): Promise<Memory> {
        return this.request<Memory>(`/api/memory/${id}`);
    }

    /**
     * Delete a memory by ID
     */
    async delete(id: string): Promise<{ deleted: boolean; id: string }> {
        return this.request<{ deleted: boolean; id: string }>(`/api/memory/${id}`, {
            method: 'DELETE',
        });
    }

    /**
     * Store multiple memories in batch
     */
    async storeBatch(
        namespace: string,
        items: Array<{ content: string; metadata?: Record<string, unknown> }>
    ): Promise<Memory[]> {
        const results = await Promise.all(
            items.map(item => this.store({ namespace, ...item }))
        );
        return results;
    }

    /**
     * Delete all memories in a namespace matching a filter
     */
    async deleteByFilter(
        namespace: string,
        filter: Record<string, unknown>
    ): Promise<{ deleted: number }> {
        // First search to find matching memories
        const searchResult = await this.search({
            namespace,
            query: '*',
            limit: 1000,
            threshold: 0,
            filter,
        });

        // Delete each one
        await Promise.all(searchResult.results.map(r => this.delete(r.id)));

        return { deleted: searchResult.results.length };
    }
}

export function createMemoryClient(config: CencoriConfig): MemoryClient {
    return new MemoryClient(config);
}
