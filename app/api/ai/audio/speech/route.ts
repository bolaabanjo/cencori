/**
 * Text-to-Speech API Route
 *
 * POST /api/ai/audio/speech
 *
 * Converts text to speech across multiple providers (OpenAI, Deepgram Aura,
 * Cartesia Sonic, Spitch, ElevenLabs). Returns audio as a binary stream.
 *
 * Provider is inferred from `model` (backward compatible: default is OpenAI
 * tts-1). Synthesis lives in `lib/audio/speech.ts`; this route owns the
 * gateway pipeline (input guard, pricing, logging, usage).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    validateGatewayRequest,
    addGatewayHeaders,
    handleCorsPreFlight,
    logGatewayRequest,
    incrementUsage,
} from '@/lib/gateway-middleware';
import { runGatewayInputPipeline } from '@/lib/gateway/input-guard';
import type { SubscriptionTier } from '@/lib/entitlements';
import { getUsageUnitPricingFromDB } from '@/lib/providers/pricing';
import {
    generateSpeech,
    listVoiceModels,
    resolveProviderModel,
    SpeechRequestError,
    type SpeechRequest,
} from '@/lib/audio/speech';

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function POST(req: NextRequest) {
    // ── Gateway validation ──
    const validation = await validateGatewayRequest(req);
    if (!validation.success) {
        return validation.response;
    }
    const ctx = validation.context;

    // Model/provider are needed in the catch block for logging; defaults match the lib.
    let model = 'tts-1';
    let provider = 'openai';

    try {
        const body: SpeechRequest = await req.json();
        model = body.model ?? 'tts-1';
        if (body.provider) provider = body.provider;

        if (typeof body.input !== 'string' || !body.input.trim()) {
            return addGatewayHeaders(
                NextResponse.json({ error: 'bad_request', message: 'Input text is required' }, { status: 400 }),
                { requestId: ctx.requestId }
            );
        }

        // ── Input guard (redaction / blocking) ──
        const inputPipeline = await runGatewayInputPipeline({
            supabase: ctx.supabase,
            projectId: ctx.projectId,
            apiKeyId: ctx.apiKeyId,
            environment: ctx.environment,
            tier: (ctx.tier || 'free') as SubscriptionTier,
            messages: [{ role: 'user', content: body.input }],
        });
        if (!inputPipeline.ok) {
            await logGatewayRequest(ctx, {
                endpoint: 'audio/speech',
                model,
                provider,
                status: 'blocked',
                errorMessage: inputPipeline.message,
            });
            return addGatewayHeaders(
                NextResponse.json(
                    { error: inputPipeline.code, message: inputPipeline.message, reasons: inputPipeline.reasons },
                    { status: inputPipeline.status }
                ),
                { requestId: ctx.requestId }
            );
        }
        const guardedInput = inputPipeline.messages[0]?.content ?? body.input;

        // Resolve provider/model and confirm pricing exists BEFORE the billable
        // provider call, so a missing pricing row fails closed.
        const resolved = resolveProviderModel(body);
        model = resolved.model;
        provider = resolved.provider;
        const pricing = await getUsageUnitPricingFromDB(resolved.provider, resolved.model, 'characters');

        // ── Synthesize (validates voice/format, resolves BYOK key) ──
        const result = await generateSpeech(ctx, { ...body, input: guardedInput });

        // ── Cost tracking (per 1,000 characters) ──
        const providerCost = (result.charCount / 1000) * pricing.unitPriceUsd;
        const cencoriCharge = providerCost * (1 + pricing.cencoriMarkupPercentage / 100);

        await logGatewayRequest(ctx, {
            endpoint: 'audio/speech',
            model: result.model,
            provider: result.provider,
            status: 'success',
            promptTokens: Math.ceil(result.charCount / 4),
            totalTokens: Math.ceil(result.charCount / 4),
            costUsd: cencoriCharge,
            providerCostUsd: providerCost,
            cencoriChargeUsd: cencoriCharge,
            markupPercentage: pricing.cencoriMarkupPercentage,
        });
        await incrementUsage(ctx, cencoriCharge);

        return new Response(result.audio, {
            headers: {
                'Content-Type': result.contentType,
                'Content-Length': result.audio.byteLength.toString(),
                'X-Request-Id': ctx.requestId,
                'X-Provider': result.provider,
            },
        });
    } catch (error) {
        if (error instanceof SpeechRequestError) {
            if (error.status >= 500) {
                await logGatewayRequest(ctx, {
                    endpoint: 'audio/speech',
                    model,
                    provider,
                    status: 'error',
                    errorMessage: error.message,
                });
            }
            return addGatewayHeaders(
                NextResponse.json({ error: error.code, message: error.message }, { status: error.status }),
                { requestId: ctx.requestId }
            );
        }

        console.error('Speech API error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        await logGatewayRequest(ctx, {
            endpoint: 'audio/speech',
            model,
            provider,
            status: 'error',
            errorMessage,
        });

        return addGatewayHeaders(
            NextResponse.json({ error: 'internal_error', message: errorMessage }, { status: 500 }),
            { requestId: ctx.requestId }
        );
    }
}

export async function GET() {
    return NextResponse.json({
        models: listVoiceModels(),
        formats: ['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'],
    });
}
