/**
 * Speech-to-Text (Transcription) API Route
 * 
 * POST /api/ai/audio/transcriptions
 * 
 * Transcribes audio to text using OpenAI Whisper.
 * Accepts multipart/form-data with audio file.
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { decryptApiKey } from '@/lib/encryption';
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

type VerboseTranscription = {
    text?: string;
    duration?: number;
    language?: string;
    segments?: Array<{ start?: number; end?: number; text?: string }>;
};

function formatTimestamp(seconds: number, separator: ',' | '.'): string {
    const millis = Math.max(0, Math.round(seconds * 1000));
    const hours = Math.floor(millis / 3_600_000);
    const minutes = Math.floor((millis % 3_600_000) / 60_000);
    const secs = Math.floor((millis % 60_000) / 1000);
    const ms = millis % 1000;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}${separator}${String(ms).padStart(3, '0')}`;
}

function formatTimedTranscript(
    segments: VerboseTranscription['segments'],
    format: 'srt' | 'vtt',
    tokenMap: Map<string, string>,
): string {
    const separator = format === 'srt' ? ',' : '.';
    const blocks = (segments || []).map((segment, index) => {
        const start = formatTimestamp(Number(segment.start || 0), separator);
        const end = formatTimestamp(Number(segment.end || segment.start || 0), separator);
        const text = deTokenize(segment.text || '', tokenMap).trim();
        return `${format === 'srt' ? `${index + 1}\n` : ''}${start} --> ${end}\n${text}`;
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

    try {
        // Parse form data
        const formData = await req.formData();
        const file = formData.get('file') as File | null;
        const model = (formData.get('model') as string) || 'whisper-1';
        const language = formData.get('language') as string | null;
        const prompt = formData.get('prompt') as string | null;
        const responseFormat = (formData.get('response_format') as string) || 'json';
        const temperature = parseFloat(formData.get('temperature') as string) || 0;

        if (model !== 'whisper-1') {
            return addGatewayHeaders(
                NextResponse.json({ error: 'bad_request', message: 'Unsupported transcription model' }, { status: 400 }),
                { requestId: ctx.requestId }
            );
        }
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

        // Check file size (max 25MB for Whisper)
        if (file.size > 25 * 1024 * 1024) {
            return addGatewayHeaders(
                NextResponse.json({ error: 'bad_request', message: 'File size exceeds maximum of 25MB' }, { status: 400 }),
                { requestId: ctx.requestId }
            );
        }

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
                provider: 'openai',
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

        // Get OpenAI API key (BYOK or default)
        let openaiKey: string | null = null;

        const { data: providerKey } = await ctx.supabase
            .from('provider_keys')
            .select('encrypted_key, is_active')
            .eq('project_id', ctx.projectId)
            .eq('provider', 'openai')
            .eq('is_active', true)
            .single();

        if (providerKey?.encrypted_key) {
            openaiKey = decryptApiKey(providerKey.encrypted_key, ctx.organizationId);
        } else {
            openaiKey = process.env.OPENAI_API_KEY ?? null;
        }

        if (!openaiKey) {
            return addGatewayHeaders(
                NextResponse.json({ error: 'provider_not_configured', message: 'No OpenAI API key configured' }, { status: 400 }),
                { requestId: ctx.requestId }
            );
        }

        const pricing = await getUsageUnitPricingFromDB('openai', model, 'minutes');
        const client = new OpenAI({ apiKey: openaiKey, timeout: 55_000, maxRetries: 0 });

        const transcriptionParams: OpenAI.Audio.TranscriptionCreateParams = {
            file,
            model,
            // Always request duration and segments so billing and timed output
            // are derived from provider metadata instead of file-size guesses.
            response_format: 'verbose_json',
            timestamp_granularities: ['segment'],
            temperature,
        };

        if (language) transcriptionParams.language = language;
        if (prompt) transcriptionParams.prompt = inputPipeline.messages[0]?.content ?? prompt;

        const response = await client.audio.transcriptions.create(transcriptionParams) as VerboseTranscription;

        const durationSeconds = Number(response.duration)
            || Number(response.segments?.at(-1)?.end)
            || 0;
        if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
            throw new Error('Transcription provider did not return a billable audio duration');
        }
        const durationMinutes = durationSeconds / 60;
        const providerCost = durationMinutes * pricing.unitPriceUsd;
        const cencoriCharge = providerCost * (1 + pricing.cencoriMarkupPercentage / 100);

        const rawTranscript = response.text || '';
        const tokenMap = inputPipeline.tokenMap ?? new Map();
        const finalTranscript = deTokenize(rawTranscript, tokenMap);
        const outputCheck = await runGatewayOutputGuard({
            supabase: ctx.supabase,
            projectId: ctx.projectId,
            apiKeyId: ctx.apiKeyId,
            environment: ctx.environment,
            outputText: rawTranscript,
            inputText: inputPipeline.inputText,
            inputSecurity: inputPipeline.inputSecurity,
            conversationHistory: inputPipeline.messages,
        });

        await logGatewayRequest(ctx, {
            endpoint: 'audio/transcriptions',
            model,
            provider: 'openai',
            status: outputCheck.ok ? 'success' : 'blocked_output',
            costUsd: cencoriCharge,
            providerCostUsd: providerCost,
            cencoriChargeUsd: cencoriCharge,
            markupPercentage: pricing.cencoriMarkupPercentage,
            metadata: {
                file_size: file.size,
                file_type: file.type,
                duration_seconds: durationSeconds,
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
                ? formatTimedTranscript(response.segments, responseFormat, tokenMap)
                : finalTranscript;
            return addGatewayHeaders(new NextResponse(bodyText, {
                headers: { 'Content-Type': `${contentType}; charset=utf-8` },
            }), { requestId: ctx.requestId });
        }

        return addGatewayHeaders(
            NextResponse.json(
                responseFormat === 'verbose_json'
                    ? { ...response, text: finalTranscript }
                    : { text: finalTranscript }
            ),
            { requestId: ctx.requestId }
        );

    } catch (error) {
        console.error('Transcription API error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        await logGatewayRequest(ctx, {
            endpoint: 'audio/transcriptions',
            model: 'whisper-1',
            provider: 'openai',
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
        models: ['whisper-1'],
        supported_formats: ['mp3', 'mp4', 'm4a', 'mpeg', 'mpga', 'wav', 'webm', 'ogg', 'flac'],
        response_formats: ['json', 'text', 'srt', 'verbose_json', 'vtt'],
        max_file_size: '25MB',
    });
}
