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
} from '@/lib/gateway-middleware';
import {
    listVisionModels,
    parseVisionRequest,
    MAX_VISION_IMAGE_BYTES,
    VISION_PROVIDER_LIMITS,
    UNIVERSAL_VISION_FORMATS,
    VisionValidationError,
} from '@/lib/vision/analyze';
import { executeGuardedVision } from '@/lib/vision/guarded';
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
        const requestedStream = request.stream === true;
        const execution = await executeGuardedVision({ ctx, request, endpoint: 'vision' });
        if (!execution.ok) return execution.response;
        const result = execution.result;

        // ── Streaming path ─────────────────────────────────────
        if (requestedStream) {
            const encoder = new TextEncoder();
            const stream = new ReadableStream({
                start(controller) {
                    // Buffering is deliberate: direct vision streams follow
                    // the same complete-output guard as chat streams.
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: result.analysis })}\n\n`));
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        done: true,
                        model: result.model,
                        provider: result.provider,
                        usage: result.usage,
                        cost: result.cost,
                        usedFallback: result.usedFallback,
                    })}\n\n`));
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    controller.close();
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
