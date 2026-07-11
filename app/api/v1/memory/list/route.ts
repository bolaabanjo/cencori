/**
 * GET /v1/memory/list — paginate memories for a scope key.
 *
 * Query params: userId (or sessionId), scope (default user), namespace,
 * limit (<=100), cursor (ISO created_at from a previous page).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    validateGatewayRequest,
    addGatewayHeaders,
    handleCorsPreFlight,
} from '@/lib/gateway-middleware';
import {
    listSessionMemories,
    parseMemoryDirective,
    toMemoryId,
} from '@/lib/memory';

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function GET(req: NextRequest) {
    const validation = await validateGatewayRequest(req);
    if (!validation.success) {
        return validation.response;
    }
    const ctx = validation.context;

    const respond = (body: unknown, status: number) =>
        addGatewayHeaders(NextResponse.json(body, { status }), { requestId: ctx.requestId });

    try {
        const searchParams = req.nextUrl.searchParams;

        const parsed = parseMemoryDirective({
            userId: searchParams.get('userId') ?? undefined,
            sessionId: searchParams.get('sessionId') ?? undefined,
            scope: searchParams.get('scope') ?? undefined,
            namespace: searchParams.get('namespace') ?? undefined,
        });
        if (!parsed.ok) {
            return respond({ error: 'bad_request', message: parsed.error }, 400);
        }
        const directive = parsed.directive;

        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));

        if (directive.scope === 'session') {
            const items = await listSessionMemories(
                ctx.organizationId,
                ctx.projectId,
                directive.scopeKey,
                limit
            );
            return respond(
                {
                    memories: items.map(m => ({
                        id: m.id,
                        content: m.content,
                        importance: m.importance,
                        createdAt: m.createdAt,
                    })),
                    count: items.length,
                    nextCursor: null,
                },
                200
            );
        }

        let query = ctx.supabase
            .from('gateway_memories')
            .select('id, namespace, content, metadata, importance, access_count, created_at')
            .eq('organization_id', ctx.organizationId)
            .eq('project_id', ctx.projectId)
            .eq('scope', directive.scope)
            .eq('scope_key', directive.scopeKey)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (directive.namespace) {
            query = query.eq('namespace', directive.namespace);
        }

        const cursor = searchParams.get('cursor');
        if (cursor) {
            query = query.lt('created_at', cursor);
        }

        const { data, error } = await query;

        if (error) {
            return respond({ error: 'internal_error', message: 'Failed to list memories' }, 500);
        }

        const memories = (data ?? []).map(row => ({
            id: toMemoryId(row.id),
            namespace: row.namespace,
            content: row.content,
            metadata: row.metadata,
            importance: Number(row.importance),
            accessCount: row.access_count,
            createdAt: row.created_at,
        }));

        return respond(
            {
                memories,
                count: memories.length,
                nextCursor: memories.length === limit ? memories[memories.length - 1].createdAt : null,
            },
            200
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return respond({ error: 'internal_error', message }, 500);
    }
}
