import { NextRequest, NextResponse } from 'next/server';
import {
    addGatewayHeaders,
    handleCorsPreFlight,
    validateGatewayRequest,
} from '@/lib/gateway-middleware';

interface CreateNamespaceRequest {
    name?: string;
    description?: string;
    embeddingModel?: string;
    dimensions?: number;
    metadata?: Record<string, unknown>;
}

const ALLOWED_EMBEDDING_MODELS = new Set([
    'text-embedding-3-small',
    'text-embedding-3-large',
    'text-embedding-ada-002',
]);

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function POST(req: NextRequest) {
    const validation = await validateGatewayRequest(req);
    if (!validation.success) return validation.response;
    const ctx = validation.context;
    const respond = (body: unknown, status: number) => addGatewayHeaders(
        NextResponse.json(body, { status }),
        { requestId: ctx.requestId },
    );

    try {
        const body = await req.json() as CreateNamespaceRequest;
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        const description = typeof body.description === 'string' ? body.description.trim() : null;
        const embeddingModel = body.embeddingModel || 'text-embedding-3-small';
        const dimensions = body.dimensions ?? 1536;
        const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
            ? body.metadata
            : {};

        if (!name || name.length > 128) {
            return respond({ error: 'bad_request', message: 'name must be 1-128 characters' }, 400);
        }
        if (description && description.length > 2000) {
            return respond({ error: 'bad_request', message: 'description is too long' }, 400);
        }
        if (!ALLOWED_EMBEDDING_MODELS.has(embeddingModel)) {
            return respond({ error: 'bad_request', message: 'Unsupported embeddingModel' }, 400);
        }
        // The deployed memories.embedding column is vector(1536).
        if (dimensions !== 1536) {
            return respond({ error: 'bad_request', message: 'dimensions must be 1536' }, 400);
        }

        const { data: existing, error: existingError } = await ctx.supabase
            .from('memory_namespaces')
            .select('id')
            .eq('project_id', ctx.projectId)
            .eq('name', name)
            .maybeSingle();
        if (existingError) throw new Error(existingError.message);
        if (existing) {
            return respond({ error: 'conflict', message: 'Namespace with this name already exists' }, 409);
        }

        const { data: namespace, error } = await ctx.supabase
            .from('memory_namespaces')
            .insert({
                project_id: ctx.projectId,
                name,
                description,
                embedding_model: embeddingModel,
                dimensions,
                metadata,
            })
            .select('id, name, description, embedding_model, dimensions, metadata, created_at')
            .single();
        if (error || !namespace) {
            throw new Error(error?.message || 'Failed to create namespace');
        }

        return respond({
            id: namespace.id,
            name: namespace.name,
            description: namespace.description,
            embeddingModel: namespace.embedding_model,
            dimensions: namespace.dimensions,
            metadata: namespace.metadata,
            createdAt: namespace.created_at,
        }, 201);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Namespace creation failed';
        return respond({ error: 'internal_error', message }, 500);
    }
}

export async function GET(req: NextRequest) {
    const validation = await validateGatewayRequest(req);
    if (!validation.success) return validation.response;
    const ctx = validation.context;
    const respond = (body: unknown, status: number) => addGatewayHeaders(
        NextResponse.json(body, { status }),
        { requestId: ctx.requestId },
    );

    try {
        const { data: namespaces, error } = await ctx.supabase
            .from('memory_namespaces')
            .select(`
                id,
                name,
                description,
                embedding_model,
                dimensions,
                metadata,
                created_at,
                memories(count)
            `)
            .eq('project_id', ctx.projectId)
            .order('created_at', { ascending: false });
        if (error) throw new Error(error.message);

        return respond({
            namespaces: (namespaces ?? []).map(namespace => ({
                id: namespace.id,
                name: namespace.name,
                description: namespace.description,
                embeddingModel: namespace.embedding_model,
                dimensions: namespace.dimensions,
                metadata: namespace.metadata,
                memoryCount: (namespace.memories as unknown as { count: number }[])?.[0]?.count ?? 0,
                createdAt: namespace.created_at,
            })),
        }, 200);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Namespace listing failed';
        return respond({ error: 'internal_error', message }, 500);
    }
}
