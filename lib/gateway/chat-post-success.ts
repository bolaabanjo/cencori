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

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

/**
 * Apply the project's matched custom rules to the messages/response before
 * they're persisted in ai_requests — the logged payloads must carry the
 * masked/redacted/tokenized values, never the raw ones.
 * (Extracted from the legacy handler's inline logging block.)
 */
export async function buildMaskedLogPayloads(params: {
    messages: Array<{ role: string; content: string }>;
    responseText: string;
    customRules?: CustomRulesPipelineResult | null;
}): Promise<{
    loggedMessages: Array<{ role: string; content: string }>;
    loggedResponse: string;
}> {
    const { messages, responseText, customRules } = params;

    if (!customRules || customRules.rules.length === 0) {
        return { loggedMessages: messages, loggedResponse: responseText };
    }

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

    return { loggedMessages, loggedResponse };
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
