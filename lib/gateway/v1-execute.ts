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

            const json = buildOpenAiCompletionJson({
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

        const stream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                let fullText = '';
                const collectedToolCalls: Record<
                    number,
                    { id: string; type: string; function: { name: string; arguments: string } }
                > = {};

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
                            const errChunk = buildOpenAiStreamChunk(params.model, {
                                content: '',
                            }, 'content_filter');
                            controller.enqueue(
                                encoder.encode(`data: ${JSON.stringify({ error: outputCheck.message })}\n\n`)
                            );
                            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                            controller.close();
                            return;
                        }

                        const deltaContent = params.tokenMap
                            ? deTokenize(chunk.delta, params.tokenMap)
                            : chunk.delta;

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
                                encoder.encode(
                                    `data: ${JSON.stringify(buildOpenAiStreamChunk(chunk.actualModel, delta, null))}\n\n`
                                )
                            );
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

                            const streamProvider = resolved.provider;
                            const promptText = params.messages.map((m) => m.content).join(' ');
                            let promptTokens = 0;
                            let completionTokens = 0;
                            try {
                                promptTokens = await streamProvider.countTokens(
                                    promptText,
                                    chunk.actualModel
                                );
                                completionTokens = await streamProvider.countTokens(
                                    fullText,
                                    chunk.actualModel
                                );
                            } catch {
                                promptTokens = Math.max(1, Math.ceil(promptText.length / 4));
                                completionTokens = Math.max(1, Math.ceil(fullText.length / 4));
                            }
                            const totalTokens = promptTokens + completionTokens;
                            const pricing = await streamProvider.getPricing(chunk.actualModel);
                            const providerCostUsd =
                                (promptTokens / 1000) * pricing.inputPer1KTokens
                                + (completionTokens / 1000) * pricing.outputPer1KTokens;
                            const cencoriChargeUsd =
                                providerCostUsd * (1 + pricing.cencoriMarkupPercentage / 100);

                            const providerLogName =
                                resolved.customProviderTag || chunk.actualProvider;
                            params.logSuccess({
                                provider: providerLogName,
                                model: chunk.actualModel,
                                status: chunk.usedFallback ? 'success_fallback' : 'success',
                                promptTokens,
                                completionTokens,
                                totalTokens,
                                providerCostUsd,
                                cencoriChargeUsd,
                                markupPercentage: pricing.cencoriMarkupPercentage,
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

                            params.onCompletion?.({
                                fullText: params.tokenMap
                                    ? deTokenize(fullText, params.tokenMap)
                                    : fullText,
                            });

                            controller.enqueue(
                                encoder.encode(
                                    `data: ${JSON.stringify(
                                        buildOpenAiStreamChunk(chunk.actualModel, {}, chunk.finishReason)
                                    )}\n\n`
                                )
                            );
                            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                            controller.close();
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
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`)
                    );
                    controller.close();
                }
            },
        });

        return {
            ok: true,
            response: new NextResponse(stream, {
                headers: { 'Content-Type': 'text/event-stream' },
            }),
        };
    } catch (error) {
        return v1ProviderFailureResult(error);
    }
}
