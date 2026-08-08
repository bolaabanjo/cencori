import { NextRequest, NextResponse } from 'next/server';
import {
    addGatewayHeaders,
    incrementUsage,
    logGatewayRequest,
    validateGatewayRequest,
    type GatewayContext,
} from '@/lib/gateway-middleware';
import { WebRuntimeError } from './errors';

export interface WebRouteResult {
    body: unknown;
    status?: number;
    metadata?: Record<string, unknown>;
}

export async function runWebRoute(
    req: NextRequest,
    endpoint: string,
    operation: (body: Record<string, unknown>, ctx: GatewayContext) => Promise<WebRouteResult>,
): Promise<NextResponse> {
    const validation = await validateGatewayRequest(req);
    if (!validation.success) return validation.response;
    const ctx = validation.context;
    const respond = (body: unknown, status: number) =>
        addGatewayHeaders(NextResponse.json(body, { status }), { requestId: ctx.requestId });

    try {
        let body: unknown;
        try {
            body = await req.json();
        } catch {
            throw new WebRuntimeError('invalid_json', 'Request body must be valid JSON');
        }
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            throw new WebRuntimeError('invalid_request', 'Request body must be a JSON object');
        }

        const result = await operation(body as Record<string, unknown>, ctx);
        await logGatewayRequest(ctx, {
            endpoint,
            model: 'cencori-web-v2',
            provider: 'cencori',
            status: 'success',
            metadata: result.metadata,
        });
        await incrementUsage(ctx, 0);
        return respond(result.body, result.status ?? 200);
    } catch (error) {
        const runtimeError = error instanceof WebRuntimeError
            ? error
            : new WebRuntimeError('internal_error', error instanceof Error ? error.message : 'Unknown error', 500);
        console.error(`[Cencori Web] ${endpoint} failed:`, error);
        await logGatewayRequest(ctx, {
            endpoint,
            model: 'cencori-web-v2',
            provider: 'cencori',
            status: 'error',
            errorMessage: runtimeError.message,
            metadata: { code: runtimeError.code },
        });
        return respond({
            error: runtimeError.code,
            message: runtimeError.message,
            ...(runtimeError.details ? { details: runtimeError.details } : {}),
        }, runtimeError.status);
    }
}
