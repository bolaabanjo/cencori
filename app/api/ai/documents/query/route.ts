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
import { calculateProviderTokenCost } from '@/lib/providers/base';
import { runGatewayInputPipeline } from '@/lib/gateway/input-guard';
import { promptPayload, textResponsePayload } from '@/lib/gateway/log-payload';
import { describeDocumentInput } from '@/lib/documents/log';
import { runGatewayOutputGuard } from '@/lib/gateway/output-guard';
import { deTokenize } from '@/lib/safety/custom-data-rules';
import type { SubscriptionTier } from '@/lib/entitlements';

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

    // Kept outside the try so the failure paths can still log what was sent.
    let documentForLog = '[document]';
    let questionForLog = '';

    try {
        const question = await extractQuestion(req);
        questionForLog = question;
        if (!question) {
            return addGatewayHeaders(
                NextResponse.json({ error: 'bad_request', message: '`question` field is required' }, { status: 400 }),
                { requestId: ctx.requestId }
            );
        }

        // Fail before document extraction if the generation model cannot be
        // billed exactly.
        const pricing = await getPricingFromDB('openai', QUERY_MODEL);

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
                    endpoint: 'documents/query',
                    model: QUERY_MODEL,
                    provider: 'openai',
                    status: 'blocked',
                    errorMessage: promptGuard.message,
                    requestPayload: promptPayload(`${documentForLog}\n\nQuestion: ${questionForLog}`),
                });
                return addGatewayHeaders(
                    NextResponse.json({ error: promptGuard.code, message: promptGuard.message }, { status: promptGuard.status }),
                    { requestId: ctx.requestId }
                );
            }
            opts.prompt = promptGuard.messages[0]?.content ?? opts.prompt;
        }
        const extracted = await extractDocument(ctx, input, opts);

        const providerInput = `Document:\n\n${extracted.text}\n\n---\n\nQuestion: ${question}`;
        const inputPipeline = await runGatewayInputPipeline({
            supabase: ctx.supabase,
            projectId: ctx.projectId,
            apiKeyId: ctx.apiKeyId,
            environment: ctx.environment,
            tier: (ctx.tier || 'free') as SubscriptionTier,
            messages: [{ role: 'user', content: providerInput }],
        });
        if (!inputPipeline.ok) {
            await logGatewayRequest(ctx, {
                endpoint: 'documents/query',
                model: QUERY_MODEL,
                provider: 'openai',
                status: 'blocked',
                errorMessage: inputPipeline.message,
                requestPayload: promptPayload(`${documentForLog}\n\nQuestion: ${questionForLog}`, { model: QUERY_MODEL }),
            });
            return addGatewayHeaders(
                NextResponse.json({ error: inputPipeline.code, message: inputPipeline.message, reasons: inputPipeline.reasons }, { status: inputPipeline.status }),
                { requestId: ctx.requestId }
            );
        }

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
        const queryResp = await client.chat.completions.create({
            model: QUERY_MODEL,
            temperature: 0,
            max_tokens: 1024,
            messages: [
                {
                    role: 'system',
                    content: 'You answer questions strictly from the provided document. If the answer is not present, say "Not found in the document." Do not invent details. Include short quoted excerpts when useful.',
                },
                { role: 'user', content: inputPipeline.messages[0]?.content ?? providerInput },
            ],
        });
        const rawAnswer = queryResp.choices[0]?.message?.content ?? '';
        const answer = inputPipeline.tokenMap
            ? deTokenize(rawAnswer, inputPipeline.tokenMap)
            : rawAnswer;
        const promptTokens = queryResp.usage?.prompt_tokens ?? 0;
        const completionTokens = queryResp.usage?.completion_tokens ?? 0;

        const providerCost = calculateProviderTokenCost(
            promptTokens,
            completionTokens,
            pricing
        );
        const charge = providerCost * (1 + pricing.cencoriMarkupPercentage / 100)
            + (pricing.fixedFeePerRequest ?? 0);

        const totalProviderCost = providerCost + (extracted.cost?.providerCostUsd ?? 0);
        const totalCharge = charge + (extracted.cost?.cencoriChargeUsd ?? 0);

        const outputCheck = await runGatewayOutputGuard({
            supabase: ctx.supabase,
            projectId: ctx.projectId,
            apiKeyId: ctx.apiKeyId,
            environment: ctx.environment,
            outputText: answer,
            inputText: inputPipeline.inputText,
            inputSecurity: inputPipeline.inputSecurity,
            conversationHistory: inputPipeline.messages,
        });

        await logGatewayRequest(ctx, {
            endpoint: 'documents/query',
            model: QUERY_MODEL,
            provider: 'openai',
            status: outputCheck.ok ? 'success' : 'blocked_output',
            promptTokens: promptTokens + (extracted.usage?.promptTokens ?? 0),
            completionTokens: completionTokens + (extracted.usage?.completionTokens ?? 0),
            totalTokens: promptTokens + completionTokens + (extracted.usage?.totalTokens ?? 0),
            costUsd: totalCharge,
            providerCostUsd: totalProviderCost,
            cencoriChargeUsd: totalCharge,
            markupPercentage: pricing.cencoriMarkupPercentage,
            metadata: { extract_method: extracted.method, kind: extracted.kind, pageCount: extracted.pageCount, question_length: question.length },
            requestPayload: promptPayload(`${documentForLog}\n\nQuestion: ${question}`, { model: QUERY_MODEL }),
            responsePayload: outputCheck.ok ? textResponsePayload(answer) : undefined,
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
                requestPayload: promptPayload(`${documentForLog}\n\nQuestion: ${questionForLog}`),
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
            requestPayload: promptPayload(`${documentForLog}\n\nQuestion: ${questionForLog}`),
        });
        return addGatewayHeaders(
            NextResponse.json({ error: 'internal_error', message }, { status: 500 }),
            { requestId: ctx.requestId }
        );
    }
}
