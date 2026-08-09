/**
 * Cencori Memory — shared types + directive parsing.
 *
 * A "directive" is the parsed, clamped, validated form of the `memory`
 * field a caller sends on a chat completion or direct memory endpoint.
 */

export type MemoryScope = 'session' | 'user' | 'workspace' | 'org';

/** Scopes accepted in Phase 1. */
export const PHASE1_SCOPES: MemoryScope[] = ['session', 'user'];

/**
 * Default similarity cutoffs, calibrated per embedding provider. Applied only
 * when the caller does not send an explicit `threshold`.
 *
 * Gemini `gemini-embedding-001` (the managed default) produces cosine scores in
 * a lower, tighter band than OpenAI `text-embedding-3-small`, so a single fixed
 * cutoff silently drops relevant memories on the managed path. Measured against
 * gemini-embedding-001 in prod on 2026-07-16: directly on-point facts scored
 * ~0.66–0.71 while a 0.7 cutoff dropped them. Tunable.
 */
export const DEFAULT_RETRIEVAL_THRESHOLD: Record<'openai' | 'google', number> = {
    openai: 0.7,
    google: 0.55,
};

/**
 * Memory is a MANAGED product: extraction + reconciliation + entity extraction
 * run on a Cencori-managed model, never a customer's BYOK key. Allowed managed
 * generative models are Gemini (`gemini-*`, default) and open GPT-OSS
 * (`gpt-oss-*` on Cerebras, `openai/gpt-oss-*` on Groq) — the latter free and
 * not Google, so memory need not depend on Gemini for its reasoning calls.
 *
 * OpenAI/Anthropic/etc. are intentionally NOT allowed — a memory call must not
 * cascade into an unfunded paid provider. Anything unrecognized coerces here.
 */
export const MEMORY_MANAGED_MODEL = 'gemini-2.5-flash';

const ALLOWED_MEMORY_MODEL = /^(gemini|gpt-oss|openai\/gpt-oss|llama)/i;

/** Coerce a configured/overridden model to an allowed managed memory model. */
export function resolveMemoryModel(model: string | null | undefined): string {
    const trimmed = typeof model === 'string' ? model.trim() : '';
    return ALLOWED_MEMORY_MODEL.test(trimmed) ? trimmed : MEMORY_MANAGED_MODEL;
}

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
    /**
     * Query memory as it was valid at this time (ISO 8601). Temporal recall:
     * returns facts true AS OF that instant, including ones later superseded.
     * Omit for current-state recall.
     */
    asOf?: string;
    /**
     * How recalled memories are surfaced to the model (Phase 3.5):
     * - 'inject' (default): drop the full memory contents into context.
     * - 'index': show a compact table of contents (id + one-line summary); the
     *   caller fetches full notes on demand via GET /v1/memory/:id. Best for
     *   agents/sessions — avoids burying the signal under full-text every turn.
     */
    mode?: 'inject' | 'index';
    /**
     * Graph-aware recall (Layer 5). When the query names an entity the memory
     * graph knows, recall also walks its relations and pulls in facts about the
     * connected entities that pure similarity would miss. Defaults on; set
     * false for strictly vector recall.
     */
    graph?: boolean;
}

export type MemoryRetrievalMode = 'inject' | 'index';

/** Parsed + clamped directive the pipeline operates on. */
export interface MemoryDirective {
    scope: MemoryScope;
    /** userId for scope=user, sessionId (fallback userId) for scope=session */
    scopeKey: string;
    retrieve: boolean;
    write: boolean;
    topK: number;
    threshold: number;
    /**
     * True when the caller sent an explicit `threshold`. When false, retrieval
     * substitutes a provider-calibrated default (see DEFAULT_RETRIEVAL_THRESHOLD)
     * once the embedding provider is known, instead of the nominal `threshold`.
     */
    thresholdExplicit: boolean;
    namespace: string | null;
    extract: MemoryExtractOverride | null;
    /**
     * ISO timestamp for temporal (as-of) recall, or null for current state.
     * When set, retrieval queries the validity window instead of active rows.
     */
    asOf: string | null;
    /** How recalled memories are surfaced: full inject vs compact index (TOC). */
    mode: MemoryRetrievalMode;
    /** Expand recall across the entity graph (Layer 5). Default true. */
    graph: boolean;
}

/** How a memory got into the recall set. */
export type MemorySource = 'vector' | 'graph' | 'session';

export interface RetrievedMemory {
    id: string;          // mem_-prefixed
    content: string;
    /**
     * Cosine similarity to the query. 1.0 for session-scope entries (no
     * ranking) and 0 for graph-expanded hits — those were reached by walking
     * relations, not by matching the query vector.
     */
    similarity: number;
    namespace: string | null;
    importance: number;
    createdAt: string | null;
    /** Present when the memory came from somewhere other than vector search. */
    source?: MemorySource;
    /** Hops from the query's seed entity, for graph-expanded hits. */
    hops?: number;
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
    /**
     * Maintain the entity graph on write (a second extraction call per
     * exchange). Off means memory still works as a semantic store, without
     * multi-hop recall.
     */
    graphEnabled: boolean;
}

export const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
    enabled: true,
    // Managed Google model — the whole memory pipeline (extraction + reconcile
    // + embeddings) runs on Cencori's Gemini key, never OpenAI.
    extractionModel: MEMORY_MANAGED_MODEL,
    extractionPrompt: null,
    minImportance: 0.5,
    maxMemoriesPerExchange: 5,
    sessionTtlSeconds: 86400,
    graphEnabled: true,
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

    // Temporal recall: accept a parseable ISO timestamp, normalize to ISO, else
    // ignore (current-state recall). Never fail the request on a bad asOf.
    let asOf: string | null = null;
    if (typeof input.asOf === 'string' && input.asOf.trim()) {
        const parsed = Date.parse(input.asOf.trim());
        if (!Number.isNaN(parsed)) asOf = new Date(parsed).toISOString();
    }

    // Surfacing mode: 'index' opts into the compact TOC; anything else = inject.
    const mode: MemoryRetrievalMode = input.mode === 'index' ? 'index' : 'inject';

    // Graph expansion is on unless explicitly disabled.
    const graph = input.graph !== false;

    return {
        ok: true,
        directive: {
            scope,
            scopeKey,
            retrieve: input.retrieve !== false,
            write: input.write !== false,
            topK: clamp(Math.round(typeof input.topK === 'number' ? input.topK : 5), 1, 20),
            threshold: clamp(typeof input.threshold === 'number' ? input.threshold : 0.7, 0, 1),
            thresholdExplicit: typeof input.threshold === 'number',
            namespace:
                typeof input.namespace === 'string' && input.namespace.trim()
                    ? input.namespace.trim()
                    : null,
            extract,
            asOf,
            mode,
            graph,
        },
    };
}
