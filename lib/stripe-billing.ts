import "server-only";

import Stripe from "stripe";
import type { PaidPlanTier, PlanBillingInterval } from "@/lib/billing/plans";

let stripeBillingClient: Stripe | null = null;

const STRIPE_PRICE_ENV_KEYS: Record<
  PaidPlanTier,
  Record<PlanBillingInterval, string>
> = {
  pro: {
    month: "STRIPE_PRICE_PRO_MONTHLY",
    year: "STRIPE_PRICE_PRO_ANNUAL",
  },
  team: {
    month: "STRIPE_PRICE_TEAM_MONTHLY",
    year: "STRIPE_PRICE_TEAM_ANNUAL",
  },
};

export function getStripeBillingClient(): Stripe {
  if (stripeBillingClient) return stripeBillingClient;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY environment variable");
  }

  stripeBillingClient = new Stripe(secretKey, {
    apiVersion: "2026-02-25.clover",
  });

  return stripeBillingClient;
}

export function getStripeBillingWebhookSecret(): string {
  const secret = process.env.STRIPE_BILLING_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("Missing STRIPE_BILLING_WEBHOOK_SECRET environment variable");
  }
  return secret;
}

export function getStripePlanPriceId(
  tier: PaidPlanTier,
  interval: PlanBillingInterval,
): string {
  const envKey = STRIPE_PRICE_ENV_KEYS[tier][interval];
  const priceId = process.env[envKey];
  if (!priceId) {
    throw new Error(`Missing ${envKey} environment variable`);
  }
  return priceId;
}

export function getStripePlanFromPriceId(
  priceId: string,
): { tier: PaidPlanTier; interval: PlanBillingInterval } | null {
  for (const tier of Object.keys(STRIPE_PRICE_ENV_KEYS) as PaidPlanTier[]) {
    for (const interval of Object.keys(
      STRIPE_PRICE_ENV_KEYS[tier],
    ) as PlanBillingInterval[]) {
      const configuredPriceId = process.env[STRIPE_PRICE_ENV_KEYS[tier][interval]];
      if (configuredPriceId && configuredPriceId === priceId) {
        return { tier, interval };
      }
    }
  }

  return null;
}
