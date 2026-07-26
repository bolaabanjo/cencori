/**
 * Memory fetch-by-id — the "pull the full note" half of Phase 3.5 progressive
 * disclosure. Index mode shows the model a table of contents; when a summary is
 * relevant, the full memory is fetched by id through here.
 *
 * One source of truth, three consumers: the GET /v1/memory/:id route, the
 * standalone SDK (`cencori.memory.get`), and the `memory_fetch` agent tool. The
 * org/project boundary is always enforced from the authenticated context — a
 * fetched id can never cross tenants.
 */

import type { createAdminClient } from '@/lib/supabaseAdmin';
import { fromMemoryId, toMemoryId } from './types';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export interface FetchedMemory {
    id: string; // mem_-prefixed
    scope: string;
    scopeKey: string;
    namespace: string | null;
    content: string;
    metadata: unknown;
    importance: number;
    accessCount: number;
    lastAccessedAt: string | null;
    expiresAt: string | null;
    createdAt: string;
    updatedAt: string;
}

/**
 * Fetch one memory by id, scoped to the caller's org+project. Accepts a
 * mem_-prefixed or raw id. Returns null if it does not exist in this tenant.
 */
export async function fetchMemoryById(
    supabase: SupabaseAdmin,
    organizationId: string,
    projectId: string,
    memId: string
): Promise<FetchedMemory | null> {
    const { data, error } = await supabase
        .from('gateway_memories')
        .select('id, scope, scope_key, namespace, content, metadata, importance, created_at, updated_at, last_accessed_at, access_count, expires_at')
        .eq('id', fromMemoryId(memId))
        .eq('organization_id', organizationId)
        .eq('project_id', projectId)
        .maybeSingle();

    if (error || !data) return null;

    return {
        id: toMemoryId(data.id),
        scope: data.scope,
        scopeKey: data.scope_key,
        namespace: data.namespace,
        content: data.content,
        metadata: data.metadata,
        importance: Number(data.importance),
        accessCount: data.access_count,
        lastAccessedAt: data.last_accessed_at,
        expiresAt: data.expires_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
    };
}

export const MEMORY_FETCH_TOOL_NAME = 'memory_fetch';

/**
 * Function-tool definition an agent registers alongside index-mode recall. The
 * model calls it with a memory id from the index to read the full note. Shape
 * matches the OpenAI/Cencori function-tool contract.
 */
export const MEMORY_FETCH_TOOL = {
    type: 'function' as const,
    function: {
        name: MEMORY_FETCH_TOOL_NAME,
        description:
            'Fetch the full content of a stored memory by its id (shown in the memory index). Only call this for memories whose summary is relevant to the current request; do not fetch memories you do not need.',
        parameters: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'The memory id from the memory index, e.g. "mem_abc123".',
                },
            },
            required: ['id'],
            additionalProperties: false,
        },
    },
} as const;

export interface MemoryFetchToolResult {
    found: boolean;
    id?: string;
    content?: string;
    error?: string;
}

/**
 * Server-side executor for the memory_fetch tool. Parses the model's arguments
 * (JSON string or object), fetches within the tenant boundary, and returns just
 * what the model needs (id + content). Never throws — a bad call returns an
 * error result the model can recover from.
 */
export async function executeMemoryFetchTool(
    supabase: SupabaseAdmin,
    ctx: { organizationId: string; projectId: string },
    args: string | Record<string, unknown> | null | undefined
): Promise<MemoryFetchToolResult> {
    let parsed: Record<string, unknown>;
    try {
        parsed = typeof args === 'string' ? JSON.parse(args || '{}') : (args ?? {});
    } catch {
        return { found: false, error: 'invalid_arguments: expected JSON with an "id" field' };
    }

    const id = typeof parsed.id === 'string' ? parsed.id.trim() : '';
    if (!id) return { found: false, error: 'invalid_arguments: "id" is required' };

    const memory = await fetchMemoryById(supabase, ctx.organizationId, ctx.projectId, id);
    if (!memory) return { found: false, id, error: 'not_found' };

    return { found: true, id: memory.id, content: memory.content };
}
