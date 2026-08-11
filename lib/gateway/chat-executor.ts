import type { createAdminClient } from '@/lib/supabaseAdmin';
import {
    type UnifiedChatRequest,
    type UnifiedChatResponse,
    type StreamChunk,
} from '@/lib/providers/base';
import { isCircuitOpen, recordSuccess, recordFailure, type CircuitBreakerConfig } from '@/lib/providers/circuit-breaker';
import { getFallbackChain, getFallbackModel, isNonRetryableError } from '@/lib/providers/failover';
import { triggerFallbackWebhook } from '@/lib/webhooks';
import { hasFeature, type SubscriptionTier } from '@/lib/entitlements';
import {
    resolveGatewayProvider,
    initializeBYOKProviders,
    type ResolvedGatewayProvider,
} from '@/lib/gateway/providers-setup';
import { GeminiProvider, OpenAICompatibleProvider } from '@/lib/providers';
import {
    applyResponseBillingMode,
    assertApiKeyModelAccess,
    type GatewayBillingMode,
} from '@/lib/gateway/model-access';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export type GatewayChatExecutionMeta = {
    actualProvider: string;
    actualModel: string;
    usedFallback: boolean;
    originalProvider: string;
    originalModel: string;
    billingMode: GatewayBillingMode;
};

export type GatewayStreamChunk = StreamChunk & GatewayChatExecutionMeta;

const PROVIDER_TIMEOUT_MS = 60_000;

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timed = new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
    try {
        return await Promise.race([promise, timed]);
    } finally {
        clearTimeout(timer);
    }
}

async function* streamWithTimeout<T>(
    stream: AsyncIterable<T>,
    label: string
): AsyncGenerator<T> {
    const iterator = stream[Symbol.asyncIterator]();
    try {
        while (true) {
            const next = await withTimeout(
                iterator.next(),
                PROVIDER_TIMEOUT_MS,
                `${label} next chunk`
            );
            if (next.done) return;
            yield next.value;
        }
    } finally {
        await iterator.return?.();
    }
}

function buildCircuitBreakerConfig(data: Record<string, unknown> | null | undefined): Partial<CircuitBreakerConfig> {
    if (!data) return {};
    const enabled = data.circuit_breaker_enabled;
    const threshold = data.circuit_breaker_failure_threshold;
    const timeout = data.circuit_breaker_timeout_seconds;
    return {
        ...(enabled !== null && enabled !== undefined ? { enabled: Boolean(enabled) } : {}),
        ...(threshold !== null && threshold !== undefined ? { failureThreshold: Number(threshold) } : {}),
        ...(timeout !== null && timeout !== undefined ? { timeoutMs: Number(timeout) * 1000 } : {}),
    };
}

interface FailoverSettings {
    enableFallback: boolean;
    configuredFallback: string | null | undefined;
    configuredFallbackModel: string | null | undefined;
    maxRetries: number;
    circuitBreakerConfig: Partial<CircuitBreakerConfig>;
}

async function loadFailoverSettings(supabase: SupabaseAdmin, projectId: string): Promise<FailoverSettings> {
    const { data } = await supabase
        .from('project_settings')
        .select('enable_fallback, fallback_provider, fallback_model, max_retries_before_fallback, circuit_breaker_enabled, circuit_breaker_failure_threshold, circuit_breaker_timeout_seconds')
        .eq('project_id', projectId)
        .single();

    return {
        enableFallback: data?.enable_fallback ?? true,
        configuredFallback: data?.fallback_provider as string | null | undefined,
        configuredFallbackModel: data?.fallback_model as string | null | undefined,
        maxRetries: data?.max_retries_before_fallback ?? 3,
        circuitBreakerConfig: buildCircuitBreakerConfig(data),
    };
}

/**
 * Non-streaming chat with retries + optional provider failover.
 */
export async function executeGatewayChat(params: {
    supabase: SupabaseAdmin;
    projectId: string;
    organizationId: string;
    allowedModels?: string[] | null;
    sponsoredModels?: string[] | null;
    tier: SubscriptionTier;
    request: UnifiedChatRequest;
    resolved?: ResolvedGatewayProvider;
    requestId?: string;
    /**
     * Per-call Google key override, applied only when the resolved provider is
     * Google. Lets memory extraction run on its dedicated key
     * (MEMORY_GEMINI_API_KEY) without affecting general Gemini chat traffic.
     */
    googleApiKeyOverride?: string;
    /**
     * Per-call, per-provider key overrides keyed by resolved provider name
     * (e.g. { cerebras, groq, google }). Lets the memory pipeline run its
     * generative fan-out on DEDICATED memory keys so it never competes with
     * chat traffic for the shared managed quota. Applied after resolution; an
     * absent/empty entry leaves the shared managed key in place.
     */
    memoryProviderKeys?: Record<string, string | undefined>;
    /**
     * Restrict this call to the primary provider — never fall back to another.
     * Used by the memory pipeline (whose own fan-out owns cross-provider
     * fallback): a failure should fail open, not route through an unfunded key.
     */
    googleOnly?: boolean;
}): Promise<UnifiedChatResponse & GatewayChatExecutionMeta> {
    let resolved =
        params.resolved ??
        (await resolveGatewayProvider({
            supabase: params.supabase,
            projectId: params.projectId,
            organizationId: params.organizationId,
            requestedModel: params.request.model,
            allowedModels: params.allowedModels,
            sponsoredModels: params.sponsoredModels,
        }));

    // Dedicated per-provider memory key override (Cerebras/Groq/Google), so the
    // memory fan-out runs on its own quota. Registered for whatever provider the
    // model resolved to.
    const memoryKey = params.memoryProviderKeys?.[resolved.providerName];
    if (memoryKey) {
        const overridden = resolved.providerName === 'google'
            ? new GeminiProvider(memoryKey)
            : new OpenAICompatibleProvider(resolved.providerName, memoryKey);
        resolved.router.registerProvider(resolved.providerName, overridden);
        resolved = { ...resolved, provider: overridden };
    }

    if (params.googleApiKeyOverride && resolved.providerName === 'google') {
        const overridden = new GeminiProvider(params.googleApiKeyOverride);
        resolved.router.registerProvider('google', overridden);
        resolved = { ...resolved, provider: overridden };
    }

    const { providerName, model, provider, router } = resolved;
    const chatRequest: UnifiedChatRequest = { ...params.request, model };
    const failoverAllowed = hasFeature(params.tier, 'failover');
    const settings = await loadFailoverSettings(params.supabase, params.projectId);
    const cbConfig = settings.circuitBreakerConfig;

    const actualProvider = providerName;
    const actualModel = model;
    const usedFallback = false;
    let lastError: Error | null = null;
    const fallbackErrors: string[] = [];

    if (failoverAllowed && (await isCircuitOpen(providerName, cbConfig))) {
        lastError = new Error(`Provider ${providerName} circuit is open`);
    } else {
        const maxRetries = failoverAllowed ? settings.maxRetries : 1;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const providerResponse = await withTimeout(
                    provider.chat(chatRequest),
                    PROVIDER_TIMEOUT_MS,
                    `${providerName} primary`
                );
                await recordSuccess(providerName);
                const response = applyResponseBillingMode(providerResponse, resolved.billingMode);
                return {
                    ...response,
                    actualProvider,
                    actualModel,
                    usedFallback,
                    originalProvider: providerName,
                    originalModel: model,
                    billingMode: resolved.billingMode,
                };
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                console.warn(
                    `[Gateway/Failover] Attempt ${attempt + 1}/${maxRetries} failed for ${providerName}:`,
                    lastError.message
                );
                if (isNonRetryableError(error)) throw error;
                if (attempt < maxRetries - 1) {
                    await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 100));
                }
            }
        }
        await recordFailure(providerName, cbConfig);
    }

    if (params.googleOnly || !failoverAllowed || !settings.enableFallback || !lastError) {
        // googleOnly: memory is managed + Google-only — never fall back to OpenAI.
        throw lastError || new Error('Chat request failed');
    }

    const fallbackChain = getFallbackChain(providerName, settings.configuredFallback);
    for (const fallbackProviderName of fallbackChain) {
        if (await isCircuitOpen(fallbackProviderName, cbConfig)) continue;

        if (!router.hasProvider(fallbackProviderName)) {
            const initialized = await initializeBYOKProviders(
                router,
                params.supabase,
                params.projectId,
                params.organizationId,
                fallbackProviderName
            );
            if (!initialized.success) continue;
        }

        try {
            const fallbackProvider = router.getProvider(fallbackProviderName);
            const fallbackModel = await getFallbackModel(model, fallbackProviderName, settings.configuredFallbackModel);
            const fallbackBillingMode = assertApiKeyModelAccess({
                allowedModels: params.allowedModels,
                sponsoredModels: params.sponsoredModels,
                provider: fallbackProviderName,
                model: fallbackModel,
            });
            await fallbackProvider.getPricing(fallbackModel);
            const providerResponse = await withTimeout(
                fallbackProvider.chat({ ...chatRequest, model: fallbackModel }),
                PROVIDER_TIMEOUT_MS,
                `${fallbackProviderName} fallback`
            );
            const response = applyResponseBillingMode(providerResponse, fallbackBillingMode);
            await recordSuccess(fallbackProviderName);

            void triggerFallbackWebhook(params.projectId, {
                original_provider: providerName,
                original_model: model,
                fallback_provider: fallbackProviderName,
                fallback_model: fallbackModel,
                reason: lastError.message,
                request_id: params.requestId,
            });

            return {
                ...response,
                actualProvider: fallbackProviderName,
                actualModel: fallbackModel,
                usedFallback: true,
                originalProvider: providerName,
                originalModel: model,
                billingMode: fallbackBillingMode,
            };
        } catch (fallbackError) {
            const msg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
            fallbackErrors.push(`${fallbackProviderName}: ${msg}`);
            console.warn(`[Gateway/Failover] Fallback ${fallbackProviderName} failed:`, fallbackError);
            await recordFailure(fallbackProviderName, cbConfig);
        }
    }

    const primaryMsg = lastError.message;
    if (fallbackErrors.length > 0) {
        throw new Error(
            `All providers exhausted. Primary (${providerName}): ${primaryMsg}. ` +
            `Fallback attempts: [${fallbackErrors.join('; ')}]`
        );
    }
    throw lastError;
}

/**
 * Streaming chat with retries + optional provider failover.
 */
export async function* streamGatewayChat(params: {
    supabase: SupabaseAdmin;
    projectId: string;
    organizationId: string;
    allowedModels?: string[] | null;
    sponsoredModels?: string[] | null;
    tier: SubscriptionTier;
    request: UnifiedChatRequest;
    resolved?: ResolvedGatewayProvider;
    requestId?: string;
}): AsyncGenerator<GatewayStreamChunk> {
    const resolved =
        params.resolved ??
        (await resolveGatewayProvider({
            supabase: params.supabase,
            projectId: params.projectId,
            organizationId: params.organizationId,
            requestedModel: params.request.model,
            allowedModels: params.allowedModels,
            sponsoredModels: params.sponsoredModels,
        }));

    const { providerName, model, provider, router } = resolved;
    const chatRequest: UnifiedChatRequest = { ...params.request, model };
    const failoverAllowed = hasFeature(params.tier, 'failover');
    const settings = await loadFailoverSettings(params.supabase, params.projectId);
    const cbConfig = settings.circuitBreakerConfig;

    let lastError: Error | null = null;
    const fallbackErrors: string[] = [];

    if (!(await isCircuitOpen(providerName, cbConfig))) {
        const maxRetries = failoverAllowed ? settings.maxRetries : 1;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            let emitted = false;
            try {
                const stream = provider.stream(chatRequest);
                for await (const chunk of streamWithTimeout(stream, `${providerName} primary`)) {
                    emitted = true;
                    yield {
                        ...chunk,
                        actualProvider: providerName,
                        actualModel: model,
                        usedFallback: false,
                        originalProvider: providerName,
                        originalModel: model,
                        billingMode: resolved.billingMode,
                    };
                }
                await recordSuccess(providerName);
                return;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                // Once bytes have reached the caller, retrying or switching
                // providers would splice two independent answers together.
                if (emitted) {
                    await recordFailure(providerName, cbConfig);
                    throw lastError;
                }
                if (isNonRetryableError(error)) throw error;
                if (attempt < maxRetries - 1) {
                    await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 100));
                }
            }
        }
        await recordFailure(providerName, cbConfig);
    } else {
        lastError = new Error(`Provider ${providerName} circuit is open`);
    }

    if (!failoverAllowed || !settings.enableFallback || !lastError) {
        throw lastError || new Error('Stream request failed');
    }

    const fallbackChain = getFallbackChain(providerName, settings.configuredFallback);
    for (const fallbackProviderName of fallbackChain) {
        if (await isCircuitOpen(fallbackProviderName, cbConfig)) continue;

        if (!router.hasProvider(fallbackProviderName)) {
            const initialized = await initializeBYOKProviders(
                router,
                params.supabase,
                params.projectId,
                params.organizationId,
                fallbackProviderName
            );
            if (!initialized.success) continue;
        }

        let fallbackEmitted = false;
        try {
            const fallbackProvider = router.getProvider(fallbackProviderName);
            const fallbackModel = await getFallbackModel(model, fallbackProviderName, settings.configuredFallbackModel);
            const fallbackBillingMode = assertApiKeyModelAccess({
                allowedModels: params.allowedModels,
                sponsoredModels: params.sponsoredModels,
                provider: fallbackProviderName,
                model: fallbackModel,
            });
            await fallbackProvider.getPricing(fallbackModel);
            const stream = fallbackProvider.stream({ ...chatRequest, model: fallbackModel });

            for await (const chunk of streamWithTimeout(stream, `${fallbackProviderName} fallback`)) {
                fallbackEmitted = true;
                yield {
                    ...chunk,
                    actualProvider: fallbackProviderName,
                    actualModel: fallbackModel,
                    usedFallback: true,
                    originalProvider: providerName,
                    originalModel: model,
                    billingMode: fallbackBillingMode,
                };
            }

            await recordSuccess(fallbackProviderName);
            void triggerFallbackWebhook(params.projectId, {
                original_provider: providerName,
                original_model: model,
                fallback_provider: fallbackProviderName,
                fallback_model: fallbackModel,
                reason: lastError.message,
                request_id: params.requestId,
            });
            return;
        } catch (fallbackError) {
            const msg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
            fallbackErrors.push(`${fallbackProviderName}: ${msg}`);
            console.warn(`[Gateway/Failover/Stream] Fallback ${fallbackProviderName} failed:`, fallbackError);
            await recordFailure(fallbackProviderName, cbConfig);
            if (fallbackEmitted) {
                throw fallbackError;
            }
        }
    }

    const primaryMsg = lastError.message;
    if (fallbackErrors.length > 0) {
        throw new Error(
            `All providers exhausted. Primary (${providerName}): ${primaryMsg}. ` +
            `Fallback attempts: [${fallbackErrors.join('; ')}]`
        );
    }
    throw lastError;
}
