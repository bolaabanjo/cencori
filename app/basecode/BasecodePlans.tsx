"use client";

import { useEffect, useState } from "react";

type PlanCode = "free" | "builder" | "pro" | "enterprise";
type PaidPlan = Extract<PlanCode, "builder" | "pro">;
type CheckoutMethod = "opay" | "banktransfer" | "international";

type BillingSnapshot = {
  plan: { code: PlanCode; name: string };
  usage: { percentageUsed: number; resetsAt: string | null };
};

const plans: Array<{
  code: PlanCode;
  eyebrow: string;
  price: string;
  cadence: string;
  description: string;
  features: string[];
}> = [
  {
    code: "free",
    eyebrow: "Start",
    price: "₦0",
    cadence: "forever",
    description: "A sharp first taste of Basecode, routed automatically.",
    features: ["10 agent requests each week", "Auto model routing", "One task at a time"],
  },
  {
    code: "builder",
    eyebrow: "Build",
    price: "₦5,000",
    cadence: "every 30 days",
    description: "More room to work with capable open-weight models.",
    features: ["Selectable open-weight models", "Weekly usage allowance", "Priority over Free"],
  },
  {
    code: "pro",
    eyebrow: "Ship",
    price: "₦15,000",
    cadence: "every 30 days",
    description: "Frontier intelligence for the work that justifies it.",
    features: ["GPT 5.6 Sol and Opus-class access", "Cost-weighted weekly allowance", "All Builder models"],
  },
  {
    code: "enterprise",
    eyebrow: "Scale",
    price: "Custom",
    cadence: "for teams",
    description: "Controls, capacity, and support shaped around your company.",
    features: ["Custom model policy", "Custom limits and concurrency", "Direct support"],
  },
];

function checkoutPayload(plan: PaidPlan, method: CheckoutMethod) {
  return method === "international"
    ? { paymentMethod: "auto", plan, provider: "bachs" }
    : { paymentMethod: method, plan, provider: "flutterwave" };
}

export function BasecodePlans() {
  const [currentPlan, setCurrentPlan] = useState<PlanCode | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PaidPlan | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/basecode/billing", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as BillingSnapshot;
      })
      .then((snapshot) => {
        if (active && snapshot) setCurrentPlan(snapshot.plan.code);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function beginCheckout(plan: PaidPlan, method: CheckoutMethod) {
    const key = `${plan}:${method}`;
    setLoading(key);
    setError(null);
    try {
      const response = await fetch("/api/basecode/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checkoutPayload(plan, method)),
      });
      if (response.status === 401) {
        window.location.assign(`/login?redirect=${encodeURIComponent("/basecode#plans")}`);
        return;
      }
      const result = (await response.json()) as { checkoutUrl?: string; error?: string };
      if (!response.ok || !result.checkoutUrl) {
        throw new Error(result.error || "Checkout could not be started.");
      }
      window.location.assign(result.checkoutUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout could not be started.");
      setLoading(null);
    }
  }

  return (
    <section className="mx-auto max-w-6xl px-5 pb-24 pt-16 md:px-8 md:pb-32 md:pt-24" id="plans">
      <div className="mb-10 grid gap-5 border-t border-white/20 pt-6 md:grid-cols-[1fr_1fr] md:items-end">
        <div>
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-white/55">
            Plans / priced for Nigeria
          </p>
          <h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">
            Start small. Pay when the work gets serious.
          </h2>
        </div>
        <p className="max-w-lg text-sm leading-6 text-white/60 md:justify-self-end">
          Every plan resets weekly. Paid usage is weighted by model cost, so frontier models use the
          allowance faster. Your app shows one clear percentage—not a wall of token arithmetic.
        </p>
      </div>

      <div className="grid overflow-hidden rounded-xl border border-white/15 bg-black/25 backdrop-blur-md sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => {
          const isCurrent = currentPlan === plan.code;
          const isPaid = plan.code === "builder" || plan.code === "pro";
          const isSelected = isPaid && selectedPlan === plan.code;
          return (
            <article
              className={`flex min-h-[28rem] flex-col border-white/10 p-5 sm:[&:nth-child(odd)]:border-r lg:border-r lg:last:border-r-0 ${
                plan.code === "pro" ? "bg-white/[0.07]" : "bg-white/[0.025]"
              }`}
              key={plan.code}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
                  {plan.eyebrow}
                </p>
                {plan.code === "pro" ? (
                  <span className="rounded-full border border-white/20 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white/70">
                    Frontier
                  </span>
                ) : null}
              </div>
              <h3 className="mt-8 text-xl font-medium tracking-[-0.035em] text-white">
                {plan.code[0].toUpperCase() + plan.code.slice(1)}
              </h3>
              <div className="mt-3 flex items-baseline gap-2">
                <strong className="text-3xl font-semibold tracking-[-0.055em] text-white">
                  {plan.price}
                </strong>
                <span className="text-[11px] text-white/40">{plan.cadence}</span>
              </div>
              <p className="mt-5 min-h-12 text-sm leading-5 text-white/55">{plan.description}</p>
              <ul className="mt-6 grid gap-3 border-t border-white/10 pt-5 text-xs text-white/70">
                {plan.features.map((feature) => (
                  <li className="flex gap-2" key={feature}>
                    <span aria-hidden="true" className="text-white/35">—</span>
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-8">
                {isCurrent ? (
                  <div className="flex h-9 items-center justify-center rounded-md border border-white/15 text-xs text-white/50">
                    Current plan
                  </div>
                ) : isPaid ? (
                  isSelected ? (
                    <div className="grid gap-2" aria-label={`Pay for ${plan.code}`}>
                      <button
                        className="h-9 rounded-md bg-white text-xs font-medium text-black transition-colors hover:bg-white/85 disabled:opacity-50"
                        disabled={loading !== null}
                        onClick={() => void beginCheckout(plan.code as PaidPlan, "opay")}
                        type="button"
                      >
                        {loading === `${plan.code}:opay` ? "Opening…" : "Pay with OPay"}
                      </button>
                      <button
                        className="h-9 rounded-md border border-white/20 text-xs font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-50"
                        disabled={loading !== null}
                        onClick={() => void beginCheckout(plan.code as PaidPlan, "banktransfer")}
                        type="button"
                      >
                        {loading === `${plan.code}:banktransfer` ? "Opening…" : "Bank transfer"}
                      </button>
                      <button
                        className="h-8 text-[11px] text-white/45 transition-colors hover:text-white/75 disabled:opacity-50"
                        disabled={loading !== null}
                        onClick={() => void beginCheckout(plan.code as PaidPlan, "international")}
                        type="button"
                      >
                        {loading === `${plan.code}:international`
                          ? "Opening…"
                          : `International card · $${plan.code === "builder" ? "5" : "15"}`}
                      </button>
                    </div>
                  ) : (
                    <button
                      className="h-9 w-full rounded-md bg-white text-xs font-medium text-black transition-colors hover:bg-white/85"
                      onClick={() => setSelectedPlan(plan.code as PaidPlan)}
                      type="button"
                    >
                      Choose {plan.code === "builder" ? "Builder" : "Pro"}
                    </button>
                  )
                ) : plan.code === "enterprise" ? (
                  <a
                    className="flex h-9 items-center justify-center rounded-md border border-white/20 text-xs font-medium text-white transition-colors hover:bg-white/10"
                    href="mailto:hello@cencori.com?subject=Basecode%20Enterprise"
                  >
                    Talk to us
                  </a>
                ) : (
                  <a
                    className="flex h-9 items-center justify-center rounded-md border border-white/20 text-xs font-medium text-white transition-colors hover:bg-white/10"
                    href="#download"
                  >
                    Download Basecode
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {error ? (
        <p className="mt-4 text-center text-xs text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      <p className="mt-5 text-center text-[11px] leading-5 text-white/40">
        OPay and Nigerian bank transfers are processed by Flutterwave. International card checkout
        is processed by Bachs. Usage allowances reset weekly; paid access renews every 30 days.
      </p>
    </section>
  );
}
