import { NextResponse } from 'next/server';
import type { createAdminClient } from '@/lib/supabaseAdmin';
import type { GatewayContext } from '@/lib/gateway-middleware';
import type { QuotaCheckResult } from '@/lib/end-user-billing';
import type { UnifiedMessage, Tool, UnifiedChatRequest } from '@/lib/providers/base';
import type { SecurityCheckResult } from '@/lib/safety/multi-layer-check';
import { deTokenize } from '@/lib/safety/custom-data-rules';
import { executeGatewayChat, streamGatewayChat } from '@/lib/gateway/chat-executor';
import { resolveGatewayProvider } from '@/lib/gateway/providers-setup';
import { runGatewayOutputGuard } from '@/lib/gateway/output-guard';
import { mapProviderErrorToHttpResponse } from '@/lib/gateway-reliability';
import { buildCencoriChatResponse } from '@/lib/gateway/ai-chat-support';
import { estimateTokenCount } from '@/lib/providers/utils';
import type { SubscriptionTier } from '@/lib/entitlements';
import type { ToolCallPayload } from '@/lib/gateway/v1-types';

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
    createExecutedAction?: (toolCall: ToolCallPayload) => void;
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

export type V1ExecuteResult =
    | { ok: true; response: NextResponse }
    | { ok: false; status: number; body: Record<string, unknown> };

function v1ProviderFailureResult(error: unknown, providerHint?: string): V1ExecuteResult {
    const failure = mapProviderErrorToHttpResponse(error, providerHint);
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
        });

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
        };

        if (!params.stream) {
            const result = await executeGatewayChat({
                supabase: params.supabase,
                projectId: params.gatewayCtx.projectId,
                organizationId: params.gatewayCtx.organizationId,
                tier,
                request: chatRequest,
                resolved,
                requestId: params.gatewayCtx.requestId,
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

            const outputBlock = await runGatewayOutputGuard({
                supabase: params.supabase,
                projectId: params.gatewayCtx.projectId,
                apiKeyId: params.gatewayCtx.apiKeyId,
                environment: params.gatewayCtx.environment,
                outputText: content,
                inputText: params.inputText,
                inputSecurity: params.inputSecurity,
                conversationHistory: params.messages,
                endUserId: params.endUserId,
            });

            if (!outputBlock.ok) {
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

            const openAiToolCalls = result.toolCalls?.map((tc) => ({
                id: tc.id,
                type: tc.type,
                function: tc.function,
            }));

            if (params.agentId && openAiToolCalls && openAiToolCalls.length > 0) {
                if (params.shadowMode && params.createPendingAction) {
                    for (const tc of openAiToolCalls) {
                        await params.createPendingAction({
                            tool_call_id: tc.id,
                            tool: tc.function.name,
                            arguments: tc.function.arguments,
                        });
                    }
                } else if (params.createExecutedAction) {
                    for (const tc of openAiToolCalls) {
                        params.createExecutedAction({
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

            return { ok: true, response: NextResponse.json(json) };
        }

        const isCencoriWire = params.wireFormat === 'cencori';

        const stream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                let fullText = '';
                let emittedFirstContent = false;
                let tokenLimitReached = false;
                const collectedToolCalls: Record<
                    number,
                    { id: string; type: string; function: { name: string; arguments: string } }
                > = {};

                const sse = (payload: unknown) =>
                    encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);

                /**
                 * Token/pricing accounting + logging + usage hooks shared by
                 * the natural finish and the server-side length cutoff.
                 * Returns the figures the cencori terminal metrics chunk needs.
                 */
                const settleStream = async (meta: {
                    actualModel: string;
                    actualProvider: string;
                    usedFallback: boolean;
                    finishReason: string;
                }) => {
                    const streamProvider = resolved.provider;
                    const promptText = params.messages.map((m) => m.content).join(' ');
                    let promptTokens = 0;
                    let completionTokens = 0;
                    try {
                        promptTokens = await streamProvider.countTokens(promptText, meta.actualModel);
                        completionTokens = await streamProvider.countTokens(fullText, meta.actualModel);
                    } catch {
                        promptTokens = Math.max(1, Math.ceil(promptText.length / 4));
                        completionTokens = Math.max(1, Math.ceil(fullText.length / 4));
                    }
                    const totalTokens = promptTokens + completionTokens;
                    const pricing = await streamProvider.getPricing(meta.actualModel);
                    const providerCostUsd =
                        (promptTokens / 1000) * pricing.inputPer1KTokens
                        + (completionTokens / 1000) * pricing.outputPer1KTokens;
                    const cencoriChargeUsd =
                        providerCostUsd * (1 + pricing.cencoriMarkupPercentage / 100);

                    const finalText = params.tokenMap
                        ? deTokenize(fullText, params.tokenMap)
                        : fullText;

                    const providerLogName = resolved.customProviderTag || meta.actualProvider;
                    params.logSuccess({
                        provider: providerLogName,
                        model: meta.actualModel,
                        status: meta.usedFallback ? 'success_fallback' : 'success',
                        promptTokens,
                        completionTokens,
                        totalTokens,
                        providerCostUsd,
                        cencoriChargeUsd,
                        markupPercentage: pricing.cencoriMarkupPercentage,
                        responseText: finalText,
                        finishReason: meta.finishReason,
                    });
                    params.incrementUsage(cencoriChargeUsd);
                    params.recordEndUserUsage({
                        promptTokens,
                        completionTokens,
                        totalTokens,
                        providerCostUsd,
                        cencoriChargeUsd,
                        markupPercentage: pricing.cencoriMarkupPercentage,
                    });

                    params.onCompletion?.({ fullText: finalText });

                    return { promptTokens, completionTokens, totalTokens, cencoriChargeUsd };
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
                    controller.close();
                };

                try {
                    for await (const chunk of streamGatewayChat({
                        supabase: params.supabase,
                        projectId: params.gatewayCtx.projectId,
                        organizationId: params.gatewayCtx.organizationId,
                        tier,
                        request: chatRequest,
                        resolved,
                        requestId: params.gatewayCtx.requestId,
                    })) {
                        if (chunk.delta) {
                            fullText += chunk.delta;
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
                        }

                        if (chunk.toolCalls) {
                            for (const tc of chunk.toolCalls) {
                                const idx = 0;
                                if (!collectedToolCalls[idx]) {
                                    collectedToolCalls[idx] = {
                                        id: tc.id,
                                        type: tc.type,
                                        function: { name: '', arguments: '' },
                                    };
                                }
                                if (tc.id) collectedToolCalls[idx].id = tc.id;
                                if (tc.function?.name) {
                                    collectedToolCalls[idx].function.name += tc.function.name;
                                }
                                if (tc.function?.arguments) {
                                    collectedToolCalls[idx].function.arguments += tc.function.arguments;
                                }
                            }
                        }

                        const outputCheck = await runGatewayOutputGuard({
                            supabase: params.supabase,
                            projectId: params.gatewayCtx.projectId,
                            apiKeyId: params.gatewayCtx.apiKeyId,
                            environment: params.gatewayCtx.environment,
                            outputText: fullText,
                            inputText: params.inputText,
                            inputSecurity: params.inputSecurity,
                            conversationHistory: params.messages,
                            endUserId: params.endUserId,
                        });

                        if (!outputCheck.ok) {
                            controller.enqueue(sse({ error: outputCheck.message }));
                            if (!isCencoriWire) {
                                // Legacy contract: error chunks close WITHOUT
                                // [DONE]; OpenAI mode keeps its existing
                                // [DONE]-after-error behavior.
                                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                            }
                            controller.close();
                            return;
                        }

                        const deltaContent = params.tokenMap
                            ? deTokenize(chunk.delta, params.tokenMap)
                            : chunk.delta;

                        if (isCencoriWire) {
                            // Legacy chunk: {delta: <string>, finish_reason}
                            // — finish_reason passthrough, dropped by
                            // JSON.stringify when undefined.
                            if (deltaContent || chunk.toolCalls?.length || chunk.finishReason) {
                                const payload: Record<string, unknown> = {
                                    delta: deltaContent ?? '',
                                    finish_reason: tokenLimitReached ? 'length' : chunk.finishReason,
                                };
                                if (!emittedFirstContent && chunk.usedFallback) {
                                    payload.fallback_used = true;
                                    payload.original_provider = chunk.originalProvider ?? resolved.providerName;
                                    payload.original_model = chunk.originalModel ?? resolved.model;
                                }
                                if (chunk.toolCalls?.length) {
                                    // BOTH spellings: snake for Vercel/TanStack,
                                    // camel for Python/PHP/Rust stream parsers.
                                    payload.tool_calls = chunk.toolCalls;
                                    payload.toolCalls = chunk.toolCalls;
                                }
                                controller.enqueue(sse(payload));
                                emittedFirstContent = true;
                            }
                        } else {
                            const delta: Record<string, unknown> = {};
                            if (deltaContent) delta.content = deltaContent;
                            if (chunk.toolCalls?.length) {
                                delta.tool_calls = chunk.toolCalls.map((tc, i) => ({
                                    index: i,
                                    id: tc.id,
                                    type: tc.type,
                                    function: tc.function,
                                }));
                            }

                            if (Object.keys(delta).length > 0) {
                                controller.enqueue(
                                    sse(buildOpenAiStreamChunk(
                                        chunk.actualModel,
                                        delta,
                                        tokenLimitReached ? 'length' : null
                                    ))
                                );
                            }
                        }

                        if (tokenLimitReached) {
                            // Cut the stream: settle accounting with
                            // finish_reason "length" and terminate.
                            const figures = await settleStream({
                                actualModel: chunk.actualModel,
                                actualProvider: chunk.actualProvider,
                                usedFallback: chunk.usedFallback,
                                finishReason: 'length',
                            });
                            finishStream(figures, {
                                actualModel: chunk.actualModel,
                                finishReason: 'length',
                            });
                            return;
                        }

                        if (chunk.finishReason) {
                            const toolCallValues = Object.values(collectedToolCalls);
                            if (
                                params.shadowMode &&
                                params.agentId &&
                                toolCallValues.length > 0 &&
                                params.createPendingAction
                            ) {
                                const pendingIds: string[] = [];
                                for (const tc of toolCallValues) {
                                    const id = await params.createPendingAction({
                                        tool_call_id: tc.id,
                                        tool: tc.function.name,
                                        arguments: tc.function.arguments,
                                    });
                                    if (id) pendingIds.push(id);
                                }
                                if (pendingIds.length > 0) {
                                    const shadowEvent = {
                                        type: 'shadow_approval_required',
                                        agent_id: params.agentId,
                                        pending_action_ids: pendingIds,
                                        poll_url: `/api/v1/agent/actions/poll?ids=${pendingIds.join(',')}`,
                                    };
                                    controller.enqueue(
                                        encoder.encode(
                                            `event: shadow_mode\ndata: ${JSON.stringify(shadowEvent)}\n\n`
                                        )
                                    );
                                }
                            } else if (
                                params.agentId &&
                                toolCallValues.length > 0 &&
                                params.createExecutedAction
                            ) {
                                for (const tc of toolCallValues) {
                                    params.createExecutedAction({
                                        tool_call_id: tc.id,
                                        tool: tc.function.name,
                                        arguments: tc.function.arguments,
                                    });
                                }
                            }

                            const figures = await settleStream({
                                actualModel: chunk.actualModel,
                                actualProvider: chunk.actualProvider,
                                usedFallback: chunk.usedFallback,
                                finishReason: chunk.finishReason,
                            });
                            finishStream(figures, {
                                actualModel: chunk.actualModel,
                                finishReason: chunk.finishReason,
                            });
                        }
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
        };
        if (isCencoriWire) {
            // Legacy stream headers
            streamHeaders['Cache-Control'] = 'no-cache';
            streamHeaders['Connection'] = 'keep-alive';
        }

        return {
            ok: true,
            response: new NextResponse(stream, { headers: streamHeaders }),
        };
    } catch (error) {
        return v1ProviderFailureResult(error);
    }
}
