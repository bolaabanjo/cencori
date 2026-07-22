import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';

interface WebRequestLogRecord {
    id: string;
    request_id: string;
    host: string;
    method: string;
    path: string;
    query_string: string | null;
    status_code: number;
    message: string | null;
    user_agent: string | null;
    referer: string | null;
    ip_address: string | null;
    country_code: string | null;
    created_at: string;
}

function getStartTime(timeRange: string): Date | null {
    const now = new Date();

    switch (timeRange) {
        case '1h':
            return new Date(now.getTime() - 60 * 60 * 1000);
        case '24h':
            return new Date(now.getTime() - 24 * 60 * 60 * 1000);
        case '7d':
            return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        case '30d':
            return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        case 'all':
            return null;
        default:
            return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
}

function isStatusFamilyFilter(value: string): value is '2xx' | '3xx' | '4xx' | '5xx' {
    return value === '2xx' || value === '3xx' || value === '4xx' || value === '5xx';
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
        const page = Number.parseInt(searchParams.get('page') || '1', 10);
        const perPage = Number.parseInt(searchParams.get('per_page') || '50', 10);
        const status = searchParams.get('status') || 'all';
        const method = searchParams.get('method') || 'all';
        const timeRange = searchParams.get('time_range') || '24h';
        const search = searchParams.get('search');

        const startTime = getStartTime(timeRange);

        let query = supabaseAdmin
            .from('web_request_logs')
            .select('*', { count: 'exact' })
            .eq('project_id', projectId)
            .not('host', 'like', '%cencori.com%');

        if (method !== 'all') {
            query = query.eq('method', method.toUpperCase());
        }

        if (status !== 'all') {
            if (isStatusFamilyFilter(status)) {
                const firstDigit = Number.parseInt(status[0], 10);
                const minStatus = firstDigit * 100;
                query = query.gte('status_code', minStatus).lte('status_code', minStatus + 99);
            } else {
                const parsedStatus = Number.parseInt(status, 10);
                if (Number.isFinite(parsedStatus)) {
                    query = query.eq('status_code', parsedStatus);
                }
            }
        }

        if (startTime) {
            query = query.gte('created_at', startTime.toISOString());
        }

        if (search) {
            query = query.or(
                `host.ilike.%${search}%,path.ilike.%${search}%,message.ilike.%${search}%,request_id.ilike.%${search}%`
            );
        }

        const offset = (page - 1) * perPage;
        query = query
            .order('created_at', { ascending: false })
            .range(offset, offset + perPage - 1);

        const { data, error, count } = await query;

        if (error) {
            console.error('[Web Logs API] Error fetching web request logs:', error);
            return NextResponse.json(
                { error: 'Failed to fetch web logs' },
                { status: 500 }
            );
        }

        const requests = ((data as WebRequestLogRecord[] | null) || []).map((log) => ({
            id: log.id,
            request_id: log.request_id,
            created_at: log.created_at,
            host: log.host,
            method: log.method,
            path: log.path,
            query_string: log.query_string,
            status_code: log.status_code,
            message: log.message,
            user_agent: log.user_agent,
            referer: log.referer,
            ip_address: log.ip_address,
            country_code: log.country_code,
        }));

        const total = count || 0;

        return NextResponse.json({
            requests,
            pagination: {
                page,
                per_page: perPage,
                total,
                total_pages: Math.ceil(total / perPage),
            },
        });
    } catch (error) {
        console.error('[Web Logs API] Unexpected error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
