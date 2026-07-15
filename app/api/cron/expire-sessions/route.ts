import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { expireStaleSessions } from '@/lib/gateway/session-engine';

async function run(req: NextRequest) {
    try {
        const cronSecret = process.env.CRON_SECRET;
        const authHeader = req.headers.get('authorization');

        if (!cronSecret) {
            console.error('[Cron] Missing CRON_SECRET - refusing to expire sessions');
            return NextResponse.json(
                { error: 'Server misconfiguration' },
                { status: 503 }
            );
        }

        if (authHeader !== `Bearer ${cronSecret}`) {
            console.error('[Cron] Unauthorized session expiry attempt');
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        console.log('[Cron] Starting stale session expiry...');
        const adminClient = createAdminClient();
        await expireStaleSessions(adminClient);
        console.log('[Cron] ✓ Stale session expiry complete');

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[Cron] Error expiring sessions:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}

export const GET = run;
export const POST = run;
