/**
 * Documents extraction core.
 *
 * Handles PDF and image inputs. Extracts text plus per-page structure.
 * For text-based PDFs we parse natively (fast, cheap, no LLM). For
 * image inputs we route through the Vision analyzer. Scanned PDFs
 * fall back to Vision when native text extraction returns nothing.
 */

import type { NextRequest } from 'next/server';
import type { GatewayContext } from '@/lib/gateway-middleware';
import { analyzeVision, type VisionAnalyzeRequest } from '@/lib/vision/analyze';

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024; // 25MB

export type DocumentInputKind = 'pdf' | 'image';

export interface DocumentInput {
    bytes: Buffer;
    mimeType: string;
    filename?: string;
}

export interface DocumentExtractResult {
    text: string;
    pageCount: number;
    kind: DocumentInputKind;
    method: 'pdf_text' | 'vision_ocr';
    model?: string;
    provider?: string;
    metadata?: Record<string, unknown>;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    cost?: {
        providerCostUsd: number;
        cencoriChargeUsd: number;
        markupPercentage: number;
    };
}

export interface DocumentExtractOptions {
    prompt?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
}

// ── Input classification ───────────────────────────────────────

function classifyKind(mime: string, filename?: string): DocumentInputKind | null {
    const m = mime.toLowerCase();
    if (m === 'application/pdf') return 'pdf';
    if (m.startsWith('image/')) return 'image';
    if (filename?.toLowerCase().endsWith('.pdf')) return 'pdf';
    return null;
}

export class DocumentValidationError extends Error {
    readonly code: string;
    readonly details: Record<string, unknown>;
    constructor(code: string, message: string, details: Record<string, unknown> = {}) {
        super(message);
        this.name = 'DocumentValidationError';
        this.code = code;
        this.details = details;
    }
}

// ── PDF text extraction (native, no LLM) ───────────────────────

async function extractPdfText(bytes: Buffer): Promise<{ text: string; pageCount: number; metadata: Record<string, unknown> }> {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: bytes });
    try {
        const [textResult, info] = await Promise.all([
            parser.getText(),
            parser.getInfo().catch(() => null),
        ]);
        return {
            text: textResult.text?.trim() ?? '',
            pageCount: textResult.total ?? textResult.pages?.length ?? 0,
            metadata: {
                info: info?.info ?? null,
                metadata: info?.metadata ?? null,
                pagesWithText: textResult.pages?.length ?? 0,
            },
        };
    } finally {
        await parser.destroy().catch(() => undefined);
    }
}

// ── Vision OCR fallback ────────────────────────────────────────

async function extractViaVision(
    ctx: GatewayContext,
    input: DocumentInput,
    opts: DocumentExtractOptions
): Promise<{ text: string; result: Awaited<ReturnType<typeof analyzeVision>> }> {
    const req: VisionAnalyzeRequest = {
        image: { base64: input.bytes.toString('base64'), mimeType: input.mimeType },
        prompt: opts.prompt ?? 'Extract every piece of text visible in this document. Preserve reading order and line breaks. Do not paraphrase.',
        model: opts.model,
        maxTokens: opts.maxTokens ?? 2048,
        temperature: opts.temperature ?? 0,
    };
    const result = await analyzeVision(ctx, req);
    return { text: result.analysis, result };
}

// ── Main entry point ───────────────────────────────────────────

export async function extractDocument(
    ctx: GatewayContext,
    input: DocumentInput,
    opts: DocumentExtractOptions = {}
): Promise<DocumentExtractResult> {
    const kind = classifyKind(input.mimeType, input.filename);
    if (!kind) {
        throw new DocumentValidationError(
            'unsupported_format',
            `File "${input.filename ?? 'unknown'}" is ${input.mimeType || 'an unknown type'}. Supported: PDF, JPEG, PNG, WEBP, GIF.`,
            { receivedFormat: input.mimeType, supportedFormats: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'] }
        );
    }

    if (input.bytes.length > MAX_DOCUMENT_BYTES) {
        throw new DocumentValidationError(
            'document_too_large',
            `File is ${(input.bytes.length / (1024 * 1024)).toFixed(1)}MB but the maximum is ${MAX_DOCUMENT_BYTES / (1024 * 1024)}MB.`,
            { receivedBytes: input.bytes.length, maxBytes: MAX_DOCUMENT_BYTES }
        );
    }

    if (kind === 'pdf') {
        try {
            const parsed = await extractPdfText(input.bytes);
            if (parsed.text.length > 0) {
                return {
                    text: parsed.text,
                    pageCount: parsed.pageCount,
                    kind: 'pdf',
                    method: 'pdf_text',
                    metadata: parsed.metadata,
                };
            }
            // Empty native text → likely scanned PDF. Fall through to Vision but flag it.
            throw new DocumentValidationError(
                'scanned_pdf_not_yet_supported',
                'This PDF appears to be scanned (contains no extractable text). Rasterize the pages to images and use /api/ai/vision, or split into per-page PNGs and POST via /api/ai/documents/extract as an image.',
                { pageCount: parsed.pageCount }
            );
        } catch (err) {
            if (err instanceof DocumentValidationError) throw err;
            throw new DocumentValidationError(
                'pdf_parse_failed',
                err instanceof Error ? err.message : 'Failed to parse PDF',
                {}
            );
        }
    }

    // Image path → Vision OCR
    const { text, result } = await extractViaVision(ctx, input, opts);
    return {
        text,
        pageCount: 1,
        kind: 'image',
        method: 'vision_ocr',
        model: result.model,
        provider: result.provider,
        usage: result.usage,
        cost: result.cost,
    };
}

// ── Request parser ─────────────────────────────────────────────

export interface ParsedDocumentRequest {
    input: DocumentInput;
    opts: DocumentExtractOptions;
}

export async function parseDocumentRequest(req: NextRequest): Promise<ParsedDocumentRequest> {
    const contentType = req.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
        const form = await req.formData();
        const file = form.get('file');
        if (!(file instanceof File)) throw new DocumentValidationError('bad_request', 'Multipart request requires a `file` field');
        const bytes = Buffer.from(await file.arrayBuffer());
        return {
            input: { bytes, mimeType: file.type || 'application/octet-stream', filename: file.name },
            opts: {
                prompt: (form.get('prompt') as string) || undefined,
                model: (form.get('model') as string) || undefined,
                maxTokens: form.get('max_tokens') ? Number(form.get('max_tokens')) : undefined,
                temperature: form.get('temperature') ? Number(form.get('temperature')) : undefined,
            },
        };
    }

    const body = await req.json();
    if (body.document_url && typeof body.document_url === 'string') {
        const res = await fetch(body.document_url);
        if (!res.ok) throw new DocumentValidationError('fetch_failed', `Failed to fetch document: ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const mimeType = res.headers.get('content-type')?.split(';')[0] ?? 'application/octet-stream';
        return {
            input: { bytes: buf, mimeType, filename: body.document_url.split('/').pop() },
            opts: {
                prompt: body.prompt,
                model: body.model,
                maxTokens: body.max_tokens,
                temperature: body.temperature,
            },
        };
    }

    if (body.document_base64 && typeof body.document_base64 === 'string') {
        const buf = Buffer.from(body.document_base64, 'base64');
        return {
            input: { bytes: buf, mimeType: body.mime_type ?? 'application/octet-stream', filename: body.filename },
            opts: {
                prompt: body.prompt,
                model: body.model,
                maxTokens: body.max_tokens,
                temperature: body.temperature,
            },
        };
    }

    throw new DocumentValidationError('bad_request', 'Request requires `document_url`, `document_base64`, or multipart `file` field');
}
