import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';

type GroupBy = '10min' | 'hour' | 'day';
type StatusBucket = 'success' | 'filtered' | 'error';

interface TimelineBucket {
    timestamp: string;
    total: number;
    success: number;
    filtered: number;
    error: number;
}

interface ApiKeyRecord {
    id: string;
    key_prefix: string;
    environment: string | null;
}

interface StatusLogRecord {
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

function classifyStatus(statusCode: number): StatusBucket {
    if (statusCode >= 200 && statusCode < 400) return 'success';
    if (statusCode === 429) return 'filtered';
    return 'error';
}

function getEarliestDate(timestamps: Array<string | undefined>): Date | null {
    const validDates = timestamps
        .map((timestamp) => (timestamp ? new Date(timestamp) : null))
        .filter((date): date is Date => date !== null && !Number.isNaN(date.getTime()));

    if (validDates.length === 0) return null;

    return validDates.reduce((earliest, current) => current < earliest ? current : earliest);
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
        const environment = searchParams.get('environment') || 'production';
        const kind = searchParams.get('kind') || 'all';
        const now = new Date();

        const includeApi = kind === 'all' || kind === 'api';
        const includeWeb = kind === 'all' || kind === 'web';

        const config = getTimelineConfig(timeRange, now);
        let startTime = config.startTime;

        const { data: allApiKeys } = await supabaseAdmin
            .from('api_keys')
            .select('id, key_prefix, environment')
            .eq('project_id', projectId)
            .is('revoked_at', null);

        const environmentApiKeys = ((allApiKeys as ApiKeyRecord[] | null) || []).filter((key) => {
            if (key.environment) {
                return environment === 'production'
                    ? key.environment === 'production'
                    : key.environment === 'test';
            }

            const isTestKey = key.key_prefix?.includes('_test') || key.key_prefix?.includes('test_');
            return environment === 'production' ? !isTestKey : isTestKey;
        });

        const apiKeyIds = environmentApiKeys.map((key) => key.id);

        if (config.useEarliest) {
            const apiEarliestPromise = includeApi && apiKeyIds.length > 0
                ? supabaseAdmin
                    .from('api_gateway_request_logs')
                    .select('created_at')
                    .eq('project_id', projectId)
                    .in('api_key_id', apiKeyIds)
                    .order('created_at', { ascending: true })
                    .limit(1)
                : Promise.resolve({
                    data: [] as Array<{ created_at: string }> | null,
                    error: null as { message: string } | null,
                });

            const webEarliestPromise = includeWeb
                ? supabaseAdmin
                    .from('web_request_logs')
                    .select('created_at')
                    .eq('project_id', projectId)
                    .not('host', 'like', '%cencori.com%')
                    .order('created_at', { ascending: true })
                    .limit(1)
                : Promise.resolve({
                    data: [] as Array<{ created_at: string }> | null,
                    error: null as { message: string } | null,
                });

            const [apiEarliestResult, webEarliestResult] = await Promise.all([
                apiEarliestPromise,
                webEarliestPromise,
            ]);

            const earliestDate = getEarliestDate([
                apiEarliestResult.data?.[0]?.created_at,
                webEarliestResult.data?.[0]?.created_at,
            ]);

            if (earliestDate) {
                startTime = earliestDate;
            }
        }

        const apiLogsPromise = includeApi && apiKeyIds.length > 0
            ? supabaseAdmin
                .from('api_gateway_request_logs')
                .select('created_at, status_code')
                .eq('project_id', projectId)
                .in('api_key_id', apiKeyIds)
                .gte('created_at', startTime.toISOString())
                .order('created_at', { ascending: true })
            : Promise.resolve({ data: [] as StatusLogRecord[] | null, error: null as { message: string } | null });

        const webLogsPromise = includeWeb
            ? supabaseAdmin
                .from('web_request_logs')
                .select('created_at, status_code')
                .eq('project_id', projectId)
                .not('host', 'like', '%cencori.com%')
                .gte('created_at', startTime.toISOString())
                .order('created_at', { ascending: true })
            : Promise.resolve({ data: [] as StatusLogRecord[] | null, error: null as { message: string } | null });

        const [apiLogsResult, webLogsResult] = await Promise.all([apiLogsPromise, webLogsPromise]);

        if (apiLogsResult.error) {
            console.error('[HTTP Timeline API] Error fetching API logs:', apiLogsResult.error);
            return NextResponse.json(
                { error: 'Failed to fetch HTTP timeline' },
                { status: 500 }
            );
        }

        if (webLogsResult.error) {
            console.error('[HTTP Timeline API] Error fetching web logs:', webLogsResult.error);
            return NextResponse.json(
                { error: 'Failed to fetch HTTP timeline' },
                { status: 500 }
            );
        }

        const logRows = [
            ...(((apiLogsResult.data as StatusLogRecord[] | null) || [])),
            ...(((webLogsResult.data as StatusLogRecord[] | null) || [])),
        ];

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
    } catch (error) {
        console.error('[HTTP Timeline API] Unexpected error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
