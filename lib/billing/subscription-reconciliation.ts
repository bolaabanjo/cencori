import { TIER_LIMITS, type BachsSubscriptionData, type SubscriptionTier } from "@/lib/bachsClient";

export type SubscriptionLifecycleEventType =
  | "customer.subscription.created"
  | "customer.subscription.updated"
  | "customer.subscription.deleted";

export function buildOrganizationSubscriptionUpdate(
  data: BachsSubscriptionData,
  eventType: SubscriptionLifecycleEventType,
  tier: SubscriptionTier | null,
) {
  const isDeleted =
    eventType === "customer.subscription.deleted" || data.status === "canceled";

  if (!tier && !isDeleted) return null;

  return {
    billing_provider: "bachs" as const,
    subscription_id: data.subscription_id,
    bachs_customer_id: data.customer.customer_id,
    subscription_tier: isDeleted ? ("free" as const) : tier!,
    subscription_status: isDeleted ? "cancelled" : data.status,
    monthly_request_limit: isDeleted
      ? TIER_LIMITS.free.requestsPerMonth
      : TIER_LIMITS[tier!].requestsPerMonth,
    subscription_current_period_start: data.current_period_start,
    subscription_current_period_end: data.current_period_end,
  };
}
