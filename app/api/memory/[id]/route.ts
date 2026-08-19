import { NextRequest, NextResponse } from 'next/server';
import {
    addGatewayHeaders,
    handleCorsPreFlight,
    logGatewayRequest,
    validateGatewayRequest,
} from '@/lib/gateway-middleware';
import { textResponsePayload } from '@/lib/gateway/log-payload';
import { runGatewayOutputGuard } from '@/lib/gateway/output-guard';

type RouteContext = { params: Promise<{ id: string }> };

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function GET(req: NextRequest, { params }: RouteContext) {
    const validation = await validateGatewayRequest(req);
    if (!validation.success) return validation.response;
    const ctx = validation.context;
    const { id } = await params;
    const respond = (body: unknown, status: number) => addGatewayHeaders(
        NextResponse.json(body, { status }),
        { requestId: ctx.requestId },
    );

    try {
        const { data: memory, error } = await ctx.supabase
            .from('memories')
            .select(`
                id,
                content,
                metadata,
                expires_at,
                created_at,
                updated_at,
                memory_namespaces!inner(id, name, project_id)
            `)
            .eq('id', id)
            .maybeSingle();

        if (error) throw new Error(error.message);
        if (!memory) return respond({ error: 'not_found', message: 'Memory not found' }, 404);

        const namespace = memory.memory_namespaces as unknown as {
            id: string;
            name: string;
            project_id: string;
        };
        // Return 404 across project boundaries to avoid revealing that the ID exists.
        if (namespace.project_id !== ctx.projectId) {
            return respond({ error: 'not_found', message: 'Memory not found' }, 404);
        }

        const safeInputSecurity = {
            safe: true,
            reasons: [],
            layer: 'input' as const,
            riskScore: 0,
            confidence: 1,
        };
        const outputCheck = await runGatewayOutputGuard({
            supabase: ctx.supabase,
            projectId: ctx.projectId,
            apiKeyId: ctx.apiKeyId,
            environment: ctx.environment,
            outputText: memory.content,
            inputText: '',
            inputSecurity: safeInputSecurity,
            conversationHistory: [],
        });
        await logGatewayRequest(ctx, {
            endpoint: 'memory/get',
            model: 'none',
            provider: 'none',
            status: outputCheck.ok ? 'success' : 'blocked_output',
            errorMessage: outputCheck.ok ? undefined : outputCheck.message,
            requestPayload: { operation: 'get', memory_id: id },
            responsePayload: outputCheck.ok ? textResponsePayload(memory.content) : undefined,
        });
        if (!outputCheck.ok) {
            return respond(
                { error: outputCheck.code, message: outputCheck.message, reasons: outputCheck.reasons },
                outputCheck.status,
            );
        }

        return respond({
            id: memory.id,
            namespace: namespace.name,
            content: memory.content,
            metadata: memory.metadata,
            expiresAt: memory.expires_at,
            createdAt: memory.created_at,
            updatedAt: memory.updated_at,
        }, 200);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Memory lookup failed';
        await logGatewayRequest(ctx, {
            endpoint: 'memory/get',
            model: 'none',
            provider: 'none',
            status: 'error',
            errorMessage: message,
            requestPayload: { operation: 'get', memory_id: id },
        });
        return respond({ error: 'internal_error', message }, 500);
    }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
    const validation = await validateGatewayRequest(req);
    if (!validation.success) return validation.response;
    const ctx = validation.context;
    const { id } = await params;
    const respond = (body: unknown, status: number) => addGatewayHeaders(
        NextResponse.json(body, { status }),
        { requestId: ctx.requestId },
    );

    try {
        const { data: memory, error: lookupError } = await ctx.supabase
            .from('memories')
            .select('id, memory_namespaces!inner(project_id)')
            .eq('id', id)
            .maybeSingle();
        if (lookupError) throw new Error(lookupError.message);
        if (!memory) return respond({ error: 'not_found', message: 'Memory not found' }, 404);

        const namespace = memory.memory_namespaces as unknown as { project_id: string };
        if (namespace.project_id !== ctx.projectId) {
            return respond({ error: 'not_found', message: 'Memory not found' }, 404);
        }

        const { error: deleteError } = await ctx.supabase
            .from('memories')
            .delete()
            .eq('id', id);
        if (deleteError) throw new Error(deleteError.message);

        await logGatewayRequest(ctx, {
            endpoint: 'memory/delete',
            model: 'none',
            provider: 'none',
            status: 'success',
            requestPayload: { operation: 'delete', memory_id: id },
            responsePayload: { content: `Deleted memory ${id}`, deleted: true },
        });
        return respond({ deleted: true, id }, 200);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Memory delete failed';
        await logGatewayRequest(ctx, {
            endpoint: 'memory/delete',
            model: 'none',
            provider: 'none',
            status: 'error',
            errorMessage: message,
            requestPayload: { operation: 'delete', memory_id: id },
        });
        return respond({ error: 'internal_error', message }, 500);
    }
}
