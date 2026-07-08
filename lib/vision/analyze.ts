/**
 * Vision Analysis Core
 *
 * Shared implementation for all /api/ai/vision routes. Accepts an image
 * (URL, base64, or file) plus a prompt, routes to a vision-capable model
 * across OpenAI / Anthropic / Google, and returns a unified response.
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { NextRequest } from 'next/server';
import { decryptApiKey } from '@/lib/encryption';
import { getGoogleApiKey } from '@/lib/providers/google-env';
import { getPricingFromDB } from '@/lib/providers/pricing';
import type { GatewayContext } from '@/lib/gateway-middleware';

export const MAX_VISION_IMAGE_BYTES = 20 * 1024 * 1024;

// ── Provider capabilities (formats + size) ─────────────────────

export const VISION_PROVIDER_LIMITS = {
    openai: {
        formats: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        maxBytes: 20 * 1024 * 1024,
        notes: 'Non-animated GIFs only. Max 20MB per image.',
    },
    anthropic: {
        formats: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        maxBytes: 5 * 1024 * 1024,
        notes: 'Max 5MB per image, max 8000×8000 dimensions.',
    },
    google: {
        formats: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'],
        maxBytes: 20 * 1024 * 1024,
        notes: 'HEIC/HEIF supported. Max 20MB per image inline.',
    },
} as const satisfies Record<VisionProvider, { formats: readonly string[]; maxBytes: number; notes: string }>;

// Universal set that works across all three providers
export const UNIVERSAL_VISION_FORMATS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

function friendlyFormatList(mimes: readonly string[]): string {
    return mimes.map(m => m.replace('image/', '').toUpperCase()).join(', ');
}

function formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)}MB`;
    return `${(bytes / 1024).toFixed(0)}KB`;
}

export class VisionValidationError extends Error {
    readonly code: string;
    readonly details: Record<string, unknown>;
    constructor(code: string, message: string, details: Record<string, unknown> = {}) {
        super(message);
        this.name = 'VisionValidationError';
        this.code = code;
        this.details = details;
    }
}

export type VisionProvider = 'openai' | 'anthropic' | 'google';

export interface VisionImage {
    // Provide exactly one of these:
    url?: string;                 // https:// or data: URL
    base64?: string;              // raw base64 (no data: prefix)
    mimeType?: string;            // required with base64; auto-detected from url otherwise
}

export interface VisionAnalyzeRequest {
    image: VisionImage;
    prompt?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    responseFormat?: 'text' | 'json';
    stream?: boolean;
}

export interface VisionAnalyzeResult {
    analysis: string;
    model: string;
    provider: VisionProvider;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    cost: {
        providerCostUsd: number;
        cencoriChargeUsd: number;
        markupPercentage: number;
    };
}

// ── Model registry ─────────────────────────────────────────────
//
// This registry only routes model names to a provider + description.
// Pricing lives in the model_pricing DB table and is resolved via
// getPricingFromDB() at request time — matches the pattern used by chat
// completions and prevents this file from drifting from real pricing.

interface ModelInfo {
    provider: VisionProvider;
    apiModel: string;
    description: string;
}

const VISION_MODELS: Record<string, ModelInfo> = {
    // OpenAI
    'gpt-4o': { provider: 'openai', apiModel: 'gpt-4o', description: 'GPT-4o multimodal' },
    'gpt-4o-mini': { provider: 'openai', apiModel: 'gpt-4o-mini', description: 'Fast, cheap vision — good default' },
    'gpt-4-turbo': { provider: 'openai', apiModel: 'gpt-4-turbo', description: 'GPT-4 Turbo vision' },
    // Anthropic
    'claude-sonnet-4-5': { provider: 'anthropic', apiModel: 'claude-sonnet-4-5', description: 'Claude Sonnet 4.5 — strong OCR' },
    'claude-3-5-sonnet-latest': { provider: 'anthropic', apiModel: 'claude-3-5-sonnet-latest', description: 'Claude 3.5 Sonnet' },
    'claude-3-5-haiku-latest': { provider: 'anthropic', apiModel: 'claude-3-5-haiku-latest', description: 'Claude 3.5 Haiku' },
    // Google
    'gemini-2.5-pro': { provider: 'google', apiModel: 'gemini-2.5-pro', description: 'Gemini 2.5 Pro — 1M context' },
    'gemini-2.5-flash': { provider: 'google', apiModel: 'gemini-2.5-flash', description: 'Cheapest, 1M context' },
    'gemini-2.5-flash-lite': { provider: 'google', apiModel: 'gemini-2.5-flash-lite', description: 'Fastest Gemini' },
};

const DEFAULT_MODEL = 'gpt-4o-mini';

function resolveModel(requested?: string): ModelInfo & { key: string } {
    const key = requested ?? DEFAULT_MODEL;
    const info = VISION_MODELS[key];
    if (info) return { ...info, key };

    // Fallback: infer provider from name prefix so callers can use models we haven't listed
    const lower = key.toLowerCase();
    if (lower.startsWith('gpt') || lower.startsWith('o1') || lower.startsWith('o3')) {
        return { key, provider: 'openai', apiModel: key, description: 'OpenAI model' };
    }
    if (lower.startsWith('claude')) {
        return { key, provider: 'anthropic', apiModel: key, description: 'Anthropic model' };
    }
    if (lower.startsWith('gemini')) {
        return { key, provider: 'google', apiModel: key, description: 'Google model' };
    }
    throw new Error(`Unknown vision model: ${key}. See GET /api/ai/vision for supported models.`);
}

export function listVisionModels() {
    return Object.entries(VISION_MODELS).map(([id, info]) => ({
        id,
        provider: info.provider,
        description: info.description,
    }));
}

// ── Provider key resolution ─────────────────────────────────────

async function getProviderKey(ctx: GatewayContext, provider: VisionProvider): Promise<string | null> {
    const { data: providerKey } = await ctx.supabase
        .from('provider_keys')
        .select('encrypted_key, is_active')
        .eq('project_id', ctx.projectId)
        .eq('provider', provider)
        .eq('is_active', true)
        .maybeSingle();

    if (providerKey?.encrypted_key) {
        return decryptApiKey(providerKey.encrypted_key, ctx.organizationId);
    }
    if (provider === 'openai') return process.env.OPENAI_API_KEY ?? null;
    if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY ?? null;
    if (provider === 'google') return getGoogleApiKey();
    return null;
}

// ── Image normalization ─────────────────────────────────────────

interface NormalizedImage {
    dataUrl: string;      // data:mime;base64,... (or https:// URL)
    base64: string;       // raw base64 only (no data: prefix)
    mimeType: string;
    isRemote: boolean;
}

async function normalizeImage(image: VisionImage): Promise<NormalizedImage> {
    if (image.url) {
        // Data URL: data:image/png;base64,xxxx
        if (image.url.startsWith('data:')) {
            const match = image.url.match(/^data:([^;]+);base64,(.+)$/);
            if (!match) throw new Error('Invalid data URL');
            return { dataUrl: image.url, base64: match[2], mimeType: match[1], isRemote: false };
        }
        // Remote URL: fetch bytes so all three providers can consume it
        if (image.url.startsWith('http://') || image.url.startsWith('https://')) {
            const res = await fetch(image.url);
            if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
            const buf = Buffer.from(await res.arrayBuffer());
            const mimeType = res.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
            const base64 = buf.toString('base64');
            return { dataUrl: image.url, base64, mimeType, isRemote: true };
        }
        throw new Error('Image URL must be http(s):// or data:');
    }
    if (image.base64) {
        const mimeType = image.mimeType ?? 'image/jpeg';
        const dataUrl = `data:${mimeType};base64,${image.base64}`;
        return { dataUrl, base64: image.base64, mimeType, isRemote: false };
    }
    throw new Error('image.url or image.base64 is required');
}

// ── Validation ─────────────────────────────────────────────────

function imageSizeBytes(img: NormalizedImage): number {
    // base64 → raw bytes: 4 chars encode 3 bytes; trailing '=' padding trims the last group
    const b64 = img.base64;
    const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
    return Math.floor((b64.length * 3) / 4) - padding;
}

export function validateImageForProvider(img: NormalizedImage, provider: VisionProvider): void {
    const limits = VISION_PROVIDER_LIMITS[provider];
    const mime = img.mimeType.toLowerCase();

    if (!(limits.formats as readonly string[]).includes(mime)) {
        throw new VisionValidationError(
            'unsupported_format',
            `Image format "${mime}" is not supported by ${provider}. ` +
            `Supported formats: ${friendlyFormatList(limits.formats)}.`,
            {
                provider,
                receivedFormat: mime,
                supportedFormats: [...limits.formats],
                universalFormats: [...UNIVERSAL_VISION_FORMATS],
            }
        );
    }

    const bytes = imageSizeBytes(img);
    if (bytes > limits.maxBytes) {
        throw new VisionValidationError(
            'image_too_large',
            `Image is ${formatBytes(bytes)} but ${provider} allows a maximum of ${formatBytes(limits.maxBytes)} per image.`,
            {
                provider,
                receivedBytes: bytes,
                maxBytes: limits.maxBytes,
            }
        );
    }
}

// ── Provider callers ────────────────────────────────────────────

async function analyzeOpenAI(
    apiKey: string,
    model: string,
    prompt: string,
    img: NormalizedImage,
    opts: { maxTokens?: number; temperature?: number; jsonMode?: boolean }
): Promise<{ analysis: string; promptTokens: number; completionTokens: number }> {
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
        model,
        max_tokens: opts.maxTokens ?? 1024,
        temperature: opts.temperature,
        response_format: opts.jsonMode ? { type: 'json_object' } : undefined,
        messages: [
            {
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    { type: 'image_url', image_url: { url: img.isRemote ? img.dataUrl : `data:${img.mimeType};base64,${img.base64}` } },
                ],
            },
        ],
    });
    return {
        analysis: response.choices[0]?.message?.content ?? '',
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
    };
}

async function analyzeAnthropic(
    apiKey: string,
    model: string,
    prompt: string,
    img: NormalizedImage,
    opts: { maxTokens?: number; temperature?: number }
): Promise<{ analysis: string; promptTokens: number; completionTokens: number }> {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
        model,
        max_tokens: opts.maxTokens ?? 1024,
        temperature: opts.temperature,
        messages: [
            {
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: img.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                            data: img.base64,
                        },
                    },
                    { type: 'text', text: prompt },
                ],
            },
        ],
    });
    const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('');
    return {
        analysis: text,
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
    };
}

async function analyzeGoogle(
    apiKey: string,
    model: string,
    prompt: string,
    img: NormalizedImage,
    opts: { maxTokens?: number; temperature?: number }
): Promise<{ analysis: string; promptTokens: number; completionTokens: number }> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const genModel = genAI.getGenerativeModel({
        model,
        generationConfig: {
            maxOutputTokens: opts.maxTokens ?? 1024,
            temperature: opts.temperature,
        },
    });
    const result = await genModel.generateContent([
        { text: prompt },
        { inlineData: { mimeType: img.mimeType, data: img.base64 } },
    ]);
    const response = result.response;
    const text = response.text();
    const meta = response.usageMetadata;
    return {
        analysis: text,
        promptTokens: meta?.promptTokenCount ?? 0,
        completionTokens: meta?.candidatesTokenCount ?? 0,
    };
}

// ── Streaming provider callers ─────────────────────────────────
//
// Each yields text deltas and finishes with a `final` event carrying total
// token counts. The top-level `streamVision()` wraps these and dispatches by
// provider.

export interface VisionStreamChunk {
    delta?: string;
    done?: boolean;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    cost?: { providerCostUsd: number; cencoriChargeUsd: number; markupPercentage: number };
    model?: string;
    provider?: VisionProvider;
    error?: string;
}

async function* streamOpenAI(
    apiKey: string,
    model: string,
    prompt: string,
    img: NormalizedImage,
    opts: { maxTokens?: number; temperature?: number }
): AsyncGenerator<{ delta: string } | { done: true; promptTokens: number; completionTokens: number }> {
    const client = new OpenAI({ apiKey });
    const stream = await client.chat.completions.create({
        model,
        max_tokens: opts.maxTokens ?? 1024,
        temperature: opts.temperature,
        stream: true,
        stream_options: { include_usage: true },
        messages: [
            {
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    { type: 'image_url', image_url: { url: img.isRemote ? img.dataUrl : `data:${img.mimeType};base64,${img.base64}` } },
                ],
            },
        ],
    });
    let promptTokens = 0;
    let completionTokens = 0;
    for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) yield { delta };
        if (chunk.usage) {
            promptTokens = chunk.usage.prompt_tokens ?? 0;
            completionTokens = chunk.usage.completion_tokens ?? 0;
        }
    }
    yield { done: true, promptTokens, completionTokens };
}

async function* streamAnthropic(
    apiKey: string,
    model: string,
    prompt: string,
    img: NormalizedImage,
    opts: { maxTokens?: number; temperature?: number }
): AsyncGenerator<{ delta: string } | { done: true; promptTokens: number; completionTokens: number }> {
    const client = new Anthropic({ apiKey });
    const stream = client.messages.stream({
        model,
        max_tokens: opts.maxTokens ?? 1024,
        temperature: opts.temperature,
        messages: [
            {
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: img.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                            data: img.base64,
                        },
                    },
                    { type: 'text', text: prompt },
                ],
            },
        ],
    });
    for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            yield { delta: event.delta.text };
        }
    }
    const final = await stream.finalMessage();
    yield {
        done: true,
        promptTokens: final.usage.input_tokens,
        completionTokens: final.usage.output_tokens,
    };
}

async function* streamGoogle(
    apiKey: string,
    model: string,
    prompt: string,
    img: NormalizedImage,
    opts: { maxTokens?: number; temperature?: number }
): AsyncGenerator<{ delta: string } | { done: true; promptTokens: number; completionTokens: number }> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const genModel = genAI.getGenerativeModel({
        model,
        generationConfig: {
            maxOutputTokens: opts.maxTokens ?? 1024,
            temperature: opts.temperature,
        },
    });
    const result = await genModel.generateContentStream([
        { text: prompt },
        { inlineData: { mimeType: img.mimeType, data: img.base64 } },
    ]);
    for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) yield { delta: text };
    }
    const aggregate = await result.response;
    const meta = aggregate.usageMetadata;
    yield {
        done: true,
        promptTokens: meta?.promptTokenCount ?? 0,
        completionTokens: meta?.candidatesTokenCount ?? 0,
    };
}

// ── Streaming entry point ──────────────────────────────────────

export async function* streamVision(
    ctx: GatewayContext,
    request: VisionAnalyzeRequest
): AsyncGenerator<VisionStreamChunk> {
    const model = resolveModel(request.model);
    const apiKey = await getProviderKey(ctx, model.provider);
    if (!apiKey) {
        throw new Error(`No ${model.provider} API key configured for this project. Add one in project settings.`);
    }

    const img = await normalizeImage(request.image);
    validateImageForProvider(img, model.provider);
    const prompt = request.prompt ?? 'Describe this image in detail.';
    const opts = { maxTokens: request.maxTokens, temperature: request.temperature };

    const generator =
        model.provider === 'openai' ? streamOpenAI(apiKey, model.apiModel, prompt, img, opts) :
        model.provider === 'anthropic' ? streamAnthropic(apiKey, model.apiModel, prompt, img, opts) :
        streamGoogle(apiKey, model.apiModel, prompt, img, opts);

    let promptTokens = 0;
    let completionTokens = 0;

    for await (const chunk of generator) {
        if ('done' in chunk) {
            promptTokens = chunk.promptTokens;
            completionTokens = chunk.completionTokens;
            break;
        }
        yield { delta: chunk.delta };
    }

    const pricing = await getPricingFromDB(model.provider, model.apiModel);
    const providerCost =
        (promptTokens / 1000) * pricing.inputPer1KTokens +
        (completionTokens / 1000) * pricing.outputPer1KTokens;
    const cencoriCharge = providerCost * (1 + pricing.cencoriMarkupPercentage / 100);

    yield {
        done: true,
        model: model.key,
        provider: model.provider,
        usage: {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
        },
        cost: {
            providerCostUsd: providerCost,
            cencoriChargeUsd: cencoriCharge,
            markupPercentage: pricing.cencoriMarkupPercentage,
        },
    };
}

// ── Main entry point ────────────────────────────────────────────

export async function analyzeVision(
    ctx: GatewayContext,
    request: VisionAnalyzeRequest
): Promise<VisionAnalyzeResult> {
    const model = resolveModel(request.model);
    const apiKey = await getProviderKey(ctx, model.provider);
    if (!apiKey) {
        throw new Error(`No ${model.provider} API key configured for this project. Add one in project settings.`);
    }

    const img = await normalizeImage(request.image);
    validateImageForProvider(img, model.provider);
    const prompt = request.prompt ?? 'Describe this image in detail.';
    const opts = {
        maxTokens: request.maxTokens,
        temperature: request.temperature,
        jsonMode: request.responseFormat === 'json',
    };

    let result: { analysis: string; promptTokens: number; completionTokens: number };
    if (model.provider === 'openai') {
        result = await analyzeOpenAI(apiKey, model.apiModel, prompt, img, opts);
    } else if (model.provider === 'anthropic') {
        result = await analyzeAnthropic(apiKey, model.apiModel, prompt, img, opts);
    } else {
        result = await analyzeGoogle(apiKey, model.apiModel, prompt, img, opts);
    }

    const pricing = await getPricingFromDB(model.provider, model.apiModel);
    const providerCost =
        (result.promptTokens / 1000) * pricing.inputPer1KTokens +
        (result.completionTokens / 1000) * pricing.outputPer1KTokens;
    const cencoriCharge = providerCost * (1 + pricing.cencoriMarkupPercentage / 100);

    return {
        analysis: result.analysis,
        model: model.key,
        provider: model.provider,
        usage: {
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
            totalTokens: result.promptTokens + result.completionTokens,
        },
        cost: {
            providerCostUsd: providerCost,
            cencoriChargeUsd: cencoriCharge,
            markupPercentage: pricing.cencoriMarkupPercentage,
        },
    };
}

// ── Request parsing ────────────────────────────────────────────

export async function parseVisionRequest(req: NextRequest): Promise<VisionAnalyzeRequest> {
    const contentType = req.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
        const form = await req.formData();
        const file = form.get('file');
        if (!(file instanceof File)) throw new Error('Multipart request requires a `file` field with the image');
        if (file.size > MAX_VISION_IMAGE_BYTES) {
            throw new Error(`Image exceeds maximum size of ${MAX_VISION_IMAGE_BYTES / (1024 * 1024)}MB`);
        }
        const buf = Buffer.from(await file.arrayBuffer());
        return {
            image: { base64: buf.toString('base64'), mimeType: file.type || 'image/jpeg' },
            prompt: (form.get('prompt') as string) || undefined,
            model: (form.get('model') as string) || undefined,
            maxTokens: form.get('max_tokens') ? Number(form.get('max_tokens')) : undefined,
            temperature: form.get('temperature') ? Number(form.get('temperature')) : undefined,
            responseFormat: (form.get('response_format') as 'text' | 'json') || undefined,
        };
    }

    const body = await req.json();
    if (!body.image_url && !body.image_base64) {
        throw new Error('Request requires `image_url` or `image_base64`');
    }
    return {
        image: body.image_url
            ? { url: body.image_url }
            : { base64: body.image_base64, mimeType: body.mime_type },
        prompt: body.prompt,
        model: body.model,
        maxTokens: body.max_tokens,
        temperature: body.temperature,
        responseFormat: body.response_format,
        stream: body.stream === true,
    };
}
