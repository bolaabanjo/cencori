import { Redis } from '@upstash/redis';
import {
    getGatewayFeatureFlags,
    incrementGatewayCounter,
    logGatewayEvent,
    serializeError,
} from '@/lib/gateway-reliability';

const RATE_LIMIT_WINDOW = 60; // 1 minute in seconds
const MAX_REQUESTS_PER_WINDOW = 60; // 60 requests per minute

let redis: Redis | null | undefined;

function getRedisClient(): Redis | null {
    if (redis !== undefined) {
        return redis;
    }

    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
        redis = null;
        return redis;
    }

    redis = new Redis({ url, token });
    return redis;
}

export interface RateLimitResult {
    success: boolean;
    allowed: boolean;
    limit: number;
    remaining: number;
    reset: number; // Timestamp when the window resets
    status: 'ok' | 'skipped' | 'failed_open' | 'failed_closed';
    reason: 'allowed' | 'limit_exceeded' | 'disabled' | 'backend_unavailable';
    errorMessage?: string;
}

export interface RateLimitTelemetryContext {
    requestId?: string;
    route?: string;
}

function fallbackResult(
    now: number,
    status: 'failed_open' | 'failed_closed',
    error: unknown,
    context?: RateLimitTelemetryContext
): RateLimitResult {
    const flags = getGatewayFeatureFlags();
    const errorMessage = error instanceof Error ? error.message : String(error);

    incrementGatewayCounter('rate_limit.redis_unavailable', {
        requestId: context?.requestId,
        route: context?.route,
    });

    logGatewayEvent(
        'rate_limit.backend_unavailable',
        {
            requestId: context?.requestId,
            route: context?.route,
            rateLimit: {
                status,
                failOpen: flags.rateLimitFailOpen,
            },
            error: serializeError(error),
        },
        'warn'
    );

    return {
        success: status === 'failed_open',
        allowed: status === 'failed_open',
        limit: MAX_REQUESTS_PER_WINDOW,
        remaining: status === 'failed_open' ? MAX_REQUESTS_PER_WINDOW : 0,
        reset: now + (RATE_LIMIT_WINDOW * 1000),
        status,
        reason: 'backend_unavailable',
        errorMessage,
    };
}

/**
 * Custom-keyed, custom-limit sliding window — used by policy-as-code rate_limit
 * rules (PRD M1). Same Redis backing as checkRateLimit but with a caller-supplied
 * key + limit + window. Fails open/closed per the gateway flag when Redis is down.
 */
export async function checkCustomRateLimit(
    key: string,
    limit: number,
    windowSeconds: number = RATE_LIMIT_WINDOW,
): Promise<{ allowed: boolean; remaining: number; reset: number }> {
    const now = Date.now();
    const flags = getGatewayFeatureFlags();
    if (!flags.rateLimitEnabled) {
        return { allowed: true, remaining: limit, reset: now + windowSeconds * 1000 };
    }
    const client = getRedisClient();
    if (!client) {
        return { allowed: flags.rateLimitFailOpen, remaining: flags.rateLimitFailOpen ? limit : 0, reset: now + windowSeconds * 1000 };
    }
    try {
        const redisKey = `policy_rate_limit:${key}`;
        const pipeline = client.pipeline();
        pipeline.incr(redisKey);
        pipeline.expire(redisKey, windowSeconds);
        pipeline.ttl(redisKey);
        const results = await pipeline.exec<[number, number, number]>();
        const requests = results[0];
        const ttl = results[2] > 0 ? results[2] : windowSeconds;
        return { allowed: requests <= limit, remaining: Math.max(0, limit - requests), reset: now + ttl * 1000 };
    } catch {
        return { allowed: flags.rateLimitFailOpen, remaining: 0, reset: now + windowSeconds * 1000 };
    }
}

export async function checkRateLimit(
    projectId: string,
    context?: RateLimitTelemetryContext
): Promise<RateLimitResult> {
    const key = `rate_limit:${projectId}`;
    const now = Date.now();
    const flags = getGatewayFeatureFlags();

    if (!flags.rateLimitEnabled) {
        logGatewayEvent('rate_limit.disabled', {
            requestId: context?.requestId,
            route: context?.route,
            rateLimit: {
                status: 'skipped',
            },
        });

        return {
            success: true,
            allowed: true,
            limit: MAX_REQUESTS_PER_WINDOW,
            remaining: MAX_REQUESTS_PER_WINDOW,
            reset: now + (RATE_LIMIT_WINDOW * 1000),
            status: 'skipped',
            reason: 'disabled',
        };
    }

    const client = getRedisClient();
    if (!client) {
        return fallbackResult(
            now,
            flags.rateLimitFailOpen ? 'failed_open' : 'failed_closed',
            new Error('Upstash Redis is not configured for rate limiting'),
            context
        );
    }

    try {
        // Pipeline: batch all 3 Redis ops into a single HTTP round-trip
        const pipeline = client.pipeline();
        pipeline.incr(key);
        pipeline.expire(key, RATE_LIMIT_WINDOW);
        pipeline.ttl(key);
        const results = await pipeline.exec<[number, number, number]>();

        const requests = results[0];
        const ttl = results[2] > 0 ? results[2] : RATE_LIMIT_WINDOW;

        const remaining = Math.max(0, MAX_REQUESTS_PER_WINDOW - requests);
        const reset = now + (ttl * 1000);

        return {
            success: requests <= MAX_REQUESTS_PER_WINDOW,
            allowed: requests <= MAX_REQUESTS_PER_WINDOW,
            limit: MAX_REQUESTS_PER_WINDOW,
            remaining,
            reset,
            status: 'ok',
            reason: requests <= MAX_REQUESTS_PER_WINDOW ? 'allowed' : 'limit_exceeded',
        };
    } catch (error) {
        return fallbackResult(
            now,
            flags.rateLimitFailOpen ? 'failed_open' : 'failed_closed',
            error,
            context
        );
    }
}
