import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { decryptApiKey } from '@/lib/encryption';
import type { SubscriptionTier } from '@/lib/entitlements';
import {
    addGatewayHeaders,
    handleCorsPreFlight,
    incrementUsage,
    logGatewayRequest,
    validateGatewayRequest,
} from '@/lib/gateway-middleware';
import { promptPayload, toLoggedText } from '@/lib/gateway/log-payload';
import { runGatewayInputPipeline } from '@/lib/gateway/input-guard';
import { runGatewayOutputGuard } from '@/lib/gateway/output-guard';
import { getPricingFromDB } from '@/lib/providers/pricing';
import { calculateProviderTokenCost } from '@/lib/providers/base';

interface SearchMemoryRequest {
    namespace?: string;
    query?: string;
    limit?: number;
    threshold?: number;
    filter?: Record<string, unknown>;
}

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function POST(req: NextRequest) {
    const validation = await validateGatewayRequest(req);
    if (!validation.success) return validation.response;
    const ctx = validation.context;
    const startedAt = Date.now();
    const respond = (body: unknown, status: number) => addGatewayHeaders(
        NextResponse.json(body, { status }),
        { requestId: ctx.requestId },
    );

    // Kept outside the try so the failure path can still log what was asked.
    let queryForLog = '';

    try {
        const body = await req.json() as SearchMemoryRequest;
        const namespace = typeof body.namespace === 'string' ? body.namespace.trim() : '';
        const query = typeof body.query === 'string' ? body.query.trim() : '';
        queryForLog = query;
        if (!namespace || !query) {
            return respond(
                { error: 'bad_request', message: 'namespace and query are required' },
                400,
            );
        }
        if (query.length > 10_240) {
            return respond({ error: 'bad_request', message: 'query is too long' }, 400);
        }
        const limit = Math.min(100, Math.max(1, Math.round(body.limit ?? 10)));
        const threshold = Math.min(1, Math.max(0, body.threshold ?? 0.7));
        const filter = body.filter && typeof body.filter === 'object' && !Array.isArray(body.filter)
            ? body.filter
            : null;

        const inputPipeline = await runGatewayInputPipeline({
            supabase: ctx.supabase,
            projectId: ctx.projectId,
            apiKeyId: ctx.apiKeyId,
            environment: ctx.environment,
            tier: (ctx.tier || 'free') as SubscriptionTier,
            messages: [{ role: 'user', content: query }],
        });
        if (!inputPipeline.ok) {
            await logGatewayRequest(ctx, {
                endpoint: 'memory/search',
                model: 'none',
                provider: 'none',
                status: 'blocked',
                errorMessage: inputPipeline.message,
                requestPayload: promptPayload(query),
            });
            return respond(
                { error: inputPipeline.code, message: inputPipeline.message, reasons: inputPipeline.reasons },
                inputPipeline.status,
            );
        }
        const guardedQuery = inputPipeline.messages[0]?.content ?? query;

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(namespace);
        const { data: namespaceData, error: namespaceError } = await ctx.supabase
            .from('memory_namespaces')
            .select('id, name, embedding_model')
            .eq('project_id', ctx.projectId)
            .eq(isUuid ? 'id' : 'name', namespace)
            .single();
        if (namespaceError || !namespaceData) {
            return respond({ error: 'not_found', message: 'Namespace not found' }, 404);
        }

        const model = namespaceData.embedding_model || 'text-embedding-3-small';
        if (!['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'].includes(model)) {
            return respond(
                { error: 'unsupported_embedding_model', message: `Unsupported namespace embedding model: ${model}` },
                400,
            );
        }

        const { data: providerKey } = await ctx.supabase
            .from('provider_keys')
            .select('encrypted_key')
            .eq('project_id', ctx.projectId)
            .eq('provider', 'openai')
            .eq('is_active', true)
            .maybeSingle();
        const openaiKey = providerKey?.encrypted_key
            ? decryptApiKey(providerKey.encrypted_key, ctx.organizationId)
            : process.env.OPENAI_API_KEY;
        if (!openaiKey) {
            return respond(
                { error: 'provider_not_configured', message: 'No OpenAI API key configured for embeddings' },
                400,
            );
        }

        const pricing = await getPricingFromDB('openai', model);
        const client = new OpenAI({ apiKey: openaiKey, timeout: 55_000, maxRetries: 0 });
        const embeddingResponse = await client.embeddings.create({
            model,
            input: guardedQuery,
            ...(model.startsWith('text-embedding-3') ? { dimensions: 1536 } : {}),
        });
        const embedding = embeddingResponse.data[0]?.embedding;
        if (!embedding || embedding.length !== 1536) {
            throw new Error('Embedding provider returned an invalid vector');
        }

        const requestedCount = filter ? Math.min(1000, Math.max(limit * 5, limit)) : limit;
        const { data, error } = await ctx.supabase.rpc('search_memories', {
            p_namespace_id: namespaceData.id,
            p_query_embedding: JSON.stringify(embedding),
            p_limit: requestedCount,
            p_threshold: threshold,
        });
        if (error) throw new Error(`Memory search failed: ${error.message}`);

        const rows = (Array.isArray(data) ? data : []) as Array<{
            id: string;
            content: string;
            metadata: Record<string, unknown> | null;
            similarity: number;
            created_at: string;
        }>;
        const results = rows
            .filter(row => !filter || Object.entries(filter).every(([key, value]) => row.metadata?.[key] === value))
            .slice(0, limit)
            .map(row => ({
                id: row.id,
                namespace: namespaceData.name,
                content: row.content,
                metadata: row.metadata,
                similarity: Number(row.similarity),
                createdAt: row.created_at,
            }));

        const outputCheck = await runGatewayOutputGuard({
            supabase: ctx.supabase,
            projectId: ctx.projectId,
            apiKeyId: ctx.apiKeyId,
            environment: ctx.environment,
            outputText: results.map(result => result.content).join('\n'),
            inputText: inputPipeline.inputText,
            inputSecurity: inputPipeline.inputSecurity,
            conversationHistory: inputPipeline.messages,
        });

        const totalTokens = embeddingResponse.usage?.total_tokens
            ?? embeddingResponse.usage?.prompt_tokens
            ?? Math.max(1, Math.ceil(guardedQuery.length / 4));
        const providerCost = calculateProviderTokenCost(totalTokens, 0, pricing);
        const cencoriCharge = providerCost * (1 + pricing.cencoriMarkupPercentage / 100)
            + (pricing.fixedFeePerRequest ?? 0);
        await logGatewayRequest(ctx, {
            endpoint: 'memory/search',
            model,
            provider: 'openai',
            status: outputCheck.ok ? 'success' : 'blocked_output',
            promptTokens: totalTokens,
            completionTokens: 0,
            totalTokens,
            costUsd: cencoriCharge,
            providerCostUsd: providerCost,
            cencoriChargeUsd: cencoriCharge,
            markupPercentage: pricing.cencoriMarkupPercentage,
            errorMessage: outputCheck.ok ? undefined : outputCheck.message,
            metadata: { namespace_id: namespaceData.id, results: results.length },
            requestPayload: promptPayload(guardedQuery, { model }),
            responsePayload: outputCheck.ok
                ? {
                    content: results
                        .map((r: { content?: unknown }, i: number) => `${i + 1}. ${toLoggedText(r.content)}`)
                        .join('\n'),
                    results: results.length,
                }
                : undefined,
        });
        await incrementUsage(ctx, cencoriCharge);

        if (!outputCheck.ok) {
            return respond(
                { error: outputCheck.code, message: outputCheck.message, reasons: outputCheck.reasons },
                outputCheck.status,
            );
        }

        return respond({
            results,
            query,
            namespace: namespaceData.name,
            count: results.length,
            latencyMs: Date.now() - startedAt,
        }, 200);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Memory search failed';
        await logGatewayRequest(ctx, {
            endpoint: 'memory/search',
            model: 'unknown',
            provider: 'unknown',
            status: 'error',
            errorMessage: message,
            requestPayload: promptPayload(queryForLog),
        });
        return respond({ error: 'internal_error', message }, 500);
    }
}
