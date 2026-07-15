import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { decryptApiKey } from '@/lib/encryption';
import { getGoogleApiKey } from '@/lib/providers/google-env';
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
import { createAdminClient } from '@/lib/supabaseAdmin';

// Supported image generation providers
type ImageProvider = 'openai' | 'google';

interface ImageGenerationRequest {
    prompt: string;
    model?: string;
    n?: number;
    size?: '256x256' | '512x512' | '1024x1024' | '1024x1792' | '1792x1024' | '1536x1024' | '1024x1536';
    quality?: 'low' | 'medium' | 'high' | 'standard' | 'hd';
    style?: 'vivid' | 'natural';
    responseFormat?: 'url' | 'b64_json';
}

interface GeneratedImage {
    url?: string;
    b64_json?: string;
    revisedPrompt?: string;
}

interface ImageGenerationResponse {
    images: GeneratedImage[];
    model: string;
    provider: string;
}

// Supported models with metadata
const IMAGE_MODELS = {
    'gpt-image-2': { provider: 'openai' as const, apiModel: 'gpt-image-2', description: 'State-of-the-art image generation model' },
    'gpt-image-1.5': { provider: 'openai' as const, apiModel: 'gpt-image-1.5', description: 'Best text rendering, top ELO rating' },
    'gpt-image-1': { provider: 'openai' as const, apiModel: 'gpt-image-1', description: 'ChatGPT image generation' },
    'dall-e-3': { provider: 'openai' as const, apiModel: 'dall-e-3', description: 'High quality, creative' },
    'dall-e-2': { provider: 'openai' as const, apiModel: 'dall-e-2', description: 'Fast, cost-effective' },
    'gemini-3-pro-image': { provider: 'google' as const, apiModel: 'gemini-2.0-flash-preview-image-generation', description: 'High photorealism, fast' },
    'nano-banana-pro': { provider: 'google' as const, apiModel: 'gemini-2.0-flash-preview-image-generation', description: 'Alias for Gemini 3 Pro Image' },
    'gemini-3.1-flash-image': { provider: 'google' as const, apiModel: 'gemini-3.1-flash-image-generation', description: 'Nano Banana 2 — reasoning-guided, up to 4K' },
    'nano-banana-2': { provider: 'google' as const, apiModel: 'gemini-3.1-flash-image-generation', description: 'Alias for Gemini 3.1 Flash Image' },
    'imagen-3': { provider: 'google' as const, apiModel: 'imagen-3.0-generate-002', description: 'Google Imagen 3' },
} as const;

type SupportedModel = keyof typeof IMAGE_MODELS;

function getProviderForModel(model: string): ImageProvider {
    const modelLower = model.toLowerCase().replace(/\s+/g, '-');
    if (modelLower in IMAGE_MODELS) return IMAGE_MODELS[modelLower as SupportedModel].provider;
    if (modelLower.includes('gemini') || modelLower.includes('imagen') || modelLower.includes('nano-banana')) return 'google';
    if (modelLower.includes('dall-e') || modelLower.includes('dalle') || modelLower.includes('gpt-image')) return 'openai';
    return 'openai';
}

function normalizeModelName(model: string): { normalized: string; apiModel: string } {
    const modelLower = model.toLowerCase().replace(/\s+/g, '-');
    if (modelLower in IMAGE_MODELS) {
        const config = IMAGE_MODELS[modelLower as SupportedModel];
        return { normalized: modelLower, apiModel: config.apiModel };
    }
    if (modelLower === 'dalle-3' || modelLower === 'dalle3') return { normalized: 'dall-e-3', apiModel: 'dall-e-3' };
    if (modelLower === 'dalle-2' || modelLower === 'dalle2') return { normalized: 'dall-e-2', apiModel: 'dall-e-2' };
    if (modelLower.includes('gpt') && modelLower.includes('image') && (modelLower.includes('2.0') || modelLower.endsWith('-2') || modelLower.includes('image-2'))) {
        return { normalized: 'gpt-image-2', apiModel: 'gpt-image-2' };
    }
    if (modelLower.includes('gpt') && modelLower.includes('image') && modelLower.includes('1.5')) return { normalized: 'gpt-image-1.5', apiModel: 'gpt-image-1.5' };
    if (modelLower.includes('gpt') && modelLower.includes('image')) return { normalized: 'gpt-image-1', apiModel: 'gpt-image-1' };
    if (modelLower.includes('gemini') && modelLower.includes('image')) return { normalized: 'gemini-3-pro-image', apiModel: 'gemini-2.0-flash-preview-image-generation' };
    if (modelLower.includes('nano-banana-2') || modelLower.includes('nano banana 2')) return { normalized: 'nano-banana-2', apiModel: 'gemini-3.1-flash-image-generation' };
    if (modelLower.includes('nano') || modelLower.includes('banana')) return { normalized: 'nano-banana-pro', apiModel: 'gemini-2.0-flash-preview-image-generation' };
    if (modelLower.includes('imagen')) return { normalized: 'imagen-3', apiModel: 'imagen-3.0-generate-002' };
    return { normalized: model, apiModel: model };
}

function mapOpenAIQuality(quality?: ImageGenerationRequest['quality']): 'low' | 'medium' | 'high' | undefined {
    if (!quality) return undefined;
    if (quality === 'standard') return 'medium';
    if (quality === 'hd') return 'high';
    return quality;
}

async function generateWithOpenAI(client: OpenAI, request: ImageGenerationRequest, apiModel: string): Promise<ImageGenerationResponse> {
    const isGptImage = apiModel.startsWith('gpt-image');
    const openaiQuality = mapOpenAIQuality(request.quality);
    const response = await client.images.generate({
        model: apiModel,
        prompt: request.prompt,
        n: isGptImage ? 1 : (request.n ?? 1),
        size: request.size || '1024x1024',
        quality: isGptImage ? openaiQuality : request.quality,
        style: isGptImage ? undefined : request.style,
        response_format: isGptImage ? 'b64_json' : (request.responseFormat || 'url'),
    });
    return {
        images: (response.data ?? []).map(item => ({
            url: item.url,
            b64_json: item.b64_json,
            revisedPrompt: item.revised_prompt,
        })),
        model: apiModel,
        provider: 'openai',
    };
}

async function generateWithGoogle(apiKey: string, request: ImageGenerationRequest, apiModel: string): Promise<ImageGenerationResponse> {
    const genAI = new GoogleGenAI({ apiKey });
    const response = await genAI.models.generateContent({
        model: apiModel,
        contents: request.prompt,
        config: {
            responseModalities: ['TEXT', 'IMAGE'],
            ...(apiModel.includes('imagen') ? {} : {}),
        },
    });
    const images: GeneratedImage[] = [];
    if (response.candidates) {
        for (const candidate of response.candidates) {
            if (candidate.content?.parts) {
                for (const part of candidate.content.parts) {
                    if (part.inlineData) {
                        images.push({ b64_json: part.inlineData.data });
                    }
                }
            }
        }
    }
    return { images, model: apiModel, provider: 'google' };
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
        const body = await req.json() as ImageGenerationRequest;
        const { prompt, model: requestedModel } = body;

        if (typeof prompt !== 'string' || !prompt.trim()) {
            return addGatewayHeaders(
                NextResponse.json({ error: 'Missing required field: prompt' }, { status: 400 }),
                { requestId: ctx.requestId }
            );
        }
        if (requestedModel !== undefined && typeof requestedModel !== 'string') {
            return addGatewayHeaders(
                NextResponse.json({ error: 'model must be a string' }, { status: 400 }),
                { requestId: ctx.requestId }
            );
        }
        if (prompt.length > 32_000) {
            return addGatewayHeaders(
                NextResponse.json({ error: 'Prompt exceeds maximum length of 32000 characters' }, { status: 400 }),
                { requestId: ctx.requestId }
            );
        }
        if (body.n !== undefined && (!Number.isInteger(body.n) || body.n < 1 || body.n > 10)) {
            return addGatewayHeaders(
                NextResponse.json({ error: 'n must be an integer between 1 and 10' }, { status: 400 }),
                { requestId: ctx.requestId }
            );
        }
        const allowedSizes = new Set(['256x256', '512x512', '1024x1024', '1024x1792', '1792x1024', '1536x1024', '1024x1536']);
        if (body.size !== undefined && (typeof body.size !== 'string' || !allowedSizes.has(body.size))) {
            return addGatewayHeaders(
                NextResponse.json({ error: 'Unsupported image size' }, { status: 400 }),
                { requestId: ctx.requestId }
            );
        }
        if (body.quality !== undefined
            && !['low', 'medium', 'high', 'standard', 'hd'].includes(body.quality)) {
            return addGatewayHeaders(
                NextResponse.json({ error: 'Unsupported image quality' }, { status: 400 }),
                { requestId: ctx.requestId }
            );
        }
        if (body.style !== undefined && !['vivid', 'natural'].includes(body.style)) {
            return addGatewayHeaders(
                NextResponse.json({ error: 'Unsupported image style' }, { status: 400 }),
                { requestId: ctx.requestId }
            );
        }
        if (body.responseFormat !== undefined && !['url', 'b64_json'].includes(body.responseFormat)) {
            return addGatewayHeaders(
                NextResponse.json({ error: 'Unsupported responseFormat' }, { status: 400 }),
                { requestId: ctx.requestId }
            );
        }

        const inputPipeline = await runGatewayInputPipeline({
            supabase: ctx.supabase,
            projectId: ctx.projectId,
            apiKeyId: ctx.apiKeyId,
            environment: ctx.environment,
            tier: (ctx.tier || 'free') as SubscriptionTier,
            messages: [{ role: 'user', content: prompt }],
        });
        if (!inputPipeline.ok) {
            await logGatewayRequest(ctx, {
                endpoint: 'images/generate',
                model: requestedModel || 'unknown',
                provider: 'unknown',
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
        body.prompt = inputPipeline.messages[0]?.content ?? prompt;

        const { normalized: model, apiModel } = normalizeModelName(requestedModel || 'dall-e-3');
        if (!(model in IMAGE_MODELS)) {
            return addGatewayHeaders(
                NextResponse.json({ error: 'unsupported_model', message: `Unsupported image model: ${model}` }, { status: 400 }),
                { requestId: ctx.requestId }
            );
        }
        const provider = getProviderForModel(model);
        const size = body.size || '1024x1024';
        const quality = apiModel.startsWith('gpt-image')
            ? (mapOpenAIQuality(body.quality) || 'medium')
            : (body.quality || 'standard');
        const requestedImageCount = body.n ?? 1;
        if (requestedImageCount > 1 && apiModel !== 'dall-e-2') {
            return addGatewayHeaders(
                NextResponse.json({ error: 'unsupported_n', message: `${model} only supports n=1 through this endpoint.` }, { status: 400 }),
                { requestId: ctx.requestId }
            );
        }
        if (provider === 'google'
            && (size !== '1024x1024' || quality !== 'standard' || body.style !== undefined || body.responseFormat === 'url')) {
            return addGatewayHeaders(
                NextResponse.json({
                    error: 'unsupported_image_options',
                    message: 'Google image models currently support only 1024x1024, standard quality, b64_json output, and no style option.',
                }, { status: 400 }),
                { requestId: ctx.requestId }
            );
        }
        body.size = size;
        body.quality = quality;

        // Image cost varies by model, size, and quality. Require an exact
        // deployed variant row instead of falling back to a guessed flat fee.
        const { data: imagePricing, error: imagePricingError } = await ctx.supabase
            .from('gateway_image_pricing')
            .select('price_per_image, cencori_markup_percentage')
            .eq('provider', provider)
            .eq('model_name', model)
            .eq('size', size)
            .eq('quality', quality)
            .eq('is_active', true)
            .maybeSingle();
        const pricePerImage = Number(imagePricing?.price_per_image);
        const markupPercentage = Number(imagePricing?.cencori_markup_percentage);
        if (imagePricingError || !imagePricing
            || !Number.isFinite(pricePerImage) || pricePerImage < 0
            || !Number.isFinite(markupPercentage) || markupPercentage < 0) {
            return addGatewayHeaders(
                NextResponse.json({
                    error: 'pricing_unavailable',
                    message: `Exact image pricing is not configured for ${model} (${size}, ${quality}).`,
                }, { status: 503 }),
                { requestId: ctx.requestId }
            );
        }

        // Get API key for provider (BYOK or default)
        let providerApiKey: string | undefined;

        const { data: providerKey } = await ctx.supabase
            .from('provider_keys')
            .select('encrypted_key, is_active')
            .eq('project_id', ctx.projectId)
            .eq('provider', provider)
            .single();

        if (providerKey?.is_active && providerKey.encrypted_key) {
            providerApiKey = decryptApiKey(providerKey.encrypted_key, ctx.organizationId);
        } else {
            if (provider === 'openai') providerApiKey = process.env.OPENAI_API_KEY;
            else if (provider === 'google') providerApiKey = getGoogleApiKey() || undefined;
        }

        if (!providerApiKey) {
            return addGatewayHeaders(
                NextResponse.json({
                    error: `No API key configured for ${provider}`,
                    message: `Please add your ${provider} API key in project settings.`,
                    supportedModels: Object.entries(IMAGE_MODELS)
                        .filter(([, config]) => config.provider === provider)
                        .map(([name, config]) => ({ name, description: config.description })),
                }, { status: 400 }),
                { requestId: ctx.requestId }
            );
        }

        // Generate images
        let result: ImageGenerationResponse;
        if (provider === 'openai') {
            const client = new OpenAI({ apiKey: providerApiKey, timeout: 55_000, maxRetries: 0 });
            result = await generateWithOpenAI(client, body, apiModel);
        } else if (provider === 'google') {
            result = await generateWithGoogle(providerApiKey, body, apiModel);
        } else {
            return addGatewayHeaders(
                NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 }),
                { requestId: ctx.requestId }
            );
        }

        // Review the provider's raw revised prompt before restoring any
        // tokenized request values.
        const textualOutput = result.images
            .map(image => image.revisedPrompt)
            .filter((value): value is string => Boolean(value))
            .join('\n');
        const outputCheck = textualOutput
            ? await runGatewayOutputGuard({
                supabase: ctx.supabase,
                projectId: ctx.projectId,
                apiKeyId: ctx.apiKeyId,
                environment: ctx.environment,
                outputText: textualOutput,
                inputText: inputPipeline.inputText,
                inputSecurity: inputPipeline.inputSecurity,
                conversationHistory: inputPipeline.messages,
            })
            : { ok: true as const };

        // Cost tracking (fixed per-image pricing)
        const providerCost = requestedImageCount * pricePerImage;
        const cencoriCharge = providerCost * (1 + markupPercentage / 100);

        await logGatewayRequest(ctx, {
            endpoint: 'images/generate',
            model,
            provider,
            status: outputCheck.ok ? 'success' : 'blocked_output',
            costUsd: cencoriCharge,
            providerCostUsd: providerCost,
            cencoriChargeUsd: cencoriCharge,
            markupPercentage,
            metadata: { prompt_length: prompt.length, numImages: requestedImageCount, size, quality },
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

        result.images = result.images.map(image => ({
            ...image,
            revisedPrompt: image.revisedPrompt
                ? deTokenize(image.revisedPrompt, inputPipeline.tokenMap ?? new Map())
                : image.revisedPrompt,
        }));

        return addGatewayHeaders(
            NextResponse.json(result),
            { requestId: ctx.requestId }
        );

    } catch (error) {
        console.error('[ImageGeneration] Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        await logGatewayRequest(ctx, {
            endpoint: 'images/generate',
            model: 'unknown',
            provider: 'unknown',
            status: 'error',
            errorMessage,
        });

        return addGatewayHeaders(
            NextResponse.json({ error: 'Image generation failed', message: errorMessage }, { status: 500 }),
            { requestId: ctx.requestId }
        );
    }
}

export async function GET() {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from('gateway_image_pricing')
        .select('provider, model_name, size, quality')
        .eq('is_active', true);
    if (error) {
        return NextResponse.json(
            { error: 'image_catalog_unavailable', message: 'Image pricing catalog is unavailable.' },
            { status: 503 },
        );
    }
    const variants = (data || []).filter(row => row.model_name in IMAGE_MODELS);
    const modelNames = Array.from(new Set(variants.map(row => row.model_name)));
    const models = modelNames.map(name => ({
        name,
        provider: IMAGE_MODELS[name as SupportedModel].provider,
        description: IMAGE_MODELS[name as SupportedModel].description,
        variants: variants
            .filter(row => row.model_name === name)
            .map(row => ({ size: row.size, quality: row.quality })),
    }));
    return NextResponse.json({
        models,
        providers: Array.from(new Set(models.map(model => model.provider))),
    });
}
