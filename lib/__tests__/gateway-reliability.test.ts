import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
    AuthenticationError,
    ModelAccessDeniedError,
    RateLimitError,
    ServiceUnavailableError,
} from '@/lib/providers/errors';
import {
    mapProviderErrorToHttpResponse,
    parseBooleanFlag,
} from '@/lib/gateway-reliability';

const ENV_KEYS = [
    'RATE_LIMIT_ENABLED',
    'RATE_LIMIT_FAIL_OPEN',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
] as const;

const ENV_BACKUP = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]])
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

async function loadRateLimitModule() {
    vi.resetModules();
    return import('@/lib/rate-limit');
}

describe('gateway reliability helpers', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(console, 'info').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        for (const key of ENV_KEYS) {
            const originalValue = ENV_BACKUP[key];
            if (originalValue === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = originalValue;
            }
        }
        vi.restoreAllMocks();
    });

    test('parseBooleanFlag honors common truthy and falsy env values', () => {
        expect(parseBooleanFlag('true', false)).toBe(true);
        expect(parseBooleanFlag('YES', false)).toBe(true);
        expect(parseBooleanFlag('off', true)).toBe(false);
        expect(parseBooleanFlag(undefined, true)).toBe(true);
        expect(parseBooleanFlag('unexpected', false)).toBe(false);
    });

    test('mapProviderErrorToHttpResponse preserves provider-specific status mapping', () => {
        expect(mapProviderErrorToHttpResponse(new AuthenticationError('openai'))).toMatchObject({
            status: 401,
            error: 'provider_auth_error',
            provider: 'openai',
        });
        expect(mapProviderErrorToHttpResponse(new RateLimitError('google', 30))).toMatchObject({
            status: 429,
            error: 'provider_rate_limited',
            provider: 'google',
            retryAfter: 30,
        });
        expect(mapProviderErrorToHttpResponse(new ServiceUnavailableError('anthropic'))).toMatchObject({
            status: 503,
            error: 'provider_unavailable',
            provider: 'anthropic',
        });
        expect(mapProviderErrorToHttpResponse(new ModelAccessDeniedError('maximo', 'maximo-atlas-1.1'))).toMatchObject({
            status: 403,
            error: 'model_access_denied',
            provider: 'maximo',
        });
    });

    test('checkRateLimit skips Redis when the feature flag disables rate limiting', async () => {
        process.env.RATE_LIMIT_ENABLED = 'false';
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;

        const { checkRateLimit } = await loadRateLimitModule();
        const result = await checkRateLimit('project-disabled');

        expect(result.allowed).toBe(true);
        expect(result.status).toBe('skipped');
        expect(result.reason).toBe('disabled');
    });

    test('checkRateLimit fails open when Redis is unavailable and fail-open is enabled', async () => {
        process.env.RATE_LIMIT_ENABLED = 'true';
        process.env.RATE_LIMIT_FAIL_OPEN = 'true';
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;

        const { checkRateLimit } = await loadRateLimitModule();
        const result = await checkRateLimit('project-fail-open');

        expect(result.allowed).toBe(true);
        expect(result.status).toBe('failed_open');
        expect(result.reason).toBe('backend_unavailable');
    });

    test('checkRateLimit fails closed only when explicitly configured', async () => {
        process.env.RATE_LIMIT_ENABLED = 'true';
        process.env.RATE_LIMIT_FAIL_OPEN = 'false';
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;

        const { checkRateLimit } = await loadRateLimitModule();
        const result = await checkRateLimit('project-fail-closed');

        expect(result.allowed).toBe(false);
        expect(result.status).toBe('failed_closed');
        expect(result.reason).toBe('backend_unavailable');
    });
});
