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
    // Support the historical deployment variable as well as the canonical one.
    maximo: ['MAXIMO_API_KEY', 'MAXIMOAI_API_KEY'],
    // Helix customer key (provisioned via the Launchverse partner secret).
    helix: ['HELIX_API_KEY'],
};

function firstConfiguredEnv(names: string[]): string | undefined {
    for (const name of names) {
        if (process.env[name]) return process.env[name];
    }
    return undefined;
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
        const { data: providerKey, error } = await supabase
            .from('provider_keys')
            .select('encrypted_key, is_active, default_model')
            .eq('project_id', projectId)
            .eq('provider', targetProvider)
            .single();

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
    customProviderTag?: string;
};

export async function resolveGatewayProvider(params: {
    supabase: SupabaseAdmin;
    projectId: string;
    organizationId: string;
    requestedModel: string;
}): Promise<ResolvedGatewayProvider> {
    const router = new ProviderRouter();
    registerDefaultProviders(router);

    const customProvider = await resolveCustomProviderForProject({
        supabase: params.supabase,
        projectId: params.projectId,
        organizationId: params.organizationId,
        requestedModel: params.requestedModel,
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
        providerName = router.detectProvider(params.requestedModel);
        model = router.normalizeModelName(params.requestedModel, providerName);

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
        : router.getProviderForModel(params.requestedModel);

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
        customProviderTag: customProvider?.providerTag,
    };
}
