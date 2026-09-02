import { createClient } from "@supabase/supabase-js";
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
import { checkEndUserQuota, recordEndUserUsage, type QuotaCheckResult } from "@/lib/end-user-billing";
import type { UnifiedMessage } from "@/lib/providers/base";
import { runGatewayInputPipeline } from "@/lib/gateway/input-guard";
import { normalizeResponsesContent, toolOutputTurns } from "@/lib/gateway/responses-content";
import {
    MAX_TEXT_FIELD_BYTES,
    utf8Bytes,
    validateResponsesInput,
} from "@/lib/gateway/responses-input";
import { buildMaskedLogPayloads, describeToolCallTurn } from "@/lib/gateway/chat-post-success";
import { recordResponseTurnEvents, toolResultsIn } from "@/lib/gateway/agentic-events";
import { waitUntil } from "@vercel/functions";
import { toOpenAiErrorBody } from "@/lib/gateway/guard-types";
import { runV1ResponsesExecution } from "@/lib/gateway/v1-responses-execute";
import type { ResponsesRequest } from "@/lib/gateway/v1-responses-execute";
import type { SubscriptionTier } from "@/lib/entitlements";
import { resolveAgentContext } from "@/lib/gateway/agent-context";

import type { ToolCallPayload } from '@/lib/gateway/v1-types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const createPendingAction = async (
    supabase: ReturnType<typeof createAdminClient>,
    agentId: string,
    toolCall: ToolCallPayload
): Promise<string | null> => {
    try {
        const { data, error } = await supabase.from("agent_actions").insert({
            agent_id: agentId,
            type: "tool_call",
            payload: toolCall,
            status: "pending",
        }).select('id').single();
        if (error) throw error;
        return data?.id || null;
    } catch (e) {
        console.error("Failed to create pending action", e);
        return null;
    }
};

const createDispatchedAction = async (
    supabase: ReturnType<typeof createAdminClient>,
    agentId: string,
    toolCall: ToolCallPayload
) => {
    try {
        await supabase.from("agent_actions").insert({
            agent_id: agentId,
            type: "tool_call",
            payload: toolCall,
            status: "dispatched",
        });
    } catch (e) {
        console.error("Failed to log action", e);
    }
};

const normalizeGatewayModelId = (modelId: string): string => {
    const strippedModel = modelId.startsWith("cencori/")
        ? modelId.slice("cencori/".length)
        : modelId;

    const aliases: Record<string, string> = {
        "gpt-5.4-thinking": "gpt-5.4",
        "gpt-5.3": "gpt-5.3-chat-latest",
        "gpt-5.3-instant": "gpt-5.3-chat-latest",
    };

    return aliases[strippedModel] || strippedModel;
};

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function POST(req: NextRequest) {
    const endpoint = '/v1/responses';
    const startedAt = Date.now();
    const callerIdentity = extractGatewayCallerIdentity(req.headers);
    let gatewayCtx: GatewayContext | null = null;

    const respond = (response: NextResponse, errorCode?: string, errorMessage?: string) => {
        if (!gatewayCtx) {
            return response;
        }
        void logApiGatewayRequest({
            projectId: gatewayCtx.projectId,
            apiKeyId: gatewayCtx.apiKeyId,
            requestId: gatewayCtx.requestId,
            endpoint,
            method: 'POST',
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

    const respondError = (
        status: number,
        message: string,
        code = 'invalid_request_error',
        headers?: HeadersInit
    ) => {
        return respond(
            NextResponse.json(
                { error: { message, type: 'invalid_request_error', code }, status: 'failed' },
                { status, headers }
            ),
            code,
            message
        );
    };

    try {
        const authHeader = req.headers.get("Authorization");
        const providedApiKey = extractCencoriApiKeyFromHeaders(req.headers);
        const isApiKeyAuth = !!providedApiKey;

        let authenticatedProjectId: string | null = null;
        let authenticatedUserId: string | null = null;

        if (isApiKeyAuth) {
            const validation = await validateGatewayRequest(req);
            if (!validation.success) {
                return validation.response;
            }
            gatewayCtx = validation.context;
            authenticatedProjectId = gatewayCtx.projectId;
        } else if (authHeader) {
            const userClient = createClient(supabaseUrl, supabaseAnonKey, {
                global: { headers: { Authorization: authHeader } },
            });
            const { data: { user }, error: authError } = await userClient.auth.getUser();
            if (authError || !user) {
                return respondError(401, "Unauthorized", "unauthorized");
            }
            authenticatedUserId = user.id;
        } else {
            return respondError(401, "Missing Authorization", "missing_authorization");
        }

        // ── Agent resolution ──
        const adminClient = createAdminClient();
        const agentResult = await resolveAgentContext({
            supabase: adminClient,
            req,
            gatewayCtx,
            authenticatedProjectId,
            authenticatedUserId,
            startedAt,
        });

        let agentId: string | null = null;
        let shadowMode = false;
        let agentConfig: { model?: string | null; system_prompt?: string | null; tools?: string[] | null } | null = null;

        if (agentResult.ok) {
            agentId = agentResult.agent.agentId;
            shadowMode = agentResult.agent.shadowMode;
            agentConfig = agentResult.agent.agentConfig;
            gatewayCtx = agentResult.agent.gatewayCtx;
        } else if (agentResult.errorCode === 'agent_not_found') {
            // No agent — allowed for API key requests
        } else if (agentResult.response) {
            return respond(agentResult.response, agentResult.errorCode, agentResult.errorMessage);
        }

        // ── Parse Request Body ──
        let body: ResponsesRequest;
        try {
            body = await req.json() as ResponsesRequest;
        } catch {
            return respondError(400, 'Request body must be valid JSON.', 'invalid_json');
        }

        if (!body || typeof body !== 'object') {
            return respondError(400, 'Request body must be a JSON object.', 'invalid_request');
        }
        if (body.model !== undefined && typeof body.model !== 'string') {
            return respondError(400, 'Model must be a string.', 'invalid_model');
        }
        if (body.instructions !== undefined
            && (typeof body.instructions !== 'string' || utf8Bytes(body.instructions) > MAX_TEXT_FIELD_BYTES)) {
            return respondError(400, 'Instructions must be a string no larger than 1 MiB.', 'invalid_instructions');
        }

        if (!body.model && !agentConfig?.model && !gatewayCtx?.defaultModel) {
            return respondError(400, "Missing model. Provide model in request body or set a default model in project settings.", 'missing_model');
        }
        const configuredModel = agentConfig?.model || body.model || gatewayCtx?.defaultModel || '';
        const model = normalizeGatewayModelId(configuredModel.trim());

        const input = body.input;
        const instructions = agentConfig?.system_prompt || body.instructions;

        // If agent mode with no input, create a default
        const inputValidationError = validateResponsesInput(input);
        if (inputValidationError) {
            return respondError(400, inputValidationError, 'invalid_input');
        }

        // ── End-User Billing ──
        const endUserId = body.user?.trim() || null;
        let endUserQuota: QuotaCheckResult | null = null;

        if (gatewayCtx?.endUserBillingEnabled && endUserId) {
            endUserQuota = await checkEndUserQuota(
                gatewayCtx.projectId,
                endUserId,
                model,
                gatewayCtx.environment
            );

            const modelNotAllowed =
                endUserQuota.reason?.startsWith('model_not_allowed:')
                || Boolean(
                    endUserQuota.allowedModels
                    && endUserQuota.allowedModels.length > 0
                    && !endUserQuota.allowedModels.includes(model)
                );

            if (modelNotAllowed) {
                return respondError(
                    403,
                    `Model "${model}" is not allowed for this end-user's rate plan`,
                    'end_user_model_not_allowed'
                );
            }

            if (!endUserQuota.allowed) {
                const retryHeaders = endUserQuota.retryAfterSeconds != null
                    ? { 'Retry-After': String(endUserQuota.retryAfterSeconds) }
                    : undefined;
                return respondError(
                    429,
                    `End-user quota exceeded: ${endUserQuota.reason || 'limit reached'}`,
                    'end_user_quota_exceeded',
                    retryHeaders
                );
            }
        }

        const maybeRecordEndUserUsage = (usageAndCost: {
            promptTokens: number; completionTokens: number; totalTokens: number;
            providerCostUsd: number; cencoriChargeUsd: number; markupPercentage: number;
        }) => {
            if (gatewayCtx?.endUserBillingEnabled && endUserId && endUserQuota) {
                recordEndUserUsage({
                    projectId: gatewayCtx.projectId,
                    externalUserId: endUserId,
                    environment: gatewayCtx.environment,
                    tokens: { prompt: usageAndCost.promptTokens, completion: usageAndCost.completionTokens, total: usageAndCost.totalTokens },
                    cost: { providerUsd: usageAndCost.providerCostUsd, cencoriChargeUsd: usageAndCost.cencoriChargeUsd },
                    customerMarkupPercentage: endUserQuota.markupPercentage,
                    flatRatePerRequest: endUserQuota.flatRatePerRequest,
                    currency: endUserQuota.currency,
                    pricingModel: endUserQuota.pricingModel,
                    pricingTiers: endUserQuota.pricingTiers,
                    monthlyTokensUsed: endUserQuota.monthlyTokensUsed,
                    platformCommissionPercentage: endUserQuota.platformCommissionPercentage,
                });
            }
        };

        if (!gatewayCtx) {
            return respondError(500, "Gateway context missing", "gateway_context_missing");
        }

        const activeGatewayCtx = gatewayCtx;

        // ── Convert input to unified messages for security pipeline ──
        const inputMessages: UnifiedMessage[] = [];
        if (instructions) {
            inputMessages.push({ role: 'system', content: instructions });
        }
        if (typeof input === 'string') {
            inputMessages.push({ role: 'user', content: input });
        } else {
            for (const item of input) {
                if (item.type === 'message') {
                    const { text, images } = normalizeResponsesContent(item.content);
                    inputMessages.push({
                        role: item.role,
                        content: text,
                        ...(images.length ? { images } : {}),
                    });
                } else if (item.type === 'function_call') {
                    inputMessages.push({
                        role: 'assistant',
                        content: '',
                        tool_calls: [{
                            id: item.call_id || item.id,
                            type: 'function',
                            function: { name: item.name, arguments: item.arguments },
                        }],
                    });
                } else if (item.type === 'function_call_output') {
                    inputMessages.push(...toolOutputTurns(item.output, item.call_id));
                } else if (item.type === 'file') {
                    inputMessages.push({
                        role: 'user',
                        content: `[File: ${item.filename}]${item.mime_type ? ` (${item.mime_type})` : ''}\n\n${item.content}`,
                    });
                }
            }
        }

        const inputPipeline = await runGatewayInputPipeline({
            supabase: adminClient,
            projectId: gatewayCtx.projectId,
            apiKeyId: gatewayCtx.apiKeyId,
            environment: gatewayCtx.environment,
            tier: (gatewayCtx.tier || "free") as SubscriptionTier,
            messages: inputMessages,
            endUserId,
        });

        if (!inputPipeline.ok) {
            const errorBody = inputPipeline.assistantMessage
                ? { ...toOpenAiErrorBody(inputPipeline), message: inputPipeline.assistantMessage, ...(inputPipeline.reasons ? { reasons: inputPipeline.reasons } : {}), ...(inputPipeline.matched_rules ? { matched_rules: inputPipeline.matched_rules } : {}) }
                : toOpenAiErrorBody(inputPipeline);
            return respond(NextResponse.json(errorBody, { status: inputPipeline.status }), inputPipeline.code, inputPipeline.message);
        }

        // Inject agent-configured built-in tools into the request
        if (agentId && agentConfig?.tools && agentConfig.tools.length > 0) {
            const existingTypes = new Set<string>((body.tools || []).map(t => t.type));
            for (const toolType of agentConfig.tools) {
                if (!existingTypes.has(toolType)) {
                    body.tools = [...(body.tools || []), { type: toolType } as never];
                }
            }
        }

        // Captured before execution: agent-configured tools are merged into `body.tools` above, so
        // this is the full set the model actually saw.
        const offeredToolNames = (body.tools || [])
            .map((tool) => {
                const named = tool as { type?: string; function?: { name?: string }; name?: string };
                return named.function?.name || named.name || named.type || '';
            })
            .filter(Boolean);

        const execResult = await runV1ResponsesExecution({
            supabase: adminClient,
            gatewayCtx: activeGatewayCtx,
            model,
            messages: inputPipeline.messages,
            body: {
                ...body,
                // Instructions have already passed through the shared input
                // pipeline and are present in `messages` above.
                instructions: undefined,
            },
            inputText: inputPipeline.inputText,
            inputSecurity: inputPipeline.inputSecurity,
            tokenMap: inputPipeline.tokenMap,
            endUserId,
            endUserQuota,
            tier: (gatewayCtx.tier || "free") as SubscriptionTier,
            recordEndUserUsage: maybeRecordEndUserUsage,
            logSuccess: (meta) => {
                // Log the prompt and completion the same way /v1/chat/completions
                // does — masked by the project's custom data rules — otherwise the
                // console shows a row with nothing to inspect.
                waitUntil(
                    (async () => {
                        const { loggedMessages, loggedResponse, loggedToolCalls } =
                            await buildMaskedLogPayloads({
                                messages: inputPipeline.messages.map((m) => ({
                                    role: m.role,
                                    content: describeToolCallTurn(m),
                                })),
                                responseText: meta.responseText ?? '',
                                toolCalls: meta.toolCalls,
                                customRules: inputPipeline.customRules,
                            });

                        await logGatewayRequest(activeGatewayCtx, {
                            endpoint: "/v1/responses",
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
                            endUserId: endUserId || undefined,
                            errorMessage: meta.errorMessage,
                            // What ties this row to the run it belongs to. Without it an agent
                            // task spanning twelve requests is twelve unrelated rows, and the
                            // console can show a request but not a run.
                            metadata: {
                                ...(meta.responseId ? { response_id: meta.responseId } : {}),
                                ...(body.previous_response_id
                                    ? { previous_response_id: body.previous_response_id }
                                    : {}),
                                ...(agentId ? { agent_id: agentId } : {}),
                            },
                            requestPayload: {
                                messages: loggedMessages,
                                model,
                                stream: body.stream || false,
                                // What the model was allowed to do, beside what it did. A turn that
                                // called nothing reads very differently depending on whether it was
                                // offered twelve tools or none.
                                ...(offeredToolNames.length > 0
                                    ? { tools: offeredToolNames }
                                    : {}),
                            },
                            responsePayload: meta.responseText !== undefined
                                ? {
                                    content: loggedResponse,
                                    ...(loggedToolCalls.length > 0
                                        ? { tool_calls: loggedToolCalls }
                                        : {}),
                                }
                                : undefined,
                        });

                        // The timeline beside the row. See lib/gateway/agentic-events.ts for why
                        // it carries the shape of the turn and not its content.
                        await recordResponseTurnEvents({
                            supabase: adminClient,
                            projectId: activeGatewayCtx.projectId,
                            organizationId: activeGatewayCtx.organizationId,
                            responseId: meta.responseId ?? '',
                            previousResponseId: body.previous_response_id,
                            model: meta.model,
                            toolsOffered: offeredToolNames,
                            toolCalls: meta.toolCalls ?? [],
                            toolResults: toolResultsIn(body.input),
                            usage: {
                                promptTokens: meta.promptTokens,
                                completionTokens: meta.completionTokens,
                                totalTokens: meta.totalTokens,
                            },
                        });
                    })().catch((err) =>
                        console.error('[Responses] request logging failed:', err)
                    )
                );
            },
            incrementUsage: (chargeUsd) => {
                void incrementUsage(activeGatewayCtx, chargeUsd);
            },
            agentId,
            shadowMode,
            createPendingAction: agentId
                ? (toolCall) => createPendingAction(adminClient, agentId, toolCall)
                : undefined,
            createDispatchedAction: agentId
                ? (toolCall) => {
                    void createDispatchedAction(adminClient, agentId, toolCall);
                }
                : undefined,
        });

        if (!execResult.ok) {
            return respond(
                NextResponse.json(execResult.body, { status: execResult.status }),
                "provider_execution_failed",
                (execResult.body as { error?: { message?: string } }).error?.message || "Provider execution failed"
            );
        }

        return respond(execResult.response);

    } catch (error: unknown) {
        console.error("Responses API Error:", error);
        const message = error instanceof Error ? error.message : "Internal server error";
        return respondError(500, message, 'internal_error');
    }
}
