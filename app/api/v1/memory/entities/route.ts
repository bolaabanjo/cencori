/**
 * GET /v1/memory/entities — list the entities in a user's memory graph.
 * (?userId=&scope=user&namespace=&limit=50). Read-only; org-scoped.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    validateGatewayRequest,
    addGatewayHeaders,
    handleCorsPreFlight,
} from '@/lib/gateway-middleware';

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function GET(req: NextRequest) {
    const validation = await validateGatewayRequest(req);
    if (!validation.success) return validation.response;
    const ctx = validation.context;
    const respond = (body: unknown, status: number) =>
        addGatewayHeaders(NextResponse.json(body, { status }), { requestId: ctx.requestId });

    try {
        const url = new URL(req.url);
        const scope = url.searchParams.get('scope') || 'user';
        const userId = url.searchParams.get('userId')?.trim() || '';
        const sessionId = url.searchParams.get('sessionId')?.trim() || '';
        const namespace = url.searchParams.get('namespace')?.trim() || null;
        const type = url.searchParams.get('type')?.trim() || null;
        const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
        const scopeKey = scope === 'session' ? sessionId || userId : userId;
        if (!scopeKey) {
            return respond({ error: 'bad_request', message: 'userId is required (or sessionId for session scope).' }, 400);
        }

        let query = ctx.supabase
            .from('memory_entities')
            .select('id, name, entity_type, aliases, mention_count, created_at')
            .eq('organization_id', ctx.organizationId)
            .eq('project_id', ctx.projectId)
            .eq('scope', scope)
            .eq('scope_key', scopeKey)
            .order('mention_count', { ascending: false })
            .limit(limit);
        if (namespace) query = query.eq('namespace', namespace);
        if (type) query = query.eq('entity_type', type);

        const { data, error } = await query;
        if (error) return respond({ error: 'internal_error', message: error.message }, 500);

        const entities = (data ?? []).map((e) => ({
            id: e.id,
            name: e.name,
            type: e.entity_type,
            aliases: (e.aliases as string[] | null) ?? [],
            mentionCount: e.mention_count,
            createdAt: e.created_at,
        }));

        return respond({ entities, count: entities.length }, 200);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return respond({ error: 'internal_error', message }, 500);
    }
}
