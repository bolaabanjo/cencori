/**
 * /api/ai/chat — legacy-shape adapter over the unified gateway engine.
 *
 * Every deployed SDK (JS, TanStack, Vercel provider, Python, PHP, Rust) and
 * the dashboard playground call this route and parse its wire format:
 * flat errors ({error: string, message?}), the Cencori response superset
 * (top-level content/provider/cost_usd/toolCalls + OpenAI choices), and
 * {delta: string} SSE chunks. That contract is preserved here byte-for-byte
 * while execution runs through the same engine as /v1/chat/completions
 * (runV1ProviderExecution with wireFormat: 'cencori').
 *
 * The engine provides: input/output guards, provider failover, server-side
 * max_tokens enforcement, payload-masked logging, RagMetrics, budget
 * alerts, credit idempotency, Redis spend counters — identical on both
 * doors, so features can never drift between them again.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { waitUntil } from '@vercel/functions';
import type { UnifiedMessage, Tool, UnifiedChatRequest } from '@/lib/providers/base';
import {
    validateGatewayRequest,
    handleCorsPreFlight,
    addGatewayHeaders,
    logGatewayRequest,
    incrementUsage,
    type GatewayContext,
} from '@/lib/gateway-middleware';
import { runGatewayInputPipeline } from '@/lib/gateway/input-guard';
import {
    hasImageInMessages,
    runVisionChat,
    toVisionGuardMessages,
} from '@/lib/gateway/chat-vision-router';
import { loadAgentKeyContext } from '@/lib/gateway/agent-context';
import { runV1ProviderExecution } from '@/lib/gateway/v1-execute';
import { makeChatLogSuccess } from '@/lib/gateway/chat-post-success';
import {
    parseCachedPayload,
    getCachedContent,
    getCachedUsage,
    buildCencoriChatResponse,
    validateCachedOutput,
} from '@/lib/gateway/ai-chat-support';
import { checkEndUserQuota, recordEndUserUsage, type QuotaCheckResult } from '@/lib/end-user-billing';
import {
    computeExactCacheKey,
    getProjectCacheConfig,
    lookupCache,
    storeInCache,
    recordCacheHit,
} from '@/lib/cache/prompt-cache';
import { getCachedCacheConfig, setCachedCacheConfig } from '@/lib/config-cache';
import type { CacheConfig, CacheLookupResult } from '@/lib/cache/types';
import { getGatewayFeatureFlags, mapProviderErrorToHttpResponse } from '@/lib/gateway-reliability';
import { resolvePrompt, logPromptUsage } from '@/lib/prompts/registry';
import type { ResolvedPrompt } from '@/lib/prompts/types';
import type { SubscriptionTier } from '@/lib/entitlements';
import { extractCencoriApiKeyFromHeaders } from '@/lib/api-keys';
import {
    buildMemorySystemBlock,
    getProjectMemorySettings,
    parseMemoryDirective,
    retrieveMemories,
    runChatMemoryWriteback,
    type MemoryDirective,
    type MemorySettings,
    type RetrievedMemory,
} from '@/lib/memory';

const ROUTE = '/api/ai/chat';

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function POST(req: NextRequest) {
    const startTime = Date.now();
    const supabase = createAdminClient();
    const reliabilityFlags = getGatewayFeatureFlags();

    const wrap = (response: NextResponse, ctx?: GatewayContext) =>
        ctx ? addGatewayHeaders(response, { requestId: ctx.requestId }) : response;

    try {
        const validation = await validateGatewayRequest(req);
        if (!validation.success) {
            return validation.response;
        }

        const ctx = validation.context;

        // ── Agent key handling (legacy contract: strict) ──
        let agentConfigModel: string | null = null;
        const rawApiKey = extractCencoriApiKeyFromHeaders(req.headers);
        const { data: keyMeta } = await supabase
            .from('api_keys')
            .select('agent_id, key_type')
            .eq('id', ctx.apiKeyId)
            .single();

        if (
            (keyMeta?.key_type === 'agent' || rawApiKey?.startsWith('cake_'))
            && !keyMeta?.agent_id
        ) {
            return wrap(
                NextResponse.json(
                    { error: 'Invalid Agent Key: No agent associated with this key' },
                    { status: 401 }
                ),
                ctx
            );
        }

        try {
            const agentCtx = await loadAgentKeyContext(supabase, ctx.apiKeyId);
            agentConfigModel = agentCtx.agentConfigModel;
        } catch (error) {
            if (error instanceof Error && error.message === 'AGENT_DISABLED') {
                return wrap(
                    NextResponse.json(
                        { error: 'Agent is disabled', message: 'This agent has been deactivated.' },
                        { status: 403 }
                    ),
                    ctx
                );
            }
            throw error;
        }

        // ── Body parse + legacy alias normalization ──
        const body = await req.json();
        const rawMessages = body.messages;
        const model: string | undefined = body.model;
        const temperature: number | undefined =
            typeof body.temperature === 'number' ? body.temperature : undefined;
        const maxTokens: number | undefined =
            typeof body.maxTokens === 'number'
                ? body.maxTokens
                : typeof body.max_tokens === 'number'
                  ? body.max_tokens
                  : undefined;
        const isStreaming = body.stream === true;
        const endUserId: string | null =
            (typeof body.userId === 'string' && body.userId.trim())
            || (typeof body.user === 'string' && body.user.trim())
            || null;
        const tools = body.tools as Tool[] | undefined;
        const toolChoice = (body.toolChoice ?? body.tool_choice) as UnifiedChatRequest['toolChoice'];
        const frequencyPenalty: number | undefined =
            typeof body.frequencyPenalty === 'number'
                ? body.frequencyPenalty
                : typeof body.frequency_penalty === 'number'
                  ? body.frequency_penalty
                  : undefined;
        const presencePenalty: number | undefined =
            typeof body.presencePenalty === 'number'
                ? body.presencePenalty
                : typeof body.presence_penalty === 'number'
                  ? body.presence_penalty
                  : undefined;

        if (!rawMessages || !Array.isArray(rawMessages)) {
            return wrap(
                NextResponse.json(
                    { error: 'Invalid request: messages array is required' },
                    { status: 400 }
                ),
                ctx
            );
        }

        let messages = rawMessages as Array<{ role: string; content: unknown }>;
        const isVisionRequest = hasImageInMessages(messages);
        if (isVisionRequest && tools && tools.length > 0) {
            return wrap(
                NextResponse.json(
                    {
                        error: 'vision_tools_unsupported',
                        message: 'Tool calling is not supported for image chat requests.',
                    },
                    { status: 400 }
                ),
                ctx
            );
        }

        // ── End-user billing quota (legacy flat shapes) ──
        let endUserQuota: QuotaCheckResult | null = null;
        if (ctx.endUserBillingEnabled && endUserId) {
            try {
                endUserQuota = await checkEndUserQuota(ctx.projectId, endUserId, model, ctx.environment);

                const modelNotAllowed =
                    endUserQuota.reason?.startsWith('model_not_allowed:')
                    || Boolean(
                        endUserQuota.allowedModels
                        && model
                        && model !== 'auto'
                        && model !== 'cencori/auto'
                        && !endUserQuota.allowedModels.includes(model)
                    );

                if (modelNotAllowed) {
                    return wrap(
                        NextResponse.json(
                            {
                                error: 'Model not allowed',
                                message: `Model '${model}' is not available on the '${endUserQuota.ratePlan}' plan.`,
                                allowed_models: endUserQuota.allowedModels,
                            },
                            { status: 403 }
                        ),
                        ctx
                    );
                }

                if (!endUserQuota.allowed) {
                    const retryAfterHeaders =
                        endUserQuota.retryAfterSeconds != null
                            ? { 'Retry-After': String(endUserQuota.retryAfterSeconds) }
                            : undefined;
                    return wrap(
                        NextResponse.json(
                            {
                                error: 'End-user quota exceeded',
                                message: endUserQuota.reason || 'Usage limit reached for this user.',
                                quota: {
                                    daily_tokens: {
                                        used: endUserQuota.dailyTokensUsed,
                                        limit: endUserQuota.dailyTokensLimit,
                                    },
                                    monthly_tokens: {
                                        used: endUserQuota.monthlyTokensUsed,
                                        limit: endUserQuota.monthlyTokensLimit,
                                    },
                                },
                                rate_plan: endUserQuota.ratePlan,
                                retry_after_seconds: endUserQuota.retryAfterSeconds,
                            },
                            { status: 429, headers: retryAfterHeaders }
                        ),
                        ctx
                    );
                }
            } catch (err) {
                console.error('[EndUserBilling] Quota check failed:', err);
                return wrap(
                    NextResponse.json(
                        {
                            error: 'End-user quota unavailable',
                            message: 'Usage limits could not be verified. Retry shortly.',
                        },
                        { status: 503 }
                    ),
                    ctx
                );
            }
        }

        const maybeRecordEndUserUsage = (usageAndCost: {
            promptTokens: number;
            completionTokens: number;
            totalTokens: number;
            providerCostUsd: number;
            cencoriChargeUsd: number;
            markupPercentage: number;
        }) => {
            if (ctx.endUserBillingEnabled && endUserId && endUserQuota) {
                recordEndUserUsage({
                    projectId: ctx.projectId,
                    externalUserId: endUserId,
                    environment: ctx.environment,
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

        // ── Prompt registry (legacy flat 404) ──
        let resolvedPromptData: ResolvedPrompt | null = null;
        const promptRef = body.prompt?.name || req.headers.get('X-Cencori-Prompt');
        if (promptRef) {
            const varsHeader = req.headers.get('X-Cencori-Prompt-Vars');
            const variables =
                body.prompt?.variables || (varsHeader ? JSON.parse(varsHeader) : undefined);
            resolvedPromptData = await resolvePrompt(ctx.projectId, promptRef, variables);
            if (!resolvedPromptData) {
                return wrap(
                    NextResponse.json(
                        { error: `Prompt "${promptRef}" not found or has no active version` },
                        { status: 404 }
                    ),
                    ctx
                );
            }
            messages = messages.filter((m) => m.role !== 'system');
            messages = [{ role: 'system', content: resolvedPromptData.content }, ...messages];
        }
        const visionSourceMessages = isVisionRequest ? [...messages] : null;

        let unifiedMessages: UnifiedMessage[] = isVisionRequest
            ? toVisionGuardMessages(messages)
            : messages.map((msg) => ({
                  role: msg.role as UnifiedMessage['role'],
                  content: typeof msg.content === 'string'
                      ? msg.content
                      : JSON.stringify(msg.content ?? ''),
              }));

        // ── Memory (API opt-in — same engine feature as /v1) ──
        let memoryDirective: MemoryDirective | null = null;
        let memorySettings: MemorySettings | null = null;
        if (body.memory !== undefined) {
            memorySettings = await getProjectMemorySettings(supabase, ctx.projectId);
            if (!memorySettings.enabled) {
                return wrap(
                    NextResponse.json(
                        { error: 'memory_disabled', message: 'Memory is disabled for this project.' },
                        { status: 403 }
                    ),
                    ctx
                );
            }
            const parsedDirective = parseMemoryDirective(body.memory);
            if (!parsedDirective.ok) {
                return wrap(NextResponse.json({ error: parsedDirective.error }, { status: 400 }), ctx);
            }
            memoryDirective = parsedDirective.directive;
        }

        const lastUserMessageText =
            [...unifiedMessages].reverse().find((m) => m.role === 'user')?.content ?? '';
        const memoryPromise: Promise<RetrievedMemory[]> =
            memoryDirective?.retrieve
                  ? retrieveMemories({
                      supabase,
                      organizationId: ctx.organizationId,
                      projectId: ctx.projectId,
                      directive: memoryDirective,
                      queryText: lastUserMessageText,
                      onEmbeddingUsage: usage => {
                          waitUntil(Promise.all([
                              logGatewayRequest(ctx, {
                                  endpoint: 'memory/search',
                                  model: usage.model,
                                  provider: usage.provider,
                                  status: 'success',
                                  promptTokens: usage.totalTokens,
                                  completionTokens: 0,
                                  totalTokens: usage.totalTokens,
                                  costUsd: usage.cencoriChargeUsd,
                                  providerCostUsd: usage.providerCostUsd,
                                  cencoriChargeUsd: usage.cencoriChargeUsd,
                                  markupPercentage: usage.markupPercentage,
                                  metadata: { source: 'chat_memory_retrieval' },
                              }),
                              incrementUsage(ctx, usage.cencoriChargeUsd),
                          ]).then(() => undefined));
                      },
                  })
                : Promise.resolve([]);

        // ── Input security pipeline (shared) → legacy flat errors ──
        const tier = (ctx.tier || 'free') as SubscriptionTier;
        const inputPipeline = await runGatewayInputPipeline({
            supabase,
            projectId: ctx.projectId,
            apiKeyId: ctx.apiKeyId,
            environment: ctx.environment,
            tier,
            messages: unifiedMessages,
            endUserId,
            // Policy-as-code enforcement (PRD M1.2)
            organizationId: ctx.organizationId,
            model,
            region: ctx.countryCode,
        });

        if (!inputPipeline.ok) {
            return wrap(
                NextResponse.json(
                    {
                        error: inputPipeline.message,
                        ...(inputPipeline.assistantMessage
                            ? { message: inputPipeline.assistantMessage }
                            : {}),
                        ...(inputPipeline.reasons ? { reasons: inputPipeline.reasons } : {}),
                        ...(inputPipeline.matched_rules
                            ? { matched_rules: inputPipeline.matched_rules }
                            : {}),
                    },
                    { status: inputPipeline.status }
                ),
                ctx
            );
        }

        unifiedMessages = inputPipeline.messages;

        // Memory injection after the guard (stored facts are pre-redacted).
        const retrievedMemories = await memoryPromise;
        if (retrievedMemories.length > 0) {
            const memoryMessage: UnifiedMessage = {
                role: 'system',
                content: buildMemorySystemBlock(retrievedMemories),
            };
            let insertAt = 0;
            while (insertAt < unifiedMessages.length && unifiedMessages[insertAt].role === 'system') {
                insertAt++;
            }
            unifiedMessages.splice(insertAt, 0, memoryMessage);
        }

        // ── Model resolution (legacy chain, incl. hardcoded fallback) ──
        const resolvedModel = model === 'auto' || model === 'cencori/auto' ? null : model;
        let requestedModel =
            resolvedModel || agentConfigModel || ctx.defaultModel || 'gemini-2.5-flash';
        // Policy `route` directive (PRD M1): override the model per governance
        // policy — either a specific model, or the equivalent on a target provider.
        if (inputPipeline.route?.model) {
            requestedModel = inputPipeline.route.model;
        } else if (inputPipeline.route?.provider) {
            const { getFallbackModel } = await import('@/lib/providers/failover');
            requestedModel = await getFallbackModel(requestedModel, inputPipeline.route.provider);
        }

        // ── Prompt cache (skip both directions when memory retrieval active) ──
        const cacheEligible =
            !isVisionRequest
            &&
            !isStreaming
            && (!Array.isArray(tools) || tools.length === 0)
            && !memoryDirective?.retrieve;
        const skipCache = req.headers.get('x-skip-cache')?.toLowerCase() === 'true';

        let cacheConfig: CacheConfig | null = null;
        let cacheResult: CacheLookupResult | null = null;
        let exactCacheKey: string | null = null;
        let cachePromptText: string | null = null;
        let cacheWriteEligible = false;

        if (cacheEligible && !skipCache) {
            try {
                const cachedConfigRow = await getCachedCacheConfig(ctx.projectId);
                const loadedConfig =
                    cachedConfigRow?.data || (await getProjectCacheConfig(ctx.projectId));
                if (!loadedConfig) {
                    throw new Error('Cache config unavailable');
                }
                cacheConfig = loadedConfig;
                if (!cachedConfigRow) {
                    await setCachedCacheConfig(ctx.projectId, cacheConfig);
                }

                const effectiveCacheConfig: CacheConfig = {
                    ...loadedConfig,
                    semanticMatchEnabled:
                        loadedConfig.semanticMatchEnabled && reliabilityFlags.semanticCacheEnabled,
                };

                const requestTemp = temperature ?? 0;
                const modelExcluded = effectiveCacheConfig.excludedModels.includes(requestedModel);
                cacheWriteEligible = Boolean(
                    effectiveCacheConfig.cacheEnabled
                    && !modelExcluded
                    && requestTemp <= effectiveCacheConfig.maxCacheableTemperature
                    && (effectiveCacheConfig.exactMatchEnabled
                        || effectiveCacheConfig.semanticMatchEnabled)
                );

                if (cacheWriteEligible) {
                    const normalizedCacheMessages = unifiedMessages.map((m) => ({
                        role: m.role,
                        content: m.content,
                    }));
                    exactCacheKey = computeExactCacheKey({
                        projectId: ctx.projectId,
                        environment: ctx.environment,
                        model: requestedModel,
                        temperature: requestTemp,
                        maxTokens,
                        messages: normalizedCacheMessages,
                    });
                    cachePromptText = normalizedCacheMessages
                        .map((m) => `${m.role}: ${m.content}`)
                        .join('\n');

                    cacheResult = await lookupCache({
                        projectId: ctx.projectId,
                        environment: ctx.environment,
                        cacheKey: exactCacheKey,
                        promptText: cachePromptText,
                        model: requestedModel,
                        maxTokens,
                        config: effectiveCacheConfig,
                    });

                    if (cacheResult.hit && cacheResult.response && cacheResult.hitType) {
                        const cachedPayload = parseCachedPayload(cacheResult.response);
                        if (cachedPayload) {
                            const cachedContent = getCachedContent(cachedPayload);
                            const finalCachedContent = validateCachedOutput({
                                cachedContent,
                                tokenMap: inputPipeline.tokenMap,
                                inputText: inputPipeline.inputText,
                                inputSecurity: inputPipeline.inputSecurity,
                                conversationHistory: unifiedMessages,
                            });

                            if (finalCachedContent) {
                                const cachedUsage = getCachedUsage(cachedPayload);
                                const cacheType = cacheResult.hitType;

                                if (cacheResult.entryId) {
                                    void recordCacheHit(
                                        cacheResult.entryId,
                                        cacheResult.estimatedTokens || cachedUsage.totalTokens,
                                        cacheResult.estimatedCostUsd || 0
                                    );
                                }

                                const responseBody = buildCencoriChatResponse({
                                    content: finalCachedContent,
                                    actualModel:
                                        typeof cachedPayload.model === 'string'
                                            ? cachedPayload.model
                                            : requestedModel,
                                    actualProvider:
                                        typeof cachedPayload.provider === 'string'
                                            ? cachedPayload.provider
                                            : 'cache',
                                    usage: cachedUsage,
                                    costUsd: 0,
                                    finishReason:
                                        typeof cachedPayload.finish_reason === 'string'
                                            ? cachedPayload.finish_reason
                                            : 'stop',
                                    cacheHit: { type: cacheType },
                                });

                                // Unified logging path (replaces inline insert)
                                void logGatewayRequest(ctx, {
                                    endpoint: ROUTE,
                                    model: requestedModel,
                                    provider:
                                        typeof cachedPayload.provider === 'string'
                                            ? cachedPayload.provider
                                            : 'cache',
                                    status: 'success',
                                    promptTokens: cachedUsage.promptTokens,
                                    completionTokens: cachedUsage.completionTokens,
                                    totalTokens: cachedUsage.totalTokens,
                                    costUsd: 0,
                                    providerCostUsd: 0,
                                    cencoriChargeUsd: 0,
                                    endUserId: endUserId || undefined,
                                    requestPayload: { messages, model, cache_hit: true },
                                    responsePayload: { content: finalCachedContent },
                                });
                                void incrementUsage(ctx, 0);

                                const cacheResponse = NextResponse.json(responseBody);
                                cacheResponse.headers.set(
                                    'X-Cencori-Cache',
                                    cacheType === 'semantic' ? 'SEMANTIC-HIT' : 'HIT'
                                );
                                cacheResponse.headers.set(
                                    'X-Cache',
                                    cacheType === 'semantic' ? 'HIT-SEMANTIC' : 'HIT-EXACT'
                                );
                                return wrap(cacheResponse, ctx);
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('[Cache] Lookup failed:', error);
            }
        }

        // ── Memory writeback scheduling ──
        const scheduleMemoryWriteback = (assistantText: string) => {
            if (memoryDirective?.write && memorySettings && assistantText) {
                const directive = memoryDirective;
                const settings = memorySettings;
                waitUntil(
                    runChatMemoryWriteback({
                        supabase,
                        gatewayCtx: ctx,
                        directive,
                        settings,
                        userText: inputPipeline.inputText,
                        assistantText,
                    })
                );
            }
        };

        if (isVisionRequest && visionSourceMessages) {
            const guardedPrompt = unifiedMessages
                .map((message) => `${message.role}: ${message.content}`)
                .join('\n');
            try {
                const response = await runVisionChat({
                    ctx,
                    rawMessages: visionSourceMessages,
                    requestedModel,
                    maxTokens,
                    temperature,
                    stream: isStreaming,
                    guardedPrompt,
                    inputText: inputPipeline.inputText,
                    inputSecurity: inputPipeline.inputSecurity,
                    conversationHistory: unifiedMessages,
                    tokenMap: inputPipeline.tokenMap,
                    endUserId,
                    wireFormat: 'cencori',
                    recordEndUserUsage: maybeRecordEndUserUsage,
                    onCompletion: (assistantText) => {
                        scheduleMemoryWriteback(assistantText);
                        if (resolvedPromptData) {
                            void logPromptUsage({
                                projectId: ctx.projectId,
                                promptId: resolvedPromptData.promptId,
                                versionId: resolvedPromptData.versionId,
                                model: requestedModel,
                                apiKeyId: ctx.apiKeyId ?? undefined,
                                requestId: ctx.requestId,
                                variablesUsed: body.prompt?.variables || null,
                                latencyMs: Date.now() - startTime,
                            });
                        }
                    },
                });
                if (memoryDirective) {
                    response.headers.set(
                        'X-Cencori-Memory-Retrieved',
                        String(retrievedMemories.length)
                    );
                }
                return wrap(response as NextResponse, ctx);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'vision_route_failed';
                return wrap(NextResponse.json({ error: message }, { status: 400 }), ctx);
            }
        }

        // ── Unified engine, legacy wire format ──
        const execResult = await runV1ProviderExecution({
            supabase,
            gatewayCtx: ctx,
            model: requestedModel,
            messages: unifiedMessages,
            inputText: inputPipeline.inputText,
            inputSecurity: inputPipeline.inputSecurity,
            tokenMap: inputPipeline.tokenMap,
            temperature,
            maxTokens,
            frequencyPenalty,
            presencePenalty,
            stream: isStreaming,
            tools,
            toolChoice,
            wireFormat: 'cencori',
            enforceMaxTokens: true,
            endUserId,
            endUserQuota,
            recordEndUserUsage: maybeRecordEndUserUsage,
            onCompletion: ({ fullText }) => {
                scheduleMemoryWriteback(fullText);
            },
            logSuccess: makeChatLogSuccess({
                supabase,
                gatewayCtx: ctx,
                endpoint: ROUTE,
                requestModel: requestedModel,
                unifiedMessages,
                isStreaming,
                endUserId,
                customRules: inputPipeline.customRules,
            }),
            incrementUsage: (chargeUsd) => {
                void incrementUsage(ctx, chargeUsd);
            },
        });

        if (!execResult.ok) {
            // Map the engine's nested OpenAI error bodies to legacy flat shapes.
            const nested = execResult.body.error as
                | { message?: string; code?: string }
                | undefined;
            const reasons = execResult.body.reasons as string[] | undefined;

            if (nested?.code === 'output_security_violation' || reasons) {
                return wrap(
                    NextResponse.json(
                        {
                            error: 'Security violation detected',
                            message: 'Response blocked as it contains sensitive data.',
                            ...(reasons ? { reasons } : {}),
                        },
                        { status: execResult.status }
                    ),
                    ctx
                );
            }

            const flatBody: Record<string, unknown> = {
                error: nested?.code || 'provider_error',
                message: nested?.message || 'Provider request failed',
            };
            if (execResult.body.retry_after != null) {
                flatBody.retry_after = execResult.body.retry_after;
            }
            return wrap(NextResponse.json(flatBody, { status: execResult.status }), ctx);
        }

        // ── Streaming: engine already emits legacy chunks ──
        if (isStreaming) {
            if (memoryDirective) {
                execResult.response.headers.set(
                    'X-Cencori-Memory-Retrieved',
                    String(retrievedMemories.length)
                );
            }
            return wrap(execResult.response, ctx);
        }

        // ── Non-streaming: legacy superset JSON from the engine ──
        const responseBody = (await execResult.response.json()) as Record<string, unknown>;

        if (cacheWriteEligible && exactCacheKey && cachePromptText && cacheConfig) {
            void storeInCache({
                projectId: ctx.projectId,
                environment: ctx.environment,
                cacheKey: exactCacheKey,
                promptText: cachePromptText,
                model: typeof responseBody.model === 'string' ? responseBody.model : requestedModel,
                temperature,
                maxTokens,
                response: responseBody,
                embedding: cacheResult?.embedding ?? null,
                ttlSeconds: cacheConfig.ttlSeconds,
                estimatedTokens:
                    (responseBody.usage as { total_tokens?: number } | undefined)?.total_tokens ?? 0,
                estimatedCostUsd: Number(responseBody.cost_usd ?? 0),
            }).catch((err) => console.error('[Cache] Store failed:', err));
        }

        if (resolvedPromptData) {
            void logPromptUsage({
                projectId: ctx.projectId,
                promptId: resolvedPromptData.promptId,
                versionId: resolvedPromptData.versionId,
                model: typeof responseBody.model === 'string' ? responseBody.model : requestedModel,
                apiKeyId: ctx.apiKeyId ?? undefined,
                requestId: ctx.requestId,
                variablesUsed: body.prompt?.variables || null,
                latencyMs: Date.now() - startTime,
            });
        }

        if (memoryDirective) {
            responseBody.memory = {
                retrieved: retrievedMemories.map((m) => ({
                    id: m.id,
                    score: m.similarity,
                    content: m.content,
                })),
                written: [],
                write_status: memoryDirective.write ? 'pending' : 'disabled',
            };
        }

        const finalResponse = NextResponse.json(responseBody);
        if (cacheWriteEligible) {
            finalResponse.headers.set('X-Cencori-Cache', 'MISS');
            finalResponse.headers.set('X-Cache', 'MISS');
        }
        return wrap(finalResponse, ctx);
    } catch (error: unknown) {
        console.error('[API] Error:', error);
        const providerFailure = mapProviderErrorToHttpResponse(error);
        return NextResponse.json(
            {
                error: providerFailure.error,
                message: providerFailure.message,
            },
            { status: providerFailure.status }
        );
    }
}
