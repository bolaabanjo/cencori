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
import type { Tool, UnifiedChatRequest } from "@/lib/providers/base";
import {
    computeExactCacheKey,
    getProjectCacheConfig,
    lookupCache,
    storeInCache,
    recordCacheHit,
    logCacheEvent,
} from "@/lib/cache/prompt-cache";
import { getCachedCacheConfig, setCachedCacheConfig } from "@/lib/config-cache";
import type { CacheConfig, CacheLookupResult } from "@/lib/cache/types";
import { resolvePrompt, logPromptUsage } from "@/lib/prompts/registry";
import type { ResolvedPrompt } from "@/lib/prompts/types";
import { runGatewayInputPipeline } from "@/lib/gateway/input-guard";
import { toOpenAiErrorBody } from "@/lib/gateway/guard-types";
import { runV1ProviderExecution } from "@/lib/gateway/v1-execute";
import { makeChatLogSuccess } from "@/lib/gateway/chat-post-success";
import {
    hasImageInMessages,
    runVisionChat,
    toVisionGuardMessages,
} from "@/lib/gateway/chat-vision-router";
import { waitUntil } from "@vercel/functions";
import {
    buildMemoryBlock,
    getProjectMemorySettings,
    parseMemoryDirective,
    retrieveMemories,
    runChatMemoryWriteback,
    type MemoryDirective,
    type MemoryDirectiveInput,
    type MemorySettings,
    type RetrievedMemory,
} from "@/lib/memory";
import type { ToolCallPayload } from "@/lib/gateway/v1-types";
import type { SubscriptionTier } from "@/lib/entitlements";
import type { UnifiedMessage } from "@/lib/providers/base";
import { resolveAgentContext } from "@/lib/gateway/agent-context";
import { isLocalMemoryBuild } from "@/lib/memory/availability";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type SupabaseAdminClient = ReturnType<typeof createAdminClient>;
type ChatMessage = {
    role: "system" | "user" | "assistant" | "tool" | string;
    content: unknown;
};
type ChatRequestBody = {
    model?: string;
    messages?: ChatMessage[];
    tools?: Tool[];
    tool_choice?: UnifiedChatRequest["toolChoice"];
    stream?: boolean;
    temperature?: number;
    max_tokens?: number;
    frequency_penalty?: number;
    frequencyPenalty?: number;
    presence_penalty?: number;
    presencePenalty?: number;
    user?: string;
    prompt?: {
        name: string;
        variables?: Record<string, string>;
    };
    memory?: MemoryDirectiveInput;
};

const normalizeGatewayModelId = (modelId: string): string => {
    // OpenClaw custom provider aliases may send "cencori/<model>".
    // Normalize to the actual upstream model ID used in provider configs.
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

/**
 * Insert a tool call as a pending action for Shadow Mode approval.
 * Returns the action ID for polling.
 */
const createPendingAction = async (
    supabase: SupabaseAdminClient,
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

/**
 * Record a tool call returned to the client (shadow mode OFF). Cencori does
 * not execute arbitrary customer functions, so the audit status is
 * "dispatched", not "executed".
 */
const createDispatchedAction = async (
    supabase: SupabaseAdminClient,
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

// ── CORS Preflight ──
export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function POST(req: NextRequest) {
    const endpoint = '/v1/chat/completions';
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
                {
                    error: {
                        message,
                        type: 'invalid_request_error',
                        code,
                    },
                },
                { status, headers }
            ),
            code,
            message
        );
    };

    try {
        const authHeader = req.headers.get("Authorization");
        const providedApiKey = extractCencoriApiKeyFromHeaders(req.headers);

        // Determine auth mode: API key (production agents) vs user token (dashboard testing)
        const isApiKeyAuth = !!providedApiKey;

        let authenticatedProjectId: string | null = null;
        let authenticatedUserId: string | null = null;

        if (isApiKeyAuth) {
            // ── Production Path: Full gateway validation (rate limit, spend cap, auth) ──
            const validation = await validateGatewayRequest(req);
            if (!validation.success) {
                return validation.response;
            }
            gatewayCtx = validation.context;
            authenticatedProjectId = gatewayCtx.projectId;
        } else if (authHeader) {
            // ── Dashboard Path: User token auth (for testing from UI) ──
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
        const body = await req.json() as ChatRequestBody;
        let messages = body.messages ?? [];
        const { tools, tool_choice } = body;
        const shouldStream = typeof body.stream === "boolean" ? body.stream : Boolean(agentConfig);
        if (messages.length === 0) {
            return respondError(400, "Missing messages", "missing_messages");
        }
        const isVisionRequest = hasImageInMessages(messages);
        if (isVisionRequest && tools && tools.length > 0) {
            return respondError(
                400,
                "Tool calling is not supported for image chat requests.",
                "vision_tools_unsupported"
            );
        }

        // Resolve model: agent config overrides request model; non-agent mode uses request/default project model.
        const configuredModel = agentConfig?.model || body.model || gatewayCtx?.defaultModel;
        if (typeof configuredModel !== "string" || configuredModel.trim().length === 0) {
            const isAgentMode = !!agentConfig;
            return respondError(
                400,
                isAgentMode
                    ? "No model configured. Set a model in the agent dashboard."
                    : "Missing model. Provide model in request body or set a default model in project settings.",
                'missing_model_configuration'
            );
        }
        const model = normalizeGatewayModelId(configuredModel.trim());

        // Inject system prompt from agent config (agent mode only).
        if (agentConfig?.system_prompt) {
            messages = messages.filter((m) => m.role !== "system");
            messages = [
                { role: "system", content: agentConfig.system_prompt },
                ...messages
            ];
        }

        // ── Prompt Registry resolution (if no agent system_prompt) ──
        let resolvedPrompt: ResolvedPrompt | null = null;
        const promptRef = body.prompt?.name || req.headers.get("X-Cencori-Prompt");
        if (promptRef && gatewayCtx && !agentConfig?.system_prompt) {
            try {
                const varsHeader = req.headers.get("X-Cencori-Prompt-Vars");
                const variables = body.prompt?.variables
                    || (varsHeader ? JSON.parse(varsHeader) : undefined);

                resolvedPrompt = await resolvePrompt(gatewayCtx.projectId, promptRef, variables);
                if (!resolvedPrompt) {
                    return respondError(404, `Prompt "${promptRef}" not found or has no active version`, 'prompt_not_found');
                }

                // Inject as system message
                messages = messages.filter((m) => m.role !== "system");
                messages = [
                    { role: "system", content: resolvedPrompt.content },
                    ...messages,
                ];
            } catch (error) {
                const msg = error instanceof Error ? error.message : 'Prompt resolution failed';
                return respondError(400, msg, 'prompt_resolution_failed');
            }
        }
        const visionSourceMessages = isVisionRequest ? [...messages] : null;

        const toUnifiedMessages = (items: ChatMessage[]): UnifiedMessage[] => {
            return items.map((m) => ({
                role: (m.role === "system" || m.role === "assistant" || m.role === "tool") ? m.role : "user",
                content: typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? ""),
            }));
        };

        // ── End-User Billing: Quota Check ──
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

        // Helper: record end-user usage after a successful request (fire-and-forget)
        const maybeRecordEndUserUsage = (usageAndCost: {
            promptTokens: number;
            completionTokens: number;
            totalTokens: number;
            providerCostUsd: number;
            cencoriChargeUsd: number;
            markupPercentage: number;
        }) => {
            if (gatewayCtx?.endUserBillingEnabled && endUserId && endUserQuota) {
                recordEndUserUsage({
                    projectId: gatewayCtx.projectId,
                    externalUserId: endUserId,
                    environment: gatewayCtx.environment,
                    tokens: {
                        prompt: usageAndCost.promptTokens,
                        completion: usageAndCost.completionTokens,
                        total: usageAndCost.totalTokens,
                    },
                    cost: {
                        providerUsd: usageAndCost.providerCostUsd,
                        cencoriChargeUsd: usageAndCost.cencoriChargeUsd,
                    },
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

        if (body.memory !== undefined && !isLocalMemoryBuild()) {
            return respondError(
                400,
                "The memory parameter is not available.",
                "unsupported_parameter"
            );
        }

        // ── Memory directive (API opt-in: presence of `memory` enables it) ──
        let memoryDirective: MemoryDirective | null = null;
        let memorySettings: MemorySettings | null = null;

        if (body.memory !== undefined) {
            memorySettings = await getProjectMemorySettings(adminClient, gatewayCtx.projectId);
            if (!memorySettings.enabled) {
                return respondError(403, "Memory is disabled for this project.", "memory_disabled");
            }

            const parsedDirective = parseMemoryDirective(body.memory);
            if (!parsedDirective.ok) {
                return respondError(400, parsedDirective.error, "invalid_memory_directive");
            }
            memoryDirective = parsedDirective.directive;
        }

        const pipelineMessages: UnifiedMessage[] = isVisionRequest
            ? toVisionGuardMessages(messages)
            : toUnifiedMessages(messages);

        // Kick off memory retrieval in parallel with the input pipeline —
        // the embedding + RPC overlap the pipeline's own work, keeping added
        // latency well under the 150ms p95 budget. retrieveMemories is
        // fail-open: any failure yields [] and the request proceeds.
        const lastUserMessageText =
            [...pipelineMessages].reverse().find((m) => m.role === "user")?.content ?? "";
        const memoryPromise: Promise<RetrievedMemory[]> =
            memoryDirective?.retrieve
                ? retrieveMemories({
                    supabase: adminClient,
                    organizationId: activeGatewayCtx.organizationId,
                    projectId: activeGatewayCtx.projectId,
                    directive: memoryDirective,
                    queryText: lastUserMessageText,
                    onEmbeddingUsage: usage => {
                        waitUntil(Promise.all([
                            logGatewayRequest(activeGatewayCtx, {
                                endpoint: "memory/search",
                                model: usage.model,
                                provider: usage.provider,
                                status: "success",
                                promptTokens: usage.totalTokens,
                                completionTokens: 0,
                                totalTokens: usage.totalTokens,
                                costUsd: usage.cencoriChargeUsd,
                                providerCostUsd: usage.providerCostUsd,
                                cencoriChargeUsd: usage.cencoriChargeUsd,
                                markupPercentage: usage.markupPercentage,
                                metadata: { source: "chat_memory_retrieval" },
                            }),
                            incrementUsage(activeGatewayCtx, usage.cencoriChargeUsd),
                        ]).then(() => undefined));
                    },
                })
                : Promise.resolve([]);

        const inputPipeline = await runGatewayInputPipeline({
            supabase: adminClient,
            projectId: gatewayCtx.projectId,
            apiKeyId: gatewayCtx.apiKeyId,
            environment: gatewayCtx.environment,
            tier: (gatewayCtx.tier || "free") as SubscriptionTier,
            messages: pipelineMessages,
            endUserId,
        });

        if (!inputPipeline.ok) {
            const errorBody = inputPipeline.assistantMessage
                ? {
                    ...toOpenAiErrorBody(inputPipeline),
                    message: inputPipeline.assistantMessage,
                    ...(inputPipeline.reasons ? { reasons: inputPipeline.reasons } : {}),
                    ...(inputPipeline.matched_rules ? { matched_rules: inputPipeline.matched_rules } : {}),
                }
                : toOpenAiErrorBody(inputPipeline);
            return respond(
                NextResponse.json(errorBody, { status: inputPipeline.status }),
                inputPipeline.code,
                inputPipeline.message
            );
        }

        const guardedMessages = inputPipeline.messages;

        // ── Memory injection ──
        // After the input pipeline: stored facts were already redacted at
        // write time and must not be re-tokenized. Insert the facts block
        // after any leading system messages, before the first non-system turn.
        const retrievedMemories = await memoryPromise;
        if (retrievedMemories.length > 0) {
            const memoryMessage: UnifiedMessage = {
                role: "system",
                content: buildMemoryBlock(retrievedMemories, memoryDirective?.mode ?? "inject"),
            };
            let insertAt = 0;
            while (insertAt < guardedMessages.length && guardedMessages[insertAt].role === "system") {
                insertAt++;
            }
            guardedMessages.splice(insertAt, 0, memoryMessage);
        }

        messages = guardedMessages.map((m) => ({
            role: m.role,
            content: m.content,
        }));

        // Vision uses the same quota, memory, input rules, output guard, and
        // billing hooks as text chat. The image-bearing source is preserved
        // separately while the provider receives only guarded text.
        if (isVisionRequest && visionSourceMessages) {
            const guardedPrompt = guardedMessages
                .map((message) => `${message.role}: ${message.content}`)
                .join('\n');
            const visionResponse = await runVisionChat({
                ctx: activeGatewayCtx,
                rawMessages: visionSourceMessages,
                requestedModel: model,
                maxTokens: body.max_tokens,
                temperature: body.temperature,
                stream: shouldStream,
                guardedPrompt,
                inputText: inputPipeline.inputText,
                inputSecurity: inputPipeline.inputSecurity,
                conversationHistory: guardedMessages,
                tokenMap: inputPipeline.tokenMap,
                endUserId,
                wireFormat: 'openai',
                recordEndUserUsage: maybeRecordEndUserUsage,
                onCompletion: (assistantText) => {
                    if (memoryDirective?.write && memorySettings && assistantText) {
                        waitUntil(runChatMemoryWriteback({
                            supabase: adminClient,
                            gatewayCtx: activeGatewayCtx,
                            directive: memoryDirective,
                            settings: memorySettings,
                            userText: inputPipeline.inputText,
                            assistantText,
                        }));
                    }
                    if (resolvedPrompt) {
                        void logPromptUsage({
                            projectId: activeGatewayCtx.projectId,
                            promptId: resolvedPrompt.promptId,
                            versionId: resolvedPrompt.versionId,
                            model,
                            apiKeyId: activeGatewayCtx.apiKeyId ?? undefined,
                            requestId: activeGatewayCtx.requestId,
                            variablesUsed: body.prompt?.variables || null,
                            latencyMs: Date.now() - startedAt,
                        });
                    }
                },
            });
            if (memoryDirective) {
                visionResponse.headers.set(
                    'X-Cencori-Memory-Retrieved',
                    String(retrievedMemories.length)
                );
            }
            return respond(visionResponse as NextResponse);
        }

        // ── Prompt Cache Intercept ──
        let cacheConfig: CacheConfig | null = null;
        let cacheResult: CacheLookupResult | null = null;
        let cacheKey: string | null = null;
        let promptTextForCache: string | null = null;

        // Check if user wants to skip cache for this request
        const skipCache = req.headers.get('x-skip-cache')?.toLowerCase() === 'true';

        // Memory interlock: responses assembled with user-specific injected
        // facts must never be cached (semantic cache matches project-wide —
        // user A's facts could serve user B), and lookups against such
        // prompts are useless. Skip the cache in both directions.
        if (gatewayCtx && !shouldStream && !tools && !skipCache && !memoryDirective?.retrieve) {
            try {
                // Try cache first - use cached config if available
                const cachedConfig = await getCachedCacheConfig(gatewayCtx.projectId);
                if (cachedConfig) {
                    cacheConfig = cachedConfig.data;
                } else {
                    cacheConfig = await getProjectCacheConfig(gatewayCtx.projectId);
                    // Cache the config for next time
                    await setCachedCacheConfig(gatewayCtx.projectId, cacheConfig);
                }

                if (cacheConfig && cacheConfig.cacheEnabled && !cacheConfig.excludedModels.includes(model)) {
                    const requestTemp = body.temperature ?? 0;

                    if (requestTemp <= cacheConfig.maxCacheableTemperature) {
                        const normalizedMsgs = messages.map(m => ({
                            role: String(m.role),
                            content: typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? ""),
                        }));

                        cacheKey = computeExactCacheKey({
                            projectId: gatewayCtx.projectId,
                            environment: gatewayCtx.environment,
                            model,
                            temperature: requestTemp,
                            maxTokens: body.max_tokens,
                            messages: normalizedMsgs,
                        });

                        promptTextForCache = normalizedMsgs.map(m => `${m.role}: ${m.content}`).join('\n');

                        cacheResult = await lookupCache({
                            projectId: gatewayCtx.projectId,
                            environment: gatewayCtx.environment,
                            cacheKey,
                            promptText: promptTextForCache,
                            model,
                            maxTokens: body.max_tokens,
                            config: cacheConfig,
                        });

                        if (cacheResult.hit && cacheResult.response) {
                            // Track hit
                            const estimatedTokens = cacheResult.estimatedTokens || cacheResult.response?.usage?.total_tokens || 0;
                            const estimatedCost = cacheResult.estimatedCostUsd || Number(cacheResult.response?.cost_usd) || 0;
                            if (cacheResult.entryId) {
                                void recordCacheHit(cacheResult.entryId, estimatedTokens, estimatedCost);
                            }
                            void logCacheEvent({
                                projectId: gatewayCtx.projectId,
                                entryId: cacheResult.entryId,
                                eventType: cacheResult.hitType === 'exact' ? 'hit_exact' : 'hit_semantic',
                                model,
                                similarityScore: cacheResult.similarityScore ?? undefined,
                                latencySavedMs: Date.now() - startedAt,
                                tokensSaved: estimatedTokens,
                                costSavedUsd: estimatedCost,
                                requestId: gatewayCtx.requestId,
                                environment: gatewayCtx.environment,
                            });

                            // Log as cached request (zero cost)
                            void logGatewayRequest(activeGatewayCtx, {
                                endpoint: '/v1/chat/completions',
                                model,
                                provider: 'cache',
                                status: 'success',
                                promptTokens: 0,
                                completionTokens: 0,
                                totalTokens: 0,
                                costUsd: 0,
                                providerCostUsd: 0,
                                cencoriChargeUsd: 0,
                                markupPercentage: 0,
                                endUserId: endUserId || undefined,
                            });
                            void incrementUsage(gatewayCtx, 0);

                            const cachedResponse = NextResponse.json(cacheResult.response);
                            cachedResponse.headers.set('X-Cache', cacheResult.hitType === 'exact' ? 'HIT-EXACT' : 'HIT-SEMANTIC');
                            cachedResponse.headers.set('X-Cencori-Cache', cacheResult.hitType === 'exact' ? 'HIT' : 'SEMANTIC-HIT');
                            if (cacheResult.similarityScore) {
                                cachedResponse.headers.set('X-Cache-Similarity', String(cacheResult.similarityScore.toFixed(4)));
                            }
                            return respond(cachedResponse);
                        } else {
                            void logCacheEvent({
                                projectId: gatewayCtx.projectId,
                                entryId: null,
                                eventType: 'miss',
                                model,
                                requestId: gatewayCtx.requestId,
                                environment: gatewayCtx.environment,
                            });
                        }
                    }
                }
            } catch (error) {
                // Cache failures should never block requests
                console.error('[Cache] Intercept failed:', error);
            }
        }

        // Helper: store response in cache after successful non-streaming completion
        const maybeCacheResponse = (responseJson: unknown, tokens: number, costUsd: number) => {
            if (cacheConfig?.cacheEnabled && cacheKey && gatewayCtx && !shouldStream && promptTextForCache) {
                void Promise.resolve(storeInCache({
                    projectId: gatewayCtx.projectId,
                    cacheKey,
                    promptText: promptTextForCache,
                    model,
                    environment: gatewayCtx.environment,
                    temperature: body.temperature,
                    maxTokens: body.max_tokens,
                    response: responseJson,
                    embedding: cacheResult?.embedding ?? null,
                    ttlSeconds: cacheConfig.ttlSeconds,
                    estimatedTokens: tokens,
                    estimatedCostUsd: costUsd,
                })).then(() => {
                    void logCacheEvent({
                        projectId: gatewayCtx!.projectId,
                        entryId: null,
                        eventType: 'store',
                        model,
                        tokensSaved: tokens,
                        costSavedUsd: costUsd,
                        requestId: gatewayCtx!.requestId,
                        environment: gatewayCtx!.environment,
                    });
                });
            }
        };

        // Helper: log prompt usage after successful completion
        const maybeLogPromptUsage = () => {
            if (resolvedPrompt && gatewayCtx) {
                void logPromptUsage({
                    projectId: gatewayCtx.projectId,
                    promptId: resolvedPrompt.promptId,
                    versionId: resolvedPrompt.versionId,
                    model,
                    apiKeyId: gatewayCtx.apiKeyId ?? undefined,
                    requestId: gatewayCtx.requestId,
                    variablesUsed: body.prompt?.variables || null,
                    latencyMs: Date.now() - startedAt,
                });
            }
        };

        // ── Memory writeback (async — runs after the response flushes) ──
        const scheduleMemoryWriteback = (assistantText: string) => {
            if (memoryDirective?.write && memorySettings && assistantText) {
                const directive = memoryDirective;
                const settings = memorySettings;
                waitUntil(
                    runChatMemoryWriteback({
                        supabase: adminClient,
                        gatewayCtx: activeGatewayCtx,
                        directive,
                        settings,
                        userText: inputPipeline.inputText,
                        assistantText,
                    })
                );
            }
        };

        const execResult = await runV1ProviderExecution({
            supabase: adminClient,
            gatewayCtx: activeGatewayCtx,
            model,
            messages: guardedMessages,
            inputText: inputPipeline.inputText,
            inputSecurity: inputPipeline.inputSecurity,
            tokenMap: inputPipeline.tokenMap,
            temperature: body.temperature,
            maxTokens: body.max_tokens,
            frequencyPenalty: body.frequency_penalty ?? body.frequencyPenalty,
            presencePenalty: body.presence_penalty ?? body.presencePenalty,
            stream: shouldStream,
            tools: tools as Tool[] | undefined,
            toolChoice: tool_choice,
            endUserId,
            endUserQuota,
            recordEndUserUsage: maybeRecordEndUserUsage,
            onCompletion: ({ fullText }) => {
                scheduleMemoryWriteback(fullText);
            },
            logSuccess: makeChatLogSuccess({
                supabase: adminClient,
                gatewayCtx: activeGatewayCtx,
                endpoint: "/v1/chat/completions",
                requestModel: model,
                unifiedMessages: guardedMessages,
                isStreaming: shouldStream,
                endUserId,
                customRules: inputPipeline.customRules,
            }),
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

        if (!shouldStream) {
            const responseJson = await execResult.response.json();
            maybeCacheResponse(
                responseJson,
                Number((responseJson as { usage?: { total_tokens?: number } }).usage?.total_tokens ?? 0),
                0
            );
            maybeLogPromptUsage();

            // Attach the memory summary. `written` is always [] here —
            // extraction runs async after the response flushes; clients can
            // confirm via GET /v1/memory/list.
            if (memoryDirective) {
                (responseJson as Record<string, unknown>).memory = {
                    retrieved: retrievedMemories.map((m) => ({
                        id: m.id,
                        score: m.similarity,
                        content: m.content,
                    })),
                    written: [],
                    write_status: memoryDirective.write ? 'pending' : 'disabled',
                };
            }

            return respond(NextResponse.json(responseJson));
        }

        maybeLogPromptUsage();
        if (memoryDirective) {
            execResult.response.headers.set(
                'X-Cencori-Memory-Retrieved',
                String(retrievedMemories.length)
            );
            execResult.response.headers.set(
                'X-Cencori-Memory-Write',
                memoryDirective.write ? 'async' : 'disabled'
            );
        }
        return respond(execResult.response);

    } catch (error: unknown) {
        console.error("Gateway Error:", error);
        const message = error instanceof Error ? error.message : "Internal server error";
        return respondError(500, message, 'internal_error');
    }
}
