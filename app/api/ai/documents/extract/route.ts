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
import { runGatewayInputPipeline } from '@/lib/gateway/input-guard';
import { promptPayload, textResponsePayload } from '@/lib/gateway/log-payload';
import { describeDocumentInput } from '@/lib/documents/log';
import type { SubscriptionTier } from '@/lib/entitlements';

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function POST(req: NextRequest) {
    const validation = await validateGatewayRequest(req);
    if (!validation.success) return validation.response;
    const ctx = validation.context;

    // Kept outside the try so the failure paths can still log what was sent.
    let documentForLog = '[document]';

    try {
        const { input, opts } = await parseDocumentRequest(req);
        documentForLog = describeDocumentInput(input, opts.prompt);
        if (opts.prompt) {
            const promptGuard = await runGatewayInputPipeline({
                supabase: ctx.supabase,
                projectId: ctx.projectId,
                apiKeyId: ctx.apiKeyId,
                environment: ctx.environment,
                tier: (ctx.tier || 'free') as SubscriptionTier,
                messages: [{ role: 'user', content: opts.prompt }],
            });
            if (!promptGuard.ok) {
                // Without this a guard-blocked prompt leaves no log row at all.
                await logGatewayRequest(ctx, {
                    endpoint: 'documents/extract',
                    model: 'unknown',
                    provider: 'unknown',
                    status: 'blocked',
                    errorMessage: promptGuard.message,
                    requestPayload: promptPayload(documentForLog),
                });
                return addGatewayHeaders(
                    NextResponse.json(
                        { error: promptGuard.code, message: promptGuard.message, reasons: promptGuard.reasons },
                        { status: promptGuard.status }
                    ),
                    { requestId: ctx.requestId }
                );
            }
            opts.prompt = promptGuard.messages[0]?.content ?? opts.prompt;
        }
        const result = await extractDocument(ctx, input, opts);
        const contentGuard = await runGatewayInputPipeline({
            supabase: ctx.supabase,
            projectId: ctx.projectId,
            apiKeyId: ctx.apiKeyId,
            environment: ctx.environment,
            tier: (ctx.tier || 'free') as SubscriptionTier,
            messages: [{ role: 'user', content: result.text }],
        });
        if (!contentGuard.ok) {
            await logGatewayRequest(ctx, {
                endpoint: 'documents/extract',
                model: result.model ?? 'pdf-parse',
                provider: result.provider ?? 'native',
                status: 'blocked',
                costUsd: result.cost?.cencoriChargeUsd ?? 0,
                providerCostUsd: result.cost?.providerCostUsd ?? 0,
                cencoriChargeUsd: result.cost?.cencoriChargeUsd ?? 0,
                errorMessage: contentGuard.message,
                requestPayload: promptPayload(documentForLog, { model: result.model }),
            });
            await incrementUsage(ctx, result.cost?.cencoriChargeUsd ?? 0);
            return addGatewayHeaders(
                NextResponse.json(
                    { error: contentGuard.code, message: contentGuard.message, reasons: contentGuard.reasons },
                    { status: contentGuard.status }
                ),
                { requestId: ctx.requestId }
            );
        }
        result.text = contentGuard.messages[0]?.content ?? result.text;

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
            requestPayload: promptPayload(documentForLog, { model: result.model ?? 'pdf-parse' }),
            responsePayload: textResponsePayload(result.text, { pages: result.pageCount }),
        });
        await incrementUsage(ctx, result.cost?.cencoriChargeUsd ?? 0);

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
                requestPayload: promptPayload(documentForLog),
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
            requestPayload: promptPayload(documentForLog),
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
