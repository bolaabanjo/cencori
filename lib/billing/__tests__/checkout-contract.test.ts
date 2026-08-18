import { describe, expect, test } from "vitest";
import {
  getStripeCheckoutReturnUrl,
  parseCheckoutSelection,
} from "@/lib/billing/checkout-contract";
import {
  CENCORI_PAID_PLANS,
  getAvailableUpgradePlans,
  getMonthlyEquivalentCents,
} from "@/lib/billing/plans";

describe("Cencori checkout contract", () => {
  test("accepts only supported plan and billing combinations", () => {
    expect(parseCheckoutSelection({ tier: "pro", interval: "month" })).toEqual({
      tier: "pro",
      interval: "month",
    });
    expect(parseCheckoutSelection({ tier: "enterprise", interval: "month" })).toBeNull();
    expect(parseCheckoutSelection({ tier: "pro", interval: "monthly" })).toBeNull();
  });

  test("returns customers to the organization billing route", () => {
    expect(getStripeCheckoutReturnUrl("https://cencori.com", "arcie")).toBe(
      "https://cencori.com/arcie/~/billing?checkout_session_id={CHECKOUT_SESSION_ID}",
    );
  });

  test("keeps the public plan promise in the checkout source of truth", () => {
    // Plans no longer promise a request allowance — requests are uncapped on
    // every tier, so nothing here should reintroduce a per-plan request number.
    expect(CENCORI_PAID_PLANS.pro).not.toHaveProperty("requestLimit");
    expect(CENCORI_PAID_PLANS.team).not.toHaveProperty("requestLimit");
    for (const plan of Object.values(CENCORI_PAID_PLANS)) {
      expect(plan.features.some((feature) => /requests?\/month|requests each month/i.test(feature)))
        .toBe(false);
    }
    expect(getMonthlyEquivalentCents("pro", "year")).toBeCloseTo(4_083.33, 1);
  });

  test("does not offer a customer their current plan as an upgrade", () => {
    expect(getAvailableUpgradePlans("free")).toEqual(["pro", "team"]);
    expect(getAvailableUpgradePlans("pro")).toEqual(["team"]);
    expect(getAvailableUpgradePlans("team")).toEqual([]);
  });
});
