import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { expireStaleSessions } from '@/lib/gateway/session-engine';
import { processUsageQueue } from '@/lib/queue';

async function run(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
        return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
    }
    if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const now = new Date().toISOString();

    try {
        await expireStaleSessions(supabase);

        let usageRecordsProcessed = 0;
        for (let batch = 0; batch < 20; batch++) {
            const processed = await processUsageQueue(100);
            usageRecordsProcessed += processed;
            if (processed < 100) break;
        }

        const [
            { count: responsesDeleted, error: responseError },
            { count: memoriesDeleted, error: memoryError },
            { count: fileChunksDeleted, error: fileChunkError },
        ] = await Promise.all([
            supabase
                .from('gateway_responses')
                .delete({ count: 'exact' })
                .lt('expires_at', now),
            supabase
                .from('gateway_memories')
                .delete({ count: 'exact' })
                .not('expires_at', 'is', null)
                .lt('expires_at', now),
            supabase
                .from('gateway_file_chunks')
                .delete({ count: 'exact' })
                .lt('expires_at', now),
        ]);

        if (responseError) throw responseError;
        if (memoryError) throw memoryError;
        if (fileChunkError) throw fileChunkError;

        return NextResponse.json({
            success: true,
            usage_records_processed: usageRecordsProcessed,
            expired_responses_deleted: responsesDeleted ?? 0,
            expired_memories_deleted: memoriesDeleted ?? 0,
            expired_file_chunks_deleted: fileChunksDeleted ?? 0,
            timestamp: now,
        });
    } catch (error) {
        console.error('[Cron/gateway-maintenance] Error:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Internal error' },
            { status: 500 }
        );
    }
}

export const GET = run;
export const POST = run;
