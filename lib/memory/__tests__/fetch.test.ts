/**
 * @vitest-environment node
 *
 * memory_fetch — the "pull the full note" primitive behind Phase 3.5 index mode.
 * Must enforce the tenant boundary, strip the mem_ prefix, and the tool executor
 * must never throw on bad model input.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    fetchMemoryById,
    executeMemoryFetchTool,
    MEMORY_FETCH_TOOL,
    MEMORY_FETCH_TOOL_NAME,
} from '../fetch';

const ROW = {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    scope: 'user',
    scope_key: 'user_1',
    namespace: null,
    content: 'User uses Rust',
    metadata: { extractedFrom: 'chat' },
    importance: 0.8,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    last_accessed_at: null,
    access_count: 3,
    expires_at: null,
};

/** Mock a supabase whose maybeSingle resolves to `result`, capturing .eq filters. */
function mockSupabase(result: { data: unknown; error: unknown }) {
    const eqCalls: [string, unknown][] = [];
    const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn((col: string, val: unknown) => { eqCalls.push([col, val]); return chain; }),
        maybeSingle: vi.fn(async () => result),
    };
    return { supabase: { from: vi.fn(() => chain) } as never, eqCalls, chain };
}

describe('fetchMemoryById', () => {
    it('scopes by org + project + id (mem_ prefix stripped) and shapes the row', async () => {
        const { supabase, eqCalls } = mockSupabase({ data: ROW, error: null });
        const mem = await fetchMemoryById(supabase, 'org_1', 'proj_1', 'mem_' + ROW.id);

        expect(eqCalls).toEqual([
            ['id', ROW.id],               // prefix stripped
            ['organization_id', 'org_1'], // hard boundary
            ['project_id', 'proj_1'],
        ]);
        expect(mem).toMatchObject({ id: 'mem_' + ROW.id, content: 'User uses Rust', accessCount: 3, scopeKey: 'user_1' });
    });

    it('returns null when the row is absent (cross-tenant id behaves like missing)', async () => {
        const { supabase } = mockSupabase({ data: null, error: null });
        expect(await fetchMemoryById(supabase, 'org_1', 'proj_1', 'mem_x')).toBeNull();
    });

    it('returns null on query error (never throws)', async () => {
        const { supabase } = mockSupabase({ data: null, error: { message: 'boom' } });
        expect(await fetchMemoryById(supabase, 'org_1', 'proj_1', 'mem_x')).toBeNull();
    });
});

describe('executeMemoryFetchTool', () => {
    const ctx = { organizationId: 'org_1', projectId: 'proj_1' };

    it('parses JSON-string args and returns id + content', async () => {
        const { supabase } = mockSupabase({ data: ROW, error: null });
        const out = await executeMemoryFetchTool(supabase, ctx, JSON.stringify({ id: 'mem_' + ROW.id }));
        expect(out).toEqual({ found: true, id: 'mem_' + ROW.id, content: 'User uses Rust' });
    });

    it('accepts an already-parsed object', async () => {
        const { supabase } = mockSupabase({ data: ROW, error: null });
        const out = await executeMemoryFetchTool(supabase, ctx, { id: 'mem_' + ROW.id });
        expect(out.found).toBe(true);
    });

    it('returns not_found (not a throw) when the id is unknown', async () => {
        const { supabase } = mockSupabase({ data: null, error: null });
        const out = await executeMemoryFetchTool(supabase, ctx, { id: 'mem_missing' });
        expect(out).toEqual({ found: false, id: 'mem_missing', error: 'not_found' });
    });

    it('rejects missing id and malformed JSON without throwing', async () => {
        const { supabase } = mockSupabase({ data: ROW, error: null });
        expect((await executeMemoryFetchTool(supabase, ctx, {})).error).toContain('id');
        expect((await executeMemoryFetchTool(supabase, ctx, '{ not json')).error).toContain('invalid_arguments');
        expect((await executeMemoryFetchTool(supabase, ctx, null)).error).toContain('id');
    });
});

describe('MEMORY_FETCH_TOOL schema', () => {
    it('is a function tool named memory_fetch requiring an id', () => {
        expect(MEMORY_FETCH_TOOL.type).toBe('function');
        expect(MEMORY_FETCH_TOOL.function.name).toBe(MEMORY_FETCH_TOOL_NAME);
        expect(MEMORY_FETCH_TOOL.function.parameters.required).toContain('id');
    });
});
