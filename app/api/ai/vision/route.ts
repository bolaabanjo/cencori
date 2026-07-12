/**
 * Vision Analysis API Route
 *
 * POST /api/ai/vision
 *
 * Analyzes an uploaded or referenced image with a vision-capable model.
 * Accepts either multipart/form-data (with `file`) or JSON body
 * (with `image_url` or `image_base64`). Routes across OpenAI / Anthropic / Google.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    validateGatewayRequest,
    addGatewayHeaders,
    handleCorsPreFlight,
    logGatewayRequest,
    incrementUsage,
} from '@/lib/gateway-middleware';
import {
    analyzeVision,
    streamVision,
    listVisionModels,
    parseVisionRequest,
    MAX_VISION_IMAGE_BYTES,
    VISION_PROVIDER_LIMITS,
    UNIVERSAL_VISION_FORMATS,
    VisionValidationError,
} from '@/lib/vision/analyze';
import { ProviderError } from '@/lib/providers/errors';
import { mapProviderErrorToHttpResponse } from '@/lib/gateway-reliability';

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function POST(req: NextRequest) {
    const validation = await validateGatewayRequest(req);
    if (!validation.success) return validation.response;
    const ctx = validation.context;

    try {
        const request = await parseVisionRequest(req);

        // ── Streaming path ─────────────────────────────────────
        if (request.stream) {
            const encoder = new TextEncoder();
            const stream = new ReadableStream({
                async start(controller) {
                    let final: { model: string; provider: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number }; cost: { providerCostUsd: number; cencoriChargeUsd: number; markupPercentage: number } } | null = null;
                    try {
                        for await (const chunk of streamVision(ctx, request)) {
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
                            if (chunk.done && chunk.usage && chunk.cost && chunk.model && chunk.provider) {
                                final = { model: chunk.model, provider: chunk.provider, usage: chunk.usage, cost: chunk.cost };
                            }
                        }
                        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                        if (final) {
                            await logGatewayRequest(ctx, {
                                endpoint: 'vision',
                                model: final.model,
                                provider: final.provider,
                                status: 'success',
                                promptTokens: final.usage.promptTokens,
                                completionTokens: final.usage.completionTokens,
                                totalTokens: final.usage.totalTokens,
                                costUsd: final.cost.cencoriChargeUsd,
                                providerCostUsd: final.cost.providerCostUsd,
                                cencoriChargeUsd: final.cost.cencoriChargeUsd,
                                markupPercentage: final.cost.markupPercentage,
                                metadata: { streamed: true },
                            });
                            await incrementUsage(ctx);
                        }
                    } catch (err) {
                        const message = err instanceof Error ? err.message : 'stream_error';
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
                        await logGatewayRequest(ctx, {
                            endpoint: 'vision',
                            model: 'unknown',
                            provider: 'unknown',
                            status: 'error',
                            errorMessage: message,
                            metadata: { streamed: true },
                        });
                    } finally {
                        controller.close();
                    }
                },
            });
            return new Response(stream, {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache, no-transform',
                    'Connection': 'keep-alive',
                    'X-Request-Id': ctx.requestId,
                },
            });
        }

        const result = await analyzeVision(ctx, request);

        await logGatewayRequest(ctx, {
            endpoint: 'vision',
            model: result.model,
            provider: result.provider,
            status: 'success',
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            totalTokens: result.usage.totalTokens,
            costUsd: result.cost.cencoriChargeUsd,
            providerCostUsd: result.cost.providerCostUsd,
            cencoriChargeUsd: result.cost.cencoriChargeUsd,
            markupPercentage: result.cost.markupPercentage,
        });
        await incrementUsage(ctx);

        return addGatewayHeaders(NextResponse.json(result), { requestId: ctx.requestId });
    } catch (error) {
        if (error instanceof VisionValidationError) {
            await logGatewayRequest(ctx, {
                endpoint: 'vision',
                model: 'unknown',
                provider: 'unknown',
                status: 'error',
                errorMessage: error.message,
                metadata: { code: error.code, ...error.details },
            });
            return addGatewayHeaders(
                NextResponse.json({ error: error.code, message: error.message, ...error.details }, { status: 400 }),
                { requestId: ctx.requestId }
            );
        }

        // Typed provider failures (quota exhausted, bad key, provider outage)
        // map to honest statuses — a provider 429 must never surface as a
        // Cencori 500.
        if (error instanceof ProviderError) {
            const failure = mapProviderErrorToHttpResponse(error);
            await logGatewayRequest(ctx, {
                endpoint: 'vision',
                model: 'unknown',
                provider: failure.provider || 'unknown',
                status: 'error',
                errorMessage: failure.message,
            });
            return addGatewayHeaders(
                NextResponse.json(
                    {
                        error: failure.error,
                        message: failure.message,
                        provider: failure.provider,
                        ...(failure.retryAfter != null ? { retry_after: failure.retryAfter } : {}),
                    },
                    { status: failure.status }
                ),
                { requestId: ctx.requestId }
            );
        }

        const message = error instanceof Error ? error.message : 'Unknown error';
        const status = /required|invalid|unsupported|exceeds|No .* API key/i.test(message) ? 400 : 500;
        console.error('[Vision] Error:', error);

        await logGatewayRequest(ctx, {
            endpoint: 'vision',
            model: 'unknown',
            provider: 'unknown',
            status: 'error',
            errorMessage: message,
        });

        return addGatewayHeaders(
            NextResponse.json({ error: status === 400 ? 'bad_request' : 'internal_error', message }, { status }),
            { requestId: ctx.requestId }
        );
    }
}

export async function GET() {
    return NextResponse.json({
        endpoint: '/api/ai/vision',
        description: 'Analyze an image with a vision-capable model.',
        accepts: ['multipart/form-data', 'application/json'],
        providers: ['openai', 'anthropic', 'google'],
        models: listVisionModels(),
        tasks: [
            { path: '/api/ai/vision', description: 'General image analysis with your own prompt' },
            { path: '/api/ai/vision/describe', description: 'Describe the image in detail' },
            { path: '/api/ai/vision/ocr', description: 'Extract all text visible in the image' },
            { path: '/api/ai/vision/classify', description: 'Return tags, categories, and a JSON classification' },
        ],
        limits: {
            maxImageBytes: MAX_VISION_IMAGE_BYTES,
            maxImageMB: MAX_VISION_IMAGE_BYTES / (1024 * 1024),
            perProvider: VISION_PROVIDER_LIMITS,
            universalFormats: UNIVERSAL_VISION_FORMATS,
            recommendation: 'Use JPEG, PNG, WEBP, or GIF for max compatibility across all providers.',
        },
    });
}
