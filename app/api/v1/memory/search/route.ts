/**
 * POST /v1/memory/search — semantic search over scoped memories.
 *
 * Reads always work, including at 100% quota. Session scope returns recent
 * entries (no semantic ranking).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    validateGatewayRequest,
    addGatewayHeaders,
    handleCorsPreFlight,
    logGatewayRequest,
    incrementUsage,
} from '@/lib/gateway-middleware';
import {
    MEMORY_EMBEDDING_MODEL,
    getProjectMemorySettings,
    parseMemoryDirective,
    retrieveMemories,
} from '@/lib/memory';

interface SearchMemoryRequest {
    userId?: string;
    sessionId?: string;
    scope?: string;
    query?: string;
    topK?: number;
    threshold?: number;
    namespace?: string;
}

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function POST(req: NextRequest) {
    const validation = await validateGatewayRequest(req);
    if (!validation.success) {
        return validation.response;
    }
    const ctx = validation.context;
    const startTime = Date.now();

    const respond = (body: unknown, status: number) =>
        addGatewayHeaders(NextResponse.json(body, { status }), { requestId: ctx.requestId });

    try {
        const body: SearchMemoryRequest = await req.json();

        const settings = await getProjectMemorySettings(ctx.supabase, ctx.projectId);
        if (!settings.enabled) {
            return respond(
                { error: 'memory_disabled', message: 'Memory is disabled for this project.' },
                403
            );
        }

        const query = typeof body.query === 'string' ? body.query.trim() : '';
        if (!query && body.scope !== 'session') {
            return respond({ error: 'bad_request', message: 'query is required' }, 400);
        }

        const parsed = parseMemoryDirective({
            userId: body.userId,
            sessionId: body.sessionId,
            scope: body.scope,
            topK: body.topK,
            threshold: body.threshold,
            namespace: body.namespace,
        });
        if (!parsed.ok) {
            return respond({ error: 'bad_request', message: parsed.error }, 400);
        }

        const embeddingUsageRef: { current: {
            totalTokens: number;
            providerCostUsd: number;
            cencoriChargeUsd: number;
            markupPercentage: number;
            model: string;
            provider: string;
        } | null } = { current: null };
        const results = await retrieveMemories({
            supabase: ctx.supabase,
            organizationId: ctx.organizationId,
            projectId: ctx.projectId,
            directive: parsed.directive,
            queryText: query,
            onEmbeddingUsage: usage => {
                embeddingUsageRef.current = usage;
            },
        });
        const embeddingUsage = embeddingUsageRef.current;

        await logGatewayRequest(ctx, {
            endpoint: 'memory/search',
            model: embeddingUsage?.model ?? (parsed.directive.scope === 'session' ? 'none' : MEMORY_EMBEDDING_MODEL),
            provider: embeddingUsage?.provider ?? (parsed.directive.scope === 'session' ? 'none' : 'unknown'),
            status: 'success',
            promptTokens: embeddingUsage?.totalTokens ?? 0,
            completionTokens: 0,
            totalTokens: embeddingUsage?.totalTokens ?? 0,
            costUsd: embeddingUsage?.cencoriChargeUsd ?? 0,
            providerCostUsd: embeddingUsage?.providerCostUsd ?? 0,
            cencoriChargeUsd: embeddingUsage?.cencoriChargeUsd ?? 0,
            markupPercentage: embeddingUsage?.markupPercentage ?? 0,
            metadata: { scope: parsed.directive.scope, results: results.length },
        });
        await incrementUsage(ctx, embeddingUsage?.cencoriChargeUsd ?? 0);

        return respond(
            {
                results: results.map(m => ({
                    id: m.id,
                    content: m.content,
                    score: m.similarity,
                    namespace: m.namespace,
                    importance: m.importance,
                    createdAt: m.createdAt,
                })),
                count: results.length,
                latencyMs: Date.now() - startTime,
            },
            200
        );
    } catch (error) {
        console.error('[Memory] Search API error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';

        await logGatewayRequest(ctx, {
            endpoint: 'memory/search',
            model: 'unknown',
            provider: 'unknown',
            status: 'error',
            errorMessage: message,
        });

        return respond({ error: 'internal_error', message }, 500);
    }
}
