/**
 * Vision API — analyze, describe, OCR, and classify images.
 *
 * @example
 *   const result = await cencori.vision.analyze({
 *       image: { url: 'https://example.com/photo.jpg' },
 *       prompt: 'What breed of dog is this?',
 *   });
 *
 * @example
 *   const { text } = await cencori.vision.ocr({ image: { base64, mimeType: 'image/png' } });
 */

import type { CencoriConfig } from '../types';

export type VisionProvider = 'openai' | 'anthropic' | 'google';

export type VisionTask = 'analyze' | 'describe' | 'ocr' | 'classify';

export interface VisionImage {
    /** https:// URL or data: URL. Exactly one of `url` or `base64` must be set. */
    url?: string;
    /** Raw base64 (no data: prefix). Requires `mimeType`. */
    base64?: string;
    /** Image mime type. Required when using `base64`. */
    mimeType?: string;
}

export interface VisionRequest {
    /** Single image. Use this OR `images`. */
    image?: VisionImage;
    /** Multiple images to analyze together. */
    images?: VisionImage[];
    prompt?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    responseFormat?: 'text' | 'json';
}

export interface VisionStreamChunk {
    delta?: string;
    done?: boolean;
    model?: string;
    provider?: VisionProvider;
    usage?: VisionUsage;
    cost?: VisionCost;
    error?: string;
}

export interface VisionUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

export interface VisionCost {
    providerCostUsd: number;
    cencoriChargeUsd: number;
    markupPercentage: number;
}

export interface VisionResult {
    analysis: string;
    model: string;
    provider: VisionProvider;
    usage: VisionUsage;
    cost: VisionCost;
}

export interface VisionDescribeResult {
    description: string;
    model: string;
    provider: VisionProvider;
    usage: VisionUsage;
    cost: VisionCost;
}

export interface VisionOcrResult {
    text: string;
    model: string;
    provider: VisionProvider;
    usage: VisionUsage;
    cost: VisionCost;
}

export interface VisionClassification {
    primary_category?: string;
    tags?: string[];
    objects?: string[];
    safe_for_work?: boolean;
    confidence?: number;
    summary?: string;
    [key: string]: unknown;
}

export interface VisionClassifyResult {
    classification: VisionClassification | string;
    raw: string;
    model: string;
    provider: VisionProvider;
    usage: VisionUsage;
    cost: VisionCost;
}

interface JsonBody {
    image_url?: string;
    image_base64?: string;
    mime_type?: string;
    images?: Array<{ url?: string; base64?: string; mime_type?: string }>;
    prompt?: string;
    model?: string;
    max_tokens?: number;
    temperature?: number;
    response_format?: 'text' | 'json';
}

function toBody(request: VisionRequest): JsonBody {
    const body: JsonBody = {
        prompt: request.prompt,
        model: request.model,
        max_tokens: request.maxTokens,
        temperature: request.temperature,
        response_format: request.responseFormat,
    };

    if (request.images && request.images.length > 0) {
        body.images = request.images.map(img => {
            if (img.url) return { url: img.url };
            if (img.base64) return { base64: img.base64, mime_type: img.mimeType };
            throw new Error('Each entry in images requires url or base64');
        });
        return body;
    }
    if (!request.image) {
        throw new Error('vision request requires `image` or `images[]`');
    }
    if (request.image.url) {
        body.image_url = request.image.url;
    } else if (request.image.base64) {
        body.image_base64 = request.image.base64;
        body.mime_type = request.image.mimeType;
    } else {
        throw new Error('vision request requires image.url or image.base64');
    }
    return body;
}

export class VisionNamespace {
    private config: Required<CencoriConfig>;

    constructor(config: Required<CencoriConfig>) {
        this.config = config;
    }

    /**
     * General image analysis — provide your own prompt.
     * Default prompt: "Describe this image in detail."
     */
    async analyze(request: VisionRequest): Promise<VisionResult> {
        return this.post<VisionResult>('/api/ai/vision', request);
    }

    /** Describe the image in rich detail. */
    async describe(request: VisionRequest): Promise<VisionDescribeResult> {
        return this.post<VisionDescribeResult>('/api/ai/vision/describe', request);
    }

    /** Extract all visible text from the image. */
    async ocr(request: VisionRequest): Promise<VisionOcrResult> {
        return this.post<VisionOcrResult>('/api/ai/vision/ocr', request);
    }

    /** Return structured tags, objects, and category classification. */
    async classify(request: VisionRequest): Promise<VisionClassifyResult> {
        return this.post<VisionClassifyResult>('/api/ai/vision/classify', request);
    }

    /**
     * Stream a vision analysis. Yields `{ delta }` chunks as text arrives, then
     * a final `{ done: true, model, provider, usage, cost }` chunk with totals.
     *
     * @example
     * for await (const chunk of cencori.vision.analyzeStream({ image: { url } })) {
     *   if (chunk.delta) process.stdout.write(chunk.delta);
     *   if (chunk.done) console.log(chunk.cost);
     * }
     */
    async *analyzeStream(request: VisionRequest): AsyncGenerator<VisionStreamChunk, void, unknown> {
        const body = { ...toBody(request), stream: true };
        const response = await fetch(`${this.config.baseUrl}/api/ai/vision`, {
            method: 'POST',
            headers: {
                'CENCORI_API_KEY': this.config.apiKey,
                'Content-Type': 'application/json',
                ...this.config.headers,
            },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            const message =
                (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string')
                    ? data.message
                    : `Vision stream request failed with status ${response.status}`;
            throw new Error(message);
        }
        if (!response.body) throw new Error('Response body is null');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6);
                    if (data === '[DONE]') return;
                    try {
                        yield JSON.parse(data) as VisionStreamChunk;
                    } catch {
                        // skip malformed frame
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }

    private async post<T>(path: string, request: VisionRequest): Promise<T> {
        const response = await fetch(`${this.config.baseUrl}${path}`, {
            method: 'POST',
            headers: {
                'CENCORI_API_KEY': this.config.apiKey,
                'Content-Type': 'application/json',
                ...this.config.headers,
            },
            body: JSON.stringify(toBody(request)),
        });
        const data = await response.json();
        if (!response.ok) {
            const message =
                (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string')
                    ? data.message
                    : `Vision request failed with status ${response.status}`;
            const code =
                (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string')
                    ? data.error
                    : 'request_failed';
            const err = new Error(message) as Error & { code?: string; details?: unknown };
            err.code = code;
            err.details = data;
            throw err;
        }
        return data as T;
    }
}
