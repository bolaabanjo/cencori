/**
 * GET    /v1/memory/:id — single memory lookup
 * DELETE /v1/memory/:id — forget by id (hard delete)
 *
 * Both filtered by the authenticated org — a memory id from another org
 * behaves exactly like a nonexistent one.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    validateGatewayRequest,
    addGatewayHeaders,
    handleCorsPreFlight,
    logGatewayRequest,
} from '@/lib/gateway-middleware';
import { fromMemoryId, toMemoryId, fetchMemoryById } from '@/lib/memory';

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const validation = await validateGatewayRequest(req);
    if (!validation.success) {
        return validation.response;
    }
    const ctx = validation.context;
    const { id } = await params;

    const respond = (body: unknown, status: number) =>
        addGatewayHeaders(NextResponse.json(body, { status }), { requestId: ctx.requestId });

    try {
        const memory = await fetchMemoryById(ctx.supabase, ctx.organizationId, ctx.projectId, id);
        if (!memory) {
            return respond({ error: 'not_found', message: 'Memory not found' }, 404);
        }
        return respond(memory, 200);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return respond({ error: 'internal_error', message }, 500);
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const validation = await validateGatewayRequest(req);
    if (!validation.success) {
        return validation.response;
    }
    const ctx = validation.context;
    const { id } = await params;

    const respond = (body: unknown, status: number) =>
        addGatewayHeaders(NextResponse.json(body, { status }), { requestId: ctx.requestId });

    try {
        const { data, error } = await ctx.supabase
            .from('gateway_memories')
            .delete()
            .eq('id', fromMemoryId(id))
            .eq('organization_id', ctx.organizationId)
            .eq('project_id', ctx.projectId)
            .select('id');

        if (error) {
            return respond({ error: 'internal_error', message: 'Failed to delete memory' }, 500);
        }

        if (!data || data.length === 0) {
            return respond({ error: 'not_found', message: 'Memory not found' }, 404);
        }

        // Forget is a first-class operation — audit it.
        await logGatewayRequest(ctx, {
            endpoint: 'memory/forget',
            model: 'none',
            provider: 'none',
            status: 'success',
            metadata: { memory_id: toMemoryId(data[0].id) },
            requestPayload: { operation: 'forget', memory_id: toMemoryId(data[0].id) },
            responsePayload: { content: `Deleted memory ${toMemoryId(data[0].id)}`, deleted: true },
        });

        return respond({ deleted: true, id: toMemoryId(data[0].id) }, 200);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return respond({ error: 'internal_error', message }, 500);
    }
}
