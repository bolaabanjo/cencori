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
import type { CreateSessionRequest } from "@/lib/gateway/session-types";
import { expireStaleSessions } from "@/lib/gateway/session-engine";

export async function OPTIONS() {
    return handleCorsPreFlight();
}

type AuthResult = {
    gatewayCtx: GatewayContext | null;
    respond: (response: NextResponse, errorCode?: string, errorMessage?: string) => NextResponse;
    respondError: (status: number, message: string, code?: string) => NextResponse;
    method: string;
    startedAt: number;
    callerIdentity: ReturnType<typeof extractGatewayCallerIdentity>;
    errorResponse: NextResponse | null;
};

async function authOrError(req: NextRequest): Promise<AuthResult> {
    const method = req.method;
    const endpoint = '/v1/sessions';
    const startedAt = Date.now();
    const callerIdentity = extractGatewayCallerIdentity(req.headers);
    let gatewayCtx: GatewayContext | null = null;

    const respond = (response: NextResponse, errorCode?: string, errorMessage?: string) => {
        if (!gatewayCtx) return response;
        void logApiGatewayRequest({
            projectId: gatewayCtx.projectId, apiKeyId: gatewayCtx.apiKeyId,
            requestId: gatewayCtx.requestId, endpoint, method,
            statusCode: response.status, startedAt, environment: gatewayCtx.environment,
            ipAddress: gatewayCtx.clientIp, countryCode: gatewayCtx.countryCode,
            userAgent: req.headers.get('user-agent'),
            callerOrigin: callerIdentity.callerOrigin, clientApp: callerIdentity.clientApp,
            errorCode: errorCode || null, errorMessage: errorMessage || null,
        });
        return addGatewayHeaders(response, { requestId: gatewayCtx.requestId });
    };

    const respondError = (status: number, message: string, code = 'invalid_request_error') => {
        return respond(NextResponse.json({ error: { message, type: 'invalid_request_error', code }, status: 'failed' }, { status }), code, message);
    };

    const providedApiKey = extractCencoriApiKeyFromHeaders(req.headers);
    if (!providedApiKey) {
        return { gatewayCtx: null, respond, respondError, method, startedAt, callerIdentity, errorResponse: respondError(401, "Missing CENCORI_API_KEY", "missing_api_key") };
    }

    const validation = await validateGatewayRequest(req);
    if (!validation.success) return { gatewayCtx: null, respond, respondError, method, startedAt, callerIdentity, errorResponse: validation.response };
    gatewayCtx = validation.context;

    return { gatewayCtx, respond, respondError, method, startedAt, callerIdentity, errorResponse: null };
}

function handleAuthResult(result: AuthResult): { gatewayCtx: GatewayContext; respond: AuthResult['respond']; respondError: AuthResult['respondError'] } | NextResponse {
    if (result.errorResponse) return result.errorResponse;
    if (!result.gatewayCtx) return result.respondError(401, "Unauthorized", "unauthorized");
    return { gatewayCtx: result.gatewayCtx, respond: result.respond, respondError: result.respondError };
}

export async function GET(req: NextRequest) {
    const authResult = await authOrError(req);
    const auth = handleAuthResult(authResult);
    if ('status' in auth) return auth;
    const { gatewayCtx, respond, respondError } = auth;

    try {
        const adminClient = createAdminClient();

        // Sweep expired paused sessions before listing
        void expireStaleSessions(adminClient as never).catch((error) => {
            console.error('[Sessions] Opportunistic expiry failed:', error);
        });

        const searchParams = req.nextUrl.searchParams;
        const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));
        const offset = (page - 1) * limit;
        const statusFilter = searchParams.get('status');
        const agentIdFilter = searchParams.get('agent_id');

        let query = adminClient
            .from('sessions')
            .select('id, status, last_turn_number, created_at, updated_at, agent_id, metadata, total_cost_usd', { count: 'exact' })
            .eq('project_id', gatewayCtx.projectId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (statusFilter) query = query.eq('status', statusFilter);
        if (agentIdFilter) query = query.eq('agent_id', agentIdFilter);

        const { data: sessions, error, count } = await query;

        if (error) return respondError(500, error.message, 'sessions_fetch_failed');

        return respond(NextResponse.json({
            data: (sessions || []).map(s => ({
                id: s.id, status: s.status,
                turn_count: s.last_turn_number,
                created_at: s.created_at, updated_at: s.updated_at,
                agent_id: s.agent_id, metadata: s.metadata,
                total_cost: s.total_cost_usd ?? 0,
            })),
            pagination: { page, limit, total: count || 0, total_pages: count ? Math.ceil(count / limit) : 0 },
        }));
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Internal server error";
        return respondError(500, message, 'internal_error');
    }
}

export async function POST(req: NextRequest) {
    const authResult = await authOrError(req);
    const auth = handleAuthResult(authResult);
    if ('status' in auth) return auth;
    const { gatewayCtx, respond, respondError } = auth;

    try {
        const body = await req.json() as CreateSessionRequest;
        const adminClient = createAdminClient();

        if (body.agent_id) {
            const { data: agent, error: agentError } = await adminClient
                .from('agents')
                .select('id, project_id, is_active')
                .eq('id', body.agent_id)
                .maybeSingle();

            if (agentError) {
                return respondError(500, 'Failed to verify agent', 'agent_access_check_failed');
            }
            if (!agent || agent.project_id !== gatewayCtx.projectId) {
                return respondError(404, 'Agent not found', 'agent_not_found');
            }
            if (!agent.is_active) {
                return respondError(409, 'Agent is not active', 'agent_inactive');
            }
        }

        const { data: session, error } = await adminClient.from('sessions').insert({
            project_id: gatewayCtx.projectId,
            organization_id: gatewayCtx.organizationId,
            status: 'active',
            agent_id: body.agent_id || null,
            metadata: body.metadata || {},
        }).select('id, status, last_turn_number, created_at, updated_at, agent_id, metadata, total_cost_usd').single();

        if (error || !session) {
            return respondError(500, error?.message || 'Failed to create session', 'session_creation_failed');
        }

        return respond(NextResponse.json({
            id: session.id, status: session.status,
            turn_count: session.last_turn_number,
            created_at: session.created_at, updated_at: session.updated_at,
            agent_id: session.agent_id, metadata: session.metadata,
            total_cost: session.total_cost_usd ?? 0,
        }, { status: 201 }));
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Internal server error";
        return respondError(500, message, 'internal_error');
    }
}
