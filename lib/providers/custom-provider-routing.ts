import { decryptApiKey } from '@/lib/encryption';
import type { createAdminClient } from '@/lib/supabaseAdmin';
import { Redis } from '@upstash/redis';

type AdminClient = ReturnType<typeof createAdminClient>;

let redis: Redis | null | undefined;

function getRedisClient(): Redis | null {
    if (redis !== undefined) return redis;
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) { redis = null; return null; }
    redis = new Redis({ url, token });
    return redis;
}

type CustomProviderModelRow = {
    model_name: string | null;
    is_active: boolean | null;
    input_price_per_1k_tokens: number | string | null;
    output_price_per_1k_tokens: number | string | null;
    platform_fee_per_request: number | string | null;
};

export type CustomProviderLookupRow = {
    id: string;
    name: string;
    base_url: string;
    api_format: string;
    encrypted_api_key: string | null;
    custom_models: CustomProviderModelRow[] | null;
};

export type ResolvedCustomProvider = {
    id: string;
    name: string;
    baseUrl: string;
    apiFormat: 'openai' | 'anthropic';
    apiKey?: string;
    providerTag: string;
    matchedBy: 'model' | 'provider_name' | 'provider_prefix';
    requestedModel: string;
    upstreamModel: string;
    pricing: {
        inputPer1KTokens: number;
        outputPer1KTokens: number;
        cencoriMarkupPercentage: number;
        fixedFeePerRequest: number;
    };
};

const normalize = (value: string): string => value.trim().toLowerCase();

const getActiveModelNames = (provider: CustomProviderLookupRow): string[] => {
    const models = provider.custom_models || [];
    return models
        .filter((model) => model.model_name && model.is_active !== false)
        .map((model) => model.model_name!.trim())
        .filter(Boolean);
};

export function resolveCustomProviderMatchFromRows(
    providers: CustomProviderLookupRow[],
    requestedModel: string
): Omit<ResolvedCustomProvider, 'apiKey' | 'apiFormat' | 'baseUrl' | 'pricing'> | null {
    const requested = requestedModel.trim();
    const requestedNorm = normalize(requested);

    for (const provider of providers) {
        const modelNames = getActiveModelNames(provider);
        const matchedModel = modelNames.find((modelName) => normalize(modelName) === requestedNorm);
        if (matchedModel) {
            return {
                id: provider.id,
                name: provider.name,
                providerTag: `custom:${provider.id}`,
                matchedBy: 'model',
                requestedModel: requested,
                upstreamModel: matchedModel,
            };
        }
    }

    for (const provider of providers) {
        const providerNameNorm = normalize(provider.name);
        if (providerNameNorm !== requestedNorm) {
            continue;
        }

        const modelNames = getActiveModelNames(provider);
        return {
            id: provider.id,
            name: provider.name,
            providerTag: `custom:${provider.id}`,
            matchedBy: 'provider_name',
            requestedModel: requested,
            upstreamModel: modelNames[0] || requested,
        };
    }

    for (const provider of providers) {
        const providerPrefix = `${normalize(provider.name)}/`;
        if (!requestedNorm.startsWith(providerPrefix)) {
            continue;
        }

        const suffix = requested.slice(providerPrefix.length).trim();
        const modelNames = getActiveModelNames(provider);
        const upstreamModel = suffix || modelNames[0] || requested;

        return {
            id: provider.id,
            name: provider.name,
            providerTag: `custom:${provider.id}`,
            matchedBy: 'provider_prefix',
            requestedModel: requested,
            upstreamModel,
        };
    }

    return null;
}

export async function resolveCustomProviderForProject(params: {
    supabase: AdminClient;
    projectId: string;
    organizationId: string;
    requestedModel: string;
}): Promise<ResolvedCustomProvider | null> {
    const { supabase, projectId, organizationId, requestedModel } = params;

    // Try Redis cache first (~10ms vs ~100ms DB query)
    const client = getRedisClient();
    const cacheKey = `cfg:cprov:${projectId}`;
    let providers: CustomProviderLookupRow[] | null = null;

    if (client) {
        try {
            const cached = await client.get<CustomProviderLookupRow[]>(cacheKey);
            if (cached) {
                providers = cached;
            }
        } catch {
            // Fall through to DB
        }
    }

    if (!providers) {
        const { data, error } = await supabase
            .from('custom_providers')
            .select(`
                id,
                name,
                base_url,
                api_format,
                encrypted_api_key,
                custom_models(
                    model_name,
                    is_active,
                    input_price_per_1k_tokens,
                    output_price_per_1k_tokens,
                    platform_fee_per_request
                )
            `)
            .eq('project_id', projectId)
            .eq('is_active', true);

        if (error) {
            console.warn('[CustomProviderRouting] Failed to load custom providers:', error.message);
            return null;
        }

        providers = ((data || []) as CustomProviderLookupRow[]).filter((provider) => !!provider.base_url);

        // Cache for 60s (providers change rarely)
        if (client && providers.length > 0) {
            // Cache without encrypted keys for safety — we re-decrypt below anyway
            void client.set(cacheKey, providers, { ex: 60 }).catch(() => {});
        }
    }

    if (providers.length === 0) {
        return null;
    }

    const candidate = resolveCustomProviderMatchFromRows(providers, requestedModel);
    if (!candidate) {
        return null;
    }

    const providerRow = providers.find((provider) => provider.id === candidate.id);
    if (!providerRow) {
        return null;
    }

    const modelRow = (providerRow.custom_models || []).find(
        model => model.model_name && normalize(model.model_name) === normalize(candidate.upstreamModel)
    );
    if (!modelRow || modelRow.is_active === false) {
        throw new Error(
            `Custom provider '${providerRow.name}' has no active pricing configuration for model '${candidate.upstreamModel}'.`
        );
    }

    let decryptedKey: string | undefined;
    if (providerRow.encrypted_api_key) {
        try {
            decryptedKey = decryptApiKey(providerRow.encrypted_api_key, organizationId);
        } catch {
            throw new Error(`Failed to decrypt API key for custom provider '${providerRow.name}'.`);
        }
    }

    return {
        ...candidate,
        baseUrl: providerRow.base_url,
        apiFormat: providerRow.api_format === 'anthropic' ? 'anthropic' : 'openai',
        apiKey: decryptedKey,
        pricing: (() => {
            const parseNonNegative = (value: number | string | null | undefined): number => {
                const parsed = Number(value ?? 0);
                return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
            };
            return {
                inputPer1KTokens: parseNonNegative(modelRow?.input_price_per_1k_tokens),
                outputPer1KTokens: parseNonNegative(modelRow?.output_price_per_1k_tokens),
                cencoriMarkupPercentage: 0,
                fixedFeePerRequest: parseNonNegative(modelRow?.platform_fee_per_request),
            };
        })(),
    };
}
