/**
 * Speech-to-Text (Transcription) API Route
 *
 * POST /api/ai/audio/transcriptions
 *
 * Transcribes audio across multiple providers (OpenAI Whisper, Deepgram
 * Nova-3, AssemblyAI, Spitch). Accepts multipart/form-data with an audio file.
 *
 * Provider is inferred from `model` (backward compatible: default is
 * whisper-1). Transcription lives in `lib/audio/transcribe.ts`; this route
 * owns the gateway pipeline (input guard, pricing, output guard, logging).
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
import { runGatewayOutputGuard } from '@/lib/gateway/output-guard';
import { deTokenize } from '@/lib/safety/custom-data-rules';
import type { SubscriptionTier } from '@/lib/entitlements';
import { getUsageUnitPricingFromDB } from '@/lib/providers/pricing';
import {
    transcribeAudio,
    resolveProviderModel,
    listTranscriptionModels,
    TranscribeRequestError,
    type TranscriptSegment,
    type STTProvider,
} from '@/lib/audio/transcribe';

function formatTimestamp(seconds: number, separator: ',' | '.'): string {
    const millis = Math.max(0, Math.round(seconds * 1000));
    const hours = Math.floor(millis / 3_600_000);
    const minutes = Math.floor((millis % 3_600_000) / 60_000);
    const secs = Math.floor((millis % 60_000) / 1000);
    const ms = millis % 1000;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}${separator}${String(ms).padStart(3, '0')}`;
}

function formatTimedTranscript(
    segments: TranscriptSegment[] | undefined,
    format: 'srt' | 'vtt',
    tokenMap: Map<string, string>,
): string {
    const separator = format === 'srt' ? ',' : '.';
    const blocks = (segments || []).map((segment, index) => {
        const start = formatTimestamp(Number(segment.start || 0), separator);
        const end = formatTimestamp(Number(segment.end || segment.start || 0), separator);
        const speaker = segment.speaker ? `[${segment.speaker}] ` : '';
        const text = deTokenize(segment.text || '', tokenMap).trim();
        return `${format === 'srt' ? `${index + 1}\n` : ''}${start} --> ${end}\n${speaker}${text}`;
    });
    return `${format === 'vtt' ? 'WEBVTT\n\n' : ''}${blocks.join('\n\n')}${blocks.length ? '\n' : ''}`;
}

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

    // Model/provider are needed in the catch block for logging.
    let model = 'whisper-1';
    let provider = 'openai';

    try {
        const formData = await req.formData();
        const file = formData.get('file') as File | null;
        model = (formData.get('model') as string) || 'whisper-1';
        const language = formData.get('language') as string | null;
        const prompt = formData.get('prompt') as string | null;
        const responseFormat = (formData.get('response_format') as string) || 'json';
        const temperature = parseFloat(formData.get('temperature') as string) || 0;
        const diarize = formData.get('diarize') === 'true';

        const allowedResponseFormats = new Set(['json', 'text', 'srt', 'verbose_json', 'vtt']);
        if (!allowedResponseFormats.has(responseFormat)) {
            return addGatewayHeaders(
                NextResponse.json({ error: 'bad_request', message: 'Unsupported response_format' }, { status: 400 }),
                { requestId: ctx.requestId }
            );
        }
        if (!Number.isFinite(temperature) || temperature < 0 || temperature > 1) {
            return addGatewayHeaders(
                NextResponse.json({ error: 'bad_request', message: 'temperature must be between 0 and 1' }, { status: 400 }),
                { requestId: ctx.requestId }
            );
        }
        if (!file) {
            return addGatewayHeaders(
                NextResponse.json({ error: 'bad_request', message: 'Audio file is required' }, { status: 400 }),
                { requestId: ctx.requestId }
            );
        }

        // Validate file type
        const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/mp4', 'audio/m4a', 'audio/ogg', 'audio/flac'];
        if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|webm|mp4|m4a|ogg|flac|mpeg)$/i)) {
            return addGatewayHeaders(
                NextResponse.json({ error: 'bad_request', message: 'Unsupported audio format. Supported: mp3, wav, webm, mp4, m4a, ogg, flac' }, { status: 400 }),
                { requestId: ctx.requestId }
            );
        }

        // ── Input guard (on the optional prompt) ──
        const inputPipeline = await runGatewayInputPipeline({
            supabase: ctx.supabase,
            projectId: ctx.projectId,
            apiKeyId: ctx.apiKeyId,
            environment: ctx.environment,
            tier: (ctx.tier || 'free') as SubscriptionTier,
            messages: [{ role: 'user', content: prompt || 'Transcribe the supplied audio.' }],
        });
        if (!inputPipeline.ok) {
            await logGatewayRequest(ctx, {
                endpoint: 'audio/transcriptions',
                model,
                provider: formData.get('provider') as string || 'openai',
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

        // Resolve provider/model and confirm pricing BEFORE the billable call.
        const resolved = resolveProviderModel({ provider: (formData.get('provider') as STTProvider | null) ?? undefined, model });
        model = resolved.model;
        provider = resolved.provider;
        const pricing = await getUsageUnitPricingFromDB(resolved.provider, resolved.model, 'minutes');

        // ── Transcribe (validates model, resolves BYOK key, dispatches) ──
        const result = await transcribeAudio(ctx, {
            file,
            provider: resolved.provider,
            model: resolved.model,
            language: language || undefined,
            prompt: inputPipeline.messages[0]?.content ?? prompt ?? undefined,
            temperature,
            diarize,
        });

        // ── Cost tracking (per minute) ──
        const durationMinutes = result.durationSeconds / 60;
        const providerCost = durationMinutes * pricing.unitPriceUsd;
        const cencoriCharge = providerCost * (1 + pricing.cencoriMarkupPercentage / 100);

        const tokenMap = inputPipeline.tokenMap ?? new Map();
        const finalTranscript = deTokenize(result.text, tokenMap);

        const outputCheck = await runGatewayOutputGuard({
            supabase: ctx.supabase,
            projectId: ctx.projectId,
            apiKeyId: ctx.apiKeyId,
            environment: ctx.environment,
            outputText: result.text,
            inputText: inputPipeline.inputText,
            inputSecurity: inputPipeline.inputSecurity,
            conversationHistory: inputPipeline.messages,
        });

        await logGatewayRequest(ctx, {
            endpoint: 'audio/transcriptions',
            model: result.model,
            provider: result.provider,
            status: outputCheck.ok ? 'success' : 'blocked_output',
            costUsd: cencoriCharge,
            providerCostUsd: providerCost,
            cencoriChargeUsd: cencoriCharge,
            markupPercentage: pricing.cencoriMarkupPercentage,
            metadata: {
                file_size: file.size,
                file_type: file.type,
                duration_seconds: result.durationSeconds,
                diarization: Boolean(result.segments?.some((s) => s.speaker)),
            },
            errorMessage: outputCheck.ok ? undefined : outputCheck.message,
        });
        await incrementUsage(ctx, cencoriCharge);

        if (!outputCheck.ok) {
            return addGatewayHeaders(
                NextResponse.json(
                    { error: outputCheck.code, message: outputCheck.message, reasons: outputCheck.reasons },
                    { status: outputCheck.status }
                ),
                { requestId: ctx.requestId }
            );
        }

        // Return based on format
        if (responseFormat === 'text' || responseFormat === 'srt' || responseFormat === 'vtt') {
            const contentType = responseFormat === 'srt'
                ? 'application/x-subrip'
                : responseFormat === 'vtt'
                    ? 'text/vtt'
                    : 'text/plain';
            const bodyText = responseFormat === 'srt' || responseFormat === 'vtt'
                ? formatTimedTranscript(result.segments, responseFormat, tokenMap)
                : finalTranscript;
            return addGatewayHeaders(new NextResponse(bodyText, {
                headers: { 'Content-Type': `${contentType}; charset=utf-8`, 'X-Provider': result.provider },
            }), { requestId: ctx.requestId });
        }

        if (responseFormat === 'verbose_json') {
            return addGatewayHeaders(
                NextResponse.json({
                    text: finalTranscript,
                    language: result.language,
                    duration: result.durationSeconds,
                    provider: result.provider,
                    model: result.model,
                    segments: result.segments?.map((s) => ({ ...s, text: deTokenize(s.text, tokenMap) })),
                    words: result.words,
                }),
                { requestId: ctx.requestId }
            );
        }

        return addGatewayHeaders(
            NextResponse.json({ text: finalTranscript }),
            { requestId: ctx.requestId }
        );

    } catch (error) {
        if (error instanceof TranscribeRequestError) {
            if (error.status >= 500) {
                await logGatewayRequest(ctx, {
                    endpoint: 'audio/transcriptions',
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

        console.error('Transcription API error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        await logGatewayRequest(ctx, {
            endpoint: 'audio/transcriptions',
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
        models: listTranscriptionModels(),
        supported_formats: ['mp3', 'mp4', 'm4a', 'mpeg', 'mpga', 'wav', 'webm', 'ogg', 'flac'],
        response_formats: ['json', 'text', 'srt', 'verbose_json', 'vtt'],
        max_file_size: '25MB',
    });
}
