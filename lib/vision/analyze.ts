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
import {
    OPENAI_COMPATIBLE_ENDPOINTS,
    openAICompatibleHeaders,
} from '@/lib/providers/openai-compatible';
import { getManagedOpenAICompatibleKey } from '@/lib/gateway/providers-setup';
import { getPricingFromDB } from '@/lib/providers/pricing';
import { calculateProviderTokenCost } from '@/lib/providers/base';
import type { GatewayContext } from '@/lib/gateway-middleware';
import {
    normalizeProviderError,
    InvalidRequestError,
    ContentFilterError,
    ModelNotFoundError,
} from '@/lib/providers/errors';
import {
    readResponseBuffer,
    safeOutboundFetch,
    safeProviderFetch,
    UnsafeOutboundUrlError,
} from '@/lib/security/outbound-url';

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
    openrouter: {
        // OpenRouter proxies to whichever upstream serves the model, so the
        // binding limit is the upstream's, not OpenRouter's, and it varies per
        // model. The cross-provider safe set is applied for the same reason as
        // Maximo below: anything valid here stays valid if the request falls
        // over to another provider.
        formats: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        maxBytes: 5 * 1024 * 1024,
        notes: 'Limits are the upstream model\'s and vary; the cross-provider safe set is applied.',
    },
    maximo: {
        // Maximo publishes no image format or size limits, so the cross-provider
        // safe set applies: anything accepted here is accepted everywhere, which
        // also keeps failover to another provider from failing validation.
        formats: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        maxBytes: 20 * 1024 * 1024,
        notes: 'No published limits; the cross-provider safe set is applied.',
    },
    bai: {
        // B.AI proxies DeepSeek and Z.AI models. No published image format or
        // size limits — the cross-provider safe set is applied.
        formats: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        maxBytes: 20 * 1024 * 1024,
        notes: 'No published limits; the cross-provider safe set is applied.',
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

/**
 * Providers on the OpenAI wire format whose vision-capable models are reached
 * through the same request shape as OpenAI's, just at a different base URL.
 *
 * Vision used to be a closed three-provider world, which meant a model like
 * Maximo Atlas — which reads images perfectly well over the OpenAI wire format —
 * threw `Unknown vision model` before a request was ever made. Adding a provider
 * here plus its models in VISION_MODELS is all it takes; nothing about the
 * payload changes.
 */
export const OPENAI_COMPATIBLE_VISION_PROVIDERS = ['maximo', 'openrouter', 'bai'] as const;

export type OpenAICompatibleVisionProvider = typeof OPENAI_COMPATIBLE_VISION_PROVIDERS[number];

export type VisionProvider = 'openai' | 'anthropic' | 'google' | OpenAICompatibleVisionProvider;

export interface VisionImage {
    // Provide exactly one of these:
    url?: string;                 // https:// or data: URL
    base64?: string;              // raw base64 (no data: prefix)
    mimeType?: string;            // required with base64; auto-detected from url otherwise
}

export interface VisionAnalyzeRequest {
    /** Single image. Use this OR `images`. Sent as the first (and only) image when both are omitted-except-this. */
    image?: VisionImage;
    /** Multiple images to analyze together. Prefer this when you have more than one. */
    images?: VisionImage[];
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
    /** Set when the requested provider failed and another one served the request */
    usedFallback?: boolean;
    originalModel?: string;
    originalProvider?: VisionProvider;
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
    'claude-sonnet-4-6': { provider: 'anthropic', apiModel: 'claude-sonnet-4-6', description: 'Claude Sonnet 4.6 — strong OCR' },
    'claude-3-5-sonnet-latest': { provider: 'anthropic', apiModel: 'claude-3-5-sonnet-latest', description: 'Claude 3.5 Sonnet' },
    'claude-3-5-haiku-latest': { provider: 'anthropic', apiModel: 'claude-3-5-haiku-latest', description: 'Claude 3.5 Haiku' },
    // Google
    'gemini-2.5-pro': { provider: 'google', apiModel: 'gemini-2.5-pro', description: 'Gemini 2.5 Pro — 1M context' },
    'gemini-2.5-flash': { provider: 'google', apiModel: 'gemini-2.5-flash', description: 'Cheapest, 1M context' },
    'gemini-2.5-flash-lite': { provider: 'google', apiModel: 'gemini-2.5-flash-lite', description: 'Fastest Gemini' },
    // Maximo (OpenAI wire format)
    'maximo-atlas-1.2': { provider: 'maximo', apiModel: 'maximo-atlas-1.2', description: 'Atlas 1.2 — agentic coding with visual understanding, 1M context' },
    'maximo-atlas-1.1': { provider: 'maximo', apiModel: 'maximo-atlas-1.1', description: 'Atlas 1.1 — agentic coding, 1M context' },
    // OpenRouter free tier (OpenAI wire format). Cost nothing to run, which
    // makes them the only vision models that work while the OpenAI and
    // Anthropic accounts are unfunded. Image understanding was verified against
    // the live models on 2026-08-20 — both named the shapes, colours and
    // left-to-right order in a generated test image — rather than inferred from
    // the "vl"/"omni" in their ids.
    'nvidia/nemotron-nano-12b-v2-vl:free': { provider: 'openrouter', apiModel: 'nvidia/nemotron-nano-12b-v2-vl:free', description: 'Free vision — 12B VL, 128k context' },
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free': { provider: 'openrouter', apiModel: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', description: 'Free vision — 30B omni-modal reasoning, 256k context' },
    // B.AI — DeepSeek V4 Flash Vision (exp), routed through b.ai
    'deepseek-v4-flash-vision-exp': { provider: 'bai', apiModel: 'deepseek-v4-flash-vision-exp', description: 'Vision-capable DeepSeek V4 Flash (exp) — image + text input via B.AI' },
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
    for (const provider of OPENAI_COMPATIBLE_VISION_PROVIDERS) {
        if (lower.startsWith(`${provider}-`)) {
            return { key, provider, apiModel: key, description: `${provider} model` };
        }
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
    // Managed keys for OpenAI-compatible providers are named in one place
    // (providers-setup), including historical aliases like MAXIMOAI_API_KEY.
    return getManagedOpenAICompatibleKey(provider) ?? null;
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
            try {
                // Some hosts (e.g. Wikimedia) reject UA-less requests with 400/403.
                const res = await safeOutboundFetch(
                    image.url,
                    {
                        headers: { 'User-Agent': 'Cencori-Gateway/1.0 (+https://cencori.com)' },
                        signal: AbortSignal.timeout(15_000),
                    },
                    { maxRedirects: 3 },
                );
                if (!res.ok) throw new VisionValidationError('fetch_failed', `Failed to fetch image: ${res.status}`);
                const buf = await readResponseBuffer(res, MAX_VISION_IMAGE_BYTES);
                const mimeType = res.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
                const base64 = buf.toString('base64');
                return { dataUrl: `data:${mimeType};base64,${base64}`, base64, mimeType, isRemote: false };
            } catch (error) {
                if (error instanceof VisionValidationError) throw error;
                const code = error instanceof UnsafeOutboundUrlError ? 'unsafe_image_url' : 'fetch_failed';
                throw new VisionValidationError(code, error instanceof Error ? error.message : 'Failed to fetch image');
            }
        }
        throw new Error('Image URL must be http(s):// or data:');
    }
    if (image.base64) {
        // Lenient: callers routinely paste a full data URL into the base64
        // field. Strip the prefix instead of forwarding it to providers
        // (OpenAI tolerates the mistake; Google/Anthropic hard-fail on it).
        if (image.base64.startsWith('data:')) {
            const match = image.base64.match(/^data:([^;]+);base64,(.+)$/);
            if (!match) throw new Error('Invalid data URL in base64 field');
            return { dataUrl: image.base64, base64: match[2], mimeType: match[1], isRemote: false };
        }
        const mimeType = image.mimeType ?? 'image/jpeg';
        const dataUrl = `data:${mimeType};base64,${image.base64}`;
        return { dataUrl, base64: image.base64, mimeType, isRemote: false };
    }
    throw new Error('image.url or image.base64 is required');
}

// ── Image list resolution ──────────────────────────────────────

function resolveImageList(request: VisionAnalyzeRequest): VisionImage[] {
    if (request.images && request.images.length > 0) {
        return request.images;
    }
    if (request.image) {
        return [request.image];
    }
    throw new Error('vision request requires `image` or `images[]`');
}

async function normalizeImages(images: VisionImage[]): Promise<NormalizedImage[]> {
    return Promise.all(images.map(normalizeImage));
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

function openaiImageContent(imgs: NormalizedImage[]) {
    return imgs.map(img => ({
        type: 'image_url' as const,
        image_url: { url: img.isRemote ? img.dataUrl : `data:${img.mimeType};base64,${img.base64}` },
    }));
}

/**
 * Client for an OpenAI-compatible provider's endpoint.
 *
 * Base URL and headers come from the same registry the chat path uses, so a
 * provider quirk fixed for chat (Maximo's WAF User-Agent rule) is fixed here
 * too, and `safeProviderFetch` keeps the SSRF guard consistent across both.
 */
function openAICompatibleClient(provider: OpenAICompatibleVisionProvider, apiKey: string): OpenAI {
    const endpoint = OPENAI_COMPATIBLE_ENDPOINTS[provider];
    if (!endpoint) {
        throw new Error(`No OpenAI-compatible endpoint is configured for provider '${provider}'.`);
    }
    return new OpenAI({
        apiKey,
        baseURL: endpoint.baseURL,
        fetch: safeProviderFetch,
        timeout: 55_000,
        maxRetries: 0,
        defaultHeaders: openAICompatibleHeaders(provider),
    });
}

async function analyzeOpenAI(
    apiKey: string,
    model: string,
    prompt: string,
    imgs: NormalizedImage[],
    opts: { maxTokens?: number; temperature?: number; jsonMode?: boolean },
    client: OpenAI = new OpenAI({ apiKey, timeout: 55_000, maxRetries: 0 })
): Promise<{ analysis: string; promptTokens: number; completionTokens: number }> {
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
                    ...openaiImageContent(imgs),
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

function anthropicImageContent(imgs: NormalizedImage[]) {
    return imgs.map(img => ({
        type: 'image' as const,
        source: {
            type: 'base64' as const,
            media_type: img.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            data: img.base64,
        },
    }));
}

async function analyzeAnthropic(
    apiKey: string,
    model: string,
    prompt: string,
    imgs: NormalizedImage[],
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
                    ...anthropicImageContent(imgs),
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

function googleImageContent(imgs: NormalizedImage[]) {
    return imgs.map(img => ({
        inlineData: { mimeType: img.mimeType, data: img.base64 },
    }));
}

async function analyzeGoogle(
    apiKey: string,
    model: string,
    prompt: string,
    imgs: NormalizedImage[],
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
        ...googleImageContent(imgs),
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
    usedFallback?: boolean;
    originalModel?: string;
    originalProvider?: VisionProvider;
}

async function* streamOpenAI(
    apiKey: string,
    model: string,
    prompt: string,
    imgs: NormalizedImage[],
    opts: { maxTokens?: number; temperature?: number },
    client: OpenAI = new OpenAI({ apiKey, timeout: 55_000, maxRetries: 0 })
): AsyncGenerator<{ delta: string } | { done: true; promptTokens: number; completionTokens: number }> {
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
                    ...openaiImageContent(imgs),
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
    imgs: NormalizedImage[],
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
                    ...anthropicImageContent(imgs),
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
    imgs: NormalizedImage[],
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
        ...googleImageContent(imgs),
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

function makeVisionStreamGenerator(
    provider: VisionProvider,
    apiKey: string,
    apiModel: string,
    prompt: string,
    imgs: NormalizedImage[],
    opts: { maxTokens?: number; temperature?: number }
) {
    // Explicit per-provider dispatch, not a trailing else: this used to fall
    // through to Google for anything that wasn't OpenAI or Anthropic, which
    // would have sent an OpenAI-compatible provider's request to Gemini.
    if (provider === 'openai') return streamOpenAI(apiKey, apiModel, prompt, imgs, opts);
    if (provider === 'anthropic') return streamAnthropic(apiKey, apiModel, prompt, imgs, opts);
    if (provider === 'google') return streamGoogle(apiKey, apiModel, prompt, imgs, opts);
    return streamOpenAI(apiKey, apiModel, prompt, imgs, opts, openAICompatibleClient(provider, apiKey));
}

export async function* streamVision(
    ctx: GatewayContext,
    request: VisionAnalyzeRequest
): AsyncGenerator<VisionStreamChunk> {
    let model = resolveModel(request.model);
    const originalModel = model;
    let usedFallback = false;
    const apiKey = await getProviderKey(ctx, model.provider);
    if (!apiKey) {
        throw new Error(`No ${model.provider} API key configured for this project. Add one in project settings.`);
    }

    const imgs = await normalizeImages(resolveImageList(request));
    for (const img of imgs) validateImageForProvider(img, model.provider);
    const prompt = request.prompt ?? (imgs.length > 1 ? 'Analyze these images together.' : 'Describe this image in detail.');
    const opts = { maxTokens: request.maxTokens, temperature: request.temperature };
    let pricing = await getPricingFromDB(model.provider, model.apiModel);

    // Failover window: only before the first chunk is emitted. Once bytes
    // have flowed to the client we can't switch providers mid-answer.
    let generator = makeVisionStreamGenerator(
        model.provider, apiKey, model.apiModel, prompt, imgs, opts
    );
    let iterator = generator[Symbol.asyncIterator]();
    let first: IteratorResult<Awaited<ReturnType<typeof iterator.next>>['value']>;

    try {
        first = await iterator.next();
    } catch (primaryError) {
        if (!isFailoverWorthy(primaryError, model.provider)) {
            throw normalizeProviderError(model.provider, primaryError);
        }

        console.warn(
            `[Vision] Stream ${model.provider}/${model.apiModel} failed, attempting failover:`,
            primaryError instanceof Error ? primaryError.message : primaryError
        );

        let recovered = false;
        for (const candidate of VISION_FALLBACK_CANDIDATES) {
            if (candidate.provider === model.provider) continue;
            const fallbackKey = await getProviderKey(ctx, candidate.provider);
            if (!fallbackKey) continue;

            const fallbackModel = resolveModel(candidate.modelKey);
            try {
                const fallbackPricing = await getPricingFromDB(candidate.provider, fallbackModel.apiModel);
                for (const img of imgs) validateImageForProvider(img, candidate.provider);
                generator = makeVisionStreamGenerator(
                    candidate.provider, fallbackKey, fallbackModel.apiModel, prompt, imgs, opts
                );
                iterator = generator[Symbol.asyncIterator]();
                first = await iterator.next();
                model = fallbackModel;
                pricing = fallbackPricing;
                usedFallback = true;
                recovered = true;
                break;
            } catch (fallbackError) {
                console.warn(
                    `[Vision] Stream fallback ${candidate.provider}/${candidate.modelKey} also failed:`,
                    fallbackError instanceof Error ? fallbackError.message : fallbackError
                );
            }
        }

        if (!recovered) {
            throw normalizeProviderError(model.provider, primaryError);
        }
    }

    let promptTokens = 0;
    let completionTokens = 0;

    while (!first!.done) {
        const chunk = first!.value;
        if ('done' in chunk) {
            promptTokens = chunk.promptTokens;
            completionTokens = chunk.completionTokens;
            break;
        }
        yield { delta: chunk.delta };
        first = await iterator.next();
    }

    const providerCost = calculateProviderTokenCost(
        promptTokens,
        completionTokens,
        pricing
    );
    const cencoriCharge = providerCost * (1 + pricing.cencoriMarkupPercentage / 100)
        + (pricing.fixedFeePerRequest ?? 0);

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
        usedFallback,
        ...(usedFallback
            ? { originalModel: originalModel.key, originalProvider: originalModel.provider }
            : {}),
    };
}

// ── Main entry point ────────────────────────────────────────────

// ── Vision failover ─────────────────────────────────────────────
// When the requested provider fails at the account/service level (quota
// exhausted, bad key, outage), retry on another vision-capable provider
// with an available key instead of failing the customer's request.
// Mirrors chat failover, which vision never had.

const VISION_FALLBACK_CANDIDATES: Array<{ provider: VisionProvider; modelKey: string }> = [
    { provider: 'google', modelKey: 'gemini-2.5-flash' },
    { provider: 'openai', modelKey: 'gpt-4o-mini' },
    { provider: 'anthropic', modelKey: 'claude-3-5-haiku-latest' },
    // Last resort, and the only one that cannot fail for billing reasons: the
    // three above are a rate-limited free Gemini tier and two paid accounts, so
    // an unfunded window takes out every vision request at once. Ordered last so
    // it changes nothing while the others are healthy.
    { provider: 'openrouter', modelKey: 'nvidia/nemotron-nano-12b-v2-vl:free' },
];

/**
 * Whether a provider failure is worth retrying on a different provider.
 * Caller mistakes (bad image, filtered content, unknown model) fail
 * everywhere — don't burn a second provider call on them.
 */
function isFailoverWorthy(error: unknown, provider: string): boolean {
    const normalized = normalizeProviderError(provider, error);
    return !(
        normalized instanceof InvalidRequestError
        || normalized instanceof ContentFilterError
        || normalized instanceof ModelNotFoundError
    );
}

type VisionCallOpts = { maxTokens?: number; temperature?: number; jsonMode?: boolean };
type VisionCallResult = { analysis: string; promptTokens: number; completionTokens: number };

async function callVisionProvider(
    provider: VisionProvider,
    apiKey: string,
    apiModel: string,
    prompt: string,
    imgs: NormalizedImage[],
    opts: VisionCallOpts
): Promise<VisionCallResult> {
    if (provider === 'openai') return analyzeOpenAI(apiKey, apiModel, prompt, imgs, opts);
    if (provider === 'anthropic') return analyzeAnthropic(apiKey, apiModel, prompt, imgs, opts);
    if (provider === 'google') return analyzeGoogle(apiKey, apiModel, prompt, imgs, opts);
    return analyzeOpenAI(apiKey, apiModel, prompt, imgs, opts, openAICompatibleClient(provider, apiKey));
}

export async function analyzeVision(
    ctx: GatewayContext,
    request: VisionAnalyzeRequest
): Promise<VisionAnalyzeResult> {
    let model = resolveModel(request.model);
    const apiKey = await getProviderKey(ctx, model.provider);
    if (!apiKey) {
        throw new Error(`No ${model.provider} API key configured for this project. Add one in project settings.`);
    }

    const imgs = await normalizeImages(resolveImageList(request));
    for (const img of imgs) validateImageForProvider(img, model.provider);
    const prompt = request.prompt ?? (imgs.length > 1 ? 'Analyze these images together.' : 'Describe this image in detail.');
    const opts = {
        maxTokens: request.maxTokens,
        temperature: request.temperature,
        jsonMode: request.responseFormat === 'json',
    };
    let pricing = await getPricingFromDB(model.provider, model.apiModel);

    let result: VisionCallResult;
    let usedFallback = false;
    const originalModel = model;

    try {
        result = await callVisionProvider(model.provider, apiKey, model.apiModel, prompt, imgs, opts);
    } catch (primaryError) {
        if (!isFailoverWorthy(primaryError, model.provider)) {
            throw normalizeProviderError(model.provider, primaryError);
        }

        console.warn(
            `[Vision] ${model.provider}/${model.apiModel} failed, attempting failover:`,
            primaryError instanceof Error ? primaryError.message : primaryError
        );

        let recovered: { result: VisionCallResult; candidate: ModelInfo & { key: string } } | null = null;
        for (const candidate of VISION_FALLBACK_CANDIDATES) {
            if (candidate.provider === model.provider) continue;

            const fallbackKey = await getProviderKey(ctx, candidate.provider);
            if (!fallbackKey) continue;

            const fallbackModel = resolveModel(candidate.modelKey);
            try {
                const fallbackPricing = await getPricingFromDB(candidate.provider, fallbackModel.apiModel);
                for (const img of imgs) validateImageForProvider(img, candidate.provider);
                const fallbackResult = await callVisionProvider(
                    candidate.provider,
                    fallbackKey,
                    fallbackModel.apiModel,
                    prompt,
                    imgs,
                    opts
                );
                recovered = { result: fallbackResult, candidate: fallbackModel };
                pricing = fallbackPricing;
                break;
            } catch (fallbackError) {
                console.warn(
                    `[Vision] Fallback ${candidate.provider}/${candidate.modelKey} also failed:`,
                    fallbackError instanceof Error ? fallbackError.message : fallbackError
                );
            }
        }

        if (!recovered) {
            // Typed error so routes can map to an honest status (429/401/503)
            // instead of a blanket 500.
            throw normalizeProviderError(model.provider, primaryError);
        }

        result = recovered.result;
        model = recovered.candidate;
        usedFallback = true;
    }

    const providerCost = calculateProviderTokenCost(
        result.promptTokens,
        result.completionTokens,
        pricing
    );
    const cencoriCharge = providerCost * (1 + pricing.cencoriMarkupPercentage / 100)
        + (pricing.fixedFeePerRequest ?? 0);

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
        ...(usedFallback
            ? {
                  usedFallback: true,
                  originalModel: originalModel.key,
                  originalProvider: originalModel.provider,
              }
            : {}),
    };
}

// ── Request parsing ────────────────────────────────────────────

export async function parseVisionRequest(req: NextRequest): Promise<VisionAnalyzeRequest> {
    const contentType = req.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
        const form = await req.formData();
        // Accept single `file` or multiple `files[]` (and repeated `file` fields).
        const rawFiles = form.getAll('files').concat(form.getAll('file'));
        const files = rawFiles.filter((v): v is File => v instanceof File);
        if (files.length === 0) throw new Error('Multipart request requires a `file` (or `files[]`) field with the image(s)');
        const images: VisionImage[] = [];
        for (const file of files) {
            if (file.size > MAX_VISION_IMAGE_BYTES) {
                throw new Error(`Image "${file.name}" exceeds maximum size of ${MAX_VISION_IMAGE_BYTES / (1024 * 1024)}MB`);
            }
            const buf = Buffer.from(await file.arrayBuffer());
            images.push({ base64: buf.toString('base64'), mimeType: file.type || 'image/jpeg' });
        }
        return {
            images,
            prompt: (form.get('prompt') as string) || undefined,
            model: (form.get('model') as string) || undefined,
            maxTokens: form.get('max_tokens') ? Number(form.get('max_tokens')) : undefined,
            temperature: form.get('temperature') ? Number(form.get('temperature')) : undefined,
            responseFormat: (form.get('response_format') as 'text' | 'json') || undefined,
        };
    }

    const body = await req.json();

    // Multi-image body: `images: [{ url|base64, mime_type? }, ...]`
    if (Array.isArray(body.images) && body.images.length > 0) {
        const images: VisionImage[] = body.images.map((img: { url?: string; base64?: string; mime_type?: string; mimeType?: string }) => {
            if (!img.url && !img.base64) throw new Error('Each entry in `images` requires `url` or `base64`');
            return img.url
                ? { url: img.url }
                : { base64: img.base64, mimeType: img.mime_type ?? img.mimeType };
        });
        return {
            images,
            prompt: body.prompt,
            model: body.model,
            maxTokens: body.max_tokens,
            temperature: body.temperature,
            responseFormat: body.response_format,
            stream: body.stream === true,
        };
    }

    if (!body.image_url && !body.image_base64) {
        throw new Error('Request requires `image_url`, `image_base64`, or `images[]`');
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
