import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { authorizeWebCrawlAdmin } from '@/lib/web/internal-auth';
import { createPublicCrawlJob, listPublicCrawlJobs } from '@/lib/web/frontier';
import { WebRuntimeError } from '@/lib/web/errors';
import { createWebDataStore } from '@/lib/web/store';

export const runtime = 'nodejs';
export const maxDuration = 30;

function errorResponse(error: unknown): NextResponse {
    const runtimeError = error instanceof WebRuntimeError
        ? error
        : new WebRuntimeError('internal_error', error instanceof Error ? error.message : 'Unknown error', 500);
    return NextResponse.json({ error: runtimeError.code, message: runtimeError.message }, { status: runtimeError.status });
}

export async function GET(req: NextRequest) {
    if (!await authorizeWebCrawlAdmin(req)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    try {
        const limit = Number(new URL(req.url).searchParams.get('limit') || 50);
        return NextResponse.json({ jobs: await listPublicCrawlJobs(createWebDataStore(createAdminClient()), limit) });
    } catch (error) {
        return errorResponse(error);
    }
}

export async function POST(req: NextRequest) {
    if (!await authorizeWebCrawlAdmin(req)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    try {
        const body = await req.json() as Record<string, unknown>;
        const seeds = Array.isArray(body.seeds)
            ? body.seeds.filter((seed): seed is string => typeof seed === 'string' && seed.trim().length > 0)
            : [];
        const domains = Array.isArray(body.domains)
            ? body.domains.filter((domain): domain is string => typeof domain === 'string' && domain.trim().length > 0)
            : [];
        for (const domain of domains) {
            const value = domain.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
            seeds.push(`https://${value}/`);
        }

        const job = await createPublicCrawlJob(createWebDataStore(createAdminClient()), {
            seeds,
            maxPages: typeof body.maxPages === 'number' ? body.maxPages : undefined,
            maxFrontier: typeof body.maxFrontier === 'number' ? body.maxFrontier : undefined,
            maxDepth: typeof body.maxDepth === 'number' ? body.maxDepth : undefined,
            maxAttempts: typeof body.maxAttempts === 'number' ? body.maxAttempts : undefined,
            priority: typeof body.priority === 'number' ? body.priority : undefined,
            sameOrigin: typeof body.sameOrigin === 'boolean' ? body.sameOrigin : undefined,
            metadata: body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
                ? body.metadata as Record<string, unknown>
                : undefined,
        });
        return NextResponse.json({ job }, { status: 201 });
    } catch (error) {
        return errorResponse(error);
    }
}
