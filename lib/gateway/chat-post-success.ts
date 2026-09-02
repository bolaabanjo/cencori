/**
 * Shared post-success chat side effects — used by BOTH chat doors
 * (/api/ai/chat adapter and /api/v1/chat/completions) so payload logging,
 * RagMetrics evaluation, and budget alerts never drift between them again.
 *
 * Everything here is fire-and-forget relative to the response; callers wrap
 * the returned promise in waitUntil() so serverless doesn't freeze the
 * function before the work lands.
 */

import { waitUntil } from '@vercel/functions';
import type { createAdminClient } from '@/lib/supabaseAdmin';
import type { GatewayContext } from '@/lib/gateway-middleware';
import { logGatewayRequest } from '@/lib/gateway-middleware';
import type { UnifiedMessage } from '@/lib/providers/base';
import {
    applyMask,
    applyRedact,
    applyTokenize,
    processCustomRules,
} from '@/lib/safety/custom-data-rules';
import type { CustomRulesPipelineResult } from '@/lib/gateway/custom-rules';
import { evaluateWithRagMetrics, extractRAGContext } from '@/lib/integrations/ragmetrics';
import { checkAndSendBudgetAlerts } from '@/lib/budgets';
import { truncateForLog } from '@/lib/gateway/log-payload';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

/**
 * Apply the project's matched custom rules to the messages/response before
 * they're persisted in ai_requests — the logged payloads must carry the
 * masked/redacted/tokenized values, never the raw ones.
 * (Extracted from the legacy handler's inline logging block.)
 */
/**
 * Render an assistant turn that called tools so it does not log as an empty string.
 *
 * A tool-calling turn frequently has no prose at all, and the history of an agent run is mostly
 * such turns. Logging them by `content` alone produced a prompt full of blank assistant messages
 * with the tool results in between — the answers to questions the log did not show.
 */
export function describeToolCallTurn(message: {
    content: string;
    tool_calls?: Array<{ function: { name: string; arguments: string } }>;
}): string {
    if (!message.tool_calls?.length) return message.content;
    const calls = message.tool_calls
        .map((call) => `${call.function.name}(${truncateForLog(call.function.arguments, 2_000)})`)
        .join('\n');
    return message.content ? `${message.content}\n${calls}` : calls;
}

export async function buildMaskedLogPayloads(params: {
    messages: Array<{ role: string; content: string }>;
    responseText: string;
    /**
     * Tool calls the model made on this request.
     *
     * Without them an agentic turn logs as blank: the model that called shell four times and wrote
     * no prose produced an empty `content`, so the console showed that a request happened and
     * nothing about the work. The arguments are masked with the same rules as the response text —
     * they carry file contents and paths, and are frequently the most sensitive part of the turn.
     */
    toolCalls?: Array<{ name: string; arguments: string }>;
    customRules?: CustomRulesPipelineResult | null;
}): Promise<{
    loggedMessages: Array<{ role: string; content: string }>;
    loggedResponse: string;
    loggedToolCalls: Array<{ name: string; arguments: string }>;
}> {
    const { messages, responseText, customRules } = params;
    const toolCalls = (params.toolCalls ?? []).map((call) => ({
        name: call.name,
        arguments: truncateForLog(call.arguments),
    }));

    if (!customRules || customRules.rules.length === 0) {
        return { loggedMessages: messages, loggedResponse: responseText, loggedToolCalls: toolCalls };
    }

    const loggedToolCalls = await Promise.all(
        toolCalls.map(async (call) => {
            try {
                const processed = await processCustomRules(call.arguments, customRules.rules);
                return { name: call.name, arguments: processed.content };
            } catch {
                // Keep the call in the log rather than losing the record of it.
                return call;
            }
        })
    );

    let loggedResponse = responseText;
    try {
        const responseRulesResult = await processCustomRules(responseText, customRules.rules);
        loggedResponse = responseRulesResult.content;
    } catch {
        // Keep the unprocessed response rather than losing the log.
    }

    let loggedMessages = messages;
    if (customRules.inputResult.wasProcessed) {
        loggedMessages = messages.map((msg) => ({
            ...msg,
            content: customRules.inputResult.matchedRules.reduce((c, match) => {
                if (match.rule.action === 'mask') return applyMask(c, match.snippets);
                if (match.rule.action === 'redact') return applyRedact(c, match.snippets);
                if (match.rule.action === 'tokenize') {
                    return applyTokenize(c, match.snippets, match.rule.name).text;
                }
                return c;
            }, msg.content),
        }));
    }

    return { loggedMessages, loggedResponse, loggedToolCalls };
}

/**
 * RagMetrics evaluation + budget alerts for a successful chat completion.
 */
export async function runChatSuccessSideEffects(params: {
    gatewayCtx: GatewayContext;
    aiRequestId: string | null;
    unifiedMessages: UnifiedMessage[];
    responseText: string;
    model: string;
    provider: string;
    isStreaming: boolean;
}): Promise<void> {
    const { gatewayCtx, aiRequestId, unifiedMessages, responseText, model, provider, isStreaming } = params;

    checkAndSendBudgetAlerts(
        gatewayCtx.projectId,
        gatewayCtx.projectName || gatewayCtx.projectId,
        gatewayCtx.organizationId
    ).catch((err) => console.error('[Budget] Alert check failed:', err));

    if (aiRequestId) {
        evaluateWithRagMetrics({
            projectId: gatewayCtx.projectId,
            requestId: aiRequestId,
            prompt: unifiedMessages.map((m) => `${m.role}: ${m.content}`).join('\n'),
            response: responseText,
            context: extractRAGContext(unifiedMessages),
            metadata: { model, provider, is_streaming: isStreaming },
        }).catch((err) => console.error('[RagMetrics] Evaluation failed:', err));
    }
}

export type ChatLogSuccessMeta = {
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
    responseText?: string;
    finishReason?: string;
};

/**
 * Build the logSuccess callback both chat routes hand to
 * runV1ProviderExecution: masked payload logging → ai_requests insert →
 * RagMetrics + budget alerts with the inserted row id. Wrapped in
 * waitUntil so a closing stream can't drop the billing row.
 */
export function makeChatLogSuccess(params: {
    supabase: SupabaseAdmin;
    gatewayCtx: GatewayContext;
    endpoint: string;
    requestModel: string;
    unifiedMessages: UnifiedMessage[];
    isStreaming: boolean;
    endUserId: string | null;
    customRules?: CustomRulesPipelineResult | null;
    requestMeta?: Record<string, unknown>;
}): (meta: ChatLogSuccessMeta) => void {
    const { gatewayCtx, endpoint, requestModel, unifiedMessages, isStreaming, endUserId, customRules, requestMeta } = params;

    return (meta: ChatLogSuccessMeta) => {
        waitUntil(
            (async () => {
                const { loggedMessages, loggedResponse } = await buildMaskedLogPayloads({
                    messages: unifiedMessages.map((m) => ({ role: m.role, content: m.content })),
                    responseText: meta.responseText ?? '',
                    customRules,
                });

                const aiRequestId = await logGatewayRequest(gatewayCtx, {
                    endpoint,
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
                    requestPayload: {
                        messages: loggedMessages,
                        model: requestModel,
                        stream: isStreaming,
                        ...requestMeta,
                    },
                    responsePayload: meta.responseText !== undefined
                        ? { content: loggedResponse, finishReason: meta.finishReason }
                        : undefined,
                });

                if (meta.status !== 'error') {
                    await runChatSuccessSideEffects({
                        gatewayCtx,
                        aiRequestId,
                        unifiedMessages,
                        responseText: loggedResponse,
                        model: meta.model,
                        provider: meta.provider,
                        isStreaming,
                    });
                }
            })().catch((err) => console.error('[Gateway] logSuccess pipeline failed:', err))
        );
    };
}
