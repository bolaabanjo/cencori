import { createAdminClient } from '@/lib/supabaseAdmin';
import type { GatewayPerformanceMetrics } from '@/lib/gateway/performance';

export type GatewayLogEnvironment = 'production' | 'test';

interface GatewayCallerIdentity {
    callerOrigin: string | null;
    clientApp: string | null;
}

interface LogApiGatewayRequestParams {
    projectId: string;
    apiKeyId: string | null;
    requestId: string;
    endpoint: string;
    method: string;
    statusCode: number;
    startedAt: number;
    environment?: string | null;
    ipAddress?: string | null;
    countryCode?: string | null;
    userAgent?: string | null;
    callerOrigin?: string | null;
    clientApp?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    metadata?: Record<string, unknown>;
}

function normalizeEnvironment(environment?: string | null): GatewayLogEnvironment {
    return environment === 'test' ? 'test' : 'production';
}

function cleanHeaderValue(value: string | null): string | null {
    const cleaned = value?.trim();
    return cleaned ? cleaned : null;
}

export function extractGatewayCallerIdentity(headers: Headers): GatewayCallerIdentity {
    const clientApp = cleanHeaderValue(headers.get('x-cencori-app'));
    const origin = cleanHeaderValue(headers.get('origin'));
    const referer = cleanHeaderValue(headers.get('referer'));

    return {
        callerOrigin: origin || referer || clientApp || null,
        clientApp: clientApp || null,
    };
}

export async function logApiGatewayRequest(params: LogApiGatewayRequestParams): Promise<void> {
    const supabase = createAdminClient();
    const latencyMs = Math.max(0, Date.now() - params.startedAt);
    const basePayload = {
        project_id: params.projectId,
        api_key_id: params.apiKeyId,
        request_id: params.requestId,
        endpoint: params.endpoint,
        method: params.method,
        status_code: params.statusCode,
        latency_ms: latencyMs,
        environment: normalizeEnvironment(params.environment),
        ip_address: params.ipAddress || null,
        country_code: params.countryCode || null,
        user_agent: params.userAgent || null,
        error_code: params.errorCode || null,
        error_message: params.errorMessage || null,
        metadata: params.metadata || {},
    };
    const extendedPayload = {
        ...basePayload,
        caller_origin: params.callerOrigin || null,
        client_app: params.clientApp || null,
    };

    try {
        const { error } = await supabase.from('api_gateway_request_logs').insert(extendedPayload);

        if (error) {
            const message = (error.message || '').toLowerCase();
            const missingCallerColumns =
                message.includes('caller_origin')
                || message.includes('client_app')
                || message.includes('schema cache');

            if (missingCallerColumns) {
                const { error: legacyError } = await supabase.from('api_gateway_request_logs').insert(basePayload);
                if (legacyError) throw legacyError;
                return;
            }

            throw error;
        }
    } catch (error) {
        // Non-blocking telemetry path: failing to write logs should not break API responses.
        console.error('[API Gateway Logs] Failed to persist request log:', error);
    }
}

/** Persist measurements that only become known after a streaming body ends. */
export async function updateApiGatewayRequestPerformance(
    requestId: string,
    metrics: GatewayPerformanceMetrics
): Promise<void> {
    try {
        const supabase = createAdminClient();
        const value = (metric: number | null) => metric === null ? null : Math.max(0, metric);
        const { error } = await supabase
            .from('api_gateway_request_logs')
            .update({
                gateway_preflight_ms: value(metrics.gatewayPreflightMs),
                provider_ttft_ms: value(metrics.providerTtftMs),
                client_ttft_ms: value(metrics.clientTtftMs),
                total_completion_ms: value(metrics.totalCompletionMs),
                tokens_per_second: value(metrics.tokensPerSecond),
            })
            .eq('request_id', requestId);

        if (error) {
            console.error('[GatewayLogs] Failed to update performance metrics:', error);
        }
    } catch (error) {
        console.error('[GatewayLogs] Performance telemetry failed:', error);
    }
}
