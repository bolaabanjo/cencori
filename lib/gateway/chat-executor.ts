import type { createAdminClient } from '@/lib/supabaseAdmin';
import {
    type UnifiedChatRequest,
    type UnifiedChatResponse,
    type StreamChunk,
} from '@/lib/providers/base';
import {
    circuitKey,
    isCircuitOpen,
    recordSuccess,
    recordFailure,
    type CircuitBreakerConfig,
} from '@/lib/providers/circuit-breaker';
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
import type { GatewayPerformanceTracker } from '@/lib/gateway/performance';
import {
    getCachedFailoverConfig,
    setCachedFailoverConfig,
} from '@/lib/config-cache';
import { hedgedStream } from '@/lib/gateway/hedged-stream';

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
    const cached = await getCachedFailoverConfig(projectId);
    let data = cached;
    if (!cached) {
        const result = await supabase
            .from('project_settings')
            .select('enable_fallback, fallback_provider, fallback_model, max_retries_before_fallback, circuit_breaker_enabled, circuit_breaker_failure_threshold, circuit_breaker_timeout_seconds')
            .eq('project_id', projectId)
            .single();
        data = result.data || {};
        void setCachedFailoverConfig(projectId, data);
    }

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
    basecodeModelPolicy?: 'auto' | 'open_weight' | 'frontier' | 'custom' | null;
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
    performance?: GatewayPerformanceTracker;
}): Promise<UnifiedChatResponse & GatewayChatExecutionMeta> {
    let resolved =
        params.resolved ??
        (await resolveGatewayProvider({
            supabase: params.supabase,
            projectId: params.projectId,
            organizationId: params.organizationId,
            requestedModel: params.request.model,
            basecodeModelPolicy: params.basecodeModelPolicy,
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

    // Scoped to the model: a provider is only short-circuited for the model that kept failing,
    // so one retired model cannot speak for everything else the provider serves.
    const primaryCircuit = circuitKey(providerName, model);
    if (failoverAllowed && (await isCircuitOpen(primaryCircuit, cbConfig))) {
        lastError = new Error(`Provider ${providerName} circuit is open for ${model}`);
    } else {
        const maxRetries = failoverAllowed ? settings.maxRetries : 1;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                params.performance?.markProviderStart();
                const providerResponse = await withTimeout(
                    provider.chat(chatRequest),
                    PROVIDER_TIMEOUT_MS,
                    `${providerName} primary`
                );
                await recordSuccess(primaryCircuit);
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
        await recordFailure(primaryCircuit, cbConfig);
    }

    if (params.googleOnly || !failoverAllowed || !settings.enableFallback || !lastError) {
        // googleOnly: memory is managed + Google-only — never fall back to OpenAI.
        throw lastError || new Error('Chat request failed');
    }

    const fallbackChain = getFallbackChain(providerName, settings.configuredFallback);
    for (const fallbackProviderName of fallbackChain) {
        // Resolved before the circuit check so the circuit is keyed on what will actually run.
        // A fallback serves a different model than the primary, and recording its outcome under
        // the primary's model would blame a model this provider was never asked for.
        let fallbackModel: string;
        try {
            fallbackModel = await getFallbackModel(
                model,
                fallbackProviderName,
                settings.configuredFallbackModel
            );
        } catch {
            continue;
        }
        const fallbackCircuit = circuitKey(fallbackProviderName, fallbackModel);
        if (await isCircuitOpen(fallbackCircuit, cbConfig)) continue;

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
            await recordSuccess(fallbackCircuit);

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
            await recordFailure(fallbackCircuit, cbConfig);
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
    basecodeModelPolicy?: 'auto' | 'open_weight' | 'frontier' | 'custom' | null;
    tier: SubscriptionTier;
    request: UnifiedChatRequest;
    resolved?: ResolvedGatewayProvider;
    requestId?: string;
    performance?: GatewayPerformanceTracker;
    hedgeDelayMs?: number;
}): AsyncGenerator<GatewayStreamChunk> {
    const resolved =
        params.resolved ??
        (await resolveGatewayProvider({
            supabase: params.supabase,
            projectId: params.projectId,
            organizationId: params.organizationId,
            requestedModel: params.request.model,
            basecodeModelPolicy: params.basecodeModelPolicy,
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
    // Scoped to the model, as in executeGatewayChat: one failing model must not short-circuit
    // every other model the same provider serves.
    const primaryCircuit = circuitKey(providerName, model);

    // Speed-profile hedging: the secondary request is not created unless the
    // primary misses the first-token threshold. The first usable stream wins;
    // the loser is cancelled and never spliced into the winning answer.
    if (
        params.hedgeDelayMs
        && params.hedgeDelayMs > 0
        && failoverAllowed
        && settings.enableFallback
        && !(await isCircuitOpen(primaryCircuit, cbConfig))
    ) {
        let hedgeFallbackProviderName: string | null = null;
        let hedgeFallbackModel: string | null = null;
        let hedgeFallbackBillingMode: GatewayBillingMode | null = null;
        let winner: 'primary' | 'secondary' | null = null;
        let emitted = false;

        try {
            const raced = hedgedStream<StreamChunk>({
                primary: () => {
                    params.performance?.markProviderStart();
                    return streamWithTimeout(provider.stream(chatRequest), `${providerName} hedged primary`);
                },
                secondary: async () => {
                    const fallbackChain = getFallbackChain(providerName, settings.configuredFallback);
                    for (const candidate of fallbackChain) {
                        if (await isCircuitOpen(circuitKey(candidate, model), cbConfig)) continue;
                        if (!router.hasProvider(candidate)) {
                            const initialized = await initializeBYOKProviders(
                                router,
                                params.supabase,
                                params.projectId,
                                params.organizationId,
                                candidate
                            );
                            if (!initialized.success) continue;
                        }

                        const fallbackProvider = router.getProvider(candidate);
                        const fallbackModel = await getFallbackModel(
                            model,
                            candidate,
                            settings.configuredFallbackModel
                        );
                        const billingMode = assertApiKeyModelAccess({
                            allowedModels: params.allowedModels,
                            sponsoredModels: params.sponsoredModels,
                            provider: candidate,
                            model: fallbackModel,
                        });
                        await fallbackProvider.getPricing(fallbackModel);
                        hedgeFallbackProviderName = candidate;
                        hedgeFallbackModel = fallbackModel;
                        hedgeFallbackBillingMode = billingMode;
                        return streamWithTimeout(
                            fallbackProvider.stream({ ...chatRequest, model: fallbackModel }),
                            `${candidate} hedge`
                        );
                    }
                    throw new Error('No hedge fallback provider is available');
                },
                delayMs: params.hedgeDelayMs,
                isUsable: (chunk) => Boolean(
                    chunk.delta
                    || (chunk.toolCalls && chunk.toolCalls.length > 0)
                    || chunk.finishReason
                ),
            });

            for await (const racedChunk of raced) {
                winner ??= racedChunk.source;
                emitted = true;
                const usedFallback = winner === 'secondary';
                yield {
                    ...racedChunk.value,
                    actualProvider: usedFallback ? hedgeFallbackProviderName! : providerName,
                    actualModel: usedFallback ? hedgeFallbackModel! : model,
                    usedFallback,
                    originalProvider: providerName,
                    originalModel: model,
                    billingMode: usedFallback ? hedgeFallbackBillingMode! : resolved.billingMode,
                };
            }

            if (winner === 'secondary') {
                await recordSuccess(circuitKey(hedgeFallbackProviderName!, model));
                void triggerFallbackWebhook(params.projectId, {
                    original_provider: providerName,
                    original_model: model,
                    fallback_provider: hedgeFallbackProviderName!,
                    fallback_model: hedgeFallbackModel!,
                    reason: `Primary exceeded ${params.hedgeDelayMs}ms first-token threshold`,
                    request_id: params.requestId,
                });
            } else {
                await recordSuccess(primaryCircuit);
            }
            return;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (emitted) {
                throw lastError;
            }
            // Both candidates failed before output. Continue through the
            // established retry/failover path below.
        }
    }

    if (!(await isCircuitOpen(primaryCircuit, cbConfig))) {
        const maxRetries = failoverAllowed ? settings.maxRetries : 1;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            let emitted = false;
            try {
                params.performance?.markProviderStart();
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
                await recordSuccess(primaryCircuit);
                return;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                // Once bytes have reached the caller, retrying or switching
                // providers would splice two independent answers together.
                if (emitted) {
                    await recordFailure(primaryCircuit, cbConfig);
                    throw lastError;
                }
                if (isNonRetryableError(error)) throw error;
                if (attempt < maxRetries - 1) {
                    await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 100));
                }
            }
        }
        await recordFailure(primaryCircuit, cbConfig);
    } else {
        lastError = new Error(`Provider ${providerName} circuit is open`);
    }

    if (!failoverAllowed || !settings.enableFallback || !lastError) {
        throw lastError || new Error('Stream request failed');
    }

    const fallbackChain = getFallbackChain(providerName, settings.configuredFallback);
    for (const fallbackProviderName of fallbackChain) {
        // Resolved before the circuit check so the circuit is keyed on what will actually run.
        // A fallback serves a different model than the primary, and recording its outcome under
        // the primary's model would blame a model this provider was never asked for.
        let fallbackModel: string;
        try {
            fallbackModel = await getFallbackModel(
                model,
                fallbackProviderName,
                settings.configuredFallbackModel
            );
        } catch {
            continue;
        }
        const fallbackCircuit = circuitKey(fallbackProviderName, fallbackModel);
        if (await isCircuitOpen(fallbackCircuit, cbConfig)) continue;

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
            const fallbackBillingMode = assertApiKeyModelAccess({
                allowedModels: params.allowedModels,
                sponsoredModels: params.sponsoredModels,
                provider: fallbackProviderName,
                model: fallbackModel,
            });
            await fallbackProvider.getPricing(fallbackModel);
            params.performance?.markProviderStart();
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

            await recordSuccess(fallbackCircuit);
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
            await recordFailure(fallbackCircuit, cbConfig);
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
