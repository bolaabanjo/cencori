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
    image: VisionImage;
    prompt?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    responseFormat?: 'text' | 'json';
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
