import { describe, expect, it } from "vitest";
import {
  basecodeCheckoutReference,
  effectiveBasecodePlan,
  flutterwavePaymentOptions,
  majorAmountToMinor,
  parseBasecodeCheckoutInput,
} from "@/lib/basecode-billing";

describe("Basecode billing contracts", () => {
  it("accepts only paid Basecode plan checkouts", () => {
    expect(
      parseBasecodeCheckoutInput({
        plan: "builder",
        provider: "flutterwave",
        paymentMethod: "opay",
      }),
    ).toEqual({ plan: "builder", provider: "flutterwave", paymentMethod: "opay" });
    expect(parseBasecodeCheckoutInput({ plan: "free", provider: "flutterwave" })).toBeNull();
    expect(
      parseBasecodeCheckoutInput({ plan: "pro", provider: "bachs", paymentMethod: "opay" }),
    ).toBeNull();
  });

  it("uses the Nigerian checkout methods requested for Flutterwave", () => {
    expect(flutterwavePaymentOptions("opay")).toBe("opay");
    expect(flutterwavePaymentOptions("banktransfer")).toBe("banktransfer");
    expect(flutterwavePaymentOptions("auto")).toContain("opay,banktransfer");
  });

  it("converts provider major-unit amounts without floating point drift", () => {
    expect(majorAmountToMinor("5000")).toBe(500_000);
    expect(majorAmountToMinor(15)).toBe(1_500);
    expect(majorAmountToMinor(0)).toBeNull();
    expect(majorAmountToMinor("not-money")).toBeNull();
  });

  it("falls back to free when a paid entitlement is inactive or expired", () => {
    const future = new Date("2026-09-30T00:00:00Z").toISOString();
    const past = new Date("2026-08-01T00:00:00Z").toISOString();
    const now = new Date("2026-08-31T00:00:00Z");
    expect(
      effectiveBasecodePlan(
        { plan_code: "pro", status: "active", entitlement_ends_at: future },
        now,
      ),
    ).toBe("pro");
    expect(
      effectiveBasecodePlan(
        { plan_code: "pro", status: "active", entitlement_ends_at: past },
        now,
      ),
    ).toBe("free");
    expect(
      effectiveBasecodePlan(
        { plan_code: "builder", status: "past_due", entitlement_ends_at: future },
        now,
      ),
    ).toBe("free");
  });

  it("creates provider-safe checkout references", () => {
    expect(basecodeCheckoutReference("d8b6c53e-1fcb-44e1-b6f7-23aa19c6a3c1")).toBe(
      "basecode_d8b6c53e1fcb44e1b6f723aa19c6a3c1",
    );
  });
});
