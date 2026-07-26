/**
 * GET /v1/memory/forget-suggestions — propose memories worth forgetting.
 *
 * A memory system is only as good as its forgetting. This returns stale,
 * low-strength, long-idle memories (Layer 4 strength) as *candidates* — it never
 * deletes anything. The caller reviews and forgets explicitly via
 * DELETE /v1/memory/:id. Honors the "no silent forgetting" contract.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    validateGatewayRequest,
    addGatewayHeaders,
    handleCorsPreFlight,
} from '@/lib/gateway-middleware';
import {
    getProjectMemorySettings,
    suggestForForgetting,
    toMemoryId,
    type StrengthInput,
} from '@/lib/memory';

export async function OPTIONS() {
    return handleCorsPreFlight();
}

interface Row extends StrengthInput {
    id: string;
    content: string;
}

export async function GET(req: NextRequest) {
    const validation = await validateGatewayRequest(req);
    if (!validation.success) return validation.response;
    const ctx = validation.context;

    const respond = (body: unknown, status: number) =>
        addGatewayHeaders(NextResponse.json(body, { status }), { requestId: ctx.requestId });

    try {
        const settings = await getProjectMemorySettings(ctx.supabase, ctx.projectId);
        if (!settings.enabled) {
            return respond({ error: 'memory_disabled', message: 'Memory is disabled for this project.' }, 403);
        }

        const url = new URL(req.url);
        const scope = url.searchParams.get('scope') || 'user';
        const userId = url.searchParams.get('userId')?.trim() || '';
        const sessionId = url.searchParams.get('sessionId')?.trim() || '';
        const namespace = url.searchParams.get('namespace')?.trim() || null;
        const scopeKey = scope === 'session' ? (sessionId || userId) : userId;
        if (!scopeKey) {
            return respond({ error: 'bad_request', message: 'userId is required (or sessionId for session scope).' }, 400);
        }

        const limit = clampInt(url.searchParams.get('limit'), 20, 1, 100);
        const minIdleDays = clampInt(url.searchParams.get('minIdleDays'), 60, 0, 3650);

        // Evaluate the active set for this scope. Cap the scan so a huge store
        // doesn't blow the request; suggestions are the weakest, oldest anyway.
        let query = ctx.supabase
            .from('gateway_memories')
            .select('id, content, importance, access_count, created_at, last_accessed_at')
            .eq('organization_id', ctx.organizationId)
            .eq('project_id', ctx.projectId)
            .eq('scope', scope)
            .eq('scope_key', scopeKey)
            .eq('status', 'active')
            .order('last_accessed_at', { ascending: true, nullsFirst: true })
            .limit(1000);
        if (namespace) query = query.eq('namespace', namespace);

        const { data, error } = await query;
        if (error) {
            return respond({ error: 'internal_error', message: error.message }, 500);
        }

        const rows: Row[] = (data ?? []).map((r) => ({
            id: r.id,
            content: r.content,
            importance: Number(r.importance),
            accessCount: Number(r.access_count ?? 0),
            createdAt: r.created_at,
            lastAccessedAt: r.last_accessed_at,
        }));

        const suggestions = suggestForForgetting(rows, { minIdleDays, limit }).map((s) => ({
            id: toMemoryId(s.memory.id),
            content: s.memory.content,
            strength: Number(s.strength.toFixed(4)),
            idleDays: Math.round(s.idleDays),
            importance: s.memory.importance,
        }));

        return respond({ suggestions, count: suggestions.length, evaluated: rows.length }, 200);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return respond({ error: 'internal_error', message }, 500);
    }
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
    const n = raw != null ? parseInt(raw, 10) : NaN;
    if (Number.isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}
