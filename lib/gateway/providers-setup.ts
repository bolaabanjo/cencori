import type { createAdminClient } from '@/lib/supabaseAdmin';
import {
    GeminiProvider,
    OpenAIProvider,
    AnthropicProvider,
    OpenAICompatibleProvider,
    CohereProvider,
    isOpenAICompatible,
} from '@/lib/providers';
import { ProviderRouter } from '@/lib/providers/router';
import { decryptApiKey } from '@/lib/encryption';
import { getGoogleApiKey } from '@/lib/providers/google-env';
import { resolveCustomProviderForProject } from '@/lib/providers/custom-provider-routing';
import type { AIProvider } from '@/lib/providers/base';
import { ModelAccessDeniedError } from '@/lib/providers/errors';
import {
    assertApiKeyModelAccess,
    type GatewayBillingMode,
} from '@/lib/gateway/model-access';
import {
    getCachedProviderConfig,
    setCachedProviderConfig,
} from '@/lib/config-cache';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

const OPENAI_COMPATIBLE_ENV_VARS: Record<string, string[]> = {
    xai: ['XAI_API_KEY'],
    deepseek: ['DEEPSEEK_API_KEY'],
    groq: ['GROQ_API_KEY'],
    mistral: ['MISTRAL_API_KEY'],
    together: ['TOGETHER_API_KEY'],
    openrouter: ['OPENROUTER_API_KEY'],
    perplexity: ['PERPLEXITY_API_KEY'],
    huggingface: ['HUGGINGFACE_API_KEY'],
    zai: ['ZAI_API_KEY'],
    cerebras: ['CEREBRAS_API_KEY'],
    qwen: ['QWEN_API_KEY'],
    // Meta has no API of its own — OPENAI_COMPATIBLE_ENDPOINTS points its
    // models at Together, so it authenticates with the Together key.
    meta: ['TOGETHER_API_KEY'],
    // Support the historical deployment variable as well as the canonical one.
    maximo: ['MAXIMO_API_KEY', 'MAXIMOAI_API_KEY'],
    // Helix customer key (provisioned via the Launchverse partner secret).
    helix: ['HELIX_API_KEY'],
    // Centaur stealth-preview key (partner-provisioned, one-week window).
    centaur: ['CENTAUR_API_KEY'],
    // B.AI — backend provider for DeepSeek and GLM models rebranded under
    // their public-facing provider names (see MODEL_PROVIDER_OVERRIDES in
    // router.ts and the catalog entries in config.ts).
    bai: ['BAI_API_KEY'],
};

function firstConfiguredEnv(names: string[]): string | undefined {
    for (const name of names) {
        if (process.env[name]) return process.env[name];
    }
    return undefined;
}

/**
 * The managed (Cencori-funded) key for an OpenAI-compatible provider, if one is
 * deployed. Exported so the vision path resolves keys from the same table the
 * chat path does — a provider whose key variable is only known here would
 * otherwise look unconfigured to vision and fail with a misleading message.
 */
export function getManagedOpenAICompatibleKey(provider: string): string | undefined {
    const envVars = OPENAI_COMPATIBLE_ENV_VARS[provider];
    return envVars ? firstConfiguredEnv(envVars) : undefined;
}

export function getManagedProviderNames(): Set<string> {
    const providers = new Set<string>();
    if (getGoogleApiKey()) providers.add('google');
    if (process.env.OPENAI_API_KEY) providers.add('openai');
    if (process.env.ANTHROPIC_API_KEY) providers.add('anthropic');
    if (process.env.COHERE_API_KEY) providers.add('cohere');
    for (const [provider, envVars] of Object.entries(OPENAI_COMPATIBLE_ENV_VARS)) {
        if (firstConfiguredEnv(envVars)) providers.add(provider);
    }
    return providers;
}

export function registerDefaultProviders(router: ProviderRouter): void {
    const defaultGoogleApiKey = getGoogleApiKey();
    if (!router.hasProvider('google') && defaultGoogleApiKey) {
        try {
            router.registerProvider('google', new GeminiProvider(defaultGoogleApiKey));
        } catch (error) {
            console.warn('[Gateway] Gemini provider not available:', error);
        }
    }

    if (!router.hasProvider('openai') && process.env.OPENAI_API_KEY) {
        try {
            router.registerProvider('openai', new OpenAIProvider());
        } catch (error) {
            console.warn('[Gateway] OpenAI provider not available:', error);
        }
    }

    if (!router.hasProvider('anthropic') && process.env.ANTHROPIC_API_KEY) {
        try {
            router.registerProvider('anthropic', new AnthropicProvider());
        } catch (error) {
            console.warn('[Gateway] Anthropic provider not available:', error);
        }
    }

    if (!router.hasProvider('cohere') && process.env.COHERE_API_KEY) {
        try {
            router.registerProvider('cohere', new CohereProvider(process.env.COHERE_API_KEY));
        } catch (error) {
            console.warn('[Gateway] Cohere provider not available:', error);
        }
    }

    for (const [provider, envVars] of Object.entries(OPENAI_COMPATIBLE_ENV_VARS)) {
        const apiKey = firstConfiguredEnv(envVars);
        if (!router.hasProvider(provider) && apiKey) {
            try {
                router.registerProvider(provider, new OpenAICompatibleProvider(provider, apiKey));
            } catch (error) {
                console.warn(`[Gateway] ${provider} provider not available:`, error);
            }
        }
    }
}

export async function initializeBYOKProviders(
    router: ProviderRouter,
    supabase: SupabaseAdmin,
    projectId: string,
    organizationId: string,
    targetProvider: string
): Promise<{ success: boolean; defaultModel?: string }> {
    try {
        const cached = await getCachedProviderConfig(projectId, targetProvider);
        let providerKey = cached?.row;
        let error: unknown = null;
        if (!cached) {
            const result = await supabase
                .from('provider_keys')
                .select('encrypted_key, is_active, default_model')
                .eq('project_id', projectId)
                .eq('provider', targetProvider)
                .single();
            providerKey = result.data;
            error = result.error;
            // Cache misses too: managed-provider projects should not query the
            // BYOK table on every inference.
            void setCachedProviderConfig(projectId, targetProvider, providerKey ?? null);
        }

        if (!error && providerKey && providerKey.is_active) {
            const apiKey = decryptApiKey(providerKey.encrypted_key, organizationId);
            if (targetProvider === 'google') {
                router.registerProvider(targetProvider, new GeminiProvider(apiKey));
                return { success: true, defaultModel: providerKey.default_model || undefined };
            }
            if (targetProvider === 'openai') {
                router.registerProvider(targetProvider, new OpenAIProvider(apiKey));
                return { success: true, defaultModel: providerKey.default_model || undefined };
            }
            if (targetProvider === 'anthropic') {
                router.registerProvider(targetProvider, new AnthropicProvider(apiKey));
                return { success: true, defaultModel: providerKey.default_model || undefined };
            }
            if (isOpenAICompatible(targetProvider)) {
                router.registerProvider(
                    targetProvider,
                    new OpenAICompatibleProvider(targetProvider, apiKey)
                );
                return { success: true, defaultModel: providerKey.default_model || undefined };
            }
            if (targetProvider === 'cohere') {
                router.registerProvider(targetProvider, new CohereProvider(apiKey));
                return { success: true, defaultModel: providerKey.default_model || undefined };
            }
        }

        if (router.hasProvider(targetProvider)) {
            return { success: true };
        }

        return { success: false };
    } catch (error) {
        console.error(`[Gateway] Failed to initialize BYOK provider ${targetProvider}:`, error);
        return { success: router.hasProvider(targetProvider) };
    }
}

export type ResolvedGatewayProvider = {
    router: ProviderRouter;
    providerName: string;
    model: string;
    provider: AIProvider;
    billingMode: GatewayBillingMode;
    customProviderTag?: string;
};

const BASECODE_OPEN_WEIGHT_MODEL_MARKERS = [
    'deepseek',
    'glm-',
    'qwen',
    'kimi',
    'llama',
    'mistral',
    'devstral',
    'nemotron',
    'gpt-oss',
    'maximo-atlas',
];

export function resolveBasecodePlanModel(
    requestedModel: string,
    policy: 'auto' | 'open_weight' | 'frontier' | 'custom' | null | undefined,
): string {
    if (!policy || policy === 'frontier' || policy === 'custom') return requestedModel;

    const normalized = requestedModel.trim().toLowerCase();
    const askedForAuto = !normalized || normalized === 'auto' || normalized === 'basecode-auto';
    const isOpenWeight = BASECODE_OPEN_WEIGHT_MODEL_MARKERS.some((marker) =>
        normalized.includes(marker),
    );

    if (policy === 'auto') {
        const autoModel = process.env.BASECODE_AUTO_MODEL?.trim() || 'glm-5.3-flash';
        if (askedForAuto) return autoModel;
        // Auto is the default on this plan, not the only option. Every request used to be replaced
        // by the auto model whatever it named, so a client offering a choice would have been lying:
        // the pick was discarded and every turn ran on the same model. An open-weight model named
        // explicitly is now served.
        if (isOpenWeight) return requestedModel;
        // A frontier model is not an error here, it is simply not on this plan, and the auto model
        // answers instead — which is what this policy did for every request before. Refusing would
        // break callers that have always been quietly substituted.
        return autoModel;
    }

    if (askedForAuto) {
        // GLM rather than DeepSeek: the DeepSeek quota is spent, so the old default resolved every
        // Builder Auto turn onto a model that cannot answer. The env var still overrides this.
        return process.env.BASECODE_BUILDER_AUTO_MODEL?.trim() || 'glm-5.3-flash';
    }
    if (!isOpenWeight) {
        throw new ModelAccessDeniedError('basecode-builder', requestedModel);
    }
    return requestedModel;
}

export async function resolveGatewayProvider(params: {
    supabase: SupabaseAdmin;
    projectId: string;
    organizationId: string;
    requestedModel: string;
    basecodeModelPolicy?: 'auto' | 'open_weight' | 'frontier' | 'custom' | null;
    allowedModels?: string[] | null;
    sponsoredModels?: string[] | null;
}): Promise<ResolvedGatewayProvider> {
    const requestedModel = resolveBasecodePlanModel(
        params.requestedModel,
        params.basecodeModelPolicy,
    );
    const router = new ProviderRouter();
    registerDefaultProviders(router);

    const customProvider = await resolveCustomProviderForProject({
        supabase: params.supabase,
        projectId: params.projectId,
        organizationId: params.organizationId,
        requestedModel,
    });

    let providerName: string;
    let model: string;

    if (customProvider) {
        providerName = customProvider.providerTag;
        model = customProvider.upstreamModel;

        if (customProvider.apiFormat === 'anthropic' && !(customProvider.apiKey || process.env.ANTHROPIC_API_KEY)) {
            throw new Error(
                `Custom provider '${customProvider.name}' is missing an API key.`
            );
        }

        if (!router.hasProvider(providerName)) {
            const impl =
                customProvider.apiFormat === 'anthropic'
                    ? new AnthropicProvider(customProvider.apiKey || process.env.ANTHROPIC_API_KEY!, {
                          baseURL: customProvider.baseUrl,
                          pricing: customProvider.pricing,
                      })
                    : new OpenAICompatibleProvider(
                          providerName,
                          customProvider.apiKey || 'cencori-no-key',
                          customProvider.baseUrl,
                          customProvider.pricing,
                      );
            router.registerProvider(providerName, impl);
        }
    } else {
        providerName = router.detectProvider(requestedModel);
        model = router.normalizeModelName(requestedModel, providerName);

        const byokResult = await initializeBYOKProviders(
            router,
            params.supabase,
            params.projectId,
            params.organizationId,
            providerName
        );

        if (!byokResult.success) {
            registerDefaultProviders(router);
        }
    }

    if (!router.hasProvider(providerName)) {
        throw new Error(
            `Provider '${providerName}' is not configured. Add your API key in project settings.`
        );
    }

    const provider = customProvider
        ? router.getProvider(providerName)
        : router.getProviderForModel(requestedModel);

    const billingMode = assertApiKeyModelAccess({
        allowedModels: params.allowedModels,
        sponsoredModels: params.sponsoredModels,
        provider: providerName,
        model,
    });

    // Verify exact billing configuration before any upstream request is made.
    // This prevents a successful provider call from later becoming an
    // unbillable response because a model was only covered by a guessed
    // provider-wide default.
    await provider.getPricing(model);

    return {
        router,
        providerName,
        model,
        provider,
        billingMode,
        customProviderTag: customProvider?.providerTag,
    };
}
