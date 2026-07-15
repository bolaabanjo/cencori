import { deductCredits } from '@/lib/credits';
import { getPricingFromDB } from '@/lib/providers/pricing';
import { calculateProviderTokenCost } from '@/lib/providers/base';

export function shouldEnforceProjectCredits(tier: string | null | undefined): boolean {
    const normalizedTier = (tier || 'free').toLowerCase();
    return normalizedTier !== 'free' && normalizedTier !== 'enterprise';
}

export function parseCreditsBalance(value: string | number | null | undefined): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

export async function calculateTokenCharge(
    provider: string,
    model: string,
    promptTokens: number,
    completionTokens: number
): Promise<{
    providerCostUsd: number;
    cencoriChargeUsd: number;
    markupPercentage: number;
}> {
    const safePromptTokens = Math.max(0, Number(promptTokens) || 0);
    const safeCompletionTokens = Math.max(0, Number(completionTokens) || 0);

    const pricing = await getPricingFromDB(provider, model);
    const providerCostUsd = calculateProviderTokenCost(
        safePromptTokens,
        safeCompletionTokens,
        pricing
    );
    const cencoriChargeUsd = providerCostUsd * (1 + pricing.cencoriMarkupPercentage / 100)
        + (pricing.fixedFeePerRequest ?? 0);

    return {
        providerCostUsd,
        cencoriChargeUsd,
        markupPercentage: pricing.cencoriMarkupPercentage,
    };
}

export async function chargeProjectUsageCredits(
    organizationId: string,
    tier: string | null | undefined,
    amountUsd: number,
    endpoint: string
): Promise<boolean> {
    if (!shouldEnforceProjectCredits(tier)) {
        return true;
    }

    if (!(amountUsd > 0)) {
        return true;
    }

    return deductCredits(
        organizationId,
        amountUsd,
        `Usage charge: ${endpoint}`
    );
}
