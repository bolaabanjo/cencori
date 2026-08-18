export type PaidPlanTier = "pro" | "team";
export type PlanBillingInterval = "month" | "year";

export type PaidPlan = {
  id: PaidPlanTier;
  name: string;
  description: string;
  logRetention: string;
  prices: Record<PlanBillingInterval, number>;
  features: readonly string[];
};

export const CENCORI_PAID_PLANS: Record<PaidPlanTier, PaidPlan> = {
  pro: {
    id: "pro",
    name: "Pro",
    description: "For developers shipping production AI workloads.",
    logRetention: "30-day log retention",
    prices: {
      month: 4_900,
      year: 49_000,
    },
    features: [
      "Unlimited projects",
      "Full security pipeline",
      "Advanced analytics",
      "Webhooks and integrations",
      "Priority support",
    ],
  },
  team: {
    id: "team",
    name: "Team",
    description: "For teams operating AI systems at scale.",
    logRetention: "90-day log retention",
    prices: {
      month: 14_900,
      year: 149_000,
    },
    features: [
      "Everything in Pro",
      "Team seats and collaboration",
      "90-day log retention",
      "Higher production limits",
      "24/7 priority support",
    ],
  },
};

export function isPaidPlanTier(value: unknown): value is PaidPlanTier {
  return value === "pro" || value === "team";
}

export function isPlanBillingInterval(value: unknown): value is PlanBillingInterval {
  return value === "month" || value === "year";
}

export function getAvailableUpgradePlans(
  currentTier: "free" | PaidPlanTier = "free",
): PaidPlanTier[] {
  if (currentTier === "team") return [];
  if (currentTier === "pro") return ["team"];
  return ["pro", "team"];
}

export function getMonthlyEquivalentCents(
  tier: PaidPlanTier,
  interval: PlanBillingInterval,
): number {
  const total = CENCORI_PAID_PLANS[tier].prices[interval];
  return interval === "year" ? total / 12 : total;
}
