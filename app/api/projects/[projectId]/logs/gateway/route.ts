import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';

interface ApiKeyRecord {
    id: string;
    name: string;
    key_prefix: string;
    environment: string | null;
}

interface GatewayRequestLogRecord {
    id: string;
    request_id: string;
    endpoint: string;
    method: string;
    status_code: number;
    latency_ms: number;
    caller_origin: string | null;
    client_app: string | null;
    error_code: string | null;
    error_message: string | null;
    created_at: string;
    api_key_id: string;
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
        const environment = searchParams.get('environment') || 'production';
        const apiKeyId = searchParams.get('api_key_id');

        const startTime = getStartTime(timeRange);

        const { data: allApiKeys } = await supabaseAdmin
            .from('api_keys')
            .select('id, name, key_prefix, environment')
            .eq('project_id', projectId)
            .is('revoked_at', null);

        const apiKeys = (allApiKeys as ApiKeyRecord[] | null)?.filter((key) => {
            if (key.environment) {
                return environment === 'production'
                    ? key.environment === 'production'
                    : key.environment === 'test';
            }

            const isTestKey = key.key_prefix?.includes('_test') || key.key_prefix?.includes('test_');
            return environment === 'production' ? !isTestKey : isTestKey;
        }) || [];

        const apiKeyIds = apiKeys.map((key) => key.id);
        if (apiKeyIds.length === 0) {
            return NextResponse.json({
                requests: [],
                pagination: {
                    page,
                    per_page: perPage,
                    total: 0,
                    total_pages: 0,
                },
            });
        }

        const apiKeyMap: Record<string, { name: string; prefix: string }> = {};
        for (const key of apiKeys) {
            apiKeyMap[key.id] = { name: key.name, prefix: key.key_prefix };
        }

        const targetKeyIds = apiKeyId && apiKeyId !== 'all' ? [apiKeyId] : apiKeyIds;

        const offset = (page - 1) * perPage;

        const buildQuery = (includeCallerSearchFields: boolean) => {
            let query = supabaseAdmin
                .from('api_gateway_request_logs')
                .select('*', { count: 'exact' })
                .eq('project_id', projectId)
                .in('api_key_id', targetKeyIds);

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
                const searchFilter = includeCallerSearchFields
                    ? `endpoint.ilike.%${search}%,request_id.ilike.%${search}%,caller_origin.ilike.%${search}%,client_app.ilike.%${search}%,error_message.ilike.%${search}%`
                    : `endpoint.ilike.%${search}%,request_id.ilike.%${search}%,error_message.ilike.%${search}%`;

                query = query.or(searchFilter);
            }

            return query
                .order('created_at', { ascending: false })
                .range(offset, offset + perPage - 1);
        };

        let { data, error, count } = await buildQuery(true);

        if (error) {
            const errorText = (error.message || '').toLowerCase();
            const missingCallerColumns = errorText.includes('caller_origin') || errorText.includes('client_app');

            if (missingCallerColumns) {
                const fallbackResult = await buildQuery(false);
                data = fallbackResult.data;
                error = fallbackResult.error;
                count = fallbackResult.count;
            }
        }

        if (error) {
            console.error('[Gateway Logs API] Error fetching gateway request logs:', error);
            return NextResponse.json(
                { error: 'Failed to fetch API gateway logs' },
                { status: 500 }
            );
        }

        const requests = ((data as GatewayRequestLogRecord[] | null) || []).map((log) => {
            const keyInfo = apiKeyMap[log.api_key_id];

            return {
                id: log.id,
                request_id: log.request_id,
                created_at: log.created_at,
                endpoint: log.endpoint,
                method: log.method,
                status_code: log.status_code,
                latency_ms: log.latency_ms,
                caller_origin: log.caller_origin,
                client_app: log.client_app,
                error_code: log.error_code,
                error_message: log.error_message,
                api_key_id: log.api_key_id,
                api_key_name: keyInfo?.name || 'Unknown',
                api_key_prefix: keyInfo?.prefix || 'unknown',
            };
        });

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
        console.error('[Gateway Logs API] Unexpected error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
