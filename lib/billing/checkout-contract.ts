import {
  isPaidPlanTier,
  isPlanBillingInterval,
  type PaidPlanTier,
  type PlanBillingInterval,
} from "@/lib/billing/plans";

export type CheckoutSelection = {
  tier: PaidPlanTier;
  interval: PlanBillingInterval;
};

export function parseCheckoutSelection(input: {
  tier?: unknown;
  interval?: unknown;
}): CheckoutSelection | null {
  if (!isPaidPlanTier(input.tier) || !isPlanBillingInterval(input.interval)) {
    return null;
  }

  return { tier: input.tier, interval: input.interval };
}

export function getStripeCheckoutReturnUrl(baseUrl: string, orgSlug: string) {
  const billingUrl = new URL(`/${orgSlug}/~/billing`, baseUrl);
  return `${billingUrl.toString()}?checkout_session_id={CHECKOUT_SESSION_ID}`;
}
