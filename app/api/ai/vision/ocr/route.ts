/**
 * POST /api/ai/vision/ocr
 *
 * Preset: extract all text visible in the image.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    validateGatewayRequest,
    addGatewayHeaders,
    handleCorsPreFlight,
    logGatewayRequest,
    incrementUsage,
} from '@/lib/gateway-middleware';
import { analyzeVision, parseVisionRequest, VisionValidationError } from '@/lib/vision/analyze';

const DEFAULT_PROMPT =
    'Extract every piece of text visible in this image. Preserve the reading order ' +
    'and line breaks as best you can. Do not paraphrase or summarize. If no text is visible, return an empty string.';

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function POST(req: NextRequest) {
    const validation = await validateGatewayRequest(req);
    if (!validation.success) return validation.response;
    const ctx = validation.context;

    try {
        const request = await parseVisionRequest(req);
        request.prompt = request.prompt || DEFAULT_PROMPT;
        request.temperature = request.temperature ?? 0;

        const result = await analyzeVision(ctx, request);

        await logGatewayRequest(ctx, {
            endpoint: 'vision/ocr',
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

        return addGatewayHeaders(
            NextResponse.json({ text: result.analysis, model: result.model, provider: result.provider, usage: result.usage, cost: result.cost }),
            { requestId: ctx.requestId }
        );
    } catch (error) {
        if (error instanceof VisionValidationError) {
            await logGatewayRequest(ctx, {
                endpoint: 'vision/ocr',
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

        const message = error instanceof Error ? error.message : 'Unknown error';
        const status = /required|invalid|unsupported|exceeds|No .* API key/i.test(message) ? 400 : 500;

        await logGatewayRequest(ctx, {
            endpoint: 'vision/ocr',
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
