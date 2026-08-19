/**
 * POST /api/ai/vision/describe
 *
 * Preset: describe the image in rich detail.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    validateGatewayRequest,
    addGatewayHeaders,
    handleCorsPreFlight,
    logGatewayRequest,
} from '@/lib/gateway-middleware';
import { parseVisionRequest, VisionValidationError, type VisionAnalyzeRequest } from '@/lib/vision/analyze';
import { executeGuardedVision, visionRequestPayload } from '@/lib/vision/guarded';
import { ProviderError } from '@/lib/providers/errors';
import { mapProviderErrorToHttpResponse } from '@/lib/gateway-reliability';

const DEFAULT_PROMPT =
    'Describe this image in rich detail. Include the subject, setting, objects, ' +
    'colors, mood, and any notable actions or context. Be thorough but concise.';

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function POST(req: NextRequest) {
    const validation = await validateGatewayRequest(req);
    if (!validation.success) return validation.response;
    const ctx = validation.context;

    // Kept outside the try so the failure paths can still log what was sent.
    let requestForLog: VisionAnalyzeRequest | null = null;

    try {
        const request = await parseVisionRequest(req);
        requestForLog = request;
        request.prompt = request.prompt || DEFAULT_PROMPT;

        const execution = await executeGuardedVision({ ctx, request, endpoint: 'vision/describe' });
        if (!execution.ok) return execution.response;
        const result = execution.result;

        return addGatewayHeaders(
            NextResponse.json({ description: result.analysis, model: result.model, provider: result.provider, usage: result.usage, cost: result.cost }),
            { requestId: ctx.requestId }
        );
    } catch (error) {
        if (error instanceof VisionValidationError) {
            await logGatewayRequest(ctx, {
                endpoint: 'vision/describe',
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
                endpoint: 'vision/describe',
                model: 'unknown',
                provider: failure.provider || 'unknown',
                status: 'error',
                errorMessage: failure.message,
                requestPayload: requestForLog ? visionRequestPayload(requestForLog) : undefined,
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

        await logGatewayRequest(ctx, {
            endpoint: 'vision/describe',
            model: 'unknown',
            provider: 'unknown',
            status: 'error',
            errorMessage: message,
            requestPayload: requestForLog ? visionRequestPayload(requestForLog) : undefined,
        });

        return addGatewayHeaders(
            NextResponse.json({ error: status === 400 ? 'bad_request' : 'internal_error', message }, { status }),
            { requestId: ctx.requestId }
        );
    }
}
