/**
 * POST /api/ai/documents/extract
 *
 * Accepts a PDF or image and returns clean text plus per-page metadata.
 * Native text extraction for text-based PDFs (fast, cheap, no LLM).
 * Vision OCR for images. Scanned PDFs currently return a clear error
 * pointing the caller at /api/ai/vision.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    validateGatewayRequest,
    addGatewayHeaders,
    handleCorsPreFlight,
    logGatewayRequest,
    incrementUsage,
} from '@/lib/gateway-middleware';
import {
    extractDocument,
    parseDocumentRequest,
    DocumentValidationError,
    MAX_DOCUMENT_BYTES,
} from '@/lib/documents/extract';

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function POST(req: NextRequest) {
    const validation = await validateGatewayRequest(req);
    if (!validation.success) return validation.response;
    const ctx = validation.context;

    try {
        const { input, opts } = await parseDocumentRequest(req);
        const result = await extractDocument(ctx, input, opts);

        await logGatewayRequest(ctx, {
            endpoint: 'documents/extract',
            model: result.model ?? 'pdf-parse',
            provider: result.provider ?? 'native',
            status: 'success',
            promptTokens: result.usage?.promptTokens ?? 0,
            completionTokens: result.usage?.completionTokens ?? 0,
            totalTokens: result.usage?.totalTokens ?? 0,
            costUsd: result.cost?.cencoriChargeUsd ?? 0,
            providerCostUsd: result.cost?.providerCostUsd ?? 0,
            cencoriChargeUsd: result.cost?.cencoriChargeUsd ?? 0,
            markupPercentage: result.cost?.markupPercentage ?? 0,
            metadata: { method: result.method, kind: result.kind, pageCount: result.pageCount },
        });
        await incrementUsage(ctx);

        return addGatewayHeaders(NextResponse.json(result), { requestId: ctx.requestId });
    } catch (error) {
        if (error instanceof DocumentValidationError) {
            await logGatewayRequest(ctx, {
                endpoint: 'documents/extract',
                model: 'unknown',
                provider: 'unknown',
                status: 'error',
                errorMessage: error.message,
                metadata: { code: error.code, ...error.details },
            });
            return addGatewayHeaders(
                NextResponse.json({ error: error.code, message: error.message, ...error.details }, { status: 400 }),
                { requestId: ctx.requestId }
            );
        }

        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Documents] Error:', error);
        await logGatewayRequest(ctx, {
            endpoint: 'documents/extract',
            model: 'unknown',
            provider: 'unknown',
            status: 'error',
            errorMessage: message,
        });
        return addGatewayHeaders(
            NextResponse.json({ error: 'internal_error', message }, { status: 500 }),
            { requestId: ctx.requestId }
        );
    }
}

export async function GET() {
    return NextResponse.json({
        endpoint: '/api/ai/documents/extract',
        description: 'Extract text from a PDF or image.',
        accepts: ['multipart/form-data (file)', 'application/json ({ document_url } | { document_base64, mime_type })'],
        supportedFormats: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        limits: { maxBytes: MAX_DOCUMENT_BYTES, maxMB: MAX_DOCUMENT_BYTES / (1024 * 1024) },
        methods: [
            { name: 'pdf_text', description: 'Native PDF text extraction for text-based PDFs. Free (no LLM call).' },
            { name: 'vision_ocr', description: 'Vision-based OCR for image inputs. Uses the vision endpoint.' },
        ],
        related: [
            { path: '/api/ai/documents/summarize', description: 'Extract then summarize the document' },
            { path: '/api/ai/documents/query', description: 'Extract then answer a question about the document' },
        ],
        notes: [
            'Scanned PDFs (no embedded text) are not yet supported. Rasterize to per-page PNGs and POST as images.',
        ],
    });
}
