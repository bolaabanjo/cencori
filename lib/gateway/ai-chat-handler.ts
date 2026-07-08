import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabaseAdmin';
import type { UnifiedMessage, Tool, UnifiedChatRequest } from '@/lib/providers/base';
import {
    validateGatewayRequest,
    handleCorsPreFlight,
    addGatewayHeaders,
    type GatewayContext,
} from '@/lib/gateway-middleware';
import { runGatewayInputPipeline } from '@/lib/gateway/input-guard';
import { hasImageInMessages, runVisionChat } from '@/lib/gateway/chat-vision-router';
import { runGatewayOutputGuard } from '@/lib/gateway/output-guard';
import { executeGatewayChat, streamGatewayChat } from '@/lib/gateway/chat-executor';
import { resolveGatewayProvider } from '@/lib/gateway/providers-setup';
import { loadAgentKeyContext } from '@/lib/gateway/agent-context';
import {
    incrementMonthlyUsage,
    chargeUsageCredits,
    parseCachedPayload,
    getCachedContent,
    getCachedUsage,
    buildCencoriChatResponse,
    validateCachedOutput,
} from '@/lib/gateway/ai-chat-support';
import { processCustomRules, applyMask, applyRedact, applyTokenize, deTokenize } from '@/lib/safety/custom-data-rules';
import { checkEndUserQuota, recordEndUserUsage, type QuotaCheckResult } from '@/lib/end-user-billing';
import { checkAndSendBudgetAlerts } from '@/lib/budgets';
import {
    computeExactCacheKey,
    getProjectCacheConfig,
    lookupCache,
    storeInCache,
    recordCacheHit,
    logCacheEvent,
} from '@/lib/cache/prompt-cache';
import { getCachedCacheConfig, setCachedCacheConfig } from '@/lib/config-cache';
import type { CacheConfig, CacheLookupResult } from '@/lib/cache/types';
import {
    getGatewayFeatureFlags,
    incrementGatewayCounter,
    logGatewayEvent,
    mapProviderErrorToHttpResponse,
} from '@/lib/gateway-reliability';
import { resolvePrompt, logPromptUsage } from '@/lib/prompts/registry';
import type { ResolvedPrompt } from '@/lib/prompts/types';
import { evaluateWithRagMetrics, extractRAGContext } from '@/lib/integrations/ragmetrics';
import { estimateTokenCount } from '@/lib/providers/utils';
import type { SubscriptionTier } from '@/lib/entitlements';
import { extractCencoriApiKeyFromHeaders } from '@/lib/api-keys';

const ROUTE = '/api/ai/chat';

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function POST(req: NextRequest) {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const supabase = createAdminClient();
    const reliabilityFlags = getGatewayFeatureFlags();

    let rateLimitStatus: 'ok' | 'skipped' | 'failed_open' | 'failed_closed' =
        reliabilityFlags.rateLimitEnabled ? 'ok' : 'skipped';
    let semanticCacheReadStatus: 'hit' | 'miss' | 'error' | 'disabled' =
        reliabilityFlags.semanticCacheEnabled ? 'miss' : 'disabled';
    let semanticCacheWriteStatus: 'ok' | 'skipped' | 'error' | 'disabled' =
        reliabilityFlags.semanticCacheEnabled ? 'skipped' : 'disabled';

    const wrap = (response: NextResponse, ctx?: GatewayContext) =>
        ctx ? addGatewayHeaders(response, { requestId: ctx.requestId }) : response;

    try {
        const validation = await validateGatewayRequest(req);
        if (!validation.success) {
            return validation.response;
        }

        const ctx = validation.context;
        rateLimitStatus = ctx.rateLimit?.status ?? rateLimitStatus;

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
            if (agentCtx.agentName) {
                console.log('[Agent Identity] Request from:', agentCtx.agentName);
            }
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

        const body = await req.json();
        const {
            messages: rawMessages,
            model,
            temperature,
            maxTokens,
            max_tokens,
            stream,
            userId,
            tools,
            toolChoice,
            frequencyPenalty,
            presencePenalty,
        } = body;

        if (!rawMessages || !Array.isArray(rawMessages)) {
            return wrap(
                NextResponse.json(
                    { error: 'Invalid request: messages array is required' },
                    { status: 400 }
                ),
                ctx
            );
        }

        let messages = rawMessages as Array<{ role: string; content: string }>;

        // ── Vision auto-route ──────────────────────────────
        // Standard chat pipeline stringifies content, so multi-part messages
        // with images can't reach the provider intact. When we detect image
        // content, route through the Vision analyzer instead — this also
        // auto-upgrades non-vision-capable models (e.g. claude-3-5-haiku →
        // claude-3-5-sonnet-latest) so callers don't have to think about it.
        if (hasImageInMessages(rawMessages as Array<{ role: string; content: unknown }>)) {
            try {
                return await runVisionChat({
                    ctx,
                    rawMessages: rawMessages as Array<{ role: string; content: unknown }>,
                    requestedModel: model,
                    maxTokens: typeof maxTokens === 'number' ? maxTokens : (typeof max_tokens === 'number' ? max_tokens : undefined),
                    temperature: typeof temperature === 'number' ? temperature : undefined,
                    stream: stream === true,
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : 'vision_route_failed';
                return wrap(
                    NextResponse.json({ error: message }, { status: 400 }),
                    ctx
                );
            }
        }

        const { data: orgRow } = await supabase
            .from('organizations')
            .select('monthly_requests_used')
            .eq('id', ctx.organizationId)
            .single();
        const currentUsage = orgRow?.monthly_requests_used ?? 0;

        let endUserQuota: QuotaCheckResult | null = null;
        if (ctx.endUserBillingEnabled && userId) {
            try {
                endUserQuota = await checkEndUserQuota(
                    ctx.projectId,
                    userId,
                    model,
                    ctx.environment
                );

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
                console.error('[EndUserBilling] Quota check failed, allowing request:', err);
            }
        }

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

        let unifiedMessages: UnifiedMessage[] = messages.map((msg) => ({
            role: msg.role as UnifiedMessage['role'],
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? ''),
        }));

        const tier = (ctx.tier || 'free') as SubscriptionTier;
        const inputPipeline = await runGatewayInputPipeline({
            supabase,
            projectId: ctx.projectId,
            apiKeyId: ctx.apiKeyId,
            environment: ctx.environment,
            tier,
            messages: unifiedMessages,
            endUserId: userId ?? null,
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
        const inputText = inputPipeline.inputText;
        const inputSecurity = inputPipeline.inputSecurity;
        const customRulesResult = inputPipeline.customRules;
        const requestTokenMap = inputPipeline.tokenMap;

        const resolvedModel =
            model === 'auto' || model === 'cencori/auto' ? null : model;
        const requestedModel =
            resolvedModel || agentConfigModel || ctx.defaultModel || 'gemini-2.0-flash';

        const cacheEligible = stream !== true && (!Array.isArray(tools) || tools.length === 0);
        const skipCache = req.headers.get('x-skip-cache')?.toLowerCase() === 'true';
        const cacheMaxTokens =
            typeof maxTokens === 'number'
                ? maxTokens
                : typeof max_tokens === 'number'
                  ? max_tokens
                  : undefined;
        const cacheTemperature = typeof temperature === 'number' ? temperature : undefined;

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
                        loadedConfig.semanticMatchEnabled
                        && reliabilityFlags.semanticCacheEnabled,
                };

                if (!effectiveCacheConfig.semanticMatchEnabled) {
                    semanticCacheReadStatus = 'disabled';
                    semanticCacheWriteStatus = 'disabled';
                }

                const requestTemp = cacheTemperature ?? 0;
                const normalizedModel = requestedModel;
                const modelExcluded = effectiveCacheConfig.excludedModels.includes(normalizedModel);
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
                        model: normalizedModel,
                        temperature: requestTemp,
                        maxTokens: cacheMaxTokens,
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
                        model: normalizedModel,
                        maxTokens: cacheMaxTokens,
                        config: effectiveCacheConfig,
                    });

                    if (cacheResult.hitType === 'semantic') {
                        semanticCacheReadStatus = 'hit';
                    } else if (effectiveCacheConfig.semanticMatchEnabled) {
                        semanticCacheReadStatus = 'miss';
                    }

                    if (cacheResult.hit && cacheResult.response && cacheResult.hitType) {
                        const cachedPayload = parseCachedPayload(cacheResult.response);
                        if (cachedPayload) {
                            const cachedContent = getCachedContent(cachedPayload);
                            const finalCachedContent = validateCachedOutput({
                                cachedContent,
                                tokenMap: requestTokenMap,
                                inputText,
                                inputSecurity,
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
                                            : normalizedModel,
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

                                await supabase.from('ai_requests').insert({
                                    project_id: ctx.projectId,
                                    api_key_id: ctx.apiKeyId,
                                    environment: ctx.environment,
                                    provider:
                                        typeof cachedPayload.provider === 'string'
                                            ? cachedPayload.provider
                                            : 'cache',
                                    model: normalizedModel,
                                    prompt_tokens: cachedUsage.promptTokens,
                                    completion_tokens: cachedUsage.completionTokens,
                                    total_tokens: cachedUsage.totalTokens,
                                    cost_usd: 0,
                                    provider_cost_usd: 0,
                                    cencori_charge_usd: 0,
                                    latency_ms: Date.now() - startTime,
                                    status: 'success',
                                    end_user_id: userId,
                                    request_payload: { messages, model, cache_hit: true },
                                    response_payload: { content: finalCachedContent },
                                    ip_address: ctx.clientIp,
                                    country_code: ctx.countryCode,
                                });

                                await incrementMonthlyUsage(supabase, ctx.organizationId, currentUsage);

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
                semanticCacheReadStatus = 'error';
            }
        }

        const resolved = await resolveGatewayProvider({
            supabase,
            projectId: ctx.projectId,
            organizationId: ctx.organizationId,
            requestedModel,
        });

        const chatRequest: UnifiedChatRequest = {
            messages: unifiedMessages,
            model: resolved.model,
            temperature,
            maxTokens: maxTokens || max_tokens,
            stream: stream === true,
            userId,
            tools: tools as Tool[] | undefined,
            toolChoice: toolChoice as UnifiedChatRequest['toolChoice'],
            frequencyPenalty,
            presencePenalty,
        };

        if (stream === true) {
            const encoder = new TextEncoder();
            const streamBody = new ReadableStream({
                async start(controller) {
                    try {
                        let fullContent = '';
                        let streamProvider = resolved.providerName;
                        let streamModel = resolved.model;
                        let streamUsedFallback = false;
                        let tokenLimitReached = false;
                        const effectiveMaxTokens = maxTokens || max_tokens;

                        for await (const chunk of streamGatewayChat({
                            supabase,
                            projectId: ctx.projectId,
                            organizationId: ctx.organizationId,
                            tier,
                            request: chatRequest,
                            resolved,
                            requestId: ctx.requestId,
                        })) {
                            streamProvider = chunk.actualProvider;
                            streamModel = chunk.actualModel;
                            streamUsedFallback = chunk.usedFallback;
                            fullContent += chunk.delta;

                            // Server-side max_tokens enforcement
                            // Some providers/models don't respect the max_tokens parameter
                            if (effectiveMaxTokens && !tokenLimitReached && estimateTokenCount(fullContent) >= effectiveMaxTokens) {
                                tokenLimitReached = true;
                            }

                            const outputBlock = await runGatewayOutputGuard({
                                supabase,
                                projectId: ctx.projectId,
                                apiKeyId: ctx.apiKeyId,
                                environment: ctx.environment,
                                outputText: fullContent,
                                inputText,
                                inputSecurity,
                                conversationHistory: unifiedMessages,
                                endUserId: userId ?? null,
                            });

                            if (!outputBlock.ok) {
                                controller.enqueue(
                                    encoder.encode(
                                        `data: ${JSON.stringify({ error: outputBlock.message })}\n\n`
                                    )
                                );
                                controller.close();
                                return;
                            }

                            const delta = requestTokenMap
                                ? deTokenize(chunk.delta, requestTokenMap)
                                : chunk.delta;

                            if (tokenLimitReached) {
                                // Enqueue the delta that hit the limit, then finish with "length"
                                const limitData: Record<string, unknown> = {
                                    delta,
                                    finish_reason: "length",
                                };
                                controller.enqueue(
                                    encoder.encode(`data: ${JSON.stringify(limitData)}\n\n`)
                                );
                                // Jump to DB logging (same as normal finish block)
                                const promptTokens = await resolved.provider.countTokens(
                                    unifiedMessages.map((m) => m.content).join(' '),
                                    streamModel
                                );
                                const completionTokens = await resolved.provider.countTokens(
                                    fullContent,
                                    streamModel
                                );
                                const pricing = await resolved.provider.getPricing(streamModel);
                                const cost =
                                    (promptTokens / 1000) * pricing.inputPer1KTokens
                                    + (completionTokens / 1000) * pricing.outputPer1KTokens;
                                const charge = cost * (1 + pricing.cencoriMarkupPercentage / 100);

                                const { data: streamLogData } = await supabase
                                    .from('ai_requests')
                                    .insert({
                                        project_id: ctx.projectId,
                                        api_key_id: ctx.apiKeyId,
                                        environment: ctx.environment,
                                        provider: streamProvider,
                                        model: streamModel,
                                        prompt_tokens: promptTokens,
                                        completion_tokens: completionTokens,
                                        total_tokens: promptTokens + completionTokens,
                                        cost_usd: cost,
                                        provider_cost_usd: cost,
                                        cencori_charge_usd: charge,
                                        markup_percentage: pricing.cencoriMarkupPercentage,
                                        latency_ms: Date.now() - startTime,
                                        status: streamUsedFallback ? 'success_fallback' : 'success',
                                        end_user_id: userId,
                                        request_payload: { messages, model, stream: true },
                                        response_payload: { content: fullContent },
                                        ip_address: ctx.clientIp,
                                        country_code: ctx.countryCode,
                                    })
                                    .select('id')
                                    .single();

                                await chargeUsageCredits(
                                    supabase,
                                    ctx.organizationId,
                                    tier,
                                    charge,
                                    streamLogData?.id ?? null,
                                    ROUTE
                                );
                                await incrementMonthlyUsage(
                                    supabase,
                                    ctx.organizationId,
                                    currentUsage
                                );

                                if (ctx.endUserBillingEnabled && userId && endUserQuota) {
                                    recordEndUserUsage({
                                        projectId: ctx.projectId,
                                        externalUserId: userId,
                                        environment: ctx.environment,
                                        tokens: {
                                            prompt: promptTokens,
                                            completion: completionTokens,
                                            total: promptTokens + completionTokens,
                                        },
                                        cost: {
                                            providerUsd: cost,
                                            cencoriChargeUsd: charge,
                                        },
                                        customerMarkupPercentage: endUserQuota.markupPercentage,
                                        flatRatePerRequest: endUserQuota.flatRatePerRequest,
                                        currency: endUserQuota.currency,
                                        pricingModel: endUserQuota.pricingModel,
                                        pricingTiers: endUserQuota.pricingTiers,
                                        monthlyTokensUsed: endUserQuota.monthlyTokensUsed,
                                        platformCommissionPercentage:
                                            endUserQuota.platformCommissionPercentage,
                                    });
                                }

                                if (streamLogData?.id) {
                                    evaluateWithRagMetrics({
                                        projectId: ctx.projectId,
                                        requestId: streamLogData.id,
                                        prompt: unifiedMessages
                                            .map((m) => `${m.role}: ${m.content}`)
                                            .join('\n'),
                                        response: fullContent,
                                        context: extractRAGContext(unifiedMessages),
                                        metadata: {
                                            model: streamModel,
                                            provider: streamProvider,
                                            is_streaming: true,
                                        },
                                    }).catch((err) =>
                                        console.error('[RagMetrics] Evaluation failed:', err)
                                    );
                                }

                                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                                controller.close();
                                return;
                            }

                            const chunkData: Record<string, unknown> = {
                                delta,
                                finish_reason: chunk.finishReason,
                            };
                            if (streamUsedFallback && fullContent === chunk.delta) {
                                chunkData.fallback_used = true;
                                chunkData.original_provider = resolved.providerName;
                                chunkData.original_model = resolved.model;
                            }
                            if (chunk.toolCalls?.length) {
                                chunkData.tool_calls = chunk.toolCalls;
                            }
                            controller.enqueue(
                                encoder.encode(`data: ${JSON.stringify(chunkData)}\n\n`)
                            );

                            if (chunk.finishReason) {
                                const promptTokens = await resolved.provider.countTokens(
                                    unifiedMessages.map((m) => m.content).join(' '),
                                    streamModel
                                );
                                const completionTokens = await resolved.provider.countTokens(
                                    fullContent,
                                    streamModel
                                );
                                const pricing = await resolved.provider.getPricing(streamModel);
                                const cost =
                                    (promptTokens / 1000) * pricing.inputPer1KTokens
                                    + (completionTokens / 1000) * pricing.outputPer1KTokens;
                                const charge = cost * (1 + pricing.cencoriMarkupPercentage / 100);

                                const { data: streamLogData } = await supabase
                                    .from('ai_requests')
                                    .insert({
                                        project_id: ctx.projectId,
                                        api_key_id: ctx.apiKeyId,
                                        environment: ctx.environment,
                                        provider: streamProvider,
                                        model: streamModel,
                                        prompt_tokens: promptTokens,
                                        completion_tokens: completionTokens,
                                        total_tokens: promptTokens + completionTokens,
                                        cost_usd: cost,
                                        provider_cost_usd: cost,
                                        cencori_charge_usd: charge,
                                        markup_percentage: pricing.cencoriMarkupPercentage,
                                        latency_ms: Date.now() - startTime,
                                        status: streamUsedFallback ? 'success_fallback' : 'success',
                                        end_user_id: userId,
                                        request_payload: { messages, model, stream: true },
                                        response_payload: { content: fullContent },
                                        ip_address: ctx.clientIp,
                                        country_code: ctx.countryCode,
                                    })
                                    .select('id')
                                    .single();

                                await chargeUsageCredits(
                                    supabase,
                                    ctx.organizationId,
                                    tier,
                                    charge,
                                    streamLogData?.id ?? null,
                                    ROUTE
                                );
                                await incrementMonthlyUsage(
                                    supabase,
                                    ctx.organizationId,
                                    currentUsage
                                );

                                if (ctx.endUserBillingEnabled && userId && endUserQuota) {
                                    recordEndUserUsage({
                                        projectId: ctx.projectId,
                                        externalUserId: userId,
                                        environment: ctx.environment,
                                        tokens: {
                                            prompt: promptTokens,
                                            completion: completionTokens,
                                            total: promptTokens + completionTokens,
                                        },
                                        cost: {
                                            providerUsd: cost,
                                            cencoriChargeUsd: charge,
                                        },
                                        customerMarkupPercentage: endUserQuota.markupPercentage,
                                        flatRatePerRequest: endUserQuota.flatRatePerRequest,
                                        currency: endUserQuota.currency,
                                        pricingModel: endUserQuota.pricingModel,
                                        pricingTiers: endUserQuota.pricingTiers,
                                        monthlyTokensUsed: endUserQuota.monthlyTokensUsed,
                                        platformCommissionPercentage:
                                            endUserQuota.platformCommissionPercentage,
                                    });
                                }

                                if (streamLogData?.id) {
                                    evaluateWithRagMetrics({
                                        projectId: ctx.projectId,
                                        requestId: streamLogData.id,
                                        prompt: unifiedMessages
                                            .map((m) => `${m.role}: ${m.content}`)
                                            .join('\n'),
                                        response: fullContent,
                                        context: extractRAGContext(unifiedMessages),
                                        metadata: {
                                            model: streamModel,
                                            provider: streamProvider,
                                            is_streaming: true,
                                        },
                                    }).catch((err) =>
                                        console.error('[RagMetrics] Evaluation failed:', err)
                                    );
                                }

                                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                            }
                        }
                        controller.close();
                    } catch (error) {
                        controller.enqueue(
                            encoder.encode(
                                `data: ${JSON.stringify({
                                    error: error instanceof Error ? error.message : 'Stream error',
                                })}\n\n`
                            )
                        );
                        controller.close();
                    }
                },
            });

            return new Response(streamBody, {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    Connection: 'keep-alive',
                },
            });
        }

        let result;
        try {
            result = await executeGatewayChat({
                supabase,
                projectId: ctx.projectId,
                organizationId: ctx.organizationId,
                tier,
                request: chatRequest,
                resolved,
                requestId: ctx.requestId,
            });
        } catch (error) {
            const providerFailure = mapProviderErrorToHttpResponse(error, resolved.providerName);
            logGatewayEvent(
                'chat.response',
                {
                    requestId,
                    route: ROUTE,
                    provider: providerFailure.provider || resolved.providerName,
                    model: resolved.model,
                    response: { status: providerFailure.status },
                    error: providerFailure.error,
                },
                providerFailure.status >= 500 ? 'error' : 'warn'
            );
            return wrap(
                NextResponse.json(
                    {
                        error: providerFailure.error,
                        message: providerFailure.message,
                        ...(providerFailure.retryAfter
                            ? { retry_after: providerFailure.retryAfter }
                            : {}),
                    },
                    { status: providerFailure.status }
                ),
                ctx
            );
        }

        let content = result.content;
        if (requestTokenMap) {
            content = deTokenize(content, requestTokenMap);
        }

        // Server-side max_tokens enforcement for non-streaming
        const nonStreamMaxTokens = maxTokens || max_tokens;
        if (nonStreamMaxTokens && estimateTokenCount(content) > nonStreamMaxTokens) {
            content = content.slice(0, nonStreamMaxTokens * 4);
            result.content = content;
        }

        const outputBlock = await runGatewayOutputGuard({
            supabase,
            projectId: ctx.projectId,
            apiKeyId: ctx.apiKeyId,
            environment: ctx.environment,
            outputText: content,
            inputText,
            inputSecurity,
            conversationHistory: unifiedMessages,
            endUserId: userId ?? null,
        });

        if (!outputBlock.ok) {
            return wrap(
                NextResponse.json(
                    {
                        error: 'Security violation detected',
                        message: 'Response blocked as it contains sensitive data.',
                        reasons: outputBlock.reasons,
                    },
                    { status: outputBlock.status }
                ),
                ctx
            );
        }

        let loggedMessages = messages;
        let loggedResponse = result.content;
        if (customRulesResult.rules.length > 0) {
            const responseRulesResult = await processCustomRules(
                result.content,
                customRulesResult.rules
            );
            loggedResponse = responseRulesResult.content;
            if (customRulesResult.inputResult.wasProcessed) {
                loggedMessages = messages.map((msg) => ({
                    ...msg,
                    content: customRulesResult.inputResult.matchedRules.reduce(
                        (c, match) => {
                            if (match.rule.action === 'mask') return applyMask(c, match.snippets);
                            if (match.rule.action === 'redact') return applyRedact(c, match.snippets);
                            if (match.rule.action === 'tokenize') {
                                return applyTokenize(c, match.snippets, match.rule.name).text;
                            }
                            return c;
                        },
                        msg.content
                    ),
                }));
            }
        }

        const { data: logData, error: logError } = await supabase
            .from('ai_requests')
            .insert({
                project_id: ctx.projectId,
                api_key_id: ctx.apiKeyId,
                environment: ctx.environment,
                provider: result.actualProvider,
                model: result.actualModel,
                prompt_tokens: result.usage.promptTokens,
                completion_tokens: result.usage.completionTokens,
                total_tokens: result.usage.totalTokens,
                cost_usd: result.cost.providerCostUsd,
                provider_cost_usd: result.cost.providerCostUsd,
                cencori_charge_usd: result.cost.cencoriChargeUsd,
                markup_percentage: result.cost.markupPercentage,
                latency_ms: result.latencyMs,
                status: result.usedFallback ? 'success_fallback' : 'success',
                end_user_id: userId,
                request_payload: {
                    messages: loggedMessages,
                    model,
                    temperature,
                    maxTokens,
                    max_tokens,
                    stream,
                    original_provider: result.usedFallback ? result.originalProvider : undefined,
                    original_model: result.usedFallback ? result.originalModel : undefined,
                },
                response_payload: {
                    content: loggedResponse,
                    finishReason: result.finishReason,
                },
                ip_address: ctx.clientIp,
                country_code: ctx.countryCode,
            })
            .select('id')
            .single();

        if (logError) {
            console.error('[AI Chat] Failed to log request:', logError);
        } else {
            await chargeUsageCredits(
                supabase,
                ctx.organizationId,
                tier,
                result.cost.cencoriChargeUsd,
                logData?.id ?? null,
                ROUTE
            );
        }

        await incrementMonthlyUsage(supabase, ctx.organizationId, currentUsage);

        if (resolvedPromptData) {
            logPromptUsage({
                projectId: ctx.projectId,
                promptId: resolvedPromptData.promptId,
                versionId: resolvedPromptData.versionId,
                model: result.actualModel,
                apiKeyId: ctx.apiKeyId ?? undefined,
                requestId,
                variablesUsed: body.prompt?.variables || null,
                latencyMs: Date.now() - startTime,
            }).catch((err) => console.error('[Prompts] Usage logging failed:', err));
        }

        if (ctx.endUserBillingEnabled && userId && endUserQuota) {
            recordEndUserUsage({
                projectId: ctx.projectId,
                externalUserId: userId,
                environment: ctx.environment,
                tokens: {
                    prompt: result.usage.promptTokens,
                    completion: result.usage.completionTokens,
                    total: result.usage.totalTokens,
                },
                cost: {
                    providerUsd: result.cost.providerCostUsd,
                    cencoriChargeUsd: result.cost.cencoriChargeUsd,
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

        checkAndSendBudgetAlerts(ctx.projectId, ctx.projectId, ctx.organizationId).catch(
            (err) => console.error('[Budget] Alert check failed:', err)
        );

        if (logData?.id) {
            evaluateWithRagMetrics({
                projectId: ctx.projectId,
                requestId: logData.id,
                prompt: unifiedMessages.map((m) => `${m.role}: ${m.content}`).join('\n'),
                response: result.content,
                context: extractRAGContext(unifiedMessages),
                metadata: {
                    model: result.actualModel,
                    provider: result.actualProvider,
                    is_streaming: false,
                },
            }).catch((err) => console.error('[RagMetrics] Evaluation failed:', err));
        }

        const openAiToolCalls = result.toolCalls?.map((tc) => ({
            id: tc.id,
            type: tc.type,
            function: tc.function,
        }));

        const responseBody = buildCencoriChatResponse({
            content,
            actualModel: result.actualModel,
            actualProvider: result.actualProvider,
            usage: result.usage,
            costUsd: result.cost.cencoriChargeUsd,
            finishReason: result.finishReason,
            toolCalls: openAiToolCalls,
            usedFallback: result.usedFallback,
            originalModel: result.originalModel,
            originalProvider: result.originalProvider,
        });

        if (cacheWriteEligible && exactCacheKey && cachePromptText && cacheConfig) {
            void storeInCache({
                projectId: ctx.projectId,
                environment: ctx.environment,
                cacheKey: exactCacheKey,
                promptText: cachePromptText,
                model: resolved.model,
                temperature: cacheTemperature,
                maxTokens: cacheMaxTokens,
                response: responseBody,
                embedding: cacheResult?.embedding ?? null,
                ttlSeconds: cacheConfig.ttlSeconds,
                estimatedTokens: result.usage.totalTokens,
                estimatedCostUsd: result.cost.cencoriChargeUsd,
            }).catch((err) => console.error('[Cache] Store failed:', err));
        }

        incrementGatewayCounter('provider_request_success', {
            requestId,
            route: ROUTE,
            provider: result.actualProvider,
            model: result.actualModel,
        });
        logGatewayEvent('chat.response', {
            requestId,
            route: ROUTE,
            provider: result.actualProvider,
            model: result.actualModel,
            rateLimit: { status: rateLimitStatus },
            semanticCache: { read: semanticCacheReadStatus, write: semanticCacheWriteStatus },
            response: { status: 200 },
        });

        const finalResponse = NextResponse.json(responseBody);
        if (cacheWriteEligible) {
            finalResponse.headers.set('X-Cencori-Cache', 'MISS');
            finalResponse.headers.set('X-Cache', 'MISS');
        }
        return wrap(finalResponse, ctx);
    } catch (error: unknown) {
        console.error('[API] Error:', error);
        const providerFailure = mapProviderErrorToHttpResponse(error);
        logGatewayEvent(
            'chat.response',
            {
                requestId,
                route: ROUTE,
                rateLimit: { status: rateLimitStatus },
                semanticCache: { read: semanticCacheReadStatus, write: semanticCacheWriteStatus },
                response: { status: providerFailure.status },
                error: providerFailure.error,
            },
            providerFailure.status >= 500 ? 'error' : 'warn'
        );
        return NextResponse.json(
            {
                error: providerFailure.error,
                message: providerFailure.message,
            },
            { status: providerFailure.status }
        );
    }
}
