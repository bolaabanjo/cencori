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
import { calculateProviderTokenCost } from '@/lib/providers/base';
import { runGatewayInputPipeline } from '@/lib/gateway/input-guard';
import { runGatewayOutputGuard } from '@/lib/gateway/output-guard';
import { deTokenize } from '@/lib/safety/custom-data-rules';
import type { SubscriptionTier } from '@/lib/entitlements';

const SUMMARY_MODEL = 'gpt-4o-mini';

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function POST(req: NextRequest) {
    const validation = await validateGatewayRequest(req);
    if (!validation.success) return validation.response;
    const ctx = validation.context;

    try {
        // Fail before document extraction if the generation model cannot be
        // billed exactly.
        const pricing = await getPricingFromDB('openai', SUMMARY_MODEL);
        const { input, opts } = await parseDocumentRequest(req);
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
                return addGatewayHeaders(
                    NextResponse.json({ error: promptGuard.code, message: promptGuard.message }, { status: promptGuard.status }),
                    { requestId: ctx.requestId }
                );
            }
            opts.prompt = promptGuard.messages[0]?.content ?? opts.prompt;
        }
        const extracted = await extractDocument(ctx, input, opts);

        const providerInput = `Summarize this document:\n\n${extracted.text}`;
        const inputPipeline = await runGatewayInputPipeline({
            supabase: ctx.supabase,
            projectId: ctx.projectId,
            apiKeyId: ctx.apiKeyId,
            environment: ctx.environment,
            tier: (ctx.tier || 'free') as SubscriptionTier,
            messages: [{ role: 'user', content: providerInput }],
        });
        if (!inputPipeline.ok) {
            return addGatewayHeaders(
                NextResponse.json({ error: inputPipeline.code, message: inputPipeline.message, reasons: inputPipeline.reasons }, { status: inputPipeline.status }),
                { requestId: ctx.requestId }
            );
        }

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

        const client = new OpenAI({ apiKey: openaiKey, timeout: 55_000, maxRetries: 0 });
        const summaryResp = await client.chat.completions.create({
            model: SUMMARY_MODEL,
            temperature: 0.2,
            max_tokens: 800,
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert document summarizer. Given a document, produce a concise, faithful summary. Keep numbers, names, and dates exact. Do not invent details.',
                },
                { role: 'user', content: inputPipeline.messages[0]?.content ?? providerInput },
            ],
        });
        const rawSummary = summaryResp.choices[0]?.message?.content ?? '';
        const summary = inputPipeline.tokenMap
            ? deTokenize(rawSummary, inputPipeline.tokenMap)
            : rawSummary;
        const summaryPromptTokens = summaryResp.usage?.prompt_tokens ?? 0;
        const summaryCompletionTokens = summaryResp.usage?.completion_tokens ?? 0;

        const summaryProviderCost = calculateProviderTokenCost(
            summaryPromptTokens,
            summaryCompletionTokens,
            pricing
        );
        const summaryCharge = summaryProviderCost * (1 + pricing.cencoriMarkupPercentage / 100)
            + (pricing.fixedFeePerRequest ?? 0);

        // Combine costs (extract may have run through Vision)
        const totalProviderCost = summaryProviderCost + (extracted.cost?.providerCostUsd ?? 0);
        const totalCharge = summaryCharge + (extracted.cost?.cencoriChargeUsd ?? 0);

        const outputCheck = await runGatewayOutputGuard({
            supabase: ctx.supabase,
            projectId: ctx.projectId,
            apiKeyId: ctx.apiKeyId,
            environment: ctx.environment,
            outputText: summary,
            inputText: inputPipeline.inputText,
            inputSecurity: inputPipeline.inputSecurity,
            conversationHistory: inputPipeline.messages,
        });

        await logGatewayRequest(ctx, {
            endpoint: 'documents/summarize',
            model: SUMMARY_MODEL,
            provider: 'openai',
            status: outputCheck.ok ? 'success' : 'blocked_output',
            promptTokens: summaryPromptTokens + (extracted.usage?.promptTokens ?? 0),
            completionTokens: summaryCompletionTokens + (extracted.usage?.completionTokens ?? 0),
            totalTokens: summaryPromptTokens + summaryCompletionTokens + (extracted.usage?.totalTokens ?? 0),
            costUsd: totalCharge,
            providerCostUsd: totalProviderCost,
            cencoriChargeUsd: totalCharge,
            markupPercentage: pricing.cencoriMarkupPercentage,
            metadata: { extract_method: extracted.method, kind: extracted.kind, pageCount: extracted.pageCount },
            errorMessage: outputCheck.ok ? undefined : outputCheck.message,
        });
        await incrementUsage(ctx, totalCharge);

        if (!outputCheck.ok) {
            return addGatewayHeaders(
                NextResponse.json({ error: outputCheck.code, message: outputCheck.message, reasons: outputCheck.reasons }, { status: outputCheck.status }),
                { requestId: ctx.requestId }
            );
        }

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
