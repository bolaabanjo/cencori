import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { extractGatewayCallerIdentity, logApiGatewayRequest } from "@/lib/api-gateway-logs";
import {
    validateGatewayRequest,
    addGatewayHeaders,
    handleCorsPreFlight,
    logGatewayRequest,
    incrementUsage,
    type GatewayContext,
} from "@/lib/gateway-middleware";
import { extractCencoriApiKeyFromHeaders } from "@/lib/api-keys";
import { resumeSessionTurn, type SupabaseAdmin } from "@/lib/gateway/session-engine";
import { recordSessionApprovalResolved } from "@/lib/governance/record-session";
import type { SubscriptionTier } from "@/lib/entitlements";
import { runGatewayInputPipeline } from "@/lib/gateway/input-guard";
import type { UnifiedMessage } from "@/lib/providers/base";
import { resolveGatewayProvider } from '@/lib/gateway/providers-setup';

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const endpoint = '/v1/sessions/:id/approve';
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

        let body: { action_id?: unknown; tool_results?: unknown };
        try {
            body = await req.json() as { action_id?: unknown; tool_results?: unknown };
        } catch {
            return respondError(400, 'Request body must be valid JSON', 'invalid_json');
        }
        const { action_id, tool_results } = body;

        if (typeof action_id !== 'string' || !action_id.trim()) {
            return respondError(400, "Missing action_id", "missing_action_id");
        }

        if (!Array.isArray(tool_results) || tool_results.length === 0) {
            return respondError(
                400,
                "tool_results are required to resume an approved tool call",
                "missing_tool_results",
            );
        }
        if (tool_results.length > 100 || tool_results.some((result) =>
            !result || typeof result !== 'object'
            || typeof (result as Record<string, unknown>).action_id !== 'string'
            || typeof (result as Record<string, unknown>).output !== 'string'
            || new TextEncoder().encode((result as Record<string, unknown>).output as string).byteLength > 1024 * 1024
        )) {
            return respondError(
                400,
                'tool_results must contain at most 100 string outputs, each no larger than 1 MiB',
                'invalid_tool_results',
            );
        }
        const validatedToolResults = tool_results as Array<{ action_id: string; output: string }>;

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

        // Fetch the paused event to verify action_id and compute next sequence
        const { data: pausedEvent } = await adminClient
            .from('session_events')
            .select('id, payload')
            .eq('session_id', sessionId)
            .eq('turn_number', session.last_turn_number)
            .eq('event_type', 'turn.paused')
            .single();

        if (!pausedEvent) {
            return respondError(409, "No pending pause to approve", "no_pending_pause");
        }

        const pausedPayload = pausedEvent.payload as Record<string, unknown>;
        if (pausedPayload.action_id !== action_id) {
            return respondError(409, "action_id does not match the paused tool call", "action_id_mismatch");
        }

        const pausedActions = Array.isArray(pausedPayload.actions)
            ? (pausedPayload.actions as Array<{ action_id?: unknown }>)
                .map((action) => action.action_id)
                .filter((id): id is string => typeof id === 'string' && id.length > 0)
            : [action_id];
        const validIds = new Set(pausedActions);
        for (const tr of validatedToolResults) {
            if (!validIds.has(tr.action_id)) {
                return respondError(400, `tool_result action_id "${tr.action_id}" does not match any paused tool call`, "invalid_tool_result_action_id");
            }
        }
        const suppliedIds = new Set(validatedToolResults.map((result) => result.action_id));
        const missingResult = pausedActions.find((id) => !suppliedIds.has(id));
        if (missingResult) {
            return respondError(
                400,
                `Missing tool_result for paused action "${missingResult}"`,
                'missing_tool_result',
            );
        }

        // Tool outputs are external input. Guard and transform them before
        // they are put back into the model context on resume.
        const toolResultMessages: UnifiedMessage[] = validatedToolResults.map((result) => ({
            role: 'user',
            content: result.output,
        }));
        const toolInputPipeline = await runGatewayInputPipeline({
            supabase: adminClient,
            projectId: gatewayCtx.projectId,
            apiKeyId: gatewayCtx.apiKeyId,
            environment: gatewayCtx.environment,
            tier: (gatewayCtx.tier || 'free') as SubscriptionTier,
            messages: toolResultMessages,
        });
        if (!toolInputPipeline.ok) {
            return respondError(
                toolInputPipeline.status,
                toolInputPipeline.message,
                toolInputPipeline.code,
            );
        }
        const guardedToolResults = validatedToolResults.map((result, index) => ({
            ...result,
            output: toolInputPipeline.messages[index]?.content ?? '',
        }));

        // Complete every fallible resume preflight before consuming the pause.
        // Once resolve_session_pause commits, concurrent approvals must lose,
        // so a missing event/model/pricing row cannot be discovered afterward.
        const { data: startedEvent, error: startedEventError } = await adminClient
            .from('session_events')
            .select('payload')
            .eq('session_id', sessionId)
            .eq('turn_number', session.last_turn_number)
            .eq('event_type', 'turn.started')
            .single();
        if (startedEventError || !startedEvent) {
            return respondError(409, 'Turn has no durable started event', 'no_started_event');
        }
        const resumeModel = (startedEvent.payload as Record<string, unknown>)?.model;
        if (typeof resumeModel !== 'string' || !resumeModel.trim()) {
            return respondError(409, 'Turn has no durable model', 'no_model');
        }
        await resolveGatewayProvider({
            supabase: adminClient,
            projectId: gatewayCtx.projectId,
            organizationId: gatewayCtx.organizationId,
            requestedModel: resumeModel,
            allowedModels: gatewayCtx.allowedModels,
            sponsoredModels: gatewayCtx.sponsoredModels,
        });

        const { data: resolutionRows, error: resolutionError } = await adminClient.rpc(
            'resolve_session_pause',
            {
                p_session_id: sessionId,
                p_project_id: gatewayCtx.projectId,
                p_turn_number: session.last_turn_number,
                p_action_id: action_id,
                p_resolution: 'approved',
            },
        );
        if (resolutionError) {
            console.error('[Sessions] Approval resolution failed:', resolutionError);
            return respondError(500, 'Failed to resolve session pause', 'session_resolution_failed');
        }
        const resolution = Array.isArray(resolutionRows) ? resolutionRows[0] : resolutionRows;
        if (!resolution?.applied) {
            const code = resolution?.error_code || 'concurrent_modification';
            const status = code === 'session_not_found' ? 404 : 409;
            return respondError(status, 'Session pause was already resolved or no longer matches', code);
        }

        // Governance: immutable record of the human approval (who/what/when).
        void recordSessionApprovalResolved(adminClient as SupabaseAdmin, {
            orgId: gatewayCtx.organizationId,
            projectId: gatewayCtx.projectId,
            sessionId,
            actionId: action_id,
            resolution: 'approved',
            tool: typeof pausedPayload.tool === 'string' ? pausedPayload.tool : null,
            apiKeyId: gatewayCtx.apiKeyId,
            actorIp: gatewayCtx.clientIp,
        });

        // Resume the turn and return its SSE stream.
        const execResult = await resumeSessionTurn({
                supabase: adminClient as SupabaseAdmin,
                gatewayCtx,
                sessionId,
                turnNumber: session.last_turn_number,
                toolResults: guardedToolResults,
                tier: (gatewayCtx.tier || "free") as SubscriptionTier,
                inputText: toolInputPipeline.inputText,
                inputSecurity: toolInputPipeline.inputSecurity,
                tokenMap: toolInputPipeline.tokenMap,
                logSuccess: (meta) => {
                    void logGatewayRequest(gatewayCtx!, {
                        endpoint: "/v1/sessions/:id/approve",
                        model: meta.model,
                        provider: meta.provider,
                        status: meta.status,
                        promptTokens: meta.promptTokens,
                        completionTokens: meta.completionTokens,
                        totalTokens: meta.totalTokens,
                        costUsd: meta.cencoriChargeUsd,
                        providerCostUsd: meta.providerCostUsd,
                        cencoriChargeUsd: meta.cencoriChargeUsd,
                        markupPercentage: meta.markupPercentage,
                        errorMessage: meta.errorMessage,
                        // The "prompt" for a resumed turn is the approved tool
                        // output that was fed back to the model.
                        requestPayload: {
                            messages: guardedToolResults.map((result) => ({
                                role: 'tool',
                                content: typeof result.output === 'string'
                                    ? result.output
                                    : JSON.stringify(result.output ?? ''),
                            })),
                            model: meta.model,
                            stream: true,
                        },
                        responsePayload: meta.responseText !== undefined
                            ? { content: meta.responseText }
                            : undefined,
                    });
                },
                incrementUsage: (chargeUsd) => {
                    void incrementUsage(gatewayCtx!, chargeUsd);
                },
            });

        if (!execResult.ok) {
            return respond(
                NextResponse.json(execResult.body, { status: execResult.status }),
                "resume_failed",
                (execResult.body as { error?: { message?: string } }).error?.message || "Resume failed",
            );
        }

        return respond(execResult.response);
    } catch (error: unknown) {
        console.error('[Sessions] Approve failed:', error);
        return respondError(500, 'Internal server error', 'internal_error');
    }
}
