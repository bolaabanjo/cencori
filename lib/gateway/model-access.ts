import type { ModelPricing, UnifiedChatResponse } from '@/lib/providers/base';
import { ModelAccessDeniedError } from '@/lib/providers/errors';

export type GatewayBillingMode = 'standard' | 'sponsored';

const RESTRICTED_MODELS = new Set([
    'maximo:maximo-atlas-1.1',
]);

export function canonicalModelKey(provider: string, model: string): string {
    return `${provider.trim().toLowerCase()}:${model.trim().toLowerCase()}`;
}

function canonicalSet(models: string[] | null | undefined): Set<string> {
    return new Set((models ?? []).map((model) => model.trim().toLowerCase()));
}

export function resolveApiKeyModelAccess(params: {
    allowedModels?: string[] | null;
    sponsoredModels?: string[] | null;
    provider: string;
    model: string;
}): { allowed: boolean; billingMode: GatewayBillingMode } {
    const key = canonicalModelKey(params.provider, params.model);
    const allowed = canonicalSet(params.allowedModels);
    const sponsored = canonicalSet(params.sponsoredModels);
    const hasExplicitAllowlist = Array.isArray(params.allowedModels);
    const isAllowed = hasExplicitAllowlist
        ? allowed.has(key)
        : !RESTRICTED_MODELS.has(key);

    return {
        allowed: isAllowed,
        billingMode: isAllowed && sponsored.has(key) ? 'sponsored' : 'standard',
    };
}

export function assertApiKeyModelAccess(params: {
    allowedModels?: string[] | null;
    sponsoredModels?: string[] | null;
    provider: string;
    model: string;
}): GatewayBillingMode {
    const access = resolveApiKeyModelAccess(params);
    if (!access.allowed) {
        throw new ModelAccessDeniedError(params.provider, params.model);
    }
    return access.billingMode;
}

export function isFullySponsoredApiKey(
    allowedModels: string[] | null | undefined,
    sponsoredModels: string[] | null | undefined,
): boolean {
    if (!Array.isArray(allowedModels) || allowedModels.length === 0) return false;
    const sponsored = canonicalSet(sponsoredModels);
    return allowedModels.every((model) => sponsored.has(model.trim().toLowerCase()));
}

export function calculateGatewayCharge(
    providerCostUsd: number,
    pricing: ModelPricing,
    billingMode: GatewayBillingMode,
): { cencoriChargeUsd: number; markupPercentage: number } {
    if (billingMode === 'sponsored') {
        return { cencoriChargeUsd: 0, markupPercentage: 0 };
    }

    return {
        cencoriChargeUsd: providerCostUsd * (1 + pricing.cencoriMarkupPercentage / 100)
            + (pricing.fixedFeePerRequest ?? 0),
        markupPercentage: pricing.cencoriMarkupPercentage,
    };
}

export function applyResponseBillingMode(
    response: UnifiedChatResponse,
    billingMode: GatewayBillingMode,
): UnifiedChatResponse {
    if (billingMode !== 'sponsored') return response;
    return {
        ...response,
        cost: {
            ...response.cost,
            cencoriChargeUsd: 0,
            markupPercentage: 0,
        },
    };
}
