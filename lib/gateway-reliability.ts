import {
    AuthenticationError,
    ContentFilterError,
    InvalidRequestError,
    ModelNotFoundError,
    ModelAccessDeniedError,
    normalizeProviderError,
    PricingUnavailableError,
    ProviderError,
    RateLimitError,
    ServiceUnavailableError,
} from '@/lib/providers/errors';

const DEFAULT_SEMANTIC_CACHE_DIMENSIONS = 768;

export type GatewayCounterMetric =
    | 'rate_limit.redis_unavailable'
    | 'semantic_cache.dimension_mismatch'
    | 'semantic_cache.write_error'
    | 'semantic_cache.read_error'
    | 'provider_request_success'
    | 'provider_request_failure';

export interface GatewayFeatureFlags {
    rateLimitEnabled: boolean;
    semanticCacheEnabled: boolean;
    rateLimitFailOpen: boolean;
    semanticCacheExpectedDimensions: number;
}

export interface GatewayEventPayload {
    [key: string]: unknown;
}

export interface ProviderHttpErrorDetails {
    status: number;
    error: string;
    message: string;
    provider: string | null;
    retryAfter?: number;
}

export function parseBooleanFlag(value: string | undefined, defaultValue: boolean): boolean {
    if (typeof value !== 'string') {
        return defaultValue;
    }

    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true;
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false;
    }

    return defaultValue;
}

function parsePositiveInteger(value: string | undefined, defaultValue: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

export function getGatewayFeatureFlags(): GatewayFeatureFlags {
    return {
        rateLimitEnabled: parseBooleanFlag(process.env.RATE_LIMIT_ENABLED, true),
        semanticCacheEnabled: parseBooleanFlag(process.env.SEMANTIC_CACHE_ENABLED, true),
        rateLimitFailOpen: parseBooleanFlag(process.env.RATE_LIMIT_FAIL_OPEN, true),
        semanticCacheExpectedDimensions: parsePositiveInteger(
            process.env.SEMANTIC_CACHE_EXPECTED_DIMENSIONS,
            DEFAULT_SEMANTIC_CACHE_DIMENSIONS
        ),
    };
}

export function serializeError(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
        };
    }

    return {
        message: String(error),
    };
}

export function logGatewayEvent(
    event: string,
    payload: GatewayEventPayload = {},
    level: 'info' | 'warn' | 'error' = 'info'
): void {
    const record = {
        timestamp: new Date().toISOString(),
        scope: 'ai_gateway',
        event,
        ...payload,
    };

    if (level === 'warn') {
        console.warn(`[AI Gateway] ${event}`, record);
        return;
    }

    if (level === 'error') {
        console.error(`[AI Gateway] ${event}`, record);
        return;
    }

    console.info(`[AI Gateway] ${event}`, record);
}

export function incrementGatewayCounter(
    metric: GatewayCounterMetric,
    payload: GatewayEventPayload = {}
): void {
    logGatewayEvent('counter', { metric, value: 1, ...payload });
}

function stripProviderPrefix(message: string): string {
    return message.replace(/^\[[^\]]+\]\s*/, '');
}

export function mapProviderErrorToHttpResponse(
    error: unknown,
    providerHint?: string
): ProviderHttpErrorDetails {
    const providerError = error instanceof ProviderError
        ? error
        : providerHint
            ? normalizeProviderError(providerHint, error)
            : null;

    if (!providerError) {
        return {
            status: 500,
            error: 'internal_error',
            message: error instanceof Error ? error.message : 'Unexpected internal error.',
            provider: null,
        };
    }

    const message = stripProviderPrefix(providerError.message);

    if (providerError instanceof AuthenticationError) {
        return {
            status: 401,
            error: 'provider_auth_error',
            message,
            provider: providerError.provider,
        };
    }

    if (providerError instanceof RateLimitError) {
        return {
            status: 429,
            error: 'provider_rate_limited',
            message,
            provider: providerError.provider,
            retryAfter: providerError.retryAfter,
        };
    }

    if (providerError instanceof InvalidRequestError) {
        return {
            status: 400,
            error: 'provider_invalid_request',
            message,
            provider: providerError.provider,
        };
    }

    if (providerError instanceof ModelNotFoundError) {
        return {
            status: 404,
            error: 'provider_model_not_found',
            message,
            provider: providerError.provider,
        };
    }

    if (providerError instanceof ContentFilterError) {
        return {
            status: 403,
            error: 'provider_content_filtered',
            message,
            provider: providerError.provider,
        };
    }

    if (providerError instanceof ModelAccessDeniedError) {
        return {
            status: 403,
            error: 'model_access_denied',
            message,
            provider: providerError.provider,
        };
    }

    if (providerError instanceof ServiceUnavailableError) {
        return {
            status: 503,
            error: 'provider_unavailable',
            message,
            provider: providerError.provider,
        };
    }

    if (providerError instanceof PricingUnavailableError) {
        return {
            status: 503,
            error: 'pricing_unavailable',
            message,
            provider: providerError.provider,
        };
    }

    return {
        status: 502,
        error: 'provider_error',
        message,
        provider: providerError.provider,
    };
}
