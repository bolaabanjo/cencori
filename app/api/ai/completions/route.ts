/** Legacy text-completions compatibility endpoint backed by the gateway chat engine. */

import { NextRequest, NextResponse } from 'next/server';
import {
    validateGatewayRequest,
    addGatewayHeaders,
    handleCorsPreFlight,
    logGatewayRequest,
    incrementUsage,
} from '@/lib/gateway-middleware';
import { executeGatewayChat } from '@/lib/gateway/chat-executor';
import { runGatewayInputPipeline } from '@/lib/gateway/input-guard';
import { runGatewayOutputGuard } from '@/lib/gateway/output-guard';
import { resolveGatewayProvider } from '@/lib/gateway/providers-setup';
import { getCache, saveCache, computeCacheKey } from '@/lib/cache';
import { deTokenize } from '@/lib/safety/custom-data-rules';
import type { SubscriptionTier } from '@/lib/entitlements';

const MAX_PROMPT_BYTES = 1024 * 1024;

function cachedUsage(response: unknown, prompt: string) {
    const usage = (response as {
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    })?.usage;
    const promptTokens = Number(usage?.prompt_tokens ?? Math.max(1, Math.ceil(prompt.length / 4)));
    const completionTokens = Number(usage?.completion_tokens ?? 0);
    return {
        promptTokens,
        completionTokens,
        totalTokens: Number(usage?.total_tokens ?? promptTokens + completionTokens),
    };
}

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function POST(req: NextRequest) {
    const validation = await validateGatewayRequest(req);
    if (!validation.success) return validation.response;
    const ctx = validation.context;

    const respondError = (status: number, error: string, message: string) => addGatewayHeaders(
        NextResponse.json({ error, message }, { status }),
        { requestId: ctx.requestId },
    );

    try {
        let body: Record<string, unknown>;
        try {
            body = await req.json() as Record<string, unknown>;
        } catch {
            return respondError(400, 'invalid_json', 'Request body must be valid JSON.');
        }

        if (typeof body.prompt !== 'string' || !body.prompt.trim()) {
            return respondError(400, 'invalid_prompt', 'prompt must be a non-empty string.');
        }
        if (new TextEncoder().encode(body.prompt).byteLength > MAX_PROMPT_BYTES) {
            return respondError(413, 'prompt_too_large', 'prompt exceeds the 1 MiB limit.');
        }
        if (body.model !== undefined && typeof body.model !== 'string') {
            return respondError(400, 'invalid_model', 'model must be a string.');
        }
        if (body.stream !== undefined && typeof body.stream !== 'boolean') {
            return respondError(400, 'invalid_stream', 'stream must be a boolean.');
        }
        if (body.n !== undefined && body.n !== 1) {
            return respondError(400, 'unsupported_n', 'Only n=1 is supported by this compatibility endpoint.');
        }
        if (body.top_p !== undefined) {
            return respondError(400, 'unsupported_top_p', 'top_p is not supported by this compatibility endpoint.');
        }

        const temperature = body.temperature === undefined ? 0.7 : Number(body.temperature);
        const maxTokens = body.max_tokens === undefined ? undefined : Number(body.max_tokens);
        if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
            return respondError(400, 'invalid_temperature', 'temperature must be between 0 and 2.');
        }
        if (maxTokens !== undefined
            && (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 1_000_000)) {
            return respondError(400, 'invalid_max_tokens', 'max_tokens must be a positive integer no larger than 1,000,000.');
        }

        const requestedModel = typeof body.model === 'string' && body.model.trim()
            ? body.model.trim()
            : ctx.defaultModel || 'gpt-3.5-turbo';
        const tier = (ctx.tier || 'free') as SubscriptionTier;
        const inputPipeline = await runGatewayInputPipeline({
            supabase: ctx.supabase,
            projectId: ctx.projectId,
            apiKeyId: ctx.apiKeyId,
            environment: ctx.environment,
            tier,
            messages: [{ role: 'user', content: body.prompt }],
        });
        if (!inputPipeline.ok) {
            await logGatewayRequest(ctx, {
                endpoint: 'completions',
                model: requestedModel,
                provider: 'unknown',
                status: 'blocked',
                errorMessage: inputPipeline.message,
            });
            return respondError(inputPipeline.status, inputPipeline.code, inputPipeline.message);
        }

        const guardedPrompt = inputPipeline.messages[0]?.content ?? body.prompt;
        const cacheKey = computeCacheKey({
            projectId: ctx.projectId,
            model: requestedModel,
            prompt: guardedPrompt,
            temperature,
            maxTokens,
        });

        if (body.stream !== true) {
            const cachedResponse = await getCache(cacheKey);
            if (cachedResponse && typeof cachedResponse === 'object') {
                const payload = cachedResponse as Record<string, unknown>;
                const choices = Array.isArray(payload.choices) ? payload.choices : [];
                const firstChoice = choices[0] && typeof choices[0] === 'object'
                    ? choices[0] as Record<string, unknown>
                    : null;
                const safePayload = firstChoice && typeof firstChoice.text === 'string'
                    ? {
                        ...payload,
                        choices: [{
                            ...firstChoice,
                            text: deTokenize(firstChoice.text, inputPipeline.tokenMap ?? new Map()),
                        }, ...choices.slice(1)],
                    }
                    : payload;
                const usage = cachedUsage(payload, guardedPrompt);
                await logGatewayRequest(ctx, {
                    endpoint: 'completions',
                    model: requestedModel,
                    provider: 'cache',
                    status: 'success',
                    promptTokens: usage.promptTokens,
                    completionTokens: usage.completionTokens,
                    totalTokens: usage.totalTokens,
                    costUsd: 0,
                    providerCostUsd: 0,
                    cencoriChargeUsd: 0,
                    markupPercentage: 0,
                    metadata: { cache: 'exact' },
                });

                const response = NextResponse.json({
                    ...safePayload,
                    id: `cached-${typeof payload.id === 'string' ? payload.id : ctx.requestId}`,
                    created: Math.floor(Date.now() / 1000),
                });
                response.headers.set('X-Cencori-Cache', 'HIT');
                return addGatewayHeaders(response, { requestId: ctx.requestId });
            }
        }

        const resolved = await resolveGatewayProvider({
            supabase: ctx.supabase,
            projectId: ctx.projectId,
            organizationId: ctx.organizationId,
            requestedModel,
            allowedModels: ctx.allowedModels,
            sponsoredModels: ctx.sponsoredModels,
        });
        const providerResponse = await executeGatewayChat({
            supabase: ctx.supabase,
            projectId: ctx.projectId,
            organizationId: ctx.organizationId,
            allowedModels: ctx.allowedModels,
            sponsoredModels: ctx.sponsoredModels,
            tier,
            resolved,
            requestId: ctx.requestId,
            request: {
                messages: inputPipeline.messages,
                model: requestedModel,
                temperature,
                maxTokens,
                userId: ctx.projectId,
            },
        });

        const outputGuard = await runGatewayOutputGuard({
            supabase: ctx.supabase,
            projectId: ctx.projectId,
            apiKeyId: ctx.apiKeyId,
            environment: ctx.environment,
            outputText: providerResponse.content,
            inputText: inputPipeline.inputText,
            inputSecurity: inputPipeline.inputSecurity,
            conversationHistory: inputPipeline.messages,
        });

        await logGatewayRequest(ctx, {
            endpoint: 'completions',
            model: providerResponse.actualModel,
            provider: providerResponse.actualProvider,
            status: outputGuard.ok
                ? (providerResponse.usedFallback ? 'success_fallback' : 'success')
                : 'filtered',
            promptTokens: providerResponse.usage.promptTokens,
            completionTokens: providerResponse.usage.completionTokens,
            totalTokens: providerResponse.usage.totalTokens,
            costUsd: providerResponse.cost.cencoriChargeUsd,
            providerCostUsd: providerResponse.cost.providerCostUsd,
            cencoriChargeUsd: providerResponse.cost.cencoriChargeUsd,
            markupPercentage: providerResponse.cost.markupPercentage,
            errorMessage: outputGuard.ok ? undefined : outputGuard.message,
        });
        await incrementUsage(ctx, providerResponse.cost.cencoriChargeUsd);

        if (!outputGuard.ok) {
            return respondError(outputGuard.status, outputGuard.code, outputGuard.message);
        }

        const safeContent = deTokenize(
            providerResponse.content,
            inputPipeline.tokenMap ?? new Map(),
        );
        const rawPayload = {
            id: ctx.requestId,
            object: 'text_completion',
            created: Math.floor(Date.now() / 1000),
            model: providerResponse.actualModel,
            choices: [{
                text: providerResponse.content,
                index: 0,
                finish_reason: providerResponse.finishReason,
            }],
            usage: {
                prompt_tokens: providerResponse.usage.promptTokens,
                completion_tokens: providerResponse.usage.completionTokens,
                total_tokens: providerResponse.usage.totalTokens,
            },
        };

        if (body.stream === true) {
            // Buffer until output review completes; unsafe stream prefixes
            // cannot be recalled after they reach a client.
            const encoder = new TextEncoder();
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        ...rawPayload,
                        choices: [{
                            ...rawPayload.choices[0],
                            text: safeContent,
                        }],
                    })}\n\n`));
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    controller.close();
                },
            });
            return new Response(stream, {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    'X-Request-Id': ctx.requestId,
                },
            });
        }

        // Store the still-tokenized provider payload. Rehydrating before the
        // cache would let one secret-bearing prompt contaminate a later hit.
        void saveCache(cacheKey, rawPayload).catch((error) => console.error('Cache save error', error));
        const response = NextResponse.json({
            ...rawPayload,
            choices: [{ ...rawPayload.choices[0], text: safeContent }],
        });
        response.headers.set('X-Cencori-Cache', 'MISS');
        return addGatewayHeaders(response, { requestId: ctx.requestId });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Completions Error:', error);
        await logGatewayRequest(ctx, {
            endpoint: 'completions',
            model: 'unknown',
            provider: 'unknown',
            status: 'error',
            errorMessage: message,
        });
        return respondError(500, 'internal_error', 'Completion request failed.');
    }
}
