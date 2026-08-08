import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { authorizeWebCrawlAdmin } from '@/lib/web/internal-auth';
import { getPublicCrawlJob } from '@/lib/web/frontier';
import { WebRuntimeError } from '@/lib/web/errors';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
    if (!await authorizeWebCrawlAdmin(req)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    try {
        const { jobId } = await params;
        const supabase = createAdminClient();
        const job = await getPublicCrawlJob(supabase, jobId);
        if (!job) return NextResponse.json({ error: 'not_found' }, { status: 404 });
        const { data: frontier, error } = await supabase
            .from('web_crawl_frontier')
            .select('status,kind')
            .eq('job_id', jobId);
        if (error) throw new WebRuntimeError('frontier_unavailable', error.message, 503);
        const counts: Record<string, number> = {};
        for (const item of frontier || []) {
            const key = `${item.kind}_${item.status}`;
            counts[key] = (counts[key] || 0) + 1;
        }
        return NextResponse.json({ job, frontier: counts });
    } catch (error) {
        const runtimeError = error instanceof WebRuntimeError
            ? error
            : new WebRuntimeError('internal_error', error instanceof Error ? error.message : 'Unknown error', 500);
        return NextResponse.json({ error: runtimeError.code, message: runtimeError.message }, { status: runtimeError.status });
    }
}
