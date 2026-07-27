import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import crypto from 'crypto';
import { addGatewayHeaders } from '@/lib/gateway-middleware';
import { extractGatewayCallerIdentity, logApiGatewayRequest } from '@/lib/api-gateway-logs';
import { extractCencoriApiKeyFromHeaders } from '@/lib/api-keys';
import { fetchAllRows } from '@/lib/supabase-paginate';

interface MetricsResponse {
    period: string;
    start_date: string;
    end_date: string;
    requests: {
        total: number;
        success: number;
        error: number;
        filtered: number;
        success_rate: number;
    };
    cost: {
        total_usd: number;
        average_per_request_usd: number;
    };
    tokens: {
        prompt: number;
        completion: number;
        total: number;
    };
    latency: {
        avg_ms: number;
        p50_ms: number | null;
        p90_ms: number | null;
        p99_ms: number | null;
    };
    providers: {
        [provider: string]: {
            requests: number;
            cost_usd: number;
        };
    };
    models: {
        [model: string]: {
            requests: number;
            cost_usd: number;
        };
    };
}

function getPeriodDates(period: string): { start: Date; end: Date } {
    const end = new Date();
    let start: Date;

    switch (period) {
        case '1h':
            start = new Date(end.getTime() - 60 * 60 * 1000);
            break;
        case '24h':
            start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
            break;
        case '7d':
            start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case '30d':
            start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
        case 'mtd': // Month to date
            start = new Date(end.getFullYear(), end.getMonth(), 1);
            break;
        default:
            start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    }

    return { start, end };
}

export async function GET(req: NextRequest) {
    const supabase = createAdminClient();
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    const callerIdentity = extractGatewayCallerIdentity(req.headers);
    let apiLogContext: { projectId: string; apiKeyId: string; environment: string | null } | null = null;

    const respond = (response: NextResponse, errorCode?: string, errorMessage?: string) => {
        if (apiLogContext) {
            const forwardedFor = req.headers.get('x-forwarded-for');
            const clientIp = forwardedFor?.split(',')[0]?.trim() || req.headers.get('x-real-ip');

            void logApiGatewayRequest({
                projectId: apiLogContext.projectId,
                apiKeyId: apiLogContext.apiKeyId,
                requestId,
                endpoint: '/v1/metrics',
                method: 'GET',
                statusCode: response.status,
                startedAt,
                environment: apiLogContext.environment,
                ipAddress: clientIp,
                countryCode: req.headers.get('x-vercel-ip-country') || req.headers.get('x-cencori-user-country'),
                userAgent: req.headers.get('user-agent'),
                callerOrigin: callerIdentity.callerOrigin,
                clientApp: callerIdentity.clientApp,
                errorCode: errorCode || null,
                errorMessage: errorMessage || null,
            });
        }

        return addGatewayHeaders(response, { requestId });
    };

    const apiKey = extractCencoriApiKeyFromHeaders(req.headers);
    if (!apiKey) {
        return respond(
            NextResponse.json(
            { error: 'Missing API key. Use Authorization: Bearer <api_key>' },
            { status: 401 }
            ),
            'missing_api_key',
            'Missing API key'
        );
    }

    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const { data: keyData, error: keyError } = await supabase
        .from('api_keys')
        .select('id, project_id, environment, projects!inner(id, name, organization_id)')
        .eq('key_hash', keyHash)
        .is('revoked_at', null)
        .single();

    if (keyError || !keyData) {
        return respond(
            NextResponse.json({ error: 'Invalid API key' }, { status: 401 }),
            'invalid_api_key',
            'Invalid API key'
        );
    }

    apiLogContext = {
        projectId: keyData.project_id,
        apiKeyId: keyData.id,
        environment: keyData.environment || null,
    };

    const projectId = keyData.project_id;

    const searchParams = req.nextUrl.searchParams;
    const period = searchParams.get('period') || '24h';
    const { start, end } = getPeriodDates(period);
    type MetricRow = {
        status: string | null; cost_usd: number | null; latency_ms: number | null;
        prompt_tokens: number | null; completion_tokens: number | null; total_tokens: number | null;
        provider: string | null; model: string | null;
    };
    let requests: MetricRow[];
    try {
        // Paginate past the 1000-row ceiling so totals reflect ALL requests.
        requests = await fetchAllRows<MetricRow>((from, to) =>
            supabase
                .from('ai_requests')
                .select('status, cost_usd, latency_ms, prompt_tokens, completion_tokens, total_tokens, provider, model')
                .eq('project_id', projectId)
                .gte('created_at', start.toISOString())
                .lte('created_at', end.toISOString())
                .order('created_at', { ascending: true })
                .range(from, to)
        );
    } catch (error) {
        console.error('[Metrics API] Query error:', error);
        return respond(
            NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 }),
            'metrics_query_failed',
            error instanceof Error ? error.message : 'query failed'
        );
    }

    const total = requests?.length || 0;
    const success = requests?.filter(r => r.status === 'success' || r.status === 'success_fallback').length || 0;
    const errored = requests?.filter(r => r.status === 'error').length || 0;
    const filtered = requests?.filter(r => r.status === 'filtered' || r.status === 'blocked').length || 0;

    const totalCost = requests?.reduce((sum, r) => sum + (r.cost_usd || 0), 0) || 0;
    const totalPromptTokens = requests?.reduce((sum, r) => sum + (r.prompt_tokens || 0), 0) || 0;
    const totalCompletionTokens = requests?.reduce((sum, r) => sum + (r.completion_tokens || 0), 0) || 0;
    const totalTokens = requests?.reduce((sum, r) => sum + (r.total_tokens || 0), 0) || 0;

    const latencies = requests?.map(r => r.latency_ms).filter((l): l is number => l !== null).sort((a, b) => a - b) || [];
    const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : null;
    const p90 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.9)] : null;
    const p99 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : null;

    const providers: { [key: string]: { requests: number; cost_usd: number } } = {};
    requests?.forEach(r => {
        if (r.provider) {
            if (!providers[r.provider]) {
                providers[r.provider] = { requests: 0, cost_usd: 0 };
            }
            providers[r.provider].requests++;
            providers[r.provider].cost_usd += r.cost_usd || 0;
        }
    });

    const models: { [key: string]: { requests: number; cost_usd: number } } = {};
    requests?.forEach(r => {
        if (r.model) {
            if (!models[r.model]) {
                models[r.model] = { requests: 0, cost_usd: 0 };
            }
            models[r.model].requests++;
            models[r.model].cost_usd += r.cost_usd || 0;
        }
    });

    Object.values(providers).forEach(p => p.cost_usd = Math.round(p.cost_usd * 10000) / 10000);
    Object.values(models).forEach(m => m.cost_usd = Math.round(m.cost_usd * 10000) / 10000);

    const response: MetricsResponse = {
        period,
        start_date: start.toISOString(),
        end_date: end.toISOString(),
        requests: {
            total,
            success,
            error: errored,
            filtered,
            success_rate: total > 0 ? Math.round((success / total) * 10000) / 100 : 0,
        },
        cost: {
            total_usd: Math.round(totalCost * 10000) / 10000,
            average_per_request_usd: total > 0 ? Math.round((totalCost / total) * 1000000) / 1000000 : 0,
        },
        tokens: {
            prompt: totalPromptTokens,
            completion: totalCompletionTokens,
            total: totalTokens,
        },
        latency: {
            avg_ms: Math.round(avgLatency),
            p50_ms: p50 !== null ? Math.round(p50) : null,
            p90_ms: p90 !== null ? Math.round(p90) : null,
            p99_ms: p99 !== null ? Math.round(p99) : null,
        },
        providers,
        models,
    };

    return respond(NextResponse.json(response));
}
