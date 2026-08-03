/**
 * End-User Usage-Based Billing
 *
 * Core library for per-end-user quota checks and usage tracking
 * in the Cencori AI gateway. Customers can set per-user limits,
 * markup percentages, and model restrictions.
 */

import { createAdminClient } from "@/lib/supabaseAdmin";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
  isNewUser: boolean;
  endUserId?: string;
  ratePlan?: string;
  overageAction?: "block" | "alert_only";
  markupPercentage: number;
  flatRatePerRequest: number | null;
  allowedModels: string[] | null;
  dailyTokensUsed: number;
  dailyTokensLimit: number | null;
  monthlyTokensUsed: number;
  monthlyTokensLimit: number | null;
  dailyRequestsUsed: number;
  dailyRequestsLimit: number | null;
  monthlyRequestsUsed: number;
  monthlyRequestsLimit: number | null;
  requestsPerMinuteUsed: number;
  requestsPerMinuteLimit: number | null;
  retryAfterSeconds: number | null;
  currency: string;
  pricingModel: 'flat' | 'tiered' | 'volume';
  pricingTiers: PricingTier[];
  platformCommissionPercentage: number;
}

export interface UsageRecord {
  projectId: string;
  externalUserId: string;
  environment?: string;
  tokens: { prompt: number; completion: number; total: number };
  cost: { providerUsd: number; cencoriChargeUsd: number };
  customerMarkupPercentage: number;
  flatRatePerRequest: number | null;
  currency: string;
  pricingModel: 'flat' | 'tiered' | 'volume';
  pricingTiers: PricingTier[];
  monthlyTokensUsed: number;
  platformCommissionPercentage: number;
}

// ──────────────────────────────────────────────
// Quota Check
// ──────────────────────────────────────────────

/**
 * Check if an end-user has quota remaining before processing their request.
 * Calls the check_end_user_quota RPC in Supabase.
 * Returns quickly — this is on the hot path.
 */
export async function checkEndUserQuota(
  projectId: string,
  externalUserId: string,
  model?: string,
  environment = "production"
): Promise<QuotaCheckResult> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("check_end_user_quota", {
    p_project_id: projectId,
    p_external_user_id: externalUserId,
    p_environment: environment,
  });

  if (error || !data) {
    console.error("[EndUserBilling] Quota check failed:", error?.message);
    // Fail closed — block requests if the quota check itself fails to prevent unmetered usage.
    // Exceptions could be made for specific enterprise projects if needed.
    return {
      allowed: false,
      reason: "quota_check_unavailable",
      isNewUser: false,
      markupPercentage: 0,
      flatRatePerRequest: null,
      allowedModels: null,
      dailyTokensUsed: 0,
      dailyTokensLimit: null,
      monthlyTokensUsed: 0,
      monthlyTokensLimit: null,
      dailyRequestsUsed: 0,
      dailyRequestsLimit: null,
      monthlyRequestsUsed: 0,
      monthlyRequestsLimit: null,
      requestsPerMinuteUsed: 0,
      requestsPerMinuteLimit: null,
      retryAfterSeconds: null,
      currency: "USD",
      pricingModel: "flat",
      pricingTiers: [],
      platformCommissionPercentage: 20,
    };
  }

  const result: QuotaCheckResult = {
    allowed: data.allowed,
    reason: data.reason ?? undefined,
    isNewUser: data.is_new_user ?? false,
    endUserId: data.end_user_id ?? undefined,
    ratePlan: data.rate_plan ?? undefined,
    overageAction: data.overage_action ?? undefined,
    markupPercentage: data.markup_percentage ?? 0,
    flatRatePerRequest: data.flat_rate_per_request ?? null,
    allowedModels: data.allowed_models ?? null,
    dailyTokensUsed: data.daily_tokens_used ?? 0,
    dailyTokensLimit: data.daily_tokens_limit ?? null,
    monthlyTokensUsed: data.monthly_tokens_used ?? 0,
    monthlyTokensLimit: data.monthly_tokens_limit ?? null,
    dailyRequestsUsed: data.daily_requests_used ?? 0,
    dailyRequestsLimit: data.daily_requests_limit ?? null,
    monthlyRequestsUsed: data.monthly_requests_used ?? 0,
    monthlyRequestsLimit: data.monthly_requests_limit ?? null,
    requestsPerMinuteUsed: data.requests_per_minute_used ?? 0,
    requestsPerMinuteLimit: data.requests_per_minute_limit ?? null,
    retryAfterSeconds: data.retry_after_seconds ?? null,
    currency: data.currency || 'USD',
    pricingModel: data.pricing_model || 'flat',
    pricingTiers: data.pricing_tiers || [],
    platformCommissionPercentage: data.platform_commission_percentage || 20,
  };

  // Model restriction check — done client-side for speed
  if (model && result.allowedModels && result.allowedModels.length > 0) {
    if (!result.allowedModels.includes(model)) {
      result.allowed = false;
      result.reason = `model_not_allowed: ${model}`;
    }
  }

  return result;
}

// ──────────────────────────────────────────────
// Usage Recording
// ──────────────────────────────────────────────

/**
 * Record usage after a successful AI request.
 * Enqueues the record into a persistent Redis queue for reliable background processing.
 * Never throws, never blocks the response.
 */
export function recordEndUserUsage(record: UsageRecord): void {
  try {
    const { enqueueUsageRecord } = require('./queue');
    
    const task = {
      ...record,
      timestamp: Date.now(),
      environment: record.environment === "test" ? "test" : "production",
    };

    // Enqueue for background processing (persistent & crash-proof)
    enqueueUsageRecord(task).catch((err: any) => {
      console.error("[EndUserBilling] Failed to enqueue usage:", err);
    });
  } catch (err) {
    console.error("[EndUserBilling] Unexpected error enqueuing usage:", err);
  }
}

/**
 * Awaitable version of recordEndUserUsage for critical paths.
 */
export async function recordEndUserUsageAsync(
  record: UsageRecord
): Promise<void> {
  const supabase = createAdminClient();
  const environment = record.environment === "test" ? "test" : "production";
  const customerChargeUsd = calculateCustomerCharge(
    record.cost.cencoriChargeUsd,
    record.customerMarkupPercentage,
    record.flatRatePerRequest,
    record.pricingModel,
    record.pricingTiers,
    record.tokens.total,
    record.monthlyTokensUsed
  );

  // Calculate Platform Commission (Cut of the profit)
  const userProfitUsd = Math.max(0, customerChargeUsd - record.cost.cencoriChargeUsd);
  const platformCommissionUsd = userProfitUsd * (record.platformCommissionPercentage / 100);

  const { error } = await supabase.rpc("increment_end_user_usage", {
    p_project_id: record.projectId,
    p_external_user_id: record.externalUserId,
    p_prompt_tokens: record.tokens.prompt,
    p_completion_tokens: record.tokens.completion,
    p_total_cost_usd: record.cost.cencoriChargeUsd,
    p_provider_cost_usd: record.cost.providerUsd,
    p_customer_charge_usd: customerChargeUsd,
    p_platform_commission_usd: platformCommissionUsd,
    p_currency: record.currency || 'USD',
    p_environment: environment,
  });

  if (error) {
    console.error("[EndUserBilling] Failed to record usage:", error.message);
    throw error;
  }
}

// ──────────────────────────────────────────────
// Charge Calculation
// ──────────────────────────────────────────────

export interface PricingTier {
  up_to: number | null; // null means infinity
  unit_amount: number;
}

/**
 * Order tiers by their ceiling, smallest first, with the open-ended tier last.
 * Tiers arrive as JSON from the rate plan, so their order is not guaranteed and
 * both pricing models depend on reading them in ascending order.
 */
function sortTiers(pricingTiers: PricingTier[]): PricingTier[] {
  return [...pricingTiers].sort(
    (a, b) => (a.up_to ?? Infinity) - (b.up_to ?? Infinity)
  );
}

/**
 * Graduated pricing: every unit is charged at the rate of the tier it falls in,
 * so a single request that crosses a tier boundary is split across both rates.
 * `usageBefore` is the end-user's usage this period prior to this request, which
 * is what decides where in the tier ladder these units land.
 */
function calculateGraduatedCharge(
  units: number,
  pricingTiers: PricingTier[],
  usageBefore: number
): number {
  const tiers = sortTiers(pricingTiers);
  let remaining = units;
  let cursor = usageBefore;
  let charge = 0;

  for (const tier of tiers) {
    if (remaining <= 0) break;
    const ceiling = tier.up_to ?? Infinity;
    if (cursor >= ceiling) continue;

    const unitsInTier = Math.min(remaining, ceiling - cursor);
    charge += unitsInTier * tier.unit_amount;
    cursor += unitsInTier;
    remaining -= unitsInTier;
  }

  // Rate plans that stop at a finite ceiling leave usage above it unpriced.
  // Bill the overflow at the highest configured rate rather than for free.
  if (remaining > 0 && tiers.length > 0) {
    charge += remaining * tiers[tiers.length - 1].unit_amount;
  }

  return charge;
}

/**
 * Volume pricing: every unit is charged at the single rate of the tier the
 * period total reaches. Usage is metered per request, so the total including
 * this request decides the rate — otherwise a first request large enough to
 * clear a discount tier would still be billed at the most expensive rate.
 */
function calculateVolumeCharge(
  units: number,
  pricingTiers: PricingTier[],
  usageBefore: number
): number {
  const tiers = sortTiers(pricingTiers);
  const total = usageBefore + units;
  const tier = tiers.find(t => t.up_to === null || total <= t.up_to)
    ?? tiers[tiers.length - 1];

  return units * tier.unit_amount;
}

/**
 * Calculate what the customer should charge their end-user.
 *
 * Flat applies the customer's markup to Cencori's charge. Graduated and volume
 * rate plans price the request's units directly and replace the markup entirely.
 */
export function calculateCustomerCharge(
  cencoriChargeUsd: number,
  markupPercentage: number,
  flatRatePerRequest: number | null,
  pricingModel: 'flat' | 'tiered' | 'volume' = 'flat',
  pricingTiers: PricingTier[] = [],
  requestUnits: number = 0,
  totalMonthlyUsage: number = 0
): number {
  if (pricingTiers.length > 0) {
    if (pricingModel === 'tiered') {
      return calculateGraduatedCharge(requestUnits, pricingTiers, totalMonthlyUsage);
    }
    if (pricingModel === 'volume') {
      return calculateVolumeCharge(requestUnits, pricingTiers, totalMonthlyUsage);
    }
  }

  return cencoriChargeUsd * (1 + markupPercentage / 100) + (flatRatePerRequest || 0);
}
