/**
 * Cencori Memory — shared types + directive parsing.
 *
 * A "directive" is the parsed, clamped, validated form of the `memory`
 * field a caller sends on a chat completion or direct memory endpoint.
 */

export type MemoryScope = 'session' | 'user' | 'workspace' | 'org';

/** Scopes accepted in Phase 1. */
export const PHASE1_SCOPES: MemoryScope[] = ['session', 'user'];

export interface MemoryExtractOverride {
    model?: string;
    prompt?: string;
    minImportance?: number;
}

/** Raw shape accepted from request bodies. */
export interface MemoryDirectiveInput {
    userId?: string;
    sessionId?: string;
    scope?: string;
    retrieve?: boolean;
    write?: boolean;
    topK?: number;
    threshold?: number;
    namespace?: string;
    extract?: MemoryExtractOverride;
}

/** Parsed + clamped directive the pipeline operates on. */
export interface MemoryDirective {
    scope: MemoryScope;
    /** userId for scope=user, sessionId (fallback userId) for scope=session */
    scopeKey: string;
    retrieve: boolean;
    write: boolean;
    topK: number;
    threshold: number;
    namespace: string | null;
    extract: MemoryExtractOverride | null;
}

export interface RetrievedMemory {
    id: string;          // mem_-prefixed
    content: string;
    similarity: number;  // 1.0 for session-scope entries (no ranking)
    namespace: string | null;
    importance: number;
    createdAt: string | null;
}

export interface WrittenMemory {
    id: string;          // mem_-prefixed
    content: string;     // post-redaction
    importance: number;
}

export interface ExtractedFact {
    content: string;
    importance: number;
}

export interface MemorySettings {
    enabled: boolean;
    extractionModel: string;
    extractionPrompt: string | null;
    minImportance: number;
    maxMemoriesPerExchange: number;
    sessionTtlSeconds: number;
}

export const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
    enabled: true,
    // Non-OpenAI by default so the whole memory pipeline (extraction +
    // embeddings) runs without an OpenAI key. Overridable per project/request.
    extractionModel: 'gemini-2.5-flash',
    extractionPrompt: null,
    minImportance: 0.5,
    maxMemoriesPerExchange: 5,
    sessionTtlSeconds: 86400,
};

/** Metering unit: a single memory's content is capped at 10KB. */
export const MEMORY_CONTENT_MAX_CHARS = 10240;

const MEM_ID_PREFIX = 'mem_';

export function toMemoryId(uuid: string): string {
    return `${MEM_ID_PREFIX}${uuid}`;
}

export function fromMemoryId(id: string): string {
    return id.startsWith(MEM_ID_PREFIX) ? id.slice(MEM_ID_PREFIX.length) : id;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export type ParseDirectiveResult =
    | { ok: true; directive: MemoryDirective }
    | { ok: false; error: string };

/**
 * Validate and normalize a raw `memory` field. Never throws.
 */
export function parseMemoryDirective(raw: unknown): ParseDirectiveResult {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { ok: false, error: 'memory must be an object' };
    }

    const input = raw as MemoryDirectiveInput;

    const scope = (input.scope || 'user') as MemoryScope;
    if (!PHASE1_SCOPES.includes(scope)) {
        return {
            ok: false,
            error: `memory.scope must be one of: ${PHASE1_SCOPES.join(', ')}`,
        };
    }

    const userId = typeof input.userId === 'string' ? input.userId.trim() : '';
    const sessionId = typeof input.sessionId === 'string' ? input.sessionId.trim() : '';

    let scopeKey: string;
    if (scope === 'session') {
        scopeKey = sessionId || userId;
        if (!scopeKey) {
            return { ok: false, error: 'memory.sessionId (or userId) is required for session scope' };
        }
    } else {
        scopeKey = userId;
        if (!scopeKey) {
            return { ok: false, error: 'memory.userId is required for user scope' };
        }
    }

    if (scopeKey.length > 256) {
        return { ok: false, error: 'memory scope key must be 256 characters or fewer' };
    }

    let extract: MemoryExtractOverride | null = null;
    if (input.extract && typeof input.extract === 'object') {
        extract = {
            model: typeof input.extract.model === 'string' ? input.extract.model : undefined,
            prompt: typeof input.extract.prompt === 'string' ? input.extract.prompt : undefined,
            minImportance:
                typeof input.extract.minImportance === 'number'
                    ? clamp(input.extract.minImportance, 0, 1)
                    : undefined,
        };
    }

    return {
        ok: true,
        directive: {
            scope,
            scopeKey,
            retrieve: input.retrieve !== false,
            write: input.write !== false,
            topK: clamp(Math.round(typeof input.topK === 'number' ? input.topK : 5), 1, 20),
            threshold: clamp(typeof input.threshold === 'number' ? input.threshold : 0.7, 0, 1),
            namespace:
                typeof input.namespace === 'string' && input.namespace.trim()
                    ? input.namespace.trim()
                    : null,
            extract,
        },
    };
}
