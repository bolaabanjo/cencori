/**
 * POST /api/ai/vision/classify
 *
 * Preset: return tags, categories, and a JSON classification of the image.
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
    'Classify this image and return a strict JSON object with these fields: ' +
    '{"primary_category": string, "tags": string[], "objects": string[], ' +
    '"safe_for_work": boolean, "confidence": number (0-1), "summary": string}. ' +
    'Return only the JSON object, no prose.';

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
        request.responseFormat = 'json';
        request.temperature = request.temperature ?? 0;

        const execution = await executeGuardedVision({ ctx, request, endpoint: 'vision/classify' });
        if (!execution.ok) return execution.response;
        const result = execution.result;

        // Try to parse — fall back to raw string if the model returned non-JSON
        let classification: unknown = result.analysis;
        try {
            classification = JSON.parse(result.analysis);
        } catch {
            const match = result.analysis.match(/\{[\s\S]*\}/);
            if (match) {
                try { classification = JSON.parse(match[0]); } catch { /* keep raw */ }
            }
        }

        return addGatewayHeaders(
            NextResponse.json({
                classification,
                raw: result.analysis,
                model: result.model,
                provider: result.provider,
                usage: result.usage,
                cost: result.cost,
            }),
            { requestId: ctx.requestId }
        );
    } catch (error) {
        if (error instanceof VisionValidationError) {
            await logGatewayRequest(ctx, {
                endpoint: 'vision/classify',
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
                endpoint: 'vision/classify',
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
            endpoint: 'vision/classify',
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
