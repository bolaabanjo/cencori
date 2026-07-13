/**
 * POST /v1/memory/remember — extract facts from a {user, assistant} exchange
 * and persist them. This is the provider-agnostic "sidecar" write path: a
 * caller using their own LLM hands us the exchange, we distill and store the
 * durable facts (redacted, org-isolated) — no inference routed through us.
 *
 * Auth: gateway API key. Quota gates user-scope writes; session scope does not.
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
    buildQuotaExceededBody,
    checkMemoryQuota,
    getProjectMemorySettings,
    parseMemoryDirective,
    rememberExchange,
} from '@/lib/memory';

interface RememberRequest {
    userId?: string;
    sessionId?: string;
    scope?: string;
    namespace?: string;
    user?: string;
    assistant?: string;
    extract?: { model?: string; prompt?: string; minImportance?: number };
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
        const body: RememberRequest = await req.json();

        const settings = await getProjectMemorySettings(ctx.supabase, ctx.projectId);
        if (!settings.enabled) {
            return respond(
                { error: 'memory_disabled', message: 'Memory is disabled for this project.' },
                403
            );
        }

        const userText = typeof body.user === 'string' ? body.user.trim() : '';
        const assistantText = typeof body.assistant === 'string' ? body.assistant.trim() : '';
        if (!userText && !assistantText) {
            return respond(
                { error: 'bad_request', message: 'Provide at least one of `user` or `assistant`.' },
                400
            );
        }
        if (userText.length > MEMORY_CONTENT_MAX_CHARS * 4 || assistantText.length > MEMORY_CONTENT_MAX_CHARS * 4) {
            return respond({ error: 'bad_request', message: 'Exchange text is too long.' }, 400);
        }

        const parsed = parseMemoryDirective({
            userId: body.userId,
            sessionId: body.sessionId,
            scope: body.scope,
            namespace: body.namespace,
            extract: body.extract,
            write: true,
        });
        if (!parsed.ok) {
            return respond({ error: 'bad_request', message: parsed.error }, 400);
        }
        const directive = parsed.directive;
        const tier = ctx.tier as SubscriptionTier;

        // Gate user-scope writes on quota up front (session scope is ungated).
        if (directive.scope !== 'session') {
            const quota = await checkMemoryQuota(ctx.supabase, ctx.projectId, tier);
            if (!quota.allowed) {
                return respond(buildQuotaExceededBody(ctx.projectId, tier, quota.used, quota.limit), 429);
            }
        }

        const result = await rememberExchange({
            supabase: ctx.supabase,
            organizationId: ctx.organizationId,
            projectId: ctx.projectId,
            tier,
            directive,
            settings,
            userText,
            assistantText,
            requestId: ctx.requestId,
        });

        await logGatewayRequest(ctx, {
            endpoint: 'memory/remember',
            model: result.model,
            provider: 'openai',
            status: result.quotaExceeded ? 'error' : 'success',
            costUsd: result.costUsd,
            cencoriChargeUsd: result.costUsd,
            errorMessage: result.quotaExceeded ? 'memory_quota_exceeded' : undefined,
            metadata: {
                scope: directive.scope,
                extracted: result.extracted,
                written: result.written.length,
            },
        });

        if (result.costUsd > 0) {
            await incrementUsage(ctx, result.costUsd);
        }

        if (result.quotaExceeded) {
            const quota = await checkMemoryQuota(ctx.supabase, ctx.projectId, tier);
            return respond(buildQuotaExceededBody(ctx.projectId, tier, quota.used, quota.limit), 429);
        }

        return respond(
            {
                written: result.written.map(m => ({
                    id: m.id,
                    content: m.content, // post-redaction
                    importance: m.importance,
                })),
                extracted: result.extracted,
                count: result.written.length,
                scope: directive.scope,
            },
            201
        );
    } catch (error) {
        console.error('[Memory] Remember API error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';

        await logGatewayRequest(ctx, {
            endpoint: 'memory/remember',
            model: 'unknown',
            provider: 'unknown',
            status: 'error',
            errorMessage: message,
        });

        return respond({ error: 'internal_error', message }, 500);
    }
}
