/**
 * POST /v1/memory/write — write a single memory.
 *
 * Auth: gateway API key (validateGatewayRequest). Org/project always come
 * from the authenticated context. Quota is the write gate; reads are never
 * gated. Content is PII-redacted before it persists.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    validateGatewayRequest,
    addGatewayHeaders,
    handleCorsPreFlight,
    logGatewayRequest,
    incrementUsage,
} from '@/lib/gateway-middleware';
import type { SubscriptionTier } from '@/lib/entitlements';
import {
    MEMORY_CONTENT_MAX_CHARS,
    MEMORY_EMBEDDING_MODEL,
    appendSessionMemories,
    buildQuotaExceededBody,
    checkMemoryQuota,
    getProjectMemorySettings,
    parseMemoryDirective,
    writeMemories,
} from '@/lib/memory';

interface WriteMemoryRequest {
    userId?: string;
    sessionId?: string;
    scope?: string;
    content?: string;
    namespace?: string;
    metadata?: Record<string, unknown>;
    importance?: number;
    expiresAt?: string;
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

    const respond = (body: unknown, status: number) =>
        addGatewayHeaders(NextResponse.json(body, { status }), { requestId: ctx.requestId });

    try {
        const body: WriteMemoryRequest = await req.json();

        const settings = await getProjectMemorySettings(ctx.supabase, ctx.projectId);
        if (!settings.enabled) {
            return respond(
                { error: 'memory_disabled', message: 'Memory is disabled for this project.' },
                403
            );
        }

        const content = typeof body.content === 'string' ? body.content.trim() : '';
        if (!content) {
            return respond({ error: 'bad_request', message: 'content is required' }, 400);
        }
        if (content.length > MEMORY_CONTENT_MAX_CHARS) {
            return respond(
                {
                    error: 'bad_request',
                    message: `content exceeds the ${MEMORY_CONTENT_MAX_CHARS}-character limit per memory`,
                },
                400
            );
        }

        const parsed = parseMemoryDirective({
            userId: body.userId,
            sessionId: body.sessionId,
            scope: body.scope,
            namespace: body.namespace,
        });
        if (!parsed.ok) {
            return respond({ error: 'bad_request', message: parsed.error }, 400);
        }
        const directive = parsed.directive;

        const importance =
            typeof body.importance === 'number'
                ? Math.min(1, Math.max(0, body.importance))
                : 0.5;

        const tier = ctx.tier as SubscriptionTier;

        // ── Session scope: Redis, no embedding, no quota ──
        if (directive.scope === 'session') {
            await appendSessionMemories(
                ctx.organizationId,
                ctx.projectId,
                directive.scopeKey,
                [{ content, importance }],
                settings.sessionTtlSeconds
            );

            await logGatewayRequest(ctx, {
                endpoint: 'memory/write',
                model: 'none',
                provider: 'none',
                status: 'success',
                metadata: { scope: 'session', content_length: content.length },
            });

            return respond(
                {
                    id: 'mem_session',
                    scope: 'session',
                    scopeKey: directive.scopeKey,
                    content,
                    importance,
                    createdAt: new Date().toISOString(),
                },
                201
            );
        }

        // ── User scope: quota → redact → embed → insert ──
        const quota = await checkMemoryQuota(ctx.supabase, ctx.projectId, tier);
        if (!quota.allowed) {
            return respond(buildQuotaExceededBody(ctx.projectId, tier, quota.used, quota.limit), 429);
        }

        const result = await writeMemories({
            supabase: ctx.supabase,
            organizationId: ctx.organizationId,
            projectId: ctx.projectId,
            tier,
            scope: directive.scope,
            scopeKey: directive.scopeKey,
            namespace: directive.namespace,
            facts: [{ content, importance }],
            metadata: { ...body.metadata, extractedFrom: 'manual' },
        });

        if (result.written.length === 0) {
            // Either the fact was blocked by a data rule or the insert failed.
            await logGatewayRequest(ctx, {
                endpoint: 'memory/write',
                model: MEMORY_EMBEDDING_MODEL,
                provider: 'openai',
                status: 'error',
                errorMessage: 'Memory was not written (blocked by data rules or storage failure)',
            });
            return respond(
                {
                    error: 'memory_not_written',
                    message: 'Memory was not written — blocked by a data rule or a storage failure.',
                },
                422
            );
        }

        await logGatewayRequest(ctx, {
            endpoint: 'memory/write',
            model: MEMORY_EMBEDDING_MODEL,
            provider: 'openai',
            status: 'success',
            costUsd: result.embeddingCostUsd,
            cencoriChargeUsd: result.embeddingCostUsd,
            metadata: { scope: directive.scope, content_length: content.length },
        });
        await incrementUsage(ctx, result.embeddingCostUsd);

        const written = result.written[0];
        return respond(
            {
                id: written.id,
                scope: directive.scope,
                scopeKey: directive.scopeKey,
                namespace: directive.namespace,
                content: written.content, // post-redaction
                importance: written.importance,
                createdAt: new Date().toISOString(),
            },
            201
        );
    } catch (error) {
        console.error('[Memory] Write API error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';

        await logGatewayRequest(ctx, {
            endpoint: 'memory/write',
            model: 'unknown',
            provider: 'unknown',
            status: 'error',
            errorMessage: message,
        });

        return respond({ error: 'internal_error', message }, 500);
    }
}
