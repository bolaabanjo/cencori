import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';

type GroupBy = '10min' | 'hour' | 'day';

interface TimelineBucket {
    timestamp: string;
    total: number;
    success: number;
    filtered: number;
    error: number;
}

interface WebLogRecord {
    created_at: string;
    status_code: number;
}

function getTimelineConfig(timeRange: string, now: Date): { startTime: Date; groupBy: GroupBy; useEarliest: boolean } {
    switch (timeRange) {
        case '1h':
            return {
                startTime: new Date(now.getTime() - 60 * 60 * 1000),
                groupBy: '10min',
                useEarliest: false,
            };
        case '24h':
            return {
                startTime: new Date(now.getTime() - 24 * 60 * 60 * 1000),
                groupBy: 'hour',
                useEarliest: false,
            };
        case '30d':
            return {
                startTime: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
                groupBy: 'day',
                useEarliest: false,
            };
        case '90d':
            return {
                startTime: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
                groupBy: 'day',
                useEarliest: false,
            };
        case 'all':
            return {
                startTime: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
                groupBy: 'day',
                useEarliest: true,
            };
        case '7d':
        default:
            return {
                startTime: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
                groupBy: 'day',
                useEarliest: false,
            };
    }
}

function toBucketKey(date: Date, groupBy: GroupBy): string {
    if (groupBy === '10min') {
        const minutes = Math.floor(date.getMinutes() / 10) * 10;
        return `${String(date.getHours()).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    if (groupBy === 'hour') {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
            date.getDate()
        ).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
    }

    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(
        2,
        '0'
    )}`;
}

function generateBuckets(startTime: Date, endTime: Date, groupBy: GroupBy): Record<string, TimelineBucket> {
    const buckets: Record<string, TimelineBucket> = {};
    const current = new Date(startTime);

    if (groupBy === '10min') {
        while (current <= endTime) {
            const key = toBucketKey(current, groupBy);
            buckets[key] = { timestamp: key, total: 0, success: 0, filtered: 0, error: 0 };
            current.setMinutes(current.getMinutes() + 10);
        }
        return buckets;
    }

    if (groupBy === 'hour') {
        current.setMinutes(0, 0, 0);
        while (current <= endTime) {
            const key = toBucketKey(current, groupBy);
            buckets[key] = { timestamp: key, total: 0, success: 0, filtered: 0, error: 0 };
            current.setHours(current.getHours() + 1);
        }
        return buckets;
    }

    current.setHours(0, 0, 0, 0);
    while (current <= endTime) {
        const key = toBucketKey(current, groupBy);
        buckets[key] = { timestamp: key, total: 0, success: 0, filtered: 0, error: 0 };
        current.setDate(current.getDate() + 1);
    }
    return buckets;
}

function classifyStatus(statusCode: number): 'success' | 'filtered' | 'error' {
    if (statusCode >= 200 && statusCode < 400) return 'success';
    if (statusCode === 429) return 'filtered';
    return 'error';
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const supabaseAdmin = createAdminClient();
    const { projectId } = await params;
    const projectAccess = await requireProjectAccess(projectId);
    if (!projectAccess.ok) return projectAccess.response;

    try {
        const searchParams = req.nextUrl.searchParams;
        const timeRange = searchParams.get('time_range') || '7d';
        const now = new Date();

        const config = getTimelineConfig(timeRange, now);
        let startTime = config.startTime;

        if (config.useEarliest) {
            const { data: earliest } = await supabaseAdmin
                .from('web_request_logs')
                .select('created_at')
                .eq('project_id', projectId)
                .order('created_at', { ascending: true })
                .limit(1);

            const earliestTimestamp = earliest?.[0]?.created_at;
            if (earliestTimestamp) {
                const earliestDate = new Date(earliestTimestamp);
                if (!Number.isNaN(earliestDate.getTime())) {
                    startTime = earliestDate;
                }
            }
        }

        const { data: logs, error } = await supabaseAdmin
            .from('web_request_logs')
            .select('created_at, status_code')
            .eq('project_id', projectId)
            .gte('created_at', startTime.toISOString())
            .order('created_at', { ascending: true });

        if (error) {
            console.error('[Web Timeline API] Error fetching web logs:', error);
            return NextResponse.json(
                { error: 'Failed to fetch web timeline' },
                { status: 500 }
            );
        }

        const logRows = (logs as WebLogRecord[] | null) || [];
        if (logRows.length === 0) {
            return NextResponse.json({ trends: [], group_by: config.groupBy });
        }

        const buckets = generateBuckets(startTime, now, config.groupBy);

        for (const log of logRows) {
            const date = new Date(log.created_at);
            if (Number.isNaN(date.getTime())) continue;

            const key = toBucketKey(date, config.groupBy);
            if (!buckets[key]) {
                buckets[key] = { timestamp: key, total: 0, success: 0, filtered: 0, error: 0 };
            }

            buckets[key].total += 1;
            const classification = classifyStatus(log.status_code);
            buckets[key][classification] += 1;
        }

        const trends = Object.values(buckets)
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
            .map((bucket) => ({
                timestamp: bucket.timestamp,
                total: bucket.total,
                success: bucket.success,
                filtered: bucket.filtered,
                error: bucket.error,
            }));

        return NextResponse.json({
            trends,
            group_by: config.groupBy,
        });
    } catch (unexpectedError) {
        console.error('[Web Timeline API] Unexpected error:', unexpectedError);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
