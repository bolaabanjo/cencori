/**
 * Documents API — extract text from PDFs and images, summarize, and query.
 *
 * @example
 *   const { text, pageCount } = await cencori.documents.extract({
 *       document: { url: 'https://example.com/contract.pdf' },
 *   });
 *
 * @example
 *   const { summary } = await cencori.documents.summarize({
 *       document: { base64, mimeType: 'application/pdf' },
 *   });
 *
 * @example
 *   const { answer } = await cencori.documents.query({
 *       document: { url: 'https://example.com/report.pdf' },
 *       question: 'What is the total revenue for Q3?',
 *   });
 */

import type { CencoriConfig } from '../types';

export type DocumentExtractMethod = 'pdf_text' | 'vision_ocr';
export type DocumentKind = 'pdf' | 'image';

export interface DocumentInput {
    url?: string;
    base64?: string;
    mimeType?: string;
    filename?: string;
}

export interface DocumentRequest {
    document: DocumentInput;
    prompt?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
}

export interface DocumentQueryRequest extends DocumentRequest {
    question: string;
}

export interface DocumentUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

export interface DocumentCost {
    providerCostUsd: number;
    cencoriChargeUsd: number;
    markupPercentage: number;
}

export interface DocumentExtractResult {
    text: string;
    pageCount: number;
    kind: DocumentKind;
    method: DocumentExtractMethod;
    model?: string;
    provider?: string;
    metadata?: Record<string, unknown>;
    usage?: DocumentUsage;
    cost?: DocumentCost;
}

export interface DocumentSummarizeResult {
    summary: string;
    text: string;
    pageCount: number;
    model: string;
    provider: string;
    extractMethod: DocumentExtractMethod;
    usage: DocumentUsage;
    cost: DocumentCost;
}

export interface DocumentQueryResult {
    answer: string;
    question: string;
    pageCount: number;
    model: string;
    provider: string;
    extractMethod: DocumentExtractMethod;
    usage: DocumentUsage;
    cost: DocumentCost;
}

interface JsonBody {
    document_url?: string;
    document_base64?: string;
    mime_type?: string;
    filename?: string;
    prompt?: string;
    model?: string;
    max_tokens?: number;
    temperature?: number;
    question?: string;
}

function toBody(request: DocumentRequest, extra: Partial<JsonBody> = {}): JsonBody {
    const body: JsonBody = {
        prompt: request.prompt,
        model: request.model,
        max_tokens: request.maxTokens,
        temperature: request.temperature,
        ...extra,
    };
    if (request.document.url) {
        body.document_url = request.document.url;
    } else if (request.document.base64) {
        body.document_base64 = request.document.base64;
        body.mime_type = request.document.mimeType;
        body.filename = request.document.filename;
    } else {
        throw new Error('documents request requires document.url or document.base64');
    }
    return body;
}

export class DocumentsNamespace {
    private config: Required<CencoriConfig>;

    constructor(config: Required<CencoriConfig>) {
        this.config = config;
    }

    /** Extract text from a PDF (native, no LLM) or image (via Vision OCR). */
    async extract(request: DocumentRequest): Promise<DocumentExtractResult> {
        return this.post<DocumentExtractResult>('/api/ai/documents/extract', toBody(request));
    }

    /** Extract then summarize the document with a chat model. */
    async summarize(request: DocumentRequest): Promise<DocumentSummarizeResult> {
        return this.post<DocumentSummarizeResult>('/api/ai/documents/summarize', toBody(request));
    }

    /** Extract then answer a question about the document. */
    async query(request: DocumentQueryRequest): Promise<DocumentQueryResult> {
        if (!request.question) throw new Error('documents.query requires a `question`');
        return this.post<DocumentQueryResult>('/api/ai/documents/query', toBody(request, { question: request.question }));
    }

    private async post<T>(path: string, body: JsonBody): Promise<T> {
        const response = await fetch(`${this.config.baseUrl}${path}`, {
            method: 'POST',
            headers: {
                'CENCORI_API_KEY': this.config.apiKey,
                'Content-Type': 'application/json',
                ...this.config.headers,
            },
            body: JSON.stringify(body),
        });
        const data = await response.json();
        if (!response.ok) {
            const message =
                (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string')
                    ? data.message
                    : `Documents request failed with status ${response.status}`;
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
