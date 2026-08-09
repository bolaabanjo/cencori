/**
 * GET /api/projects/:projectId/memory/forget-suggestions — stale, low-strength,
 * long-idle memories worth pruning (Layer 4 strength).
 *
 * Unlike the public /v1 route, this is project-wide by default: an operator
 * looking at the dashboard wants "what is this project hoarding", not one
 * end-user at a time. Candidates only — nothing is deleted here. The "no silent
 * forgetting" contract means a human presses the button.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';
import {
    classifyStrength,
    suggestForForgetting,
    toMemoryId,
    type StrengthInput,
} from '@/lib/memory';

/** Cap on rows evaluated — suggestions are the weakest tail, not a full audit. */
const SCAN_LIMIT = 2000;

interface Row extends StrengthInput {
    id: string;
    content: string;
    scope: string;
    scope_key: string;
    namespace: string | null;
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
    const parsed = parseInt(raw ?? '', 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
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
    const scopeKey = url.searchParams.get('userId')?.trim() || '';
    const limit = clampInt(url.searchParams.get('limit'), 25, 1, 100);
    const minIdleDays = clampInt(url.searchParams.get('minIdleDays'), 60, 0, 3650);

    try {
        let query = supabase
            .from('gateway_memories')
            .select('id, content, scope, scope_key, namespace, importance, access_count, created_at, last_accessed_at')
            .eq('organization_id', access.organizationId)
            .eq('project_id', projectId)
            .eq('status', 'active')
            // Weakest first by proxy, so the scan cap keeps the right tail.
            .order('access_count', { ascending: true })
            .order('importance', { ascending: true })
            .limit(SCAN_LIMIT);

        if (scopeKey) query = query.eq('scope_key', scopeKey);

        const { data, error } = await query;
        if (error) throw error;

        const rows: Row[] = (data ?? []).map(r => ({
            id: r.id as string,
            content: r.content as string,
            scope: r.scope as string,
            scope_key: r.scope_key as string,
            namespace: (r.namespace as string | null) ?? null,
            importance: Number(r.importance),
            accessCount: Number(r.access_count ?? 0),
            createdAt: (r.created_at as string | null) ?? null,
            lastAccessedAt: (r.last_accessed_at as string | null) ?? null,
        }));

        const suggestions = suggestForForgetting(rows, { minIdleDays, limit });

        // Band the whole scanned set so the UI can show what proportion of the
        // store is actually pulling its weight.
        const bands = { strong: 0, weak: 0, stale: 0 };
        for (const row of rows) bands[classifyStrength(row)]++;

        return NextResponse.json({
            suggestions: suggestions.map(s => ({
                id: toMemoryId(s.memory.id),
                content: s.memory.content,
                scope: s.memory.scope,
                scopeKey: s.memory.scope_key,
                namespace: s.memory.namespace,
                importance: s.memory.importance,
                accessCount: s.memory.accessCount,
                createdAt: s.memory.createdAt,
                lastAccessedAt: s.memory.lastAccessedAt,
                strength: Number(s.strength.toFixed(3)),
                idleDays: Math.round(s.idleDays),
            })),
            bands,
            scanned: rows.length,
            scanCapped: rows.length >= SCAN_LIMIT,
            minIdleDays,
        });
    } catch (error) {
        console.error('[Memory] Forget-suggestions error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
