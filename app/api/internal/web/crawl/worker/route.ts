import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { authorizeWebCrawlAdmin } from '@/lib/web/internal-auth';
import { processWebFrontier, scheduleDuePublicRecrawls } from '@/lib/web/frontier';
import { createWebDataStore } from '@/lib/web/store';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
    if (!await authorizeWebCrawlAdmin(req)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    try {
        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        const store = createWebDataStore(createAdminClient());
        const scheduledRecrawl = body.scheduleRecrawls === false
            ? null
            : await scheduleDuePublicRecrawls(store, 100);
        const result = await processWebFrontier(store, {
            maxItems: typeof body.maxItems === 'number' ? body.maxItems : undefined,
            batchSize: typeof body.batchSize === 'number' ? body.batchSize : undefined,
            timeBudgetMs: typeof body.timeBudgetMs === 'number' ? body.timeBudgetMs : undefined,
        });
        return NextResponse.json({
            scheduledRecrawlJobId: scheduledRecrawl?.id || null,
            ...result,
        });
    } catch (error) {
        console.error('[Cencori Web worker] Error:', error);
        return NextResponse.json({
            error: 'worker_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
