import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { extractGatewayCallerIdentity, logApiGatewayRequest } from "@/lib/api-gateway-logs";
import {
    validateGatewayRequest,
    addGatewayHeaders,
    handleCorsPreFlight,
    type GatewayContext,
} from "@/lib/gateway-middleware";
import { extractCencoriApiKeyFromHeaders } from "@/lib/api-keys";
import { expireStaleSessions } from "@/lib/gateway/session-engine";

export async function OPTIONS() {
    return handleCorsPreFlight();
}

type HandlerContext = {
    gatewayCtx: GatewayContext;
    respond: (response: NextResponse, errorCode?: string, errorMessage?: string) => NextResponse;
    respondError: (status: number, message: string, code?: string) => NextResponse;
};

async function authOrError(req: NextRequest, endpoint: string, startedAt: number, callerIdentity: ReturnType<typeof extractGatewayCallerIdentity>): Promise<NextResponse | HandlerContext> {
    const providedApiKey = extractCencoriApiKeyFromHeaders(req.headers);
    if (!providedApiKey) {
        return NextResponse.json({ error: { message: "Missing CENCORI_API_KEY", type: 'invalid_request_error', code: 'missing_api_key' }, status: 'failed' }, { status: 401 });
    }

    const validation = await validateGatewayRequest(req);
    if (!validation.success) return validation.response;
    const gatewayCtx = validation.context;

    const respond = (response: NextResponse, errorCode?: string, errorMessage?: string) => {
        void logApiGatewayRequest({
            projectId: gatewayCtx.projectId,
            apiKeyId: gatewayCtx.apiKeyId,
            requestId: gatewayCtx.requestId,
            endpoint,
            method: req.method,
            statusCode: response.status,
            startedAt,
            environment: gatewayCtx.environment,
            ipAddress: gatewayCtx.clientIp,
            countryCode: gatewayCtx.countryCode,
            userAgent: req.headers.get('user-agent'),
            callerOrigin: callerIdentity.callerOrigin,
            clientApp: callerIdentity.clientApp,
            errorCode: errorCode || null,
            errorMessage: errorMessage || null,
        });
        return addGatewayHeaders(response, { requestId: gatewayCtx.requestId });
    };

    const respondError = (status: number, message: string, code = 'invalid_request_error') => {
        return respond(
            NextResponse.json({ error: { message, type: 'invalid_request_error', code }, status: 'failed' }, { status }),
            code,
            message,
        );
    };

    return { gatewayCtx, respond, respondError };
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const endpoint = '/v1/sessions/:id';
    const startedAt = Date.now();
    const callerIdentity = extractGatewayCallerIdentity(req.headers);
    const { id } = await params;

    const ctx = await authOrError(req, endpoint, startedAt, callerIdentity);
    if ('status' in ctx) return ctx;
    const { gatewayCtx, respondError, respond } = ctx;

    try {
        const adminClient = createAdminClient();
        void expireStaleSessions(adminClient as never).catch((error) => {
            console.error('[Sessions] Opportunistic expiry failed:', error);
        });
        const { data: session, error } = await adminClient
            .from('sessions')
            .select('id, project_id, status, last_turn_number, created_at, updated_at, agent_id, metadata, total_cost_usd')
            .eq('id', id)
            .single();

        if (error || !session) {
            return respondError(404, "Session not found", "session_not_found");
        }

        if (session.project_id !== gatewayCtx.projectId) {
            return respondError(404, "Session not found", "session_not_found");
        }

        return respond(NextResponse.json({
            id: session.id,
            status: session.status,
            turn_count: session.last_turn_number,
            created_at: session.created_at,
            updated_at: session.updated_at,
            agent_id: session.agent_id,
            metadata: session.metadata,
            total_cost: session.total_cost_usd ?? 0,
        }));
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Internal server error";
        return respondError(500, message, 'internal_error');
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const endpoint = '/v1/sessions/:id';
    const startedAt = Date.now();
    const callerIdentity = extractGatewayCallerIdentity(req.headers);
    const { id } = await params;

    const ctx = await authOrError(req, endpoint, startedAt, callerIdentity);
    if ('status' in ctx) return ctx;
    const { gatewayCtx, respondError, respond } = ctx;

    try {
        const adminClient = createAdminClient();

        const { data: session, error: fetchError } = await adminClient
            .from('sessions')
            .select('id, project_id, status')
            .eq('id', id)
            .single();

        if (fetchError || !session) {
            return respondError(404, "Session not found", "session_not_found");
        }

        if (session.project_id !== gatewayCtx.projectId) {
            return respondError(404, "Session not found", "session_not_found");
        }

        const { error: deleteError } = await adminClient
            .from('sessions')
            .delete()
            .eq('id', id);

        if (deleteError) {
            return respondError(500, deleteError.message, 'session_deletion_failed');
        }

        return respond(NextResponse.json({ id, deleted: true }));
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Internal server error";
        return respondError(500, message, 'internal_error');
    }
}
