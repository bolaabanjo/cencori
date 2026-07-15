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

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const endpoint = '/v1/sessions/:id/reject';
    const startedAt = Date.now();
    const callerIdentity = extractGatewayCallerIdentity(req.headers);
    let gatewayCtx: GatewayContext | null = null;
    const { id: sessionId } = await params;

    const respond = (response: NextResponse, errorCode?: string, errorMessage?: string) => {
        if (!gatewayCtx) return response;
        void logApiGatewayRequest({
            projectId: gatewayCtx.projectId, apiKeyId: gatewayCtx.apiKeyId,
            requestId: gatewayCtx.requestId, endpoint, method: 'POST',
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

    try {
        const providedApiKey = extractCencoriApiKeyFromHeaders(req.headers);

        if (!providedApiKey) {
            return respondError(401, "Missing CENCORI_API_KEY", "missing_api_key");
        }

        const validation = await validateGatewayRequest(req);
        if (!validation.success) return validation.response;
        gatewayCtx = validation.context;

        let actionIdValue: unknown;
        try {
            const body = await req.json() as { action_id?: unknown };
            actionIdValue = body.action_id;
        } catch {
            return respondError(400, 'Request body must be valid JSON', 'invalid_json');
        }

        if (typeof actionIdValue !== 'string' || !actionIdValue.trim()) {
            return respondError(400, "Missing action_id", "missing_action_id");
        }
        const action_id = actionIdValue;

        const adminClient = createAdminClient();

        const { data: session, error: sessionError } = await adminClient
            .from('sessions')
            .select('id, project_id, status, last_turn_number')
            .eq('id', sessionId)
            .single();

        if (sessionError || !session) {
            return respondError(404, "Session not found", "session_not_found");
        }

        if (session.project_id !== gatewayCtx.projectId) {
            return respondError(404, "Session not found", "session_not_found");
        }

        if (session.status !== 'paused') {
            return respondError(409, `Session is ${session.status}, not paused`, "session_not_paused");
        }

        const { data: pausedEvent } = await adminClient
            .from('session_events')
            .select('id, payload')
            .eq('session_id', sessionId)
            .eq('turn_number', session.last_turn_number)
            .eq('event_type', 'turn.paused')
            .single();

        if (!pausedEvent) {
            return respondError(409, "No pending pause to reject", "no_pending_pause");
        }

        const pausedPayload = pausedEvent.payload as Record<string, unknown>;
        if (pausedPayload.action_id !== action_id) {
            return respondError(409, "action_id does not match the paused tool call", "action_id_mismatch");
        }

        const { data: resolutionRows, error: resolutionError } = await adminClient.rpc(
            'resolve_session_pause',
            {
                p_session_id: sessionId,
                p_project_id: gatewayCtx.projectId,
                p_turn_number: session.last_turn_number,
                p_action_id: action_id,
                p_resolution: 'rejected',
            },
        );
        if (resolutionError) {
            console.error('[Sessions] Rejection resolution failed:', resolutionError);
            return respondError(500, 'Failed to resolve session pause', 'session_resolution_failed');
        }
        const resolution = Array.isArray(resolutionRows) ? resolutionRows[0] : resolutionRows;
        if (!resolution?.applied) {
            const code = resolution?.error_code || 'concurrent_modification';
            const status = code === 'session_not_found' ? 404 : 409;
            return respondError(status, 'Session pause was already resolved or no longer matches', code);
        }

        return respond(NextResponse.json({
            id: sessionId,
            action_id,
            resolution: 'rejected',
            status: 'active',
        }));
    } catch (error: unknown) {
        console.error('[Sessions] Reject failed:', error);
        return respondError(500, 'Internal server error', 'internal_error');
    }
}
