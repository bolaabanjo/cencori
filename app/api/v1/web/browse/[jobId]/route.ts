import { NextRequest, NextResponse } from 'next/server';
import { addGatewayHeaders, handleCorsPreFlight, validateGatewayRequest } from '@/lib/gateway-middleware';
import { createWebDataStore } from '@/lib/web/store';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function OPTIONS() { return handleCorsPreFlight(); }

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
    const validation = await validateGatewayRequest(req);
    if (!validation.success) return validation.response;
    const ctx = validation.context;
    const { jobId } = await params;
    const respond = (body: unknown, status: number) => addGatewayHeaders(NextResponse.json(body, { status }), { requestId: ctx.requestId });
    try {
        const job = await createWebDataStore(ctx.supabase).getBrowserJob(jobId, ctx.projectId);
        if (!job) return respond({ error: 'not_found', message: 'Browser job not found' }, 404);
        return respond({
            id: job.id, url: job.url, status: job.status, result: job.result, error: job.error,
            attempts: job.attempts, createdAt: job.created_at, startedAt: job.started_at, finishedAt: job.finished_at,
        }, 200);
    } catch (error) {
        return respond({ error: 'internal_error', message: error instanceof Error ? error.message : 'Browser job lookup failed' }, 500);
    }
}
