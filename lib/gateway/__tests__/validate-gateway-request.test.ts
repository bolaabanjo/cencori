/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';

const mockGetCachedApiKeyConfig = vi.fn();
const mockSetCachedApiKeyConfig = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockCheckSpendCap = vi.fn();
const mockGetCachedCreditsBalance = vi.fn();
const mockSupabaseFrom = vi.fn();
const mockProcessUsageQueue = vi.fn();

vi.mock('@vercel/functions', () => ({
    geolocation: vi.fn(() => ({})),
    ipAddress: vi.fn(() => '127.0.0.1'),
    waitUntil: vi.fn(),
}));

vi.mock('@/lib/config-cache', () => ({
    getCachedApiKeyConfig: (...args: unknown[]) => mockGetCachedApiKeyConfig(...args),
    setCachedApiKeyConfig: (...args: unknown[]) => mockSetCachedApiKeyConfig(...args),
    invalidateApiKeyCache: vi.fn(),
    getCachedCreditsBalance: (...args: unknown[]) => mockGetCachedCreditsBalance(...args),
}));

vi.mock('@/lib/rate-limit', () => ({
    checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

vi.mock('@/lib/budgets', () => ({
    checkSpendCap: (...args: unknown[]) => mockCheckSpendCap(...args),
}));

vi.mock('@/lib/credits', () => ({
    deductCredits: vi.fn(),
}));

vi.mock('@/lib/queue', () => ({
    processUsageQueue: (...args: unknown[]) => mockProcessUsageQueue(...args),
}));

vi.mock('@/lib/supabaseAdmin', () => ({
    createAdminClient: vi.fn(() => ({
        from: (...args: unknown[]) => mockSupabaseFrom(...args),
    })),
}));

import { validateGatewayRequest } from '@/lib/gateway-middleware';

const TEST_API_KEY = 'cenc_live_test_key_abc123';

function buildKeyData(overrides?: {
    tier?: string;
    billingFrozen?: boolean;
    creditsBalance?: number;
    monthlyUsed?: number;
    monthlyLimit?: number;
    keyType?: string;
    allowedDomains?: string[] | null;
}) {
    return {
        id: 'key-val-1',
        project_id: 'proj-val-1',
        environment: 'production',
        key_type: overrides?.keyType ?? 'secret',
        allowed_domains: overrides?.allowedDomains ?? null,
        projects: {
            id: 'proj-val-1',
            name: 'Validation Project',
            organization_id: 'org-val-1',
            default_model: 'gpt-4o',
            default_provider: 'openai',
            end_user_billing_enabled: false,
            organizations: {
                id: 'org-val-1',
                subscription_tier: overrides?.tier ?? 'pro',
                monthly_requests_used: overrides?.monthlyUsed ?? 0,
                monthly_request_limit: overrides?.monthlyLimit ?? 10000,
                credits_balance: overrides?.creditsBalance ?? 100,
                billing_frozen: overrides?.billingFrozen ?? false,
            },
        },
    };
}

function authRequest(
    path: string,
    options?: { apiKey?: string | null; origin?: string }
): NextRequest {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (options?.apiKey !== null) {
        headers.Authorization = `Bearer ${options?.apiKey ?? TEST_API_KEY}`;
    }
    if (options?.origin) {
        headers.origin = options.origin;
    }
    return new NextRequest(`http://localhost${path}`, { method: 'POST', headers });
}

describe('validateGatewayRequest', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetCachedApiKeyConfig.mockResolvedValue(null);
        mockGetCachedCreditsBalance.mockResolvedValue(null);
        mockProcessUsageQueue.mockResolvedValue(0);
        mockCheckRateLimit.mockResolvedValue({
            allowed: true,
            status: 'ok',
            limit: 60,
            remaining: 59,
            reset: Date.now() + 60_000,
        });
        mockCheckSpendCap.mockResolvedValue({
            allowed: true,
            status: { currentSpend: 0, spendCap: 1000 },
        });
        mockSupabaseFrom.mockImplementation((table: string) => {
            if (table === 'api_keys') {
                return {
                    select: () => ({
                        eq: () => ({
                            is: () => ({
                                single: async () => ({
                                    data: buildKeyData(),
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            }
            return {
                select: () => ({
                    eq: () => ({
                        single: async () => ({ data: null, error: null }),
                    }),
                }),
            };
        });
    });

    it('returns 401 when API key is missing', async () => {
        const result = await validateGatewayRequest(
            authRequest('/api/v1/chat/completions', { apiKey: null })
        );
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.response.status).toBe(401);
            const body = await result.response.json();
            expect(body.error).toMatch(/Missing API key/i);
        }
    });

    it('returns 401 for unknown key hash', async () => {
        mockSupabaseFrom.mockImplementation((table: string) => {
            if (table === 'api_keys') {
                return {
                    select: () => ({
                        eq: () => ({
                            is: () => ({
                                single: async () => ({ data: null, error: { code: 'PGRST116' } }),
                            }),
                        }),
                    }),
                };
            }
            return { select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) };
        });

        const result = await validateGatewayRequest(authRequest('/api/ai/chat'));
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.response.status).toBe(401);
        }
    });

    it('returns success context for valid secret key', async () => {
        const result = await validateGatewayRequest(authRequest('/api/v1/chat/completions'));
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.context.projectId).toBe('proj-val-1');
            expect(result.context.organizationId).toBe('org-val-1');
            expect(result.context.tier).toBe('pro');
            expect(result.context.apiKeyId).toBe('key-val-1');

            const keyHash = crypto.createHash('sha256').update(TEST_API_KEY).digest('hex');
            expect(mockSupabaseFrom).toHaveBeenCalledWith('api_keys');
            expect(mockGetCachedApiKeyConfig).toHaveBeenCalledWith(keyHash);
        }
    });

    it('returns 403 when billing is frozen', async () => {
        mockSupabaseFrom.mockImplementation((table: string) => {
            if (table === 'api_keys') {
                return {
                    select: () => ({
                        eq: () => ({
                            is: () => ({
                                single: async () => ({
                                    data: buildKeyData({ billingFrozen: true }),
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            }
            return { select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) };
        });

        const result = await validateGatewayRequest(authRequest('/api/ai/chat'));
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.response.status).toBe(403);
            const body = await result.response.json();
            expect(body.error).toMatch(/frozen/i);
        }
    });

    it('returns 403 when pro org has no credits', async () => {
        mockSupabaseFrom.mockImplementation((table: string) => {
            if (table === 'api_keys') {
                return {
                    select: () => ({
                        eq: () => ({
                            is: () => ({
                                single: async () => ({
                                    data: buildKeyData({ tier: 'pro', creditsBalance: 0 }),
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            }
            return { select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) };
        });

        const result = await validateGatewayRequest(authRequest('/api/v1/chat/completions'));
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.response.status).toBe(403);
        }
    });

    it('returns 429 when monthly request limit is reached', async () => {
        mockSupabaseFrom.mockImplementation((table: string) => {
            if (table === 'api_keys') {
                return {
                    select: () => ({
                        eq: () => ({
                            is: () => ({
                                single: async () => ({
                                    data: buildKeyData({ monthlyUsed: 10000, monthlyLimit: 10000 }),
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            }
            return { select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) };
        });

        const result = await validateGatewayRequest(authRequest('/api/ai/chat'));
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.response.status).toBe(429);
        }
    });

    it('returns 403 for publishable key on disallowed origin', async () => {
        mockSupabaseFrom.mockImplementation((table: string) => {
            if (table === 'api_keys') {
                return {
                    select: () => ({
                        eq: () => ({
                            is: () => ({
                                single: async () => ({
                                    data: buildKeyData({
                                        keyType: 'publishable',
                                        allowedDomains: ['allowed.example.com'],
                                    }),
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            }
            return { select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) };
        });

        const result = await validateGatewayRequest(
            authRequest('/api/v1/chat/completions', { origin: 'https://evil.example.com' })
        );
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.response.status).toBe(403);
            const body = await result.response.json();
            expect(body.error).toMatch(/Domain not allowed/i);
        }
    });

    it('uses cached API key without hitting Supabase', async () => {
        const keyData = buildKeyData();
        mockGetCachedApiKeyConfig.mockResolvedValue({ data: keyData });

        const result = await validateGatewayRequest(authRequest('/api/ai/chat'));
        expect(result.success).toBe(true);
        expect(mockSupabaseFrom).not.toHaveBeenCalledWith('api_keys');
    });
});
