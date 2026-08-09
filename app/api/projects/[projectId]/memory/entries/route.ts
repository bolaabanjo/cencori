/**
 * GET /api/projects/:projectId/memory/entries — browse the project's gateway
 * memories (the `memory` field / `/v1/memory/*` store).
 *
 * Filtering is literal, not semantic: the dashboard is for inspecting what is
 * stored, and a semantic search would bill an embedding call per keystroke.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { toMemoryId } from '@/lib/memory';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
/** Users returned per page of the filter's picker — a page, never the whole set. */
const USER_PAGE_SIZE = 20;

type SortKey = 'recent' | 'importance' | 'recalled' | 'stale';

/**
 * ?users=1 — the searchable end-user list backing the browse filter. Grouped in
 * SQL and bounded: a project's end-users are not a list you can ship whole.
 */
async function listUsers(
    supabase: ReturnType<typeof createAdminClient>,
    organizationId: string,
    projectId: string,
    search: string
) {
    const { data, error } = await supabase.rpc('memory_project_users', {
        p_org_id: organizationId,
        p_project_id: projectId,
        p_search: search || null,
        p_limit: USER_PAGE_SIZE,
    });

    if (error) {
        // Pre-migration: no picker rather than a broken page. The browse list
        // itself is unaffected.
        console.warn('[Memory] Project-users RPC unavailable:', error.message);
        return { users: [], totalUsers: 0, search, unavailable: true };
    }

    const rows = (data ?? []) as Array<{ scope_key: string; memory_count: number; total_matches: number }>;
    return {
        users: rows.map(row => ({ scopeKey: row.scope_key, memories: Number(row.memory_count) })),
        totalUsers: Number(rows[0]?.total_matches ?? 0),
        search,
    };
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const { projectId } = await params;
    const access = await requireProjectAccess(projectId);
    if (!access.ok) return access.response;

    const supabase = createAdminClient();
    const url = new URL(req.url);
    const search = url.searchParams.get('q')?.trim() || '';
    const scopeKey = url.searchParams.get('userId')?.trim() || '';
    const namespace = url.searchParams.get('namespace')?.trim() || '';
    const status = url.searchParams.get('status')?.trim() || 'active';
    const sort = (url.searchParams.get('sort') || 'recent') as SortKey;
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);

    try {
        if (url.searchParams.get('users') === '1') {
            const search = url.searchParams.get('userSearch')?.trim() || '';
            return NextResponse.json(await listUsers(supabase, access.organizationId, projectId, search));
        }

        // 'estimated', not 'exact': an exact count makes Postgres walk every
        // matching row on each page turn, which on a project holding 100k+
        // memories costs more than the page itself. PostgREST returns the
        // planner estimate for large results and an exact count for small ones.
        let query = supabase
            .from('gateway_memories')
            .select('id, content, scope, scope_key, namespace, importance, access_count, status, created_at, last_accessed_at, valid_from, valid_to, metadata', { count: 'estimated' })
            .eq('organization_id', access.organizationId)
            .eq('project_id', projectId);

        if (status !== 'all') query = query.eq('status', status);
        if (scopeKey) query = query.eq('scope_key', scopeKey);
        if (namespace) query = query.eq('namespace', namespace);
        if (search) {
            // Escape PostgREST's pattern wildcards so a literal % or _ in the
            // search box doesn't silently widen the match.
            query = query.ilike('content', `%${search.replace(/[%_]/g, m => `\\${m}`)}%`);
        }

        switch (sort) {
            case 'importance':
                query = query.order('importance', { ascending: false });
                break;
            case 'recalled':
                query = query.order('access_count', { ascending: false });
                break;
            case 'stale':
                // Never-recalled first, then least recently used.
                query = query.order('last_accessed_at', { ascending: true, nullsFirst: true });
                break;
            default:
                query = query.order('created_at', { ascending: false });
        }

        const { data, error, count } = await query.range(offset, offset + limit - 1);
        if (error) throw error;

        return NextResponse.json({
            memories: (data ?? []).map(row => ({
                id: toMemoryId(row.id as string),
                content: row.content,
                scope: row.scope,
                scopeKey: row.scope_key,
                namespace: row.namespace,
                importance: Number(row.importance),
                accessCount: Number(row.access_count ?? 0),
                status: row.status,
                createdAt: row.created_at,
                lastAccessedAt: row.last_accessed_at,
                validFrom: row.valid_from,
                validTo: row.valid_to,
                metadata: row.metadata,
            })),
            total: count ?? 0,
            limit,
            offset,
        });
    } catch (error) {
        console.error('[Memory] Entries error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
