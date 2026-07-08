/**
 * POST /api/ai/documents/summarize
 *
 * Extract text from a PDF or image, then generate a concise summary via chat.
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

const SUMMARY_MODEL = 'gpt-4o-mini';

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function POST(req: NextRequest) {
    const validation = await validateGatewayRequest(req);
    if (!validation.success) return validation.response;
    const ctx = validation.context;

    try {
        const { input, opts } = await parseDocumentRequest(req);
        const extracted = await extractDocument(ctx, input, opts);

        // Resolve OpenAI key
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
        const summaryResp = await client.chat.completions.create({
            model: SUMMARY_MODEL,
            temperature: 0.2,
            max_tokens: 800,
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert document summarizer. Given a document, produce a concise, faithful summary. Keep numbers, names, and dates exact. Do not invent details.',
                },
                { role: 'user', content: `Summarize this document:\n\n${extracted.text}` },
            ],
        });
        const summary = summaryResp.choices[0]?.message?.content ?? '';
        const summaryPromptTokens = summaryResp.usage?.prompt_tokens ?? 0;
        const summaryCompletionTokens = summaryResp.usage?.completion_tokens ?? 0;

        const pricing = await getPricingFromDB('openai', SUMMARY_MODEL);
        const summaryProviderCost =
            (summaryPromptTokens / 1000) * pricing.inputPer1KTokens +
            (summaryCompletionTokens / 1000) * pricing.outputPer1KTokens;
        const summaryCharge = summaryProviderCost * (1 + pricing.cencoriMarkupPercentage / 100);

        // Combine costs (extract may have run through Vision)
        const totalProviderCost = summaryProviderCost + (extracted.cost?.providerCostUsd ?? 0);
        const totalCharge = summaryCharge + (extracted.cost?.cencoriChargeUsd ?? 0);

        await logGatewayRequest(ctx, {
            endpoint: 'documents/summarize',
            model: SUMMARY_MODEL,
            provider: 'openai',
            status: 'success',
            promptTokens: summaryPromptTokens + (extracted.usage?.promptTokens ?? 0),
            completionTokens: summaryCompletionTokens + (extracted.usage?.completionTokens ?? 0),
            totalTokens: summaryPromptTokens + summaryCompletionTokens + (extracted.usage?.totalTokens ?? 0),
            costUsd: totalCharge,
            providerCostUsd: totalProviderCost,
            cencoriChargeUsd: totalCharge,
            markupPercentage: pricing.cencoriMarkupPercentage,
            metadata: { extract_method: extracted.method, kind: extracted.kind, pageCount: extracted.pageCount },
        });
        await incrementUsage(ctx);

        return addGatewayHeaders(
            NextResponse.json({
                summary,
                text: extracted.text,
                pageCount: extracted.pageCount,
                model: SUMMARY_MODEL,
                provider: 'openai',
                extractMethod: extracted.method,
                usage: {
                    promptTokens: summaryPromptTokens + (extracted.usage?.promptTokens ?? 0),
                    completionTokens: summaryCompletionTokens + (extracted.usage?.completionTokens ?? 0),
                    totalTokens: summaryPromptTokens + summaryCompletionTokens + (extracted.usage?.totalTokens ?? 0),
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
                endpoint: 'documents/summarize',
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
        console.error('[Documents/summarize] Error:', error);
        await logGatewayRequest(ctx, {
            endpoint: 'documents/summarize',
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
