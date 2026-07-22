import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';

type HttpLogKind = 'api' | 'web';

type StatusFamilyFilter = '2xx' | '3xx' | '4xx' | '5xx';

interface ApiKeyRecord {
    id: string;
    name: string;
    key_prefix: string;
    environment: string | null;
}

interface ApiGatewayRequestLogRecord {
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

interface WebRequestLogRecord {
    id: string;
    request_id: string;
    host: string;
    method: string;
    path: string;
    query_string: string | null;
    status_code: number;
    message: string | null;
    created_at: string;
}

interface HttpRequestLog {
    id: string;
    request_id: string;
    created_at: string;
    kind: HttpLogKind;
    method: string;
    status_code: number;
    target: string;
    origin: string | null;
    context: string | null;
    latency_ms: number | null;
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

function isStatusFamilyFilter(value: string): value is StatusFamilyFilter {
    return value === '2xx' || value === '3xx' || value === '4xx' || value === '5xx';
}

function getDisplayDomain(value: string | null | undefined): string | null {
    if (!value) return null;

    const trimmed = value.trim();
    if (!trimmed) return null;

    try {
        const withScheme = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
        return new URL(withScheme).hostname;
    } catch {
        return trimmed.replace(/^https?:\/\//i, '').split('/')[0] || trimmed;
    }
}

function formatApiContext(apiKeyName: string | undefined, apiKeyPrefix: string | undefined): string | null {
    if (!apiKeyName || !apiKeyPrefix) return null;
    return `${apiKeyName} (${apiKeyPrefix}...)`;
}

function formatWebTarget(log: WebRequestLogRecord): string {
    const query = log.query_string ? `?${log.query_string}` : '';
    return `${log.path}${query}`;
}

function isMissingCallerColumnsError(message: string | undefined): boolean {
    const errorText = (message || '').toLowerCase();
    return errorText.includes('caller_origin') || errorText.includes('client_app');
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
        const search = searchParams.get('search')?.trim();
        const environment = searchParams.get('environment') || 'production';
        const apiKeyId = searchParams.get('api_key_id') || 'all';
        const kind = searchParams.get('kind') || 'all';

        const startTime = getStartTime(timeRange);
        const offset = (page - 1) * perPage;
        const fetchLimit = offset + perPage;

        const includeApi = kind === 'all' || kind === 'api';
        const includeWeb = (kind === 'all' || kind === 'web') && apiKeyId === 'all';

        const { data: allApiKeys } = await supabaseAdmin
            .from('api_keys')
            .select('id, name, key_prefix, environment')
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

        const apiKeyMap: Record<string, { name: string; prefix: string }> = {};
        for (const key of environmentApiKeys) {
            apiKeyMap[key.id] = { name: key.name, prefix: key.key_prefix };
        }

        const targetApiKeyIds = apiKeyId !== 'all'
            ? environmentApiKeys.filter((key) => key.id === apiKeyId).map((key) => key.id)
            : environmentApiKeys.map((key) => key.id);

        const loadApiLogs = async (includeCallerSearchFields: boolean) => {
            if (!includeApi || targetApiKeyIds.length === 0) {
                return {
                    count: 0,
                    data: [] as ApiGatewayRequestLogRecord[],
                    error: null as { message: string } | null,
                };
            }

            let countQuery = supabaseAdmin
                .from('api_gateway_request_logs')
                .select('id', { count: 'exact', head: true })
                .eq('project_id', projectId)
                .in('api_key_id', targetApiKeyIds);

            let rowsQuery = supabaseAdmin
                .from('api_gateway_request_logs')
                .select('*')
                .eq('project_id', projectId)
                .in('api_key_id', targetApiKeyIds);

            if (method !== 'all') {
                countQuery = countQuery.eq('method', method.toUpperCase());
                rowsQuery = rowsQuery.eq('method', method.toUpperCase());
            }

            if (status !== 'all') {
                if (isStatusFamilyFilter(status)) {
                    const firstDigit = Number.parseInt(status[0], 10);
                    const minStatus = firstDigit * 100;
                    countQuery = countQuery.gte('status_code', minStatus).lte('status_code', minStatus + 99);
                    rowsQuery = rowsQuery.gte('status_code', minStatus).lte('status_code', minStatus + 99);
                } else {
                    const parsedStatus = Number.parseInt(status, 10);
                    if (Number.isFinite(parsedStatus)) {
                        countQuery = countQuery.eq('status_code', parsedStatus);
                        rowsQuery = rowsQuery.eq('status_code', parsedStatus);
                    }
                }
            }

            if (startTime) {
                countQuery = countQuery.gte('created_at', startTime.toISOString());
                rowsQuery = rowsQuery.gte('created_at', startTime.toISOString());
            }

            if (search) {
                const searchFilter = includeCallerSearchFields
                    ? `endpoint.ilike.%${search}%,request_id.ilike.%${search}%,caller_origin.ilike.%${search}%,client_app.ilike.%${search}%,error_message.ilike.%${search}%`
                    : `endpoint.ilike.%${search}%,request_id.ilike.%${search}%,error_message.ilike.%${search}%`;
                countQuery = countQuery.or(searchFilter);
                rowsQuery = rowsQuery.or(searchFilter);
            }

            rowsQuery = rowsQuery
                .order('created_at', { ascending: false })
                .range(0, fetchLimit - 1);

            const [countResult, rowsResult] = await Promise.all([countQuery, rowsQuery]);

            return {
                count: countResult.count || 0,
                data: (rowsResult.data as ApiGatewayRequestLogRecord[] | null) || [],
                error: (countResult.error || rowsResult.error) as { message: string } | null,
            };
        };

        const loadWebLogs = async () => {
            if (!includeWeb) {
                return {
                    count: 0,
                    data: [] as WebRequestLogRecord[],
                    error: null as { message: string } | null,
                };
            }

            let countQuery = supabaseAdmin
                .from('web_request_logs')
                .select('id', { count: 'exact', head: true })
                .eq('project_id', projectId)
                .not('host', 'like', '%cencori.com%');

            let rowsQuery = supabaseAdmin
                .from('web_request_logs')
                .select('id, request_id, host, method, path, query_string, status_code, message, created_at')
                .eq('project_id', projectId)
                .not('host', 'like', '%cencori.com%');

            if (method !== 'all') {
                countQuery = countQuery.eq('method', method.toUpperCase());
                rowsQuery = rowsQuery.eq('method', method.toUpperCase());
            }

            if (status !== 'all') {
                if (isStatusFamilyFilter(status)) {
                    const firstDigit = Number.parseInt(status[0], 10);
                    const minStatus = firstDigit * 100;
                    countQuery = countQuery.gte('status_code', minStatus).lte('status_code', minStatus + 99);
                    rowsQuery = rowsQuery.gte('status_code', minStatus).lte('status_code', minStatus + 99);
                } else {
                    const parsedStatus = Number.parseInt(status, 10);
                    if (Number.isFinite(parsedStatus)) {
                        countQuery = countQuery.eq('status_code', parsedStatus);
                        rowsQuery = rowsQuery.eq('status_code', parsedStatus);
                    }
                }
            }

            if (startTime) {
                countQuery = countQuery.gte('created_at', startTime.toISOString());
                rowsQuery = rowsQuery.gte('created_at', startTime.toISOString());
            }

            if (search) {
                const searchFilter = `host.ilike.%${search}%,path.ilike.%${search}%,message.ilike.%${search}%,request_id.ilike.%${search}%`;
                countQuery = countQuery.or(searchFilter);
                rowsQuery = rowsQuery.or(searchFilter);
            }

            rowsQuery = rowsQuery
                .order('created_at', { ascending: false })
                .range(0, fetchLimit - 1);

            const [countResult, rowsResult] = await Promise.all([countQuery, rowsQuery]);

            return {
                count: countResult.count || 0,
                data: (rowsResult.data as WebRequestLogRecord[] | null) || [],
                error: (countResult.error || rowsResult.error) as { message: string } | null,
            };
        };

        const includeCallerSearchFields = Boolean(search);
        let apiResult = await loadApiLogs(includeCallerSearchFields);

        if (apiResult.error && includeCallerSearchFields && isMissingCallerColumnsError(apiResult.error.message)) {
            apiResult = await loadApiLogs(false);
        }

        const webResult = await loadWebLogs();

        if (apiResult.error) {
            console.error('[HTTP Logs API] Error fetching API traffic logs:', apiResult.error);
            return NextResponse.json(
                { error: 'Failed to fetch HTTP traffic logs' },
                { status: 500 }
            );
        }

        if (webResult.error) {
            console.error('[HTTP Logs API] Error fetching web traffic logs:', webResult.error);
            return NextResponse.json(
                { error: 'Failed to fetch HTTP traffic logs' },
                { status: 500 }
            );
        }

        const apiRequests: HttpRequestLog[] = apiResult.data.map((log) => {
            const keyInfo = apiKeyMap[log.api_key_id];
            const callerRaw = log.client_app || log.caller_origin;

            return {
                id: log.id,
                request_id: log.request_id,
                created_at: log.created_at,
                kind: 'api',
                method: log.method,
                status_code: log.status_code,
                target: log.endpoint,
                origin: getDisplayDomain(callerRaw) || callerRaw,
                context: formatApiContext(keyInfo?.name, keyInfo?.prefix),
                latency_ms: log.latency_ms,
            };
        });

        const webRequests: HttpRequestLog[] = webResult.data.map((log) => ({
            id: log.id,
            request_id: log.request_id,
            created_at: log.created_at,
            kind: 'web',
            method: log.method,
            status_code: log.status_code,
            target: formatWebTarget(log),
            origin: log.host,
            context: log.message,
            latency_ms: null,
        }));

        const requests = [...apiRequests, ...webRequests]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(offset, offset + perPage);

        const total = apiResult.count + webResult.count;

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
        console.error('[HTTP Logs API] Unexpected error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
