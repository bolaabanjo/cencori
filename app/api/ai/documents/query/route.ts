/**
 * POST /api/ai/documents/query
 *
 * Extract text from a PDF or image, then answer a question about it.
 * Requires a `question` field in the request body (multipart or JSON).
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
import {
    extractDocument,
    parseDocumentRequest,
    DocumentValidationError,
} from '@/lib/documents/extract';
import { getPricingFromDB } from '@/lib/providers/pricing';

const QUERY_MODEL = 'gpt-4o-mini';

export async function OPTIONS() {
    return handleCorsPreFlight();
}

async function extractQuestion(req: NextRequest): Promise<string> {
    const contentType = req.headers.get('content-type') ?? '';
    const cloned = req.clone();
    if (contentType.includes('multipart/form-data')) {
        const form = await cloned.formData();
        const q = form.get('question');
        return typeof q === 'string' ? q : '';
    }
    const body = await cloned.json().catch(() => ({}));
    return typeof body.question === 'string' ? body.question : '';
}

export async function POST(req: NextRequest) {
    const validation = await validateGatewayRequest(req);
    if (!validation.success) return validation.response;
    const ctx = validation.context;

    try {
        const question = await extractQuestion(req);
        if (!question) {
            return addGatewayHeaders(
                NextResponse.json({ error: 'bad_request', message: '`question` field is required' }, { status: 400 }),
                { requestId: ctx.requestId }
            );
        }

        const { input, opts } = await parseDocumentRequest(req);
        const extracted = await extractDocument(ctx, input, opts);

        const { data: providerKey } = await ctx.supabase
            .from('provider_keys')
            .select('encrypted_key, is_active')
            .eq('project_id', ctx.projectId)
            .eq('provider', 'openai')
            .eq('is_active', true)
            .maybeSingle();
        const openaiKey = providerKey?.encrypted_key
            ? decryptApiKey(providerKey.encrypted_key, ctx.organizationId)
            : process.env.OPENAI_API_KEY;
        if (!openaiKey) {
            return addGatewayHeaders(
                NextResponse.json({ error: 'provider_not_configured', message: 'No OpenAI API key configured for this project' }, { status: 400 }),
                { requestId: ctx.requestId }
            );
        }

        const client = new OpenAI({ apiKey: openaiKey });
        const queryResp = await client.chat.completions.create({
            model: QUERY_MODEL,
            temperature: 0,
            max_tokens: 1024,
            messages: [
                {
                    role: 'system',
                    content: 'You answer questions strictly from the provided document. If the answer is not present, say "Not found in the document." Do not invent details. Include short quoted excerpts when useful.',
                },
                { role: 'user', content: `Document:\n\n${extracted.text}\n\n---\n\nQuestion: ${question}` },
            ],
        });
        const answer = queryResp.choices[0]?.message?.content ?? '';
        const promptTokens = queryResp.usage?.prompt_tokens ?? 0;
        const completionTokens = queryResp.usage?.completion_tokens ?? 0;

        const pricing = await getPricingFromDB('openai', QUERY_MODEL);
        const providerCost =
            (promptTokens / 1000) * pricing.inputPer1KTokens +
            (completionTokens / 1000) * pricing.outputPer1KTokens;
        const charge = providerCost * (1 + pricing.cencoriMarkupPercentage / 100);

        const totalProviderCost = providerCost + (extracted.cost?.providerCostUsd ?? 0);
        const totalCharge = charge + (extracted.cost?.cencoriChargeUsd ?? 0);

        await logGatewayRequest(ctx, {
            endpoint: 'documents/query',
            model: QUERY_MODEL,
            provider: 'openai',
            status: 'success',
            promptTokens: promptTokens + (extracted.usage?.promptTokens ?? 0),
            completionTokens: completionTokens + (extracted.usage?.completionTokens ?? 0),
            totalTokens: promptTokens + completionTokens + (extracted.usage?.totalTokens ?? 0),
            costUsd: totalCharge,
            providerCostUsd: totalProviderCost,
            cencoriChargeUsd: totalCharge,
            markupPercentage: pricing.cencoriMarkupPercentage,
            metadata: { extract_method: extracted.method, kind: extracted.kind, pageCount: extracted.pageCount, question_length: question.length },
        });
        await incrementUsage(ctx);

        return addGatewayHeaders(
            NextResponse.json({
                answer,
                question,
                pageCount: extracted.pageCount,
                extractMethod: extracted.method,
                model: QUERY_MODEL,
                provider: 'openai',
                usage: {
                    promptTokens: promptTokens + (extracted.usage?.promptTokens ?? 0),
                    completionTokens: completionTokens + (extracted.usage?.completionTokens ?? 0),
                    totalTokens: promptTokens + completionTokens + (extracted.usage?.totalTokens ?? 0),
                },
                cost: {
                    providerCostUsd: totalProviderCost,
                    cencoriChargeUsd: totalCharge,
                    markupPercentage: pricing.cencoriMarkupPercentage,
                },
            }),
            { requestId: ctx.requestId }
        );
    } catch (error) {
        if (error instanceof DocumentValidationError) {
            await logGatewayRequest(ctx, {
                endpoint: 'documents/query',
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
        console.error('[Documents/query] Error:', error);
        await logGatewayRequest(ctx, {
            endpoint: 'documents/query',
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
