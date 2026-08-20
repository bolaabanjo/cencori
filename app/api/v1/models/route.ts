import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import crypto from 'crypto';
import { SUPPORTED_PROVIDERS } from '@/lib/providers/config';
import { publicProviderLabel } from '@/lib/providers/branding';
import { addGatewayHeaders, handleCorsPreFlight } from '@/lib/gateway-middleware';
import { extractGatewayCallerIdentity, logApiGatewayRequest } from '@/lib/api-gateway-logs';
import { extractCencoriApiKeyFromHeaders } from '@/lib/api-keys';
import { getManagedProviderNames } from '@/lib/gateway/providers-setup';
import { hasStaticPricing } from '@/lib/providers/pricing';
import { resolveApiKeyModelAccess } from '@/lib/gateway/model-access';

/**
 * GET /api/v1/models
 * 
 * Lists all available models through the Cencori gateway.
 * Dynamically derived from lib/providers/config.ts — always up to date.
 * 
 * Headers:
 *   Authorization: Bearer <api_key>
 * 
 * Returns:
 *   200: { object: "list", data: [...models] }
 *   401: { error: "..." }
 */

/**
 * `created` is resolved per request from the model's pricing row rather than
 * baked in here: evaluating Date.now() at module load stamps every model with
 * the server's boot time, so the same model reports a different `created` from
 * each serverless instance and the value drifts on every deploy. The pricing
 * row's created_at is the closest real answer — when the model became
 * available on Cencori — and it is stable across instances and deploys.
 */
const UNKNOWN_CREATED = 0;

// Build models list once at module load from the provider config (single source of truth)
const MODELS = SUPPORTED_PROVIDERS.flatMap(provider =>
    provider.models.map(model => ({
        id: model.id,
        object: 'model' as const,
        // Free-tier models run on Cencori's own upstream accounts, so Cencori is
        // the provider the customer actually deals with. Paid models keep their
        // real vendor id. See lib/providers/branding.ts.
        owned_by: publicProviderLabel(provider.id, model.id),
        name: model.name,
        type: model.type,
        context_window: model.contextWindow,
        description: model.description,
    }))
);

type CatalogModel = (typeof MODELS)[number] & { created: number };

function toEpochSeconds(value: unknown): number {
    const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : UNKNOWN_CREATED;
}

export async function OPTIONS() {
    return handleCorsPreFlight();
}

export async function GET(req: NextRequest) {
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    const callerIdentity = extractGatewayCallerIdentity(req.headers);
    let apiLogContext: { projectId: string; apiKeyId: string; environment: string | null } | null = null;
    let apiKeyModelAccess: { allowedModels: string[] | null; sponsoredModels: string[] | null } = {
        allowedModels: null,
        sponsoredModels: null,
    };

    const respond = (response: NextResponse, errorCode?: string, errorMessage?: string) => {
        if (apiLogContext) {
            const forwardedFor = req.headers.get('x-forwarded-for');
            const clientIp = forwardedFor?.split(',')[0]?.trim() || req.headers.get('x-real-ip');

            void logApiGatewayRequest({
                projectId: apiLogContext.projectId,
                apiKeyId: apiLogContext.apiKeyId,
                requestId,
                endpoint: '/v1/models',
                method: 'GET',
                statusCode: response.status,
                startedAt,
                environment: apiLogContext.environment,
                ipAddress: clientIp,
                countryCode: req.headers.get('x-vercel-ip-country') || req.headers.get('x-cencori-user-country'),
                userAgent: req.headers.get('user-agent'),
                callerOrigin: callerIdentity.callerOrigin,
                clientApp: callerIdentity.clientApp,
                errorCode: errorCode || null,
                errorMessage: errorMessage || null,
            });
        }

        return addGatewayHeaders(response, { requestId });
    };

    // 1. Try API Key Auth (Legacy/External)
    const authHeader = req.headers.get('Authorization');
    const apiKey = extractCencoriApiKeyFromHeaders(req.headers);

    let isAuthenticated = false;

    if (apiKey) {
        // Validate API key
        const supabase = createAdminClient();
        const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
        const { data: keyData, error: keyError } = await supabase
            .from('api_keys')
            .select('id, project_id, environment, allowed_models, sponsored_models')
            .eq('key_hash', keyHash)
            .is('revoked_at', null)
            .single();

        if (keyError || !keyData) {
            return respond(
                NextResponse.json({
                    error: {
                        message: 'Invalid API key',
                        type: 'invalid_request_error',
                        code: 'invalid_api_key'
                    }
                }, { status: 401 }),
                'invalid_api_key',
                'Invalid API key'
            );
        }

        apiLogContext = {
            projectId: keyData.project_id,
            apiKeyId: keyData.id,
            environment: keyData.environment || null,
        };
        apiKeyModelAccess = {
            allowedModels: Array.isArray(keyData.allowed_models) ? keyData.allowed_models : null,
            sponsoredModels: Array.isArray(keyData.sponsored_models) ? keyData.sponsored_models : null,
        };

        isAuthenticated = true;
    } else if (authHeader) {
        // 2. Try User Session Auth (OpenClaw Gateway)
        // If no recognized API key was provided, assume the bearer token is a Supabase JWT.
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } },
        });

        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (!authError && user) {
            isAuthenticated = true;
        }
    }

    if (!isAuthenticated) {
        // 3. Unauthorized
        return respond(
            NextResponse.json({
                error: {
                    message: 'Missing API key or valid session. Use Authorization: Bearer <key>',
                    type: 'invalid_request_error',
                    code: 'missing_api_key'
                }
            }, { status: 401 }),
            'missing_api_key',
            'Missing API key or valid session'
        );
    }

    const availableProviderIds = getManagedProviderNames();

    // Include project BYOK and custom providers/models for API-key scoped requests.
    let customModels: CatalogModel[] = [];
    if (apiLogContext?.projectId) {
        const supabase = createAdminClient();
        const { data: providerKeys } = await supabase
            .from('provider_keys')
            .select('provider')
            .eq('project_id', apiLogContext.projectId)
            .eq('is_active', true);
        for (const providerKey of providerKeys ?? []) {
            if (providerKey.provider) availableProviderIds.add(providerKey.provider);
        }

        const { data: projectCustomProviders, error: customProviderError } = await supabase
            .from('custom_providers')
            .select(`
                id,
                name,
                created_at,
                custom_models(model_name, display_name, is_active, created_at)
            `)
            .eq('project_id', apiLogContext.projectId)
            .eq('is_active', true);

        if (!customProviderError && Array.isArray(projectCustomProviders)) {
            const customRows = projectCustomProviders.flatMap((provider) => {
                const providerTag = `custom:${provider.id}`;
                const models = (provider.custom_models || [])
                    .filter((model) => model.model_name && model.is_active !== false)
                    .map((model) => ({
                        id: model.model_name as string,
                        object: 'model' as const,
                        created: toEpochSeconds(model.created_at),
                        owned_by: providerTag,
                        name: (model.display_name as string | null) || (model.model_name as string),
                        type: 'chat' as const,
                        context_window: 0,
                        description: `Custom provider model (${provider.name})`,
                    }));

                const hasAliasModel = models.some((model) => model.id === provider.name);
                const aliasModel = hasAliasModel
                    ? []
                    : [{
                        id: provider.name,
                        object: 'model' as const,
                        // The alias stands for the provider, not one model.
                        created: toEpochSeconds(provider.created_at),
                        owned_by: providerTag,
                        name: provider.name,
                        type: 'chat' as const,
                        context_window: 0,
                        description: `Custom provider alias (${provider.name})`,
                    }];

                return [...models, ...aliasModel];
            });

            const seen = new Set<string>();
            customModels = customRows.filter((row) => {
                if (!row.id || seen.has(row.id)) {
                    return false;
                }
                seen.add(row.id);
                return true;
            });
        }
    }

    // Only advertise models that have exact pricing. Provider-wide guessed
    // defaults are unsafe for billing and are intentionally not used.
    const pricingClient = createAdminClient();
    const { data: pricingRows, error: pricingError } = await pricingClient
        .from('model_pricing')
        // select('*') rather than naming next_*: PostgREST errors on an unknown
        // column, which would 503 the whole catalog if this ships before the
        // migration that adds them.
        .select('*')
        .eq('is_active', true);
    if (pricingError) {
        return respond(
            NextResponse.json({
                error: {
                    message: 'Model pricing catalog is temporarily unavailable',
                    type: 'server_error',
                    code: 'pricing_catalog_unavailable',
                },
            }, { status: 503 }),
            'pricing_catalog_unavailable',
            pricingError.message,
        );
    }
    // A row whose promotional rate has lapsed still counts as priced when it
    // carries the follow-on rate it switches to — that is a scheduled
    // changeover, not a gap. Without one it drops out, same as before.
    const activePricingRows = (pricingRows ?? [])
        .filter(row => !row.pricing_expires_at
            || Date.parse(row.pricing_expires_at) > Date.now()
            || (row.next_input_price_per_1k_tokens != null
                && row.next_output_price_per_1k_tokens != null));
    const pricedModels = new Set(
        activePricingRows.map(row => `${row.provider}:${row.model_name}`)
    );
    // When the model became available on Cencori. Stable across instances and
    // deploys, unlike a boot-time timestamp.
    const createdByModel = new Map<string, number>(
        activePricingRows.map(row => [
            `${row.provider}:${row.model_name}`,
            toEpochSeconds(row.created_at),
        ])
    );

    // Optional filtering by provider or type (Restored Feature)
    const url = new URL(req.url);
    const filterProvider = url.searchParams.get('provider');
    const filterType = url.searchParams.get('type');

    const visibleCustomModels = customModels.filter((model) =>
        resolveApiKeyModelAccess({
            ...apiKeyModelAccess,
            provider: model.owned_by,
            model: model.id,
        }).allowed
    );

    let filteredModels: CatalogModel[] = [
        ...MODELS.filter((model) =>
            availableProviderIds.has(model.owned_by)
            && resolveApiKeyModelAccess({
                ...apiKeyModelAccess,
                provider: model.owned_by,
                model: model.id,
            }).allowed
            && (
                pricedModels.has(`${model.owned_by}:${model.id}`)
                || hasStaticPricing(model.owned_by, model.id)
            ))
            // Statically-priced models have no pricing row to date them.
            .map((model) => ({
                ...model,
                created: createdByModel.get(`${model.owned_by}:${model.id}`) ?? UNKNOWN_CREATED,
            })),
        ...visibleCustomModels,
    ];
    if (filterProvider) {
        filteredModels = filteredModels.filter(m => m.owned_by === filterProvider);
    }
    if (filterType) {
        filteredModels = filteredModels.filter(m => {
            const types = Array.isArray(m.type) ? m.type : [m.type];
            return types.includes(filterType);
        });
    }

    return respond(
        NextResponse.json({
            object: 'list',
            data: filteredModels,
            providers: [
                ...SUPPORTED_PROVIDERS
                    .filter((provider) => availableProviderIds.has(provider.id))
                    .map(provider => ({
                        id: provider.id,
                        name: provider.name,
                        model_count: filteredModels.filter(model => model.owned_by === provider.id).length,
                    }))
                    .filter(provider => provider.model_count > 0),
                ...Array.from(new Set(visibleCustomModels.map(model => model.owned_by))).map((providerId) => ({
                    id: providerId,
                    name: providerId,
                    model_count: visibleCustomModels.filter(model => model.owned_by === providerId).length,
                })),
            ],
        })
    );
}
