import { describe, expect, test } from "vitest";
import {
  buildStripeOrganizationSubscriptionUpdate,
  type StripeSubscriptionSnapshot,
} from "@/lib/billing/stripe-subscription-reconciliation";

const activeSubscription: StripeSubscriptionSnapshot = {
  subscriptionId: "sub_123",
  customerId: "cus_123",
  status: "active",
  tier: "pro",
  currentPeriodStart: "2026-07-01T00:00:00.000Z",
  currentPeriodEnd: "2026-08-01T00:00:00.000Z",
};

describe("Stripe subscription reconciliation", () => {
  test("provisions an active subscription from Stripe's billing dates", () => {
    expect(buildStripeOrganizationSubscriptionUpdate(activeSubscription)).toEqual({
      billing_provider: "stripe",
      stripe_customer_id: "cus_123",
      subscription_id: "sub_123",
      subscription_tier: "pro",
      subscription_status: "active",
      monthly_request_limit: 50_000,
      subscription_current_period_start: "2026-07-01T00:00:00.000Z",
      subscription_current_period_end: "2026-08-01T00:00:00.000Z",
    });
  });

  test("keeps access while Stripe retries a past-due renewal", () => {
    expect(
      buildStripeOrganizationSubscriptionUpdate({
        ...activeSubscription,
        status: "past_due",
      }),
    ).toMatchObject({
      subscription_tier: "pro",
      subscription_status: "past_due",
    });
  });

  test("does not provision an incomplete first payment", () => {
    expect(
      buildStripeOrganizationSubscriptionUpdate({
        ...activeSubscription,
        status: "incomplete",
      }),
    ).toMatchObject({
      subscription_tier: "free",
      subscription_status: "incomplete",
      monthly_request_limit: 1_000,
    });
  });

  test("returns canceled subscriptions to the free entitlement", () => {
    expect(
      buildStripeOrganizationSubscriptionUpdate({
        ...activeSubscription,
        status: "canceled",
      }),
    ).toMatchObject({
      subscription_tier: "free",
      subscription_status: "cancelled",
      monthly_request_limit: 1_000,
    });
  });

  test("rejects an active subscription with an unknown plan", () => {
    expect(
      buildStripeOrganizationSubscriptionUpdate({
        ...activeSubscription,
        tier: null,
      }),
    ).toBeNull();
  });
});
