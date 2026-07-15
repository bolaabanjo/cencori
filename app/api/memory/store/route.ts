/**
 * Memory Store API Route
 *
 * POST /api/memory/store - Store a memory with optional auto-embedding
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { decryptApiKey } from '@/lib/encryption';
import { getPricingFromDB } from '@/lib/providers/pricing';
import { calculateProviderTokenCost } from '@/lib/providers/base';
import {
    validateGatewayRequest,
    addGatewayHeaders,
    handleCorsPreFlight,
    logGatewayRequest,
    incrementUsage,
} from '@/lib/gateway-middleware';
import { runGatewayInputPipeline } from '@/lib/gateway/input-guard';
import type { SubscriptionTier } from '@/lib/entitlements';
import { MEMORY_CONTENT_MAX_CHARS } from '@/lib/memory';

interface StoreMemoryRequest {
    namespace: string; // Namespace name or ID
    content: string;
    embedding?: number[]; // Optional pre-computed embedding
    metadata?: Record<string, unknown>;
    expiresAt?: string; // ISO date string
}

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function POST(req: NextRequest) {
    const validation = await validateGatewayRequest(req);
    if (!validation.success) {
        return validation.response;
    }
    const ctx = validation.context;

    try {
        const body: StoreMemoryRequest = await req.json();
        const { namespace, content, embedding, metadata = {}, expiresAt } = body;

        if (typeof namespace !== 'string' || !namespace.trim()) {
            return addGatewayHeaders(
                NextResponse.json(
                    { error: 'bad_request', message: 'Namespace is required' },
                    { status: 400 }
                ),
                { requestId: ctx.requestId }
            );
        }

        if (typeof content !== 'string' || !content.trim()) {
            return addGatewayHeaders(
                NextResponse.json(
                    { error: 'bad_request', message: 'Content is required' },
                    { status: 400 }
                ),
                { requestId: ctx.requestId }
            );
        }
        if (content.length > MEMORY_CONTENT_MAX_CHARS) {
            return addGatewayHeaders(
                NextResponse.json(
                    { error: 'bad_request', message: `Content exceeds ${MEMORY_CONTENT_MAX_CHARS} characters` },
                    { status: 400 }
                ),
                { requestId: ctx.requestId }
            );
        }
        if (embedding !== undefined && (
            !Array.isArray(embedding)
            || embedding.length !== 1536
            || embedding.some(value => typeof value !== 'number' || !Number.isFinite(value))
        )) {
            return addGatewayHeaders(
                NextResponse.json(
                    { error: 'bad_request', message: 'embedding must contain exactly 1536 finite numbers' },
                    { status: 400 }
                ),
                { requestId: ctx.requestId }
            );
        }
        let normalizedExpiresAt: string | null = null;
        if (expiresAt !== undefined) {
            const expiry = Date.parse(expiresAt);
            if (!Number.isFinite(expiry) || expiry <= Date.now()) {
                return addGatewayHeaders(
                    NextResponse.json(
                        { error: 'bad_request', message: 'expiresAt must be a future ISO-8601 timestamp' },
                        { status: 400 }
                    ),
                    { requestId: ctx.requestId }
                );
            }
            normalizedExpiresAt = new Date(expiry).toISOString();
        }

        const inputPipeline = await runGatewayInputPipeline({
            supabase: ctx.supabase,
            projectId: ctx.projectId,
            apiKeyId: ctx.apiKeyId,
            environment: ctx.environment,
            tier: (ctx.tier || 'free') as SubscriptionTier,
            messages: [{ role: 'user', content }],
        });
        if (!inputPipeline.ok) {
            await logGatewayRequest(ctx, {
                endpoint: 'memory/store',
                model: 'none',
                provider: 'none',
                status: 'blocked',
                errorMessage: inputPipeline.message,
            });
            return addGatewayHeaders(
                NextResponse.json(
                    { error: inputPipeline.code, message: inputPipeline.message, reasons: inputPipeline.reasons },
                    { status: inputPipeline.status }
                ),
                { requestId: ctx.requestId }
            );
        }
        const guardedContent = inputPipeline.messages[0]?.content ?? content;

        const supabase = ctx.supabase;

        // Find namespace by name or UUID within the caller's project.
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(namespace);
        const { data: namespaceData, error: nsError } = await supabase
            .from('memory_namespaces')
            .select('id, embedding_model, dimensions')
            .eq('project_id', ctx.projectId)
            .eq(isUUID ? 'id' : 'name', namespace)
            .single();

        if (nsError || !namespaceData) {
            return addGatewayHeaders(
                NextResponse.json(
                    { error: 'not_found', message: 'Namespace not found' },
                    { status: 404 }
                ),
                { requestId: ctx.requestId }
            );
        }

        const model = namespaceData.embedding_model || 'text-embedding-3-small';
        if (!['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'].includes(model)) {
            return addGatewayHeaders(
                NextResponse.json(
                    { error: 'unsupported_embedding_model', message: `Unsupported namespace embedding model: ${model}` },
                    { status: 400 }
                ),
                { requestId: ctx.requestId }
            );
        }
        // If a project rule transformed the text, the caller's vector no
        // longer represents what will be stored. Re-embed the guarded text.
        const usingClientEmbedding = Array.isArray(embedding)
            && embedding.length === 1536
            && guardedContent === content;

        let finalEmbedding = embedding;
        let promptTokens = 0;
        let totalTokens = 0;
        let providerCost = 0;
        let cencoriCharge = 0;
        let markupPercentage = 0;
        let providerName = 'none';

        if (!usingClientEmbedding) {
            providerName = 'openai';

            // Get OpenAI API key (BYOK or managed default).
            let openaiKey: string | null = null;
            const { data: providerKey } = await supabase
                .from('provider_keys')
                .select('encrypted_key, is_active')
                .eq('project_id', ctx.projectId)
                .eq('provider', 'openai')
                .eq('is_active', true)
                .single();

            if (providerKey?.encrypted_key) {
                openaiKey = decryptApiKey(providerKey.encrypted_key, ctx.organizationId);
            } else {
                openaiKey = process.env.OPENAI_API_KEY ?? null;
            }

            if (!openaiKey) {
                return addGatewayHeaders(
                    NextResponse.json(
                        {
                            error: 'provider_not_configured',
                            message: 'No OpenAI API key configured for embeddings',
                        },
                        { status: 400 }
                    ),
                    { requestId: ctx.requestId }
                );
            }

            const pricing = await getPricingFromDB('openai', model);
            const client = new OpenAI({ apiKey: openaiKey, timeout: 55_000, maxRetries: 0 });
            const embeddingResponse = await client.embeddings.create({
                model,
                input: guardedContent,
                ...(model.startsWith('text-embedding-3') ? { dimensions: 1536 } : {}),
            });

            finalEmbedding = embeddingResponse.data[0].embedding;
            promptTokens = embeddingResponse.usage?.prompt_tokens ?? 0;
            totalTokens = embeddingResponse.usage?.total_tokens ?? promptTokens;

            providerCost = calculateProviderTokenCost(totalTokens, 0, pricing);
            cencoriCharge = providerCost * (1 + pricing.cencoriMarkupPercentage / 100)
                + (pricing.fixedFeePerRequest ?? 0);
            markupPercentage = pricing.cencoriMarkupPercentage;
        }

        const { data: memory, error: storeError } = await supabase
            .from('memories')
            .insert({
                namespace_id: namespaceData.id,
                content: guardedContent,
                embedding: JSON.stringify(finalEmbedding),
                metadata,
                expires_at: normalizedExpiresAt,
            })
            .select('id, content, metadata, created_at')
            .single();

        if (storeError) {
            console.error('Error storing memory:', storeError);
            await logGatewayRequest(ctx, {
                endpoint: 'memory/store',
                model,
                provider: providerName,
                status: 'error',
                errorMessage: 'Failed to store memory',
            });

            return addGatewayHeaders(
                NextResponse.json(
                    { error: 'internal_error', message: 'Failed to store memory' },
                    { status: 500 }
                ),
                { requestId: ctx.requestId }
            );
        }

        await logGatewayRequest(ctx, {
            endpoint: 'memory/store',
            model,
            provider: providerName,
            status: 'success',
            promptTokens,
            totalTokens,
            costUsd: cencoriCharge,
            providerCostUsd: providerCost,
            cencoriChargeUsd: cencoriCharge,
            markupPercentage,
            metadata: {
                namespace_id: namespaceData.id,
                embedded: !usingClientEmbedding,
                content_length: guardedContent.length,
            },
        });
        await incrementUsage(ctx, cencoriCharge);

        return addGatewayHeaders(
            NextResponse.json(
                {
                    id: memory.id,
                    namespace,
                    content: memory.content,
                    metadata: memory.metadata,
                    embedded: !usingClientEmbedding,
                    createdAt: memory.created_at,
                },
                { status: 201 }
            ),
            { requestId: ctx.requestId }
        );
    } catch (error) {
        console.error('Memory store API error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        await logGatewayRequest(ctx, {
            endpoint: 'memory/store',
            model: 'unknown',
            provider: 'unknown',
            status: 'error',
            errorMessage,
        });

        return addGatewayHeaders(
            NextResponse.json(
                { error: 'internal_error', message: errorMessage },
                { status: 500 }
            ),
            { requestId: ctx.requestId }
        );
    }
}
