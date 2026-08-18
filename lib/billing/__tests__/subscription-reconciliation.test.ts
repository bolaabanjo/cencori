import { describe, expect, test } from "vitest";
import type { BachsSubscriptionData } from "@/lib/bachsClient";
import { buildOrganizationSubscriptionUpdate } from "@/lib/billing/subscription-reconciliation";

const subscription: BachsSubscriptionData = {
  subscription_id: "sub_1a2b3c4d5e",
  customer: {
    customer_id: "cust_1a2b3c4d5e6f",
    email: "owner@example.com",
    name: "Owner",
  },
  product_id: "prod_pro",
  status: "active",
  collection_method: "charge_automatically",
  currency: "USD",
  amount: "49.00",
  billing_cycle: { interval: "month", frequency: 1 },
  quantity: 1,
  current_period_start: "2026-07-01T00:00:00Z",
  current_period_end: "2026-08-01T00:00:00Z",
  next_billed_at: "2026-08-01T00:00:00Z",
  trial_end: null,
  cancel_at_period_end: false,
  canceled_at: null,
  created_at: "2026-07-01T00:00:00Z",
  items: [],
  metadata: { org_id: "org_123" },
};

describe("Bachs subscription reconciliation", () => {
  test("uses Bachs' subscription ID and billing-period dates", () => {
    expect(
      buildOrganizationSubscriptionUpdate(
        subscription,
        "customer.subscription.created",
        "pro",
      ),
    ).toMatchObject({
      billing_provider: "bachs",
      subscription_id: "sub_1a2b3c4d5e",
      bachs_customer_id: "cust_1a2b3c4d5e6f",
      subscription_tier: "pro",
      subscription_status: "active",
      subscription_current_period_start: "2026-07-01T00:00:00Z",
      subscription_current_period_end: "2026-08-01T00:00:00Z",
    });
  });

  test("moves a canceled subscription back to the free entitlement", () => {
    const canceled = { ...subscription, status: "canceled" as const };

    expect(
      buildOrganizationSubscriptionUpdate(
        canceled,
        "customer.subscription.deleted",
        "pro",
      ),
    ).toMatchObject({
      subscription_tier: "free",
      subscription_status: "cancelled",
    });
  });

  test("does not provision an unknown active product", () => {
    expect(
      buildOrganizationSubscriptionUpdate(
        subscription,
        "customer.subscription.updated",
        null,
      ),
    ).toBeNull();
  });
});
