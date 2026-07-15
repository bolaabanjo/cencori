import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import OpenAI from 'openai';
import { decryptApiKey } from '@/lib/encryption';
import {
    validateGatewayRequest,
    addGatewayHeaders,
    handleCorsPreFlight,
    logGatewayRequest,
    incrementUsage,
} from '@/lib/gateway-middleware';

interface ModerationRequest {
    input: string | string[];
    model?: 'text-moderation-latest' | 'text-moderation-stable' | 'omni-moderation-latest';
}

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function POST(req: NextRequest) {
    // ── Gateway validation ──
    const validation = await validateGatewayRequest(req);
    if (!validation.success) {
        return validation.response;
    }
    const ctx = validation.context;

    try {
        const body: ModerationRequest = await req.json();
        const { input, model = 'text-moderation-latest' } = body;

        if (!input || (Array.isArray(input) && input.length === 0)) {
            return addGatewayHeaders(
                NextResponse.json({ error: 'bad_request', message: 'Input is required' }, { status: 400 }),
                { requestId: ctx.requestId }
            );
        }

        // Get OpenAI API key (BYOK or default)
        let openaiKey: string | null = null;

        const { data: providerKey } = await ctx.supabase
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
                NextResponse.json({ error: 'provider_not_configured', message: 'No OpenAI API key configured' }, { status: 400 }),
                { requestId: ctx.requestId }
            );
        }

        const client = new OpenAI({ apiKey: openaiKey, timeout: 55_000, maxRetries: 0 });

        const response = await client.moderations.create({ input, model });

        const anyFlagged = response.results.some(r => r.flagged);
        const inputText = Array.isArray(input) ? input.join(' ') : input;
        const estimatedTokens = Math.ceil(inputText.length / 4);

        await logGatewayRequest(ctx, {
            endpoint: 'moderation',
            model,
            provider: 'openai',
            status: anyFlagged ? 'filtered' : 'success',
            promptTokens: estimatedTokens,
            totalTokens: estimatedTokens,
            // Moderation is free from OpenAI
            costUsd: 0,
            providerCostUsd: 0,
            cencoriChargeUsd: 0,
            markupPercentage: 0,
            metadata: { flagged: anyFlagged, results_count: response.results.length },
        });
        await incrementUsage(ctx);

        // If flagged, log a security incident
        if (anyFlagged) {
            const flaggedCategories = response.results
                .filter(r => r.flagged)
                .flatMap(r => Object.entries(r.categories)
                    .filter(([_, flagged]) => flagged)
                    .map(([category]) => category)
                );

            await ctx.supabase.from('security_incidents').insert({
                id: crypto.randomUUID(),
                project_id: ctx.projectId,
                organization_id: ctx.organizationId,
                environment: ctx.environment === 'test' ? 'test' : 'production',
                incident_type: 'content_moderation',
                severity: 'medium',
                description: `Content flagged for: ${flaggedCategories.join(', ')}`,
                metadata: { categories: flaggedCategories, request_id: ctx.requestId },
                created_at: new Date().toISOString(),
            });
        }

        return addGatewayHeaders(
            NextResponse.json({
                id: response.id,
                model: response.model,
                results: response.results.map(result => ({
                    flagged: result.flagged,
                    categories: result.categories,
                    category_scores: result.category_scores,
                })),
            }),
            { requestId: ctx.requestId }
        );

    } catch (error) {
        console.error('Moderation API error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        await logGatewayRequest(ctx, {
            endpoint: 'moderation',
            model: 'text-moderation-latest',
            provider: 'openai',
            status: 'error',
            errorMessage,
        });

        return addGatewayHeaders(
            NextResponse.json({ error: 'internal_error', message: errorMessage }, { status: 500 }),
            { requestId: ctx.requestId }
        );
    }
}

export async function GET() {
    return NextResponse.json({
        models: [
            { id: 'text-moderation-latest', description: 'Latest moderation model' },
            { id: 'text-moderation-stable', description: 'Stable moderation model' },
            { id: 'omni-moderation-latest', description: 'Multimodal moderation (text + images)' },
        ],
        categories: [
            'hate', 'hate/threatening', 'harassment', 'harassment/threatening',
            'self-harm', 'self-harm/intent', 'self-harm/instructions',
            'sexual', 'sexual/minors', 'violence', 'violence/graphic',
        ],
    });
}
