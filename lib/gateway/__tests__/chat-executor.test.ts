/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { UnifiedChatRequest, UnifiedChatResponse } from '@/lib/providers/base';

const mockIsCircuitOpen = vi.fn();
const mockRecordSuccess = vi.fn();
const mockRecordFailure = vi.fn();
const mockGetFallbackChain = vi.fn();
const mockGetFallbackModel = vi.fn();
const mockIsNonRetryableError = vi.fn();
const mockTriggerFallbackWebhook = vi.fn();
const mockInitializeBYOKProviders = vi.fn();

vi.mock('@/lib/providers/circuit-breaker', () => ({
    isCircuitOpen: (...args: unknown[]) => mockIsCircuitOpen(...args),
    recordSuccess: (...args: unknown[]) => mockRecordSuccess(...args),
    recordFailure: (...args: unknown[]) => mockRecordFailure(...args),
}));

vi.mock('@/lib/providers/failover', () => ({
    getFallbackChain: (...args: unknown[]) => mockGetFallbackChain(...args),
    getFallbackModel: (...args: unknown[]) => mockGetFallbackModel(...args),
    isNonRetryableError: (...args: unknown[]) => mockIsNonRetryableError(...args),
}));

vi.mock('@/lib/webhooks', () => ({
    triggerSecurityWebhook: vi.fn(),
    triggerFallbackWebhook: (...args: unknown[]) => mockTriggerFallbackWebhook(...args),
}));

vi.mock('@/lib/gateway/providers-setup', () => ({
    initializeBYOKProviders: (...args: unknown[]) => mockInitializeBYOKProviders(...args),
}));

import { executeGatewayChat, streamGatewayChat } from '@/lib/gateway/chat-executor';

function createMockSupabaseForExecutor(options?: {
    enableFallback?: boolean;
    maxRetries?: number;
    circuitBreakerEnabled?: boolean;
    circuitBreakerThreshold?: number;
    circuitBreakerTimeout?: number;
    fallbackModel?: string;
}) {
    return {
        from: vi.fn((table: string) => {
            if (table === 'project_settings') {
                return {
                    select: () => ({
                        eq: () => ({
                            single: async () => ({
                                data: {
                                    enable_fallback: options?.enableFallback ?? true,
                                    fallback_provider: null,
                                    fallback_model: options?.fallbackModel ?? null,
                                    max_retries_before_fallback: options?.maxRetries ?? 1,
                                    circuit_breaker_enabled: options?.circuitBreakerEnabled ?? null,
                                    circuit_breaker_failure_threshold: options?.circuitBreakerThreshold ?? null,
                                    circuit_breaker_timeout_seconds: options?.circuitBreakerTimeout ?? null,
                                },
                                error: null,
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
        }),
    };
}

function mockResponse(content: string): UnifiedChatResponse {
    return {
        content,
        model: 'gpt-4o',
        provider: 'openai',
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        cost: { providerCostUsd: 0.001, cencoriChargeUsd: 0.001, markupPercentage: 0 },
        latencyMs: 10,
        finishReason: 'stop',
    };
}

describe('executeGatewayChat failover', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIsCircuitOpen.mockResolvedValue(false);
        mockRecordSuccess.mockResolvedValue(undefined);
        mockRecordFailure.mockResolvedValue(undefined);
        mockIsNonRetryableError.mockReturnValue(false);
        mockGetFallbackChain.mockReturnValue(['anthropic']);
        mockGetFallbackModel.mockResolvedValue('claude-sonnet-4');
        mockInitializeBYOKProviders.mockResolvedValue({ success: true });
    });

    it('returns primary provider response on success', async () => {
        const primaryChat = vi.fn().mockResolvedValue(mockResponse('primary ok'));

        const result = await executeGatewayChat({
            supabase: createMockSupabaseForExecutor() as never,
            projectId: 'proj-ex',
            organizationId: 'org-ex',
            tier: 'pro',
            request: { messages: [], model: 'gpt-4o', stream: false } as UnifiedChatRequest,
            resolved: {
                providerName: 'openai',
                model: 'gpt-4o',
                provider: { chat: primaryChat, stream: vi.fn(), countTokens: vi.fn(), getPricing: vi.fn() },
                router: { hasProvider: () => true, getProvider: vi.fn() },
            } as never,
        });

        expect(result.content).toBe('primary ok');
        expect(result.usedFallback).toBe(false);
        expect(primaryChat).toHaveBeenCalledTimes(1);
    });

    it('falls back to secondary provider when primary fails', async () => {
        const primaryChat = vi.fn().mockRejectedValue(new Error('openai down'));
        const fallbackChat = vi.fn().mockResolvedValue(mockResponse('fallback ok'));
        const router = {
            hasProvider: (name: string) => name === 'anthropic',
            getProvider: (name: string) =>
                name === 'anthropic'
                    ? { chat: fallbackChat, stream: vi.fn(), countTokens: vi.fn(), getPricing: vi.fn() }
                    : { chat: vi.fn(), stream: vi.fn(), countTokens: vi.fn(), getPricing: vi.fn() },
        };

        const result = await executeGatewayChat({
            supabase: createMockSupabaseForExecutor({ maxRetries: 1 }) as never,
            projectId: 'proj-ex',
            organizationId: 'org-ex',
            tier: 'pro',
            request: { messages: [], model: 'gpt-4o', stream: false } as UnifiedChatRequest,
            resolved: {
                providerName: 'openai',
                model: 'gpt-4o',
                provider: { chat: primaryChat, stream: vi.fn(), countTokens: vi.fn(), getPricing: vi.fn() },
                router,
            } as never,
        });

        expect(result.content).toBe('fallback ok');
        expect(result.usedFallback).toBe(true);
        expect(result.actualProvider).toBe('anthropic');
        expect(mockTriggerFallbackWebhook).toHaveBeenCalled();
    });

    it('skips primary when circuit is open and uses fallback', async () => {
        mockIsCircuitOpen.mockImplementation(async (provider: string) => provider === 'openai');

        const primaryChat = vi.fn().mockResolvedValue(mockResponse('should not run'));
        const fallbackChat = vi.fn().mockResolvedValue(mockResponse('circuit fallback'));
        const router = {
            hasProvider: () => true,
            getProvider: (name: string) =>
                name === 'anthropic'
                    ? { chat: fallbackChat, stream: vi.fn(), countTokens: vi.fn(), getPricing: vi.fn() }
                    : { chat: primaryChat, stream: vi.fn(), countTokens: vi.fn(), getPricing: vi.fn() },
        };

        const result = await executeGatewayChat({
            supabase: createMockSupabaseForExecutor({ maxRetries: 1 }) as never,
            projectId: 'proj-ex',
            organizationId: 'org-ex',
            tier: 'pro',
            request: { messages: [], model: 'gpt-4o', stream: false } as UnifiedChatRequest,
            resolved: {
                providerName: 'openai',
                model: 'gpt-4o',
                provider: { chat: primaryChat, stream: vi.fn(), countTokens: vi.fn(), getPricing: vi.fn() },
                router,
            } as never,
        });

        expect(result.content).toBe('circuit fallback');
        expect(primaryChat).not.toHaveBeenCalled();
    });

    it('throws immediately on non-retryable error without retry or fallback', async () => {
        mockIsNonRetryableError.mockReturnValue(true);
        const primaryChat = vi.fn().mockRejectedValue(new Error('invalid api key'));

        await expect(executeGatewayChat({
            supabase: createMockSupabaseForExecutor() as never,
            projectId: 'proj-ex',
            organizationId: 'org-ex',
            tier: 'pro',
            request: { messages: [], model: 'gpt-4o', stream: false } as UnifiedChatRequest,
            resolved: {
                providerName: 'openai',
                model: 'gpt-4o',
                provider: { chat: primaryChat, stream: vi.fn(), countTokens: vi.fn(), getPricing: vi.fn() },
                router: { hasProvider: () => true, getProvider: vi.fn() },
            } as never,
        })).rejects.toThrow('invalid api key');

        expect(primaryChat).toHaveBeenCalledTimes(1);
        expect(mockRecordFailure).not.toHaveBeenCalled();
        expect(mockTriggerFallbackWebhook).not.toHaveBeenCalled();
    });

    it('records failure only once when all retries are exhausted', async () => {
        mockGetFallbackChain.mockReturnValue([]);
        const primaryChat = vi.fn().mockRejectedValue(new Error('openai down'));

        await expect(executeGatewayChat({
            supabase: createMockSupabaseForExecutor({ maxRetries: 3 }) as never,
            projectId: 'proj-ex',
            organizationId: 'org-ex',
            tier: 'pro',
            request: { messages: [], model: 'gpt-4o', stream: false } as UnifiedChatRequest,
            resolved: {
                providerName: 'openai',
                model: 'gpt-4o',
                provider: { chat: primaryChat, stream: vi.fn(), countTokens: vi.fn(), getPricing: vi.fn() },
                router: { hasProvider: () => false, getProvider: vi.fn() },
            } as never,
        })).rejects.toThrow();

        expect(primaryChat).toHaveBeenCalledTimes(3);
        expect(mockRecordFailure).toHaveBeenCalledTimes(1);
    });

    it('throws aggregate error when all fallbacks are exhausted', async () => {
        const primaryChat = vi.fn().mockRejectedValue(new Error('primary down'));
        const fallbackChat1 = vi.fn().mockRejectedValue(new Error('anthropic down'));
        const fallbackChat2 = vi.fn().mockRejectedValue(new Error('google down'));
        const router = {
            hasProvider: (name: string) => ['anthropic', 'google'].includes(name),
            getProvider: (name: string) => ({
                chat: name === 'anthropic' ? fallbackChat1 : fallbackChat2,
                stream: vi.fn(), countTokens: vi.fn(), getPricing: vi.fn(),
            }),
        };

        mockGetFallbackChain.mockReturnValue(['anthropic', 'google']);

        await expect(executeGatewayChat({
            supabase: createMockSupabaseForExecutor({ maxRetries: 1 }) as never,
            projectId: 'proj-ex',
            organizationId: 'org-ex',
            tier: 'pro',
            request: { messages: [], model: 'gpt-4o', stream: false } as UnifiedChatRequest,
            resolved: {
                providerName: 'openai',
                model: 'gpt-4o',
                provider: { chat: primaryChat, stream: vi.fn(), countTokens: vi.fn(), getPricing: vi.fn() },
                router,
            } as never,
        })).rejects.toThrow(/All providers exhausted.*anthropic.*google/s);

        expect(primaryChat).toHaveBeenCalledTimes(1);
        expect(fallbackChat1).toHaveBeenCalledTimes(1);
        expect(fallbackChat2).toHaveBeenCalledTimes(1);
    });

    it('skips fallback provider with open circuit and tries next', async () => {
        mockIsCircuitOpen.mockImplementation(async (provider: string) => provider === 'anthropic');
        mockGetFallbackChain.mockReturnValue(['anthropic', 'google']);

        const primaryChat = vi.fn().mockRejectedValue(new Error('openai down'));
        const anthropicChat = vi.fn().mockRejectedValue(new Error('should not be called'));
        const googleChat = vi.fn().mockResolvedValue(mockResponse('google ok'));
        const router = {
            hasProvider: () => true,
            getProvider: (name: string) =>
                name === 'anthropic'
                    ? { chat: anthropicChat, stream: vi.fn(), countTokens: vi.fn(), getPricing: vi.fn() }
                    : { chat: googleChat, stream: vi.fn(), countTokens: vi.fn(), getPricing: vi.fn() },
        };

        const result = await executeGatewayChat({
            supabase: createMockSupabaseForExecutor({ maxRetries: 1 }) as never,
            projectId: 'proj-ex',
            organizationId: 'org-ex',
            tier: 'pro',
            request: { messages: [], model: 'gpt-4o', stream: false } as UnifiedChatRequest,
            resolved: {
                providerName: 'openai',
                model: 'gpt-4o',
                provider: { chat: primaryChat, stream: vi.fn(), countTokens: vi.fn(), getPricing: vi.fn() },
                router,
            } as never,
        });

        expect(result.content).toBe('google ok');
        expect(anthropicChat).not.toHaveBeenCalled();
        expect(googleChat).toHaveBeenCalledTimes(1);
    });

    it('skips fallback when BYOK initialization fails and tries next', async () => {
        mockGetFallbackChain.mockReturnValue(['anthropic', 'google']);
        mockInitializeBYOKProviders.mockImplementation(
            async (_router: unknown, _supabase: unknown, _pid: unknown, _oid: unknown, provider: string) =>
                ({ success: provider !== 'anthropic' })
        );

        const primaryChat = vi.fn().mockRejectedValue(new Error('openai down'));
        const anthropicChat = vi.fn().mockRejectedValue(new Error('should not be called'));
        const googleChat = vi.fn().mockResolvedValue(mockResponse('google ok'));
        const router = {
            hasProvider: (name: string) => false,
            getProvider: (name: string) =>
                name === 'google'
                    ? { chat: googleChat, stream: vi.fn(), countTokens: vi.fn(), getPricing: vi.fn() }
                    : { chat: anthropicChat, stream: vi.fn(), countTokens: vi.fn(), getPricing: vi.fn() },
        };

        const result = await executeGatewayChat({
            supabase: createMockSupabaseForExecutor({ maxRetries: 1 }) as never,
            projectId: 'proj-ex',
            organizationId: 'org-ex',
            tier: 'pro',
            request: { messages: [], model: 'gpt-4o', stream: false } as UnifiedChatRequest,
            resolved: {
                providerName: 'openai',
                model: 'gpt-4o',
                provider: { chat: primaryChat, stream: vi.fn(), countTokens: vi.fn(), getPricing: vi.fn() },
                router,
            } as never,
        });

        expect(result.content).toBe('google ok');
        expect(anthropicChat).not.toHaveBeenCalled();
        expect(googleChat).toHaveBeenCalledTimes(1);
    });

    it('passes circuit breaker config from project settings to circuit breaker functions', async () => {
        mockGetFallbackChain.mockReturnValue([]);
        const primaryChat = vi.fn().mockRejectedValue(new Error('openai down'));

        await expect(executeGatewayChat({
            supabase: createMockSupabaseForExecutor({
                maxRetries: 2,
                circuitBreakerEnabled: true,
                circuitBreakerThreshold: 3,
                circuitBreakerTimeout: 30,
            }) as never,
            projectId: 'proj-ex',
            organizationId: 'org-ex',
            tier: 'pro',
            request: { messages: [], model: 'gpt-4o', stream: false } as UnifiedChatRequest,
            resolved: {
                providerName: 'openai',
                model: 'gpt-4o',
                provider: { chat: primaryChat, stream: vi.fn(), countTokens: vi.fn(), getPricing: vi.fn() },
                router: { hasProvider: () => false, getProvider: vi.fn() },
            } as never,
        })).rejects.toThrow();

        const isCircuitCall = mockIsCircuitOpen.mock.calls.find(([p]) => p === 'openai');
        expect(isCircuitCall).toBeDefined();
        const configArg = isCircuitCall![1];
        expect(configArg).toMatchObject({
            enabled: true,
            failureThreshold: 3,
            timeoutMs: 30000,
        });

        const recordFailureCall = mockRecordFailure.mock.calls.find(([p]) => p === 'openai');
        expect(recordFailureCall).toBeDefined();
        expect(recordFailureCall![1]).toMatchObject({
            enabled: true,
            failureThreshold: 3,
            timeoutMs: 30000,
        });
    });
});

describe('streamGatewayChat', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIsCircuitOpen.mockResolvedValue(false);
        mockRecordSuccess.mockResolvedValue(undefined);
        mockRecordFailure.mockResolvedValue(undefined);
        mockIsNonRetryableError.mockReturnValue(false);
        mockGetFallbackChain.mockReturnValue([]);
    });

    it('yields chunks with execution metadata', async () => {
        async function* mockStream() {
            yield { delta: 'Hello', finishReason: null };
            yield { delta: ' world', finishReason: 'stop' };
        }

        const stream = streamGatewayChat({
            supabase: createMockSupabaseForExecutor({ enableFallback: false }) as never,
            projectId: 'proj-ex',
            organizationId: 'org-ex',
            tier: 'free',
            request: { messages: [], model: 'gpt-4o', stream: true } as UnifiedChatRequest,
            resolved: {
                providerName: 'openai',
                model: 'gpt-4o',
                provider: {
                    chat: vi.fn(),
                    stream: () => mockStream(),
                    countTokens: vi.fn(),
                    getPricing: vi.fn(),
                },
                router: { hasProvider: () => false, getProvider: vi.fn() },
            } as never,
        });

        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }

        expect(chunks.length).toBe(2);
        expect(chunks[0].delta).toBe('Hello');
        expect(chunks[0].actualProvider).toBe('openai');
        expect(chunks[1].finishReason).toBe('stop');
    });

    it('does not retry or fail over after the first chunk has been emitted', async () => {
        mockGetFallbackChain.mockReturnValue(['anthropic']);
        async function* brokenPrimary() {
            yield { delta: 'partial', finishReason: null };
            throw new Error('stream disconnected');
        }
        const fallbackStream = vi.fn(async function* () {
            yield { delta: 'fallback', finishReason: 'stop' };
        });

        const stream = streamGatewayChat({
            supabase: createMockSupabaseForExecutor({ enableFallback: true, maxRetries: 3 }) as never,
            projectId: 'proj-ex',
            organizationId: 'org-ex',
            tier: 'pro',
            request: { messages: [], model: 'gpt-4o', stream: true } as UnifiedChatRequest,
            resolved: {
                providerName: 'openai',
                model: 'gpt-4o',
                provider: {
                    chat: vi.fn(),
                    stream: () => brokenPrimary(),
                    countTokens: vi.fn(),
                    getPricing: vi.fn(),
                },
                router: {
                    hasProvider: () => true,
                    getProvider: () => ({
                        chat: vi.fn(),
                        stream: fallbackStream,
                        countTokens: vi.fn(),
                        getPricing: vi.fn(),
                    }),
                },
            } as never,
        });

        const chunks = [];
        await expect(async () => {
            for await (const chunk of stream) chunks.push(chunk);
        }).rejects.toThrow('stream disconnected');

        expect(chunks).toHaveLength(1);
        expect(chunks[0].delta).toBe('partial');
        expect(fallbackStream).not.toHaveBeenCalled();
        expect(mockRecordFailure).toHaveBeenCalledTimes(1);
    });

    it('can fail over when a provider fails before emitting anything', async () => {
        mockGetFallbackChain.mockReturnValue(['anthropic']);
        async function* failedPrimary(): AsyncGenerator<never> {
            throw new Error('primary unavailable');
        }
        async function* fallback() {
            yield { delta: 'safe fallback', finishReason: 'stop' };
        }

        const stream = streamGatewayChat({
            supabase: createMockSupabaseForExecutor({ enableFallback: true, maxRetries: 1 }) as never,
            projectId: 'proj-ex',
            organizationId: 'org-ex',
            tier: 'pro',
            request: { messages: [], model: 'gpt-4o', stream: true } as UnifiedChatRequest,
            resolved: {
                providerName: 'openai',
                model: 'gpt-4o',
                provider: {
                    chat: vi.fn(), stream: () => failedPrimary(), countTokens: vi.fn(), getPricing: vi.fn(),
                },
                router: {
                    hasProvider: () => true,
                    getProvider: () => ({
                        chat: vi.fn(), stream: () => fallback(), countTokens: vi.fn(), getPricing: vi.fn(),
                    }),
                },
            } as never,
        });

        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        expect(chunks.map(chunk => chunk.delta).join('')).toBe('safe fallback');
        expect(chunks[0].actualProvider).toBe('anthropic');
    });
});
