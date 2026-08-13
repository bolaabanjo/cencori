/**
 * Pricing Utilities
 * 
 * Functions for retrieving and managing AI model pricing
 */

import { createAdminClient } from '@/lib/supabaseAdmin';
import { ModelPricing } from './base';
import { PricingUnavailableError } from './errors';

const EXPLICITLY_FREE_MODELS = new Set([
    // Cencori's public free-model catalog. These intentionally bypass the
    // database pricing lookup and are never charged to the customer.
    'groq:llama-3.3-70b-versatile',
    'groq:llama-3.1-8b-instant',
    'groq:groq/compound',
    'groq:groq/compound-mini',
    'cerebras:gpt-oss-120b',
    'cerebras:zai-glm-4.7',
    // Maximo Atlas ran here as a free preview until 2026-07-22. It is now
    // billed from the model_pricing row deployed in
    // 20260803_120000_maximo_atlas_paid_pricing.sql.
]);

function isExplicitlyFree(provider: string, model: string): boolean {
    return EXPLICITLY_FREE_MODELS.has(`${provider}:${model}`);
}

export function hasStaticPricing(provider: string, model: string): boolean {
    return isExplicitlyFree(provider, model);
}

const PRICING_CACHE_TTL_MS = 5 * 60 * 1000;
const pricingCache = new Map<string, { pricing: ModelPricing; expiresAt: number }>();

export type UsageUnit = 'characters' | 'minutes';

export type UsageUnitPricing = {
    unitPriceUsd: number;
    cencoriMarkupPercentage: number;
};

/** Resolve non-token pricing for audio models, failing closed on missing data. */
export async function getUsageUnitPricingFromDB(
    provider: string,
    model: string,
    unit: UsageUnit,
): Promise<UsageUnitPricing> {
    const supabase = createAdminClient();
    const column = unit === 'characters' ? 'price_per_1k_chars' : 'price_per_minute';
    const { data, error } = await supabase
        .from('model_pricing')
        .select(`${column}, cencori_markup_percentage, pricing_expires_at`)
        .eq('provider', provider)
        .eq('model_name', model)
        .eq('is_active', true)
        .single();

    const row = data as Record<string, unknown> | null;
    const unitPriceUsd = Number(row?.[column]);
    const cencoriMarkupPercentage = Number(row?.cencori_markup_percentage);
    const pricingExpiresAt = typeof row?.pricing_expires_at === 'string'
        ? Date.parse(row.pricing_expires_at)
        : null;
    if (error || !data
        || !Number.isFinite(unitPriceUsd) || unitPriceUsd < 0
        || !Number.isFinite(cencoriMarkupPercentage) || cencoriMarkupPercentage < 0
        || (pricingExpiresAt !== null && (!Number.isFinite(pricingExpiresAt) || pricingExpiresAt <= Date.now()))) {
        throw new PricingUnavailableError(provider, model, `${column} is missing or invalid`);
    }

    return { unitPriceUsd, cencoriMarkupPercentage };
}

/**
 * Premium a provider charges on the input rate for writing a prompt cache
 * entry, keyed by provider. This is a property of the provider's billing model
 * rather than of any one model, so it lives here instead of in model_pricing.
 * Anthropic: 1.25x for the 5-minute TTL (2x for the 1-hour TTL, which nothing
 * here requests). Providers absent from this map bill writes as plain input.
 */
const CACHE_WRITE_MULTIPLIERS: Record<string, number> = {
    anthropic: 1.25,
};

type ScheduledPricing = { input: number; output: number; cachedInput: number | undefined };

/**
 * Resolve the follow-on rate a row switches to at `pricing_expires_at`.
 *
 * Returns undefined when the changeover hasn't happened yet, or when no
 * successor rate is stored — in which case an elapsed expiry still fails
 * closed. A partially filled successor (input without output, or either one
 * negative/non-numeric) also returns undefined so we never bill half a rate.
 */
function resolveScheduledPricing(
    row: Record<string, unknown>,
    pricingExpiresAt: number | null,
): ScheduledPricing | undefined {
    if (pricingExpiresAt === null
        || !Number.isFinite(pricingExpiresAt)
        || pricingExpiresAt > Date.now()) {
        return undefined;
    }

    const rate = (value: unknown): number | undefined => {
        if (value === null || value === undefined) return undefined;
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
    };
    const input = rate(row.next_input_price_per_1k_tokens);
    const output = rate(row.next_output_price_per_1k_tokens);
    if (input === undefined || output === undefined) return undefined;

    return { input, output, cachedInput: rate(row.next_cached_input_price_per_1k_tokens) };
}

/**
 * Get pricing for a model from the database
 */
export async function getPricingFromDB(
    provider: string,
    model: string
): Promise<ModelPricing> {
    // Intercept natively free models before any DB queries for 0-latency pricing
    if (isExplicitlyFree(provider, model)) {
        return {
            inputPer1KTokens: 0,
            outputPer1KTokens: 0,
            cencoriMarkupPercentage: 0,
        };
    }

    const cacheKey = `${provider}:${model}`;
    const cached = pricingCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.pricing;
    if (cached) pricingCache.delete(cacheKey);

    const supabase = createAdminClient();

    const { data, error } = await supabase
        .from('model_pricing')
        .select('*')
        .eq('provider', provider)
        .eq('model_name', model)
        .eq('is_active', true)
        .single();

    if (error || !data) {
        // A guessed provider-wide default can materially undercharge expensive
        // models. Fail closed until an exact price row is deployed.
        throw new PricingUnavailableError(provider, model, error?.message);
    }

    const cencoriMarkupPercentage = Number(data.cencori_markup_percentage);
    const pricingExpiresAt = typeof data.pricing_expires_at === 'string'
        ? Date.parse(data.pricing_expires_at)
        : null;

    // A promotional rate ends on a known date, and the rate that replaces it is
    // usually known at the same time. When the follow-on rate is stored, the
    // expiry is a scheduled changeover rather than a deadline: bill the
    // successor from that instant. Without one we still fail closed, so an
    // unreviewed promo can never silently keep charging the old price.
    const scheduled = resolveScheduledPricing(data, pricingExpiresAt);
    const inputPer1KTokens = scheduled?.input ?? Number(data.input_price_per_1k_tokens);
    const outputPer1KTokens = scheduled?.output ?? Number(data.output_price_per_1k_tokens);
    const expiryIsUnresolved = pricingExpiresAt !== null
        && (!Number.isFinite(pricingExpiresAt) || (pricingExpiresAt <= Date.now() && !scheduled));

    if (
        !Number.isFinite(inputPer1KTokens)
        || !Number.isFinite(outputPer1KTokens)
        || !Number.isFinite(cencoriMarkupPercentage)
        || inputPer1KTokens < 0
        || outputPer1KTokens < 0
        || cencoriMarkupPercentage < 0
        || expiryIsUnresolved
    ) {
        throw new PricingUnavailableError(provider, model, 'stored pricing is invalid');
    }

    const optionalRate = (value: unknown): number | undefined => {
        if (value === null || value === undefined) return undefined;
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 0) {
            throw new PricingUnavailableError(provider, model, 'stored optional pricing is invalid');
        }
        return parsed;
    };
    const threshold = data.long_context_threshold_tokens === null
        || data.long_context_threshold_tokens === undefined
        ? undefined
        : Number(data.long_context_threshold_tokens);
    const longContextInputPer1KTokens = optionalRate(data.long_context_input_price_per_1k_tokens);
    const longContextOutputPer1KTokens = optionalRate(data.long_context_output_price_per_1k_tokens);
    if (threshold !== undefined && (
        !Number.isInteger(threshold)
        || threshold < 1
        || longContextInputPer1KTokens === undefined
        || longContextOutputPer1KTokens === undefined
    )) {
        throw new PricingUnavailableError(provider, model, 'stored long-context pricing is incomplete');
    }

    const pricing: ModelPricing = {
        inputPer1KTokens,
        outputPer1KTokens,
        cencoriMarkupPercentage,
        cachedInputPer1KTokens: scheduled
            ? scheduled.cachedInput
            : optionalRate(data.cached_input_price_per_1k_tokens),
        longContextThresholdTokens: threshold,
        longContextInputPer1KTokens,
        longContextOutputPer1KTokens,
        longContextCachedInputPer1KTokens: optionalRate(data.long_context_cached_input_price_per_1k_tokens),
        cacheWriteMultiplier: CACHE_WRITE_MULTIPLIERS[provider],
        // Once the changeover has happened the successor rate has no end date,
        // so don't keep reporting a deadline that has already passed.
        pricingExpiresAt: !scheduled && typeof data.pricing_expires_at === 'string'
            ? data.pricing_expires_at
            : undefined,
    };
    // Expire the cache exactly at the changeover so the successor rate takes
    // effect immediately; afterwards fall back to the normal TTL rather than a
    // timestamp in the past, which would defeat caching entirely.
    const cacheExpiresAt = pricingExpiresAt === null || scheduled
        ? Date.now() + PRICING_CACHE_TTL_MS
        : Math.min(pricingExpiresAt, Date.now() + PRICING_CACHE_TTL_MS);
    pricingCache.set(cacheKey, { pricing, expiresAt: cacheExpiresAt });
    return pricing;
}

/**
 * Update pricing in database (admin function)
 */
export async function updatePricing(
    provider: string,
    model: string,
    pricing: Partial<ModelPricing>
): Promise<void> {
    const supabase = createAdminClient();

    await supabase
        .from('model_pricing')
        .upsert({
            provider,
            model_name: model,
            input_price_per_1k_tokens: pricing.inputPer1KTokens,
            output_price_per_1k_tokens: pricing.outputPer1KTokens,
            cencori_markup_percentage: pricing.cencoriMarkupPercentage,
            updated_at: new Date().toISOString(),
        }, {
            onConflict: 'provider,model_name'
        });
    pricingCache.delete(`${provider}:${model}`);
}

/**
 * Get all pricing for a provider
 */
export async function getProviderPricing(provider: string): Promise<Record<string, ModelPricing>> {
    const supabase = createAdminClient();

    const { data, error } = await supabase
        .from('model_pricing')
        .select('*')
        .eq('provider', provider)
        .eq('is_active', true);

    if (error || !data) {
        return {};
    }

    const pricing: Record<string, ModelPricing> = {};

    for (const row of data) {
        const expiresAt = typeof row.pricing_expires_at === 'string'
            ? Date.parse(row.pricing_expires_at)
            : null;
        const scheduled = resolveScheduledPricing(row, expiresAt);
        if (!scheduled
            && expiresAt !== null
            && (!Number.isFinite(expiresAt) || expiresAt <= Date.now())) {
            continue;
        }
        pricing[row.model_name] = {
            inputPer1KTokens: scheduled?.input ?? parseFloat(row.input_price_per_1k_tokens),
            outputPer1KTokens: scheduled?.output ?? parseFloat(row.output_price_per_1k_tokens),
            cencoriMarkupPercentage: parseFloat(row.cencori_markup_percentage),
            cachedInputPer1KTokens: scheduled
                ? scheduled.cachedInput
                : row.cached_input_price_per_1k_tokens == null
                    ? undefined
                    : parseFloat(row.cached_input_price_per_1k_tokens),
            longContextThresholdTokens: row.long_context_threshold_tokens == null
                ? undefined
                : Number(row.long_context_threshold_tokens),
            longContextInputPer1KTokens: row.long_context_input_price_per_1k_tokens == null
                ? undefined
                : parseFloat(row.long_context_input_price_per_1k_tokens),
            longContextOutputPer1KTokens: row.long_context_output_price_per_1k_tokens == null
                ? undefined
                : parseFloat(row.long_context_output_price_per_1k_tokens),
            longContextCachedInputPer1KTokens: row.long_context_cached_input_price_per_1k_tokens == null
                ? undefined
                : parseFloat(row.long_context_cached_input_price_per_1k_tokens),
            cacheWriteMultiplier: CACHE_WRITE_MULTIPLIERS[provider],
            pricingExpiresAt: scheduled ? undefined : (row.pricing_expires_at || undefined),
        };
    }

    return pricing;
}
