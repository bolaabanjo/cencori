import { NextResponse } from 'next/server';
import type { createAdminClient } from '@/lib/supabaseAdmin';
import type { GatewayContext } from '@/lib/gateway-middleware';
import type { QuotaCheckResult } from '@/lib/end-user-billing';
import {
    type UnifiedMessage,
    type Tool,
    type UnifiedChatRequest,
    type TokenUsage,
} from '@/lib/providers/base';
import type { SecurityCheckResult } from '@/lib/safety/multi-layer-check';
import { deTokenize } from '@/lib/safety/custom-data-rules';
import { executeGatewayChat, streamGatewayChat } from '@/lib/gateway/chat-executor';
import { resolveGatewayProvider } from '@/lib/gateway/providers-setup';
import { settleStreamUsage } from '@/lib/gateway/stream-usage';
import {
    STREAM_GUARD_EMIT_BATCH_CHARS,
    STREAM_GUARD_HOLDBACK_CHARS,
} from '@/lib/gateway/stream-guard';
import { runGatewayOutputGuard } from '@/lib/gateway/output-guard';
import { mapProviderErrorToHttpResponse } from '@/lib/gateway-reliability';
import { buildCencoriChatResponse } from '@/lib/gateway/ai-chat-support';
import { estimateTokenCount } from '@/lib/providers/utils';
import type { SubscriptionTier } from '@/lib/entitlements';
import type { ToolCallPayload } from '@/lib/gateway/v1-types';
import {
    calculateGatewayCharge,
    type GatewayBillingMode,
} from '@/lib/gateway/model-access';
import type {
    GatewayPerformanceMetrics,
    GatewayPerformanceTracker,
} from '@/lib/gateway/performance';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export type V1ExecuteParams = {
    supabase: SupabaseAdmin;
    gatewayCtx: GatewayContext;
    model: string;
    messages: UnifiedMessage[];
    inputText: string;
    inputSecurity: SecurityCheckResult;
    tokenMap?: Map<string, string>;
    temperature?: number;
    maxTokens?: number;
    stream: boolean;
    tools?: Tool[];
    toolChoice?: UnifiedChatRequest['toolChoice'];
    frequencyPenalty?: number;
    presencePenalty?: number;
    /**
     * Wire format of the HTTP response. 'openai' (default) emits strict
     * OpenAI chat.completion JSON / chunk SSE. 'cencori' emits the legacy
     * /api/ai/chat superset shape ({delta} string chunks, top-level
     * content/cost_usd/provider, both toolCalls spellings) that every
     * deployed SDK parses.
     */
    wireFormat?: 'openai' | 'cencori';
    /**
     * Server-side max_tokens enforcement: some providers ignore max_tokens,
     * so the stream is cut off with finish_reason "length" (and non-stream
     * content sliced) once the estimate crosses the limit.
     */
    enforceMaxTokens?: boolean;
    endUserId: string | null;
    endUserQuota: QuotaCheckResult | null;
    recordEndUserUsage: (usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        providerCostUsd: number;
        cencoriChargeUsd: number;
        markupPercentage: number;
    }) => void;
    logSuccess: (meta: {
        provider: string;
        model: string;
        status: 'success' | 'success_fallback' | 'error';
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        providerCostUsd: number;
        cencoriChargeUsd: number;
        markupPercentage: number;
        errorMessage?: string;
        /** Full (detokenized) assistant text — for payload logging + eval hooks */
        responseText?: string;
        finishReason?: string;
    }) => void;
    incrementUsage: (chargeUsd: number) => void;
    /**
     * Fires once with the full (detokenized) assistant text when a
     * completion finishes — non-streaming after the response is built,
     * streaming at finishReason. Used for post-response hooks like memory
     * fact extraction. Must not throw.
     */
    onCompletion?: (result: { fullText: string }) => void;
    /** Agent shadow mode (optional) */
    agentId?: string | null;
    shadowMode?: boolean;
    createPendingAction?: (toolCall: ToolCallPayload) => Promise<string | null>;
    createDispatchedAction?: (toolCall: ToolCallPayload) => void;
    performance?: GatewayPerformanceTracker;
    onPerformance?: (metrics: GatewayPerformanceMetrics) => void;
    hedgeDelayMs?: number;
};

function buildOpenAiCompletionJson(params: {
    model: string;
    content: string;
    toolCalls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
    usage: { promptTokens: number; completionTokens: number; totalTokens: number };
    finishReason?: string;
    fallbackMeta?: { usedFallback: boolean; originalProvider: string; originalModel: string };
}) {
    const finishReason =
        params.finishReason ||
        (params.toolCalls && params.toolCalls.length > 0 ? 'tool_calls' : 'stop');

    const body: Record<string, unknown> = {
        id: 'chatcmpl-' + Math.random().toString(36).slice(2, 11),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: params.model,
        choices: [
            {
                index: 0,
                message: {
                    role: 'assistant',
                    content: params.content,
                    ...(params.toolCalls && params.toolCalls.length > 0
                        ? { tool_calls: params.toolCalls }
                        : {}),
                },
                finish_reason: finishReason,
            },
        ],
        usage: {
            prompt_tokens: params.usage.promptTokens,
            completion_tokens: params.usage.completionTokens,
            total_tokens: params.usage.totalTokens,
        },
    };

    if (params.fallbackMeta?.usedFallback) {
        body.fallback_used = true;
        body.original_provider = params.fallbackMeta.originalProvider;
        body.original_model = params.fallbackMeta.originalModel;
    }

    return body;
}

function buildOpenAiStreamChunk(model: string, delta: Record<string, unknown>, finishReason: string | null) {
    return {
        id: 'chatcmpl-' + Math.random().toString(36).substr(2, 9),
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
            {
                index: 0,
                delta,
                finish_reason: finishReason,
            },
        ],
    };
}

export { STREAM_GUARD_EMIT_BATCH_CHARS, STREAM_GUARD_HOLDBACK_CHARS };

export type V1ExecuteResult =
    | { ok: true; response: NextResponse }
    | { ok: false; status: number; body: Record<string, unknown> };

function v1ProviderFailureResult(error: unknown, providerHint?: string, model?: string): V1ExecuteResult {
    const failure = mapProviderErrorToHttpResponse(error, providerHint, model);
    const body: Record<string, unknown> = {
        error: {
            message: failure.message,
            type: 'invalid_request_error',
            code: failure.error,
        },
    };
    if (failure.retryAfter != null) {
        body.retry_after = failure.retryAfter;
    }
    return { ok: false, status: failure.status, body };
}

/**
 * Run provider chat (with failover) and return OpenAI-compatible HTTP response.
 */
export async function runV1ProviderExecution(
    params: V1ExecuteParams
): Promise<V1ExecuteResult> {
    const tier = (params.gatewayCtx.tier || 'free') as SubscriptionTier;

    try {
        const resolved = await resolveGatewayProvider({
            supabase: params.supabase,
            projectId: params.gatewayCtx.projectId,
            organizationId: params.gatewayCtx.organizationId,
            requestedModel: params.model,
            allowedModels: params.gatewayCtx.allowedModels,
            sponsoredModels: params.gatewayCtx.sponsoredModels,
        });
        params.performance?.markPreflightComplete();

        const chatRequest: UnifiedChatRequest = {
            messages: params.messages,
            model: resolved.model,
            temperature: params.temperature,
            maxTokens: params.maxTokens,
            stream: params.stream,
            tools: params.tools,
            toolChoice: params.toolChoice,
            userId: params.endUserId || undefined,
            frequencyPenalty: params.frequencyPenalty,
            presencePenalty: params.presencePenalty,
            promptCacheKey: `cencori:${params.gatewayCtx.projectId}:${resolved.model}`,
        };

        if (params.tools && params.tools.length > 0 && resolved.provider.supportsTools === false) {
            return {
                ok: false,
                status: 400,
                body: {
                    error: {
                        message: `Tool calling is not implemented for provider '${resolved.providerName}'.`,
                        type: 'invalid_request_error',
                        code: 'tools_not_supported_by_provider',
                    },
                },
            };
        }

        if (!params.stream) {
            const result = await executeGatewayChat({
                supabase: params.supabase,
                projectId: params.gatewayCtx.projectId,
                organizationId: params.gatewayCtx.organizationId,
                allowedModels: params.gatewayCtx.allowedModels,
                sponsoredModels: params.gatewayCtx.sponsoredModels,
                tier,
                request: chatRequest,
                resolved,
                requestId: params.gatewayCtx.requestId,
                performance: params.performance,
            });

            let content = result.content;
            if (params.tokenMap) {
                content = deTokenize(content, params.tokenMap);
            }

            // Server-side max_tokens enforcement: some providers/models
            // ignore the parameter.
            if (params.enforceMaxTokens && params.maxTokens && estimateTokenCount(content) > params.maxTokens) {
                content = content.slice(0, params.maxTokens * 4);
            }

            const openAiToolCalls = result.toolCalls?.map((tc) => ({
                id: tc.id,
                type: tc.type,
                function: tc.function,
            }));
            const outputTextForGuard = [
                content,
                ...(openAiToolCalls ?? []).map((toolCall) => toolCall.function.arguments),
            ].filter(Boolean).join('\n');
            const outputBlock = await runGatewayOutputGuard({
                supabase: params.supabase,
                projectId: params.gatewayCtx.projectId,
                apiKeyId: params.gatewayCtx.apiKeyId,
                environment: params.gatewayCtx.environment,
                outputText: outputTextForGuard,
                inputText: params.inputText,
                inputSecurity: params.inputSecurity,
                conversationHistory: params.messages,
                endUserId: params.endUserId,
            });

            if (!outputBlock.ok) {
                const providerLogName = resolved.customProviderTag || result.actualProvider;
                params.logSuccess({
                    provider: providerLogName,
                    model: result.actualModel,
                    status: 'error',
                    promptTokens: result.usage.promptTokens,
                    completionTokens: result.usage.completionTokens,
                    totalTokens: result.usage.totalTokens,
                    providerCostUsd: result.cost.providerCostUsd,
                    cencoriChargeUsd: result.cost.cencoriChargeUsd,
                    markupPercentage: result.cost.markupPercentage,
                    errorMessage: outputBlock.message,
                    finishReason: result.finishReason,
                });
                params.incrementUsage(result.cost.cencoriChargeUsd);
                params.recordEndUserUsage({
                    promptTokens: result.usage.promptTokens,
                    completionTokens: result.usage.completionTokens,
                    totalTokens: result.usage.totalTokens,
                    providerCostUsd: result.cost.providerCostUsd,
                    cencoriChargeUsd: result.cost.cencoriChargeUsd,
                    markupPercentage: result.cost.markupPercentage,
                });
                return {
                    ok: false,
                    status: outputBlock.status,
                    body: {
                        error: {
                            message: outputBlock.message,
                            type: 'invalid_request_error',
                            code: outputBlock.code,
                        },
                        ...(outputBlock.reasons ? { reasons: outputBlock.reasons } : {}),
                    },
                };
            }

            if (params.agentId && openAiToolCalls && openAiToolCalls.length > 0) {
                if (params.shadowMode && params.createPendingAction) {
                    for (const tc of openAiToolCalls) {
                        await params.createPendingAction({
                            tool_call_id: tc.id,
                            tool: tc.function.name,
                            arguments: tc.function.arguments,
                        });
                    }
                } else if (params.createDispatchedAction) {
                    for (const tc of openAiToolCalls) {
                        params.createDispatchedAction({
                            tool_call_id: tc.id,
                            tool: tc.function.name,
                            arguments: tc.function.arguments,
                        });
                    }
                }
            }

            const providerLogName = resolved.customProviderTag || result.actualProvider;
            params.logSuccess({
                provider: providerLogName,
                model: result.actualModel,
                status: result.usedFallback ? 'success_fallback' : 'success',
                promptTokens: result.usage.promptTokens,
                completionTokens: result.usage.completionTokens,
                totalTokens: result.usage.totalTokens,
                providerCostUsd: result.cost.providerCostUsd,
                cencoriChargeUsd: result.cost.cencoriChargeUsd,
                markupPercentage: result.cost.markupPercentage,
                responseText: content,
                finishReason: result.finishReason,
            });
            params.incrementUsage(result.cost.cencoriChargeUsd);
            params.recordEndUserUsage({
                promptTokens: result.usage.promptTokens,
                completionTokens: result.usage.completionTokens,
                totalTokens: result.usage.totalTokens,
                providerCostUsd: result.cost.providerCostUsd,
                cencoriChargeUsd: result.cost.cencoriChargeUsd,
                markupPercentage: result.cost.markupPercentage,
            });

            const json = params.wireFormat === 'cencori'
                ? buildCencoriChatResponse({
                      content,
                      actualModel: result.actualModel,
                      actualProvider: providerLogName,
                      usage: result.usage,
                      costUsd: result.cost.cencoriChargeUsd,
                      finishReason: result.finishReason,
                      toolCalls: openAiToolCalls,
                      usedFallback: result.usedFallback,
                      originalModel: result.originalModel,
                      originalProvider: result.originalProvider,
                  })
                : buildOpenAiCompletionJson({
                      model: result.actualModel,
                      content,
                      toolCalls: openAiToolCalls,
                      usage: result.usage,
                      finishReason: result.finishReason,
                      fallbackMeta: result.usedFallback
                          ? {
                                usedFallback: true,
                                originalProvider: result.originalProvider,
                                originalModel: result.originalModel,
                            }
                          : undefined,
                  });

            params.onCompletion?.({ fullText: content });
            params.performance?.markClientFirstByte();
            params.performance?.markComplete(result.usage.completionTokens);
            if (params.performance) {
                params.onPerformance?.(params.performance.snapshot());
            }

            return { ok: true, response: NextResponse.json(json) };
        }

        const isCencoriWire = params.wireFormat === 'cencori';

        const stream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                let fullText = '';
                let tokenLimitReached = false;
                // Usage the provider itself reported, when it reports any.
                // Preferred over counting tokens off the text: it is what we
                // were actually billed for, and it is the only way cached
                // prompt tokens are visible at all.
                let reportedUsage: TokenUsage | undefined;
                let releasedRawLength = 0;
                let emittedText = '';
                let fallbackMetadataEmitted = false;
                const collectedToolCalls: Record<
                    string,
                    { id: string; type: string; function: { name: string; arguments: string } }
                > = {};

                const sse = (payload: unknown) =>
                    encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);

                const detokenize = (text: string) =>
                    params.tokenMap ? deTokenize(text, params.tokenMap) : text;

                /**
                 * Do not split a tokenization placeholder (for example
                 * "[EMAIL_1]") at the release boundary. A partial placeholder
                 * cannot be detokenized and would leak the internal marker.
                 */
                const adjustReleaseEndForTokenPlaceholders = (proposedEnd: number) => {
                    let safeEnd = proposedEnd;
                    if (params.tokenMap && proposedEnd < fullText.length) {
                        const prefix = fullText.slice(0, proposedEnd);
                        for (const placeholder of params.tokenMap.keys()) {
                            const maxPartialLength = Math.min(placeholder.length - 1, prefix.length);
                            for (let partialLength = maxPartialLength; partialLength > 0; partialLength--) {
                                if (prefix.endsWith(placeholder.slice(0, partialLength))) {
                                    safeEnd = Math.min(safeEnd, proposedEnd - partialLength);
                                    break;
                                }
                            }
                        }
                    }

                    // Avoid emitting half of a UTF-16 surrogate pair.
                    if (safeEnd > 0) {
                        const previousCodeUnit = fullText.charCodeAt(safeEnd - 1);
                        if (previousCodeUnit >= 0xd800 && previousCodeUnit <= 0xdbff) {
                            safeEnd -= 1;
                        }
                    }
                    return Math.max(releasedRawLength, safeEnd);
                };

                const emitTextDelta = (
                    text: string,
                    meta: {
                        actualModel: string;
                        usedFallback: boolean;
                        originalProvider: string;
                        originalModel: string;
                    }
                ) => {
                    if (!text) return;
                    params.performance?.markClientFirstByte();

                    if (isCencoriWire) {
                        const payload: Record<string, unknown> = { delta: text };
                        if (meta.usedFallback && !fallbackMetadataEmitted) {
                            payload.fallback_used = true;
                            payload.original_provider = meta.originalProvider;
                            payload.original_model = meta.originalModel;
                            fallbackMetadataEmitted = true;
                        }
                        controller.enqueue(sse(payload));
                    } else {
                        controller.enqueue(
                            sse(buildOpenAiStreamChunk(meta.actualModel, { content: text }, null))
                        );
                    }
                };

                const releaseApprovedText = (
                    meta: {
                        actualModel: string;
                        usedFallback: boolean;
                        originalProvider: string;
                        originalModel: string;
                    },
                    flushAll = false
                ) => {
                    const proposedEnd = flushAll
                        ? fullText.length
                        : Math.max(releasedRawLength, fullText.length - STREAM_GUARD_HOLDBACK_CHARS);
                    const releaseEnd = adjustReleaseEndForTokenPlaceholders(proposedEnd);
                    if (releaseEnd <= releasedRawLength) return;

                    const approvedText = detokenize(fullText.slice(0, releaseEnd));
                    if (!approvedText.startsWith(emittedText)) {
                        throw new Error('Streaming detokenization prefix changed after release');
                    }

                    emitTextDelta(approvedText.slice(emittedText.length), meta);
                    emittedText = approvedText;
                    releasedRawLength = releaseEnd;
                };

                const checkCurrentOutput = () => runGatewayOutputGuard({
                    supabase: params.supabase,
                    projectId: params.gatewayCtx.projectId,
                    apiKeyId: params.gatewayCtx.apiKeyId,
                    environment: params.gatewayCtx.environment,
                    outputText: detokenize(fullText),
                    inputText: params.inputText,
                    inputSecurity: params.inputSecurity,
                    conversationHistory: params.messages,
                    endUserId: params.endUserId,
                });

                /**
                 * Token/pricing accounting + logging + usage hooks shared by
                 * the natural finish and the server-side length cutoff.
                 * Returns the figures the cencori terminal metrics chunk needs.
                 */
                const settleStream = async (meta: {
                    actualModel: string;
                    actualProvider: string;
                    usedFallback: boolean;
                    billingMode: GatewayBillingMode;
                    finishReason: string;
                    blocked?: boolean;
                    errorMessage?: string;
                }) => {
                    const streamProvider =
                        meta.actualProvider !== resolved.providerName
                        && resolved.router.hasProvider(meta.actualProvider)
                            ? resolved.router.getProvider(meta.actualProvider)
                            : resolved.provider;
                    const promptText = params.messages.map((m) => m.content).join(' ');
                    const pricing = await streamProvider.getPricing(meta.actualModel);
                    const {
                        promptTokens: reportedPromptTokens,
                        completionTokens,
                        totalTokens,
                        providerCostUsd,
                    } = await settleStreamUsage({
                        reported: reportedUsage,
                        pricing,
                        estimate: async () => {
                            try {
                                return {
                                    promptTokens: await streamProvider.countTokens(promptText, meta.actualModel),
                                    completionTokens: await streamProvider.countTokens(fullText, meta.actualModel),
                                };
                            } catch {
                                return {
                                    promptTokens: Math.max(1, Math.ceil(promptText.length / 4)),
                                    completionTokens: Math.max(1, Math.ceil(fullText.length / 4)),
                                };
                            }
                        },
                    });
                    const { cencoriChargeUsd, markupPercentage } = calculateGatewayCharge(
                        providerCostUsd,
                        pricing,
                        meta.billingMode,
                    );

                    const finalText = params.tokenMap
                        ? deTokenize(fullText, params.tokenMap)
                        : fullText;

                    const providerLogName = resolved.customProviderTag || meta.actualProvider;
                    params.logSuccess({
                        provider: providerLogName,
                        model: meta.actualModel,
                        status: meta.blocked
                            ? 'error'
                            : meta.usedFallback ? 'success_fallback' : 'success',
                        promptTokens: reportedPromptTokens,
                        completionTokens,
                        totalTokens,
                        providerCostUsd,
                        cencoriChargeUsd,
                        markupPercentage,
                        responseText: finalText,
                        finishReason: meta.finishReason,
                        errorMessage: meta.errorMessage,
                    });
                    params.incrementUsage(cencoriChargeUsd);
                    params.recordEndUserUsage({
                        promptTokens: reportedPromptTokens,
                        completionTokens,
                        totalTokens,
                        providerCostUsd,
                        cencoriChargeUsd,
                        markupPercentage,
                    });

                    return {
                        promptTokens: reportedPromptTokens,
                        completionTokens,
                        totalTokens,
                        cencoriChargeUsd,
                        finalText,
                    };
                };

                /** Terminal chunks after settlement, per wire format. */
                    const finishStream = (
                    figures: Awaited<ReturnType<typeof settleStream>>,
                    meta: { actualModel: string; finishReason: string }
                ) => {
                    if (isCencoriWire) {
                        // NEW terminal metrics chunk (additive — legacy never
                        // sent usage/cost; parsers tolerate delta-less chunks).
                        controller.enqueue(
                            sse({
                                usage: {
                                    prompt_tokens: figures.promptTokens,
                                    completion_tokens: figures.completionTokens,
                                    total_tokens: figures.totalTokens,
                                },
                                cost_usd: figures.cencoriChargeUsd,
                            })
                        );
                    } else {
                        controller.enqueue(
                            sse(buildOpenAiStreamChunk(meta.actualModel, {}, meta.finishReason))
                        );
                    }
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    params.performance?.markComplete(figures.completionTokens);
                    if (params.performance) {
                        params.onPerformance?.(params.performance.snapshot());
                    }
                    controller.close();
                };

                const closeBlockedStream = async (
                    meta: {
                        actualModel: string;
                        actualProvider: string;
                        usedFallback: boolean;
                        billingMode: GatewayBillingMode;
                        finishReason: string;
                    },
                    outputCheck: { ok: false; message: string }
                ) => {
                    const figures = await settleStream({
                        actualModel: meta.actualModel,
                        actualProvider: meta.actualProvider,
                        usedFallback: meta.usedFallback,
                        billingMode: meta.billingMode,
                        finishReason: meta.finishReason,
                        blocked: true,
                        errorMessage: outputCheck.message,
                    });
                    controller.enqueue(sse({ error: outputCheck.message }));
                    if (!isCencoriWire) {
                        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    }
                    params.performance?.markComplete(figures.completionTokens);
                    if (params.performance) {
                        params.onPerformance?.(params.performance.snapshot());
                    }
                    controller.close();
                };

                const completeGuardedStream = async (meta: {
                    actualModel: string;
                    actualProvider: string;
                    usedFallback: boolean;
                    billingMode: GatewayBillingMode;
                    originalProvider: string;
                    originalModel: string;
                    finishReason: string;
                }) => {
                    const toolCallValues = Object.values(collectedToolCalls);
                    const outputTextForGuard = [
                        detokenize(fullText),
                        ...toolCallValues.map((toolCall) => toolCall.function.arguments),
                    ].filter(Boolean).join('\n');
                    const outputCheck = await runGatewayOutputGuard({
                        supabase: params.supabase,
                        projectId: params.gatewayCtx.projectId,
                        apiKeyId: params.gatewayCtx.apiKeyId,
                        environment: params.gatewayCtx.environment,
                        outputText: outputTextForGuard,
                        inputText: params.inputText,
                        inputSecurity: params.inputSecurity,
                        conversationHistory: params.messages,
                        endUserId: params.endUserId,
                    });

                    if (!outputCheck.ok) {
                        await closeBlockedStream(meta, outputCheck);
                        return;
                    }

                    // The final full-output check approved the retained tail.
                    releaseApprovedText(meta, true);

                    const figures = await settleStream({
                        actualModel: meta.actualModel,
                        actualProvider: meta.actualProvider,
                        usedFallback: meta.usedFallback,
                        billingMode: meta.billingMode,
                        finishReason: meta.finishReason,
                    });

                    if (isCencoriWire) {
                        const payload: Record<string, unknown> = {
                            delta: '',
                            finish_reason: meta.finishReason,
                        };
                        if (meta.usedFallback && !fallbackMetadataEmitted) {
                            payload.fallback_used = true;
                            payload.original_provider = meta.originalProvider;
                            payload.original_model = meta.originalModel;
                            fallbackMetadataEmitted = true;
                        }
                        if (toolCallValues.length > 0) {
                            payload.tool_calls = toolCallValues;
                            payload.toolCalls = toolCallValues;
                            params.performance?.markClientFirstByte();
                        }
                        controller.enqueue(sse(payload));
                    } else {
                        const delta: Record<string, unknown> = {};
                        if (toolCallValues.length > 0) {
                            delta.tool_calls = toolCallValues.map((toolCall, index) => ({
                                index,
                                id: toolCall.id,
                                type: toolCall.type,
                                function: toolCall.function,
                            }));
                        }
                        if (Object.keys(delta).length > 0) {
                            params.performance?.markClientFirstByte();
                            controller.enqueue(
                                sse(buildOpenAiStreamChunk(meta.actualModel, delta, null))
                            );
                        }
                    }

                    if (
                        params.shadowMode
                        && params.agentId
                        && toolCallValues.length > 0
                        && params.createPendingAction
                    ) {
                        const pendingIds: string[] = [];
                        for (const toolCall of toolCallValues) {
                            const id = await params.createPendingAction({
                                tool_call_id: toolCall.id,
                                tool: toolCall.function.name,
                                arguments: toolCall.function.arguments,
                            });
                            if (id) pendingIds.push(id);
                        }
                        if (pendingIds.length > 0) {
                            controller.enqueue(
                                encoder.encode(
                                    `event: shadow_mode\ndata: ${JSON.stringify({
                                        type: 'shadow_approval_required',
                                        agent_id: params.agentId,
                                        pending_action_ids: pendingIds,
                                        poll_url: `/api/v1/agent/actions/poll?ids=${pendingIds.join(',')}`,
                                    })}\n\n`
                                )
                            );
                        }
                    } else if (
                        params.agentId
                        && toolCallValues.length > 0
                        && params.createDispatchedAction
                    ) {
                        for (const toolCall of toolCallValues) {
                            params.createDispatchedAction({
                                tool_call_id: toolCall.id,
                                tool: toolCall.function.name,
                                arguments: toolCall.function.arguments,
                            });
                        }
                    }

                    params.onCompletion?.({ fullText: figures.finalText });
                    finishStream(figures, {
                        actualModel: meta.actualModel,
                        finishReason: meta.finishReason,
                    });
                };

                try {
                    let lastMeta: {
                        actualModel: string;
                        actualProvider: string;
                        usedFallback: boolean;
                        originalProvider: string;
                        originalModel: string;
                        billingMode: GatewayBillingMode;
                    } | null = null;
                    for await (const chunk of streamGatewayChat({
                        supabase: params.supabase,
                        projectId: params.gatewayCtx.projectId,
                        organizationId: params.gatewayCtx.organizationId,
                        allowedModels: params.gatewayCtx.allowedModels,
                        sponsoredModels: params.gatewayCtx.sponsoredModels,
                        tier,
                        request: chatRequest,
                        resolved,
                        requestId: params.gatewayCtx.requestId,
                        performance: params.performance,
                        hedgeDelayMs: params.hedgeDelayMs,
                    })) {
                        const originalProvider: string = lastMeta?.usedFallback && chunk.usedFallback
                            ? lastMeta.originalProvider
                            : chunk.originalProvider;
                        const originalModel: string = lastMeta?.usedFallback && chunk.usedFallback
                            ? lastMeta.originalModel
                            : chunk.originalModel;
                        lastMeta = {
                            actualModel: chunk.actualModel,
                            actualProvider: chunk.actualProvider,
                            usedFallback: chunk.usedFallback,
                            originalProvider,
                            originalModel,
                            billingMode: chunk.billingMode,
                        };
                        if (chunk.usage) {
                            reportedUsage = chunk.usage;
                        }
                        if (chunk.delta) {
                            params.performance?.markProviderFirstToken();
                            fullText += chunk.delta;
                        }
                        if (chunk.toolCalls && chunk.toolCalls.length > 0) {
                            params.performance?.markProviderFirstToken();
                        }

                        // Server-side max_tokens enforcement — some
                        // providers/models don't respect the parameter.
                        if (
                            params.enforceMaxTokens &&
                            params.maxTokens &&
                            !tokenLimitReached &&
                            estimateTokenCount(fullText) >= params.maxTokens
                        ) {
                            tokenLimitReached = true;
                            fullText = fullText.slice(0, params.maxTokens * 4);
                        }

                        if (chunk.toolCalls) {
                            for (const [index, tc] of chunk.toolCalls.entries()) {
                                const key = tc.id || `tool_${index}`;
                                if (!collectedToolCalls[key]) {
                                    collectedToolCalls[key] = {
                                        id: tc.id,
                                        type: tc.type,
                                        function: { name: '', arguments: '' },
                                    };
                                }
                                if (tc.id) collectedToolCalls[key].id = tc.id;
                                if (tc.function?.name) {
                                    collectedToolCalls[key].function.name += tc.function.name;
                                }
                                if (tc.function?.arguments) {
                                    collectedToolCalls[key].function.arguments += tc.function.arguments;
                                }
                            }
                        }

                        if (tokenLimitReached || chunk.finishReason) {
                            await completeGuardedStream({
                                ...lastMeta,
                                finishReason: tokenLimitReached ? 'length' : chunk.finishReason || 'stop',
                            });
                            return;
                        }

                        const releasableCharacters =
                            fullText.length
                            - releasedRawLength
                            - STREAM_GUARD_HOLDBACK_CHARS;
                        if (releasableCharacters >= STREAM_GUARD_EMIT_BATCH_CHARS) {
                            const outputCheck = await checkCurrentOutput();
                            if (!outputCheck.ok) {
                                await closeBlockedStream(
                                    { ...lastMeta, finishReason: 'content_filter' },
                                    outputCheck
                                );
                                return;
                            }
                            releaseApprovedText(lastMeta);
                        }
                    }

                    // Defensive completion for providers that close without a
                    // terminal finish_reason chunk.
                    if (lastMeta) {
                        await completeGuardedStream({ ...lastMeta, finishReason: 'stop' });
                    } else {
                        throw new Error('Provider stream ended without output');
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Stream failed';
                    params.logSuccess({
                        provider: resolved.providerName,
                        model: resolved.model,
                        status: 'error',
                        promptTokens: 0,
                        completionTokens: 0,
                        totalTokens: 0,
                        providerCostUsd: 0,
                        cencoriChargeUsd: 0,
                        markupPercentage: 0,
                        errorMessage: message,
                    });
                    controller.enqueue(sse({ error: message }));
                    controller.close();
                }
            },
        });

        const streamHeaders: Record<string, string> = {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        };

        return {
            ok: true,
            response: new NextResponse(stream, { headers: streamHeaders }),
        };
    } catch (error) {
        return v1ProviderFailureResult(error, undefined, params.model);
    }
}
