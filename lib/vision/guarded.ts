import { NextResponse } from 'next/server';
import type { GatewayContext } from '@/lib/gateway-middleware';
import { addGatewayHeaders, incrementUsage, logGatewayRequest } from '@/lib/gateway-middleware';
import { runGatewayInputPipeline } from '@/lib/gateway/input-guard';
import { runGatewayOutputGuard } from '@/lib/gateway/output-guard';
import { deTokenize } from '@/lib/safety/custom-data-rules';
import type { SubscriptionTier } from '@/lib/entitlements';
import { analyzeVision, type VisionAnalyzeRequest, type VisionAnalyzeResult } from './analyze';
import { redactBinaryRef, textResponsePayload, toLoggedText } from '@/lib/gateway/log-payload';

/**
 * Describe the images without embedding them: base64 frames are megabytes that
 * would bloat every log row and tell the reader nothing.
 */
function describeVisionImages(request: VisionAnalyzeRequest): string[] {
    const images = request.images?.length ? request.images : request.image ? [request.image] : [];
    return images.map((image) => {
        if (image.url) return redactBinaryRef(image.url);
        if (image.base64) return `[inline ${image.mimeType || 'image'}, ${image.base64.length} chars]`;
        return '[image]';
    });
}

export function visionRequestPayload(request: VisionAnalyzeRequest, model?: string) {
    const images = describeVisionImages(request);
    return {
        messages: [
            {
                role: 'user',
                content: [
                    toLoggedText(request.prompt || 'Describe this image in detail.'),
                    ...images.map((image) => `[image: ${image}]`),
                ].join('\n'),
            },
        ],
        model: model || request.model,
        images: images.length,
    };
}

export type GuardedVisionResult =
    | { ok: true; result: VisionAnalyzeResult }
    | { ok: false; response: NextResponse };

export async function executeGuardedVision(params: {
    ctx: GatewayContext;
    request: VisionAnalyzeRequest;
    endpoint: string;
    endUserId?: string | null;
}): Promise<GuardedVisionResult> {
    const { ctx, request, endpoint, endUserId } = params;
    const inputPipeline = await runGatewayInputPipeline({
        supabase: ctx.supabase,
        projectId: ctx.projectId,
        apiKeyId: ctx.apiKeyId,
        environment: ctx.environment,
        tier: (ctx.tier || 'free') as SubscriptionTier,
        messages: [{ role: 'user', content: request.prompt || 'Describe this image in detail.' }],
        endUserId,
    });

    if (!inputPipeline.ok) {
        // Without this a guard-blocked vision request leaves no log row at all.
        await logGatewayRequest(ctx, {
            endpoint,
            model: request.model || 'unknown',
            provider: 'unknown',
            status: 'blocked',
            errorMessage: inputPipeline.message,
            endUserId: endUserId || undefined,
            requestPayload: visionRequestPayload(request),
        });
        return {
            ok: false,
            response: addGatewayHeaders(
                NextResponse.json(
                    {
                        error: inputPipeline.code,
                        message: inputPipeline.message,
                        ...(inputPipeline.reasons ? { reasons: inputPipeline.reasons } : {}),
                    },
                    { status: inputPipeline.status }
                ),
                { requestId: ctx.requestId }
            ),
        };
    }

    request.prompt = inputPipeline.messages
        .filter((message) => message.role === 'user')
        .map((message) => message.content)
        .join('\n');
    request.stream = false;

    const result = await analyzeVision(ctx, request);
    const outputCheck = await runGatewayOutputGuard({
        supabase: ctx.supabase,
        projectId: ctx.projectId,
        apiKeyId: ctx.apiKeyId,
        environment: ctx.environment,
        outputText: result.analysis,
        inputText: inputPipeline.inputText,
        inputSecurity: inputPipeline.inputSecurity,
        conversationHistory: inputPipeline.messages,
        endUserId,
    });

    await logGatewayRequest(ctx, {
        endpoint,
        model: result.model,
        provider: result.provider,
        status: outputCheck.ok ? 'success' : 'blocked_output',
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        costUsd: result.cost.cencoriChargeUsd,
        providerCostUsd: result.cost.providerCostUsd,
        cencoriChargeUsd: result.cost.cencoriChargeUsd,
        markupPercentage: result.cost.markupPercentage,
        endUserId: endUserId || undefined,
        errorMessage: outputCheck.ok ? undefined : outputCheck.message,
        requestPayload: visionRequestPayload(request, result.model),
        // A blocked analysis is never returned, so it is not logged.
        responsePayload: outputCheck.ok ? textResponsePayload(result.analysis) : undefined,
    });
    await incrementUsage(ctx, result.cost.cencoriChargeUsd);

    if (!outputCheck.ok) {
        return {
            ok: false,
            response: addGatewayHeaders(
                NextResponse.json(
                    { error: outputCheck.code, message: outputCheck.message, reasons: outputCheck.reasons },
                    { status: outputCheck.status }
                ),
                { requestId: ctx.requestId }
            ),
        };
    }

    const finalAnalysis = deTokenize(result.analysis, inputPipeline.tokenMap ?? new Map());

    return { ok: true, result: { ...result, analysis: finalAnalysis } };
}
