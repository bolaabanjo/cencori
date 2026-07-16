import { CENCORI_PAID_PLANS, type PaidPlanTier } from "@/lib/billing/plans";

export type StripeSubscriptionSnapshot = {
  subscriptionId: string;
  customerId: string;
  status:
    | "active"
    | "canceled"
    | "incomplete"
    | "incomplete_expired"
    | "past_due"
    | "paused"
    | "trialing"
    | "unpaid";
  tier: PaidPlanTier | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
};

const ENTITLED_STATUSES = new Set<StripeSubscriptionSnapshot["status"]>([
  "active",
  "past_due",
  "trialing",
]);

export function normalizeStripeSubscriptionStatus(
  status: StripeSubscriptionSnapshot["status"],
): "active" | "cancelled" | "incomplete" | "past_due" | "paused" | "trialing" | "unpaid" {
  if (status === "canceled" || status === "incomplete_expired") {
    return "cancelled";
  }
  return status;
}

export function buildStripeOrganizationSubscriptionUpdate(
  snapshot: StripeSubscriptionSnapshot,
) {
  const retainsEntitlement = ENTITLED_STATUSES.has(snapshot.status);
  if (retainsEntitlement && !snapshot.tier) return null;

  const tier = retainsEntitlement ? snapshot.tier! : "free";

  return {
    billing_provider: "stripe" as const,
    stripe_customer_id: snapshot.customerId,
    subscription_id: snapshot.subscriptionId,
    subscription_tier: tier,
    subscription_status: normalizeStripeSubscriptionStatus(snapshot.status),
    monthly_request_limit:
      tier === "free" ? 1_000 : CENCORI_PAID_PLANS[tier].requestLimit,
    subscription_current_period_start: snapshot.currentPeriodStart,
    subscription_current_period_end: snapshot.currentPeriodEnd,
  };
}
