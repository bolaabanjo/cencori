/**
 * Auto-route chat completions with image content through the Vision analyzer.
 *
 * When a caller sends a chat completion with image content (OpenAI or
 * Anthropic style content parts), we:
 *   1. Detect the image + text prompt in the messages.
 *   2. Upgrade the model to a vision-capable equivalent if needed.
 *   3. Call the Vision analyzer directly.
 *   4. Return an OpenAI-shaped chat completion so the caller doesn't
 *      have to change any parsing code.
 *
 * This bypasses the standard chat pipeline for image requests because
 * UnifiedMessage.content is a string — the standard path can't carry
 * multi-part content to the provider without stringifying it away.
 */

import { NextResponse } from 'next/server';
import { analyzeVision, streamVision, type VisionAnalyzeRequest } from '@/lib/vision/analyze';
import {
    logGatewayRequest,
    incrementUsage,
    addGatewayHeaders,
    type GatewayContext,
} from '@/lib/gateway-middleware';
import { runGatewayOutputGuard } from '@/lib/gateway/output-guard';
import { deTokenize } from '@/lib/safety/custom-data-rules';
import type { SecurityCheckResult } from '@/lib/safety/multi-layer-check';
import type { UnifiedMessage } from '@/lib/providers/base';

type RawMessage = {
    role: string;
    content: unknown;
};

// ── Detection ──────────────────────────────────────────────────

export function hasImageInMessages(messages: RawMessage[]): boolean {
    for (const msg of messages) {
        if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
                if (part && typeof part === 'object') {
                    const p = part as { type?: string; image_url?: unknown; source?: unknown };
                    if (p.type === 'image_url' && p.image_url) return true;
                    if (p.type === 'image' && p.source) return true;
                    if (p.type === 'input_image') return true;
                }
            }
        }
    }
    return false;
}

/**
 * Preserve the conversational text for the shared input guard without
 * serializing base64 image payloads or silently dropping multipart text.
 */
export function toVisionGuardMessages(messages: RawMessage[]): UnifiedMessage[] {
    return messages.map((message) => {
        let content = '';
        if (typeof message.content === 'string') {
            content = message.content;
        } else if (Array.isArray(message.content)) {
            content = message.content
                .map((part) => {
                    if (!part || typeof part !== 'object') return '';
                    const value = part as { type?: string; text?: unknown };
                    return value.type === 'text' && typeof value.text === 'string'
                        ? value.text
                        : '';
                })
                .filter(Boolean)
                .join('\n');
        }

        const role = message.role === 'system'
            || message.role === 'assistant'
            || message.role === 'tool'
            ? message.role
            : 'user';
        return { role, content } as UnifiedMessage;
    });
}

// ── Model upgrade ──────────────────────────────────────────────

// Non-vision → vision-capable equivalent in the same family. Anything already
// vision-capable stays as-is.
const VISION_UPGRADES: Record<string, string> = {
    'gpt-3.5-turbo': 'gpt-4o-mini',
    'gpt-4': 'gpt-4o',
    'claude-3-haiku-20240307': 'claude-3-5-haiku-latest',
    'claude-3-5-haiku-latest': 'claude-3-5-haiku-latest',
    'claude-haiku-4.5': 'claude-sonnet-4-6',
    'claude-haiku-4-5': 'claude-sonnet-4-6',
    'gemini-2.0-flash-lite': 'gemini-2.5-flash-lite',
    'gemini-2.0-flash': 'gemini-2.5-flash',
};

// Prefixes we consider vision-capable out of the box.
const VISION_CAPABLE_PATTERNS = [
    /^gpt-4o/i,
    /^gpt-4-turbo/i,
    /^gpt-4-vision/i,
    /^claude-3-5-sonnet/i,
    /^claude-3-opus/i,
    /^claude-sonnet-4/i,
    /^claude-sonnet-5/i,
    /^gemini-2\.5/i,
    /^gemini-3/i,
];

function isVisionCapable(model: string): boolean {
    return VISION_CAPABLE_PATTERNS.some(p => p.test(model));
}

export interface ModelUpgradeResult {
    model: string;
    upgraded: boolean;
    from?: string;
}

export function upgradeModelForVision(requestedModel: string | null | undefined): ModelUpgradeResult {
    const requested = requestedModel ?? 'gpt-4o-mini';

    if (isVisionCapable(requested)) {
        return { model: requested, upgraded: false };
    }

    // Explicit override table
    const mapped = VISION_UPGRADES[requested];
    if (mapped) {
        return { model: mapped, upgraded: mapped !== requested, from: requested };
    }

    // Family-level fallback
    const lower = requested.toLowerCase();
    if (lower.startsWith('gpt') || lower.startsWith('o1') || lower.startsWith('o3')) {
        return { model: 'gpt-4o-mini', upgraded: true, from: requested };
    }
    if (lower.startsWith('claude')) {
        return { model: 'claude-3-5-sonnet-latest', upgraded: true, from: requested };
    }
    if (lower.startsWith('gemini')) {
        return { model: 'gemini-2.5-flash', upgraded: true, from: requested };
    }

    // Unknown provider — assume caller knows what they're doing
    return { model: requested, upgraded: false };
}

// ── Extraction ─────────────────────────────────────────────────

interface ExtractedVision {
    request: VisionAnalyzeRequest;
    imageCount: number;
}

export function extractVisionRequest(
    messages: RawMessage[],
    model: string,
    opts: { maxTokens?: number; temperature?: number; stream?: boolean }
): ExtractedVision {
    const textParts: string[] = [];
    let image: { url?: string; base64?: string; mimeType?: string } | null = null;
    let imageCount = 0;

    for (const msg of messages) {
        if (typeof msg.content === 'string') {
            if (msg.content) textParts.push(msg.content);
            continue;
        }
        if (!Array.isArray(msg.content)) continue;

        for (const part of msg.content) {
            if (!part || typeof part !== 'object') continue;
            const p = part as {
                type?: string;
                text?: string;
                image_url?: string | { url?: string };
                source?: { type?: string; media_type?: string; data?: string; url?: string };
                image?: string;
            };

            if (p.type === 'text' && typeof p.text === 'string') {
                textParts.push(p.text);
            } else if (p.type === 'image_url' && p.image_url) {
                imageCount += 1;
                // Keep the last image — matches how single-image vision APIs behave
                const url = typeof p.image_url === 'string' ? p.image_url : p.image_url.url;
                if (url) image = { url };
            } else if (p.type === 'image' && p.source) {
                imageCount += 1;
                if (p.source.type === 'base64' && p.source.data) {
                    image = { base64: p.source.data, mimeType: p.source.media_type ?? 'image/jpeg' };
                } else if (p.source.type === 'url' && p.source.url) {
                    image = { url: p.source.url };
                }
            } else if (p.type === 'input_image' && typeof p.image === 'string') {
                imageCount += 1;
                image = { url: p.image };
            }
        }
    }

    if (!image) throw new Error('chat-vision-router: image content declared but no extractable image found');

    return {
        request: {
            image,
            prompt: textParts.join('\n\n') || 'Describe this image in detail.',
            model,
            maxTokens: opts.maxTokens,
            temperature: opts.temperature,
            stream: opts.stream,
        },
        imageCount,
    };
}

// ── Response shaping ───────────────────────────────────────────

function chatCompletionShape(analysis: string, model: string, promptTokens: number, completionTokens: number) {
    return {
        id: `chatcmpl-vision-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{
            index: 0,
            message: { role: 'assistant', content: analysis },
            finish_reason: 'stop',
        }],
        usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
        },
    };
}

function chatStreamChunkShape(delta: string, model: string) {
    return {
        id: `chatcmpl-vision-${Date.now()}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
    };
}

function chatStreamFinalShape(model: string) {
    return {
        id: `chatcmpl-vision-${Date.now()}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    };
}

// ── Main entry point ───────────────────────────────────────────

export interface RunVisionChatArgs {
    ctx: GatewayContext;
    rawMessages: RawMessage[];
    requestedModel: string | null | undefined;
    maxTokens?: number;
    temperature?: number;
    stream?: boolean;
    guardedPrompt: string;
    inputText: string;
    inputSecurity: SecurityCheckResult;
    conversationHistory: UnifiedMessage[];
    tokenMap?: Map<string, string>;
    endUserId?: string | null;
    wireFormat?: 'openai' | 'cencori';
    recordEndUserUsage?: (usageAndCost: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        providerCostUsd: number;
        cencoriChargeUsd: number;
        markupPercentage: number;
    }) => void;
    onCompletion?: (assistantText: string) => void;
}

export async function runVisionChat(args: RunVisionChatArgs): Promise<Response> {
    const {
        ctx,
        rawMessages,
        requestedModel,
        maxTokens,
        temperature,
        stream,
        guardedPrompt,
        inputText,
        inputSecurity,
        conversationHistory,
        tokenMap,
        endUserId,
        wireFormat = 'openai',
        recordEndUserUsage,
        onCompletion,
    } = args;

    const upgrade = upgradeModelForVision(requestedModel);
    const { request: visionRequest, imageCount } = extractVisionRequest(rawMessages, upgrade.model, {
        maxTokens,
        temperature,
        stream,
    });
    visionRequest.prompt = guardedPrompt || 'Describe this image in detail.';

    const guardOutput = async (text: string) => {
        const finalText = tokenMap ? deTokenize(text, tokenMap) : text;
        const result = await runGatewayOutputGuard({
            supabase: ctx.supabase,
            projectId: ctx.projectId,
            apiKeyId: ctx.apiKeyId,
            environment: ctx.environment,
            outputText: finalText,
            inputText,
            inputSecurity,
            conversationHistory,
            endUserId,
        });
        return { finalText, result };
    };

    const settle = async (details: {
        model: string;
        provider: string;
        promptTokens: number;
        completionTokens: number;
        providerCostUsd: number;
        cencoriChargeUsd: number;
        markupPercentage: number;
        blocked: boolean;
        streamed: boolean;
    }) => {
        await logGatewayRequest(ctx, {
            endpoint: 'chat',
            model: details.model,
            provider: details.provider,
            status: details.blocked ? 'blocked_output' : 'success',
            promptTokens: details.promptTokens,
            completionTokens: details.completionTokens,
            totalTokens: details.promptTokens + details.completionTokens,
            costUsd: details.cencoriChargeUsd,
            providerCostUsd: details.providerCostUsd,
            cencoriChargeUsd: details.cencoriChargeUsd,
            markupPercentage: details.markupPercentage,
            endUserId: endUserId || undefined,
            metadata: {
                routed_through: 'vision',
                model_upgraded: upgrade.upgraded,
                model_original: upgrade.from,
                image_count: imageCount,
                streamed: details.streamed,
                output_blocked: details.blocked,
            },
        });
        await incrementUsage(ctx, details.cencoriChargeUsd);
        recordEndUserUsage?.({
            promptTokens: details.promptTokens,
            completionTokens: details.completionTokens,
            totalTokens: details.promptTokens + details.completionTokens,
            providerCostUsd: details.providerCostUsd,
            cencoriChargeUsd: details.cencoriChargeUsd,
            markupPercentage: details.markupPercentage,
        });
    };

    // ── Streaming path ─────────────────────────────────────
    if (stream) {
        const encoder = new TextEncoder();
        const streamHeaders: Record<string, string> = {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Request-Id': ctx.requestId,
        };
        if (upgrade.upgraded) {
            streamHeaders['X-Model-Upgraded'] = 'true';
            streamHeaders['X-Model-Original'] = upgrade.from ?? '';
        }

        const body = new ReadableStream({
            async start(controller) {
                let promptTokens = 0;
                let completionTokens = 0;
                let providerCostUsd = 0;
                let cencoriChargeUsd = 0;
                let markupPercentage = 0;
                let fullText = '';
                let actualModel = upgrade.model;
                let actualProvider = 'vision-router';
                try {
                    for await (const chunk of streamVision(ctx, visionRequest)) {
                        if (chunk.delta) {
                            fullText += chunk.delta;
                        }
                        if (chunk.done && chunk.usage && chunk.cost) {
                            promptTokens = chunk.usage.promptTokens;
                            completionTokens = chunk.usage.completionTokens;
                            providerCostUsd = chunk.cost.providerCostUsd;
                            cencoriChargeUsd = chunk.cost.cencoriChargeUsd;
                            markupPercentage = chunk.cost.markupPercentage;
                            actualModel = chunk.model ?? actualModel;
                            actualProvider = chunk.provider ?? actualProvider;
                        }
                    }

                    const guarded = await guardOutput(fullText);
                    await settle({
                        model: actualModel,
                        provider: actualProvider,
                        promptTokens,
                        completionTokens,
                        providerCostUsd,
                        cencoriChargeUsd,
                        markupPercentage,
                        blocked: !guarded.result.ok,
                        streamed: true,
                    });
                    if (!guarded.result.ok) {
                        const errorPayload = wireFormat === 'cencori'
                            ? { error: 'Security violation detected', message: guarded.result.message }
                            : { error: { message: guarded.result.message, type: 'security_error', code: guarded.result.code } };
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorPayload)}\n\n`));
                        return;
                    }

                    if (guarded.finalText) {
                        controller.enqueue(
                            encoder.encode(`data: ${JSON.stringify(chatStreamChunkShape(guarded.finalText, actualModel))}\n\n`)
                        );
                    }
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify(chatStreamFinalShape(actualModel))}\n\n`)
                    );
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    onCompletion?.(guarded.finalText);
                } catch (err) {
                    const message = err instanceof Error ? err.message : 'vision_chat_error';
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
                    await logGatewayRequest(ctx, {
                        endpoint: 'chat',
                        model: upgrade.model,
                        provider: 'vision-router',
                        status: 'error',
                        errorMessage: message,
                    });
                } finally {
                    controller.close();
                }
            },
        });

        return new Response(body, { headers: streamHeaders });
    }

    // ── Non-streaming path ─────────────────────────────────
    const result = await analyzeVision(ctx, visionRequest);
    const guarded = await guardOutput(result.analysis);
    await settle({
        model: result.model,
        provider: result.provider,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        providerCostUsd: result.cost.providerCostUsd,
        cencoriChargeUsd: result.cost.cencoriChargeUsd,
        markupPercentage: result.cost.markupPercentage,
        blocked: !guarded.result.ok,
        streamed: false,
    });

    if (!guarded.result.ok) {
        const body = wireFormat === 'cencori'
            ? { error: 'Security violation detected', message: guarded.result.message }
            : { error: { message: guarded.result.message, type: 'security_error', code: guarded.result.code } };
        return addGatewayHeaders(NextResponse.json(body, { status: guarded.result.status }), {
            requestId: ctx.requestId,
        });
    }

    const payload: Record<string, unknown> = chatCompletionShape(
        guarded.finalText,
        result.model,
        result.usage.promptTokens,
        result.usage.completionTokens
    );
    if (wireFormat === 'cencori') {
        payload.content = guarded.finalText;
        payload.provider = result.provider;
        payload.cost_usd = result.cost.cencoriChargeUsd;
        payload.fallback_used = result.usedFallback === true;
        if (result.usedFallback) {
            payload.original_model = result.originalModel;
            payload.original_provider = result.originalProvider;
        }
    }
    onCompletion?.(guarded.finalText);

    const response = NextResponse.json(payload);
    if (upgrade.upgraded) {
        response.headers.set('X-Model-Upgraded', 'true');
        response.headers.set('X-Model-Original', upgrade.from ?? '');
    }
    return addGatewayHeaders(response, { requestId: ctx.requestId });
}
