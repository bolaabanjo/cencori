import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { authorizeWebCrawlAdmin } from '@/lib/web/internal-auth';
import { getPublicCrawlJob } from '@/lib/web/frontier';
import { WebRuntimeError } from '@/lib/web/errors';
import { createWebDataStore } from '@/lib/web/store';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
    if (!await authorizeWebCrawlAdmin(req)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    try {
        const { jobId } = await params;
        const store = createWebDataStore(createAdminClient());
        const job = await getPublicCrawlJob(store, jobId);
        if (!job) return NextResponse.json({ error: 'not_found' }, { status: 404 });
        const counts = await store.getFrontierStatusCounts(jobId);
        return NextResponse.json({ job, frontier: counts });
    } catch (error) {
        const runtimeError = error instanceof WebRuntimeError
            ? error
            : new WebRuntimeError('internal_error', error instanceof Error ? error.message : 'Unknown error', 500);
        return NextResponse.json({ error: runtimeError.code, message: runtimeError.message }, { status: runtimeError.status });
    }
}
