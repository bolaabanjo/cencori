"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { loadStripe } from "@stripe/stripe-js";
import {
  BillingAddressElement,
  CheckoutElementsProvider,
  PaymentElement,
  useCheckoutElements,
} from "@stripe/react-stripe-js/checkout";
import {
  ArrowRight,
  Check,
  CreditCard,
  Loader2,
  LockKeyhole,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CENCORI_PAID_PLANS,
  getAvailableUpgradePlans,
  getMonthlyEquivalentCents,
  type PaidPlanTier,
  type PlanBillingInterval,
} from "@/lib/billing/plans";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  orgSlug: string;
  orgName?: string;
  currentTier?: "free" | PaidPlanTier;
  reason?: string;
  recommendedTier?: PaidPlanTier;
  checkoutMode?: "review" | "direct";
  preload?: boolean;
}

type CheckoutResponse = {
  clientSecret?: string;
  sessionId?: string;
  error?: string;
};

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePublishableKey
  ? loadStripe(stripePublishableKey)
  : null;

function formatCents(cents: number, maximumFractionDigits = 2): string {
  return formatCurrency(cents / 100, "USD", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
}

function getInitialTier(
  currentTier: "free" | PaidPlanTier,
  recommendedTier: PaidPlanTier,
): PaidPlanTier {
  const availablePlans = getAvailableUpgradePlans(currentTier);
  return availablePlans.includes(recommendedTier)
    ? recommendedTier
    : availablePlans[0] ?? "pro";
}

function getReturnUrl(orgSlug: string, sessionId: string): string {
  const returnUrl = new URL(
    `/${encodeURIComponent(orgSlug)}/~/billing`,
    window.location.origin,
  );
  returnUrl.searchParams.set("checkout_session_id", sessionId);
  return returnUrl.toString();
}

function PaymentForm({
  children,
  error,
  orgSlug,
  paymentFirst,
  sessionId,
  onError,
  onSubmittingChange,
}: {
  children: ReactNode;
  error: string | null;
  orgSlug: string;
  paymentFirst: boolean;
  sessionId: string;
  onError: (message: string | null) => void;
  onSubmittingChange: (submitting: boolean) => void;
}) {
  const checkoutState = useCheckoutElements();
  const [paymentReady, setPaymentReady] = useState(false);
  const [billingAddressReady, setBillingAddressReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (checkoutState.type === "error") {
      onError(checkoutState.error.message);
    }
  }, [checkoutState, onError]);

  const confirmPayment = async () => {
    if (checkoutState.type !== "success" || submitting) return;

    setSubmitting(true);
    onSubmittingChange(true);
    onError(null);

    const result = await checkoutState.checkout.confirm({
      redirect: "if_required",
      returnUrl: getReturnUrl(orgSlug, sessionId),
    });

    if (result.type === "error") {
      onError(result.error.message || "Payment could not be completed. Try again.");
      setSubmitting(false);
      onSubmittingChange(false);
      return;
    }

    window.location.assign(getReturnUrl(orgSlug, result.session.id || sessionId));
  };

  const canConfirm =
    checkoutState.type === "success" &&
    checkoutState.checkout.canConfirm &&
    paymentReady &&
    billingAddressReady &&
    !submitting;

  const paymentSection = (
    <section
      aria-labelledby="payment-heading"
      className={paymentFirst ? undefined : "border-t border-border/50 pt-6"}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CreditCard className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <h3 id="payment-heading" className="text-xs font-medium">
            Payment details
          </h3>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <LockKeyhole className="size-3" aria-hidden="true" />
          Encrypted
        </span>
      </div>

      {checkoutState.type === "loading" && (
        <div className="space-y-3" aria-label="Loading payment form">
          <Skeleton className="h-11 w-full rounded-md" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-11 rounded-md" />
            <Skeleton className="h-11 rounded-md" />
          </div>
        </div>
      )}

      {checkoutState.type === "success" && (
        <PaymentElement
          options={{
            layout: "tabs",
            paymentMethodOrder: ["card"],
            fields: {
              billingDetails: "never",
            },
            wallets: {
              applePay: "never",
              googlePay: "never",
              link: "never",
            },
          }}
          onReady={() => setPaymentReady(true)}
          onChange={() => onError(null)}
          onLoadError={(event) =>
            onError(event.error.message || "The payment form could not be loaded.")
          }
        />
      )}

      <div className="-mx-5 mt-6 border-t border-border/50 px-5 pt-6 sm:-mx-7 sm:px-7">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-xs font-medium">Billing details</h3>
          <span className="text-[10px] text-muted-foreground">Required</span>
        </div>
        {checkoutState.type === "loading" && (
          <div className="space-y-3" aria-label="Loading billing address form">
            <Skeleton className="h-11 w-full rounded-md" />
            <Skeleton className="h-11 w-full rounded-md" />
            <Skeleton className="h-11 w-full rounded-md" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-11 rounded-md" />
              <Skeleton className="h-11 rounded-md" />
            </div>
          </div>
        )}
        {checkoutState.type === "success" && (
          <BillingAddressElement
            options={{
              display: { name: "full" },
            }}
            onReady={() => setBillingAddressReady(true)}
            onChange={() => onError(null)}
            onLoadError={(event) =>
              onError(event.error.message || "The billing address form could not be loaded.")
            }
          />
        )}
      </div>
    </section>
  );

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-7 px-5 py-6 sm:px-7">
          {paymentFirst && paymentSection}
          {children}
          {!paymentFirst && paymentSection}

          {error && <CheckoutError message={error} />}
        </div>
      </div>

      <SheetFooter className="gap-3 border-t border-border/50 bg-background px-5 py-5 sm:px-7">
        <Button
          type="button"
          size="sm"
          className="h-10 w-full rounded-md text-xs font-medium transition-transform active:scale-[0.99]"
          onClick={confirmPayment}
          disabled={!canConfirm}
        >
          {submitting ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Processing
            </>
          ) : (
            "Upgrade"
          )}
        </Button>

        <SecureCheckoutNotice />
      </SheetFooter>
    </>
  );
}

function SecureCheckoutNotice() {
  return (
    <div className="text-center text-[10px] leading-4 text-muted-foreground">
      <p>
        Your payment details are encrypted. By upgrading, you agree to Cencori&apos;s{" "}
        <Link href="/terms-of-service" className="underline underline-offset-2 hover:text-foreground">
          terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy-policy" className="underline underline-offset-2 hover:text-foreground">
          privacy policy
        </Link>
        .
      </p>
    </div>
  );
}

function PaymentFormSkeleton({ bordered = false }: { bordered?: boolean }) {
  return (
    <section
      className={cn(bordered && "border-t border-border/50 pt-6")}
      aria-label="Preparing payment form"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CreditCard className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="text-xs font-medium">Payment details</span>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <LockKeyhole className="size-3" aria-hidden="true" />
          Encrypted
        </span>
      </div>

      <div className="space-y-3">
        <Skeleton className="h-11 w-full rounded-md" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-11 rounded-md" />
          <Skeleton className="h-11 rounded-md" />
        </div>
      </div>

      <div className="-mx-5 mt-6 border-t border-border/50 px-5 pt-6 sm:-mx-7 sm:px-7">
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="text-xs font-medium">Billing details</span>
          <span className="text-[10px] text-muted-foreground">Required</span>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-11 w-full rounded-md" />
          <Skeleton className="h-11 w-full rounded-md" />
          <Skeleton className="h-11 w-full rounded-md" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-11 rounded-md" />
            <Skeleton className="h-11 rounded-md" />
          </div>
        </div>
      </div>
    </section>
  );
}

export function UpgradeDialog({
  open,
  onOpenChange,
  orgId,
  orgSlug,
  orgName,
  currentTier = "free",
  reason,
  recommendedTier = "pro",
  checkoutMode = "review",
  preload = false,
}: UpgradeDialogProps) {
  const { resolvedTheme } = useTheme();
  const availablePlans = useMemo(
    () => getAvailableUpgradePlans(currentTier),
    [currentTier],
  );
  const directTier = getInitialTier(currentTier, recommendedTier);
  const [selectedTier, setSelectedTier] = useState<PaidPlanTier>(directTier);
  const [interval, setInterval] = useState<PlanBillingInterval>("month");
  const [creatingSession, setCreatingSession] = useState(false);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const directCheckoutStartedRef = useRef(false);
  const checkoutIdempotencyKeyRef = useRef<string | null>(null);
  const checkoutOrgIdRef = useRef(orgId);

  const checkoutTier = checkoutMode === "direct" ? directTier : selectedTier;
  const checkoutInterval = checkoutMode === "direct" ? "month" : interval;
  const plan = CENCORI_PAID_PLANS[checkoutTier];
  const dueNow = plan.prices[checkoutInterval];
  const monthlyEquivalent = getMonthlyEquivalentCents(checkoutTier, checkoutInterval);
  const organizationLabel = orgName || orgSlug || "your organization";

  const resetCheckout = useCallback(() => {
    directCheckoutStartedRef.current = false;
    checkoutIdempotencyKeyRef.current = null;
    setCreatingSession(false);
    setPaymentSubmitting(false);
    setClientSecret(null);
    setSessionId(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    setSelectedTier(directTier);
    if (checkoutMode === "direct") setInterval("month");
    setError(null);
  }, [checkoutMode, directTier, open]);

  useEffect(() => {
    checkoutIdempotencyKeyRef.current = null;
  }, [checkoutInterval, checkoutTier]);

  useEffect(() => {
    if (checkoutOrgIdRef.current === orgId) return;
    checkoutOrgIdRef.current = orgId;
    resetCheckout();
  }, [orgId, resetCheckout]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && (creatingSession || paymentSubmitting)) return;
    if (!nextOpen && checkoutMode === "review") resetCheckout();
    if (!nextOpen && checkoutMode === "direct") {
      setPaymentSubmitting(false);
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  const startCheckout = useCallback(async () => {
    if (creatingSession || clientSecret) return;
    if (!stripePromise) {
      setError("Checkout is not configured yet. Please contact support.");
      return;
    }
    if (!orgId) {
      setError("We couldn't identify this organization. Refresh and try again.");
      return;
    }

    setCreatingSession(true);
    setError(null);

    try {
      if (!checkoutIdempotencyKeyRef.current) {
        checkoutIdempotencyKeyRef.current =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Checkout-Idempotency-Key": checkoutIdempotencyKeyRef.current,
        },
        body: JSON.stringify({
          tier: checkoutTier,
          interval: checkoutInterval,
          orgId,
        }),
      });

      const contentType = response.headers.get("content-type") || "";
      const data: CheckoutResponse = contentType.includes("application/json")
        ? await response.json()
        : { error: "Checkout returned an unexpected response. Please try again." };

      if (!response.ok || !data.clientSecret || !data.sessionId) {
        throw new Error(data.error || "Secure checkout could not be started.");
      }

      sessionStorage.setItem(
        `cencori:stripe-checkout:${data.sessionId}`,
        checkoutTier,
      );
      setClientSecret(data.clientSecret);
      setSessionId(data.sessionId);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Secure checkout could not be started.",
      );
    } finally {
      setCreatingSession(false);
    }
  }, [checkoutInterval, checkoutTier, clientSecret, creatingSession, orgId]);

  useEffect(() => {
    if (!open && !preload) return;
    if (checkoutMode !== "direct" || directCheckoutStartedRef.current) return;
    directCheckoutStartedRef.current = true;
    void startCheckout();
  }, [checkoutMode, open, preload, startCheckout]);

  const checkoutOptions = useMemo(
    () =>
      clientSecret
        ? {
            clientSecret,
            elementsOptions: {
              appearance: {
                theme: resolvedTheme === "light" ? ("stripe" as const) : ("night" as const),
                variables: {
                  colorPrimary: resolvedTheme === "light" ? "#111111" : "#ffffff",
                  colorBackground: resolvedTheme === "light" ? "#ffffff" : "#050505",
                  colorText: resolvedTheme === "light" ? "#111111" : "#f5f5f5",
                  colorDanger: "#ef4444",
                  borderRadius: "6px",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSizeBase: "13px",
                  spacingUnit: "4px",
                },
              },
            },
          }
        : null,
    [clientSecret, resolvedTheme],
  );

  const checkoutSheet = (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-hidden border-border/60 p-0 shadow-2xl sm:max-w-[36rem]"
      >
        <SheetHeader className="border-b border-border/50 px-5 pb-5 pt-6 sm:px-7 sm:pt-7">
          <div className="mb-4 flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg border border-border/60 bg-secondary/30">
              <Logo variant="mark" className="h-3.5" />
            </div>
            <div>
              <p className="text-xs font-medium text-foreground">Cencori checkout</p>
              <p className="text-[11px] text-muted-foreground">
                {checkoutMode === "direct" || clientSecret ? "Secure payment" : "Plan review"}
              </p>
            </div>
          </div>

          <div className="flex items-start justify-between gap-6 pr-7">
            <SheetTitle className="max-w-sm text-xl font-semibold tracking-[-0.025em] text-balance">
              Upgrade {organizationLabel} to {plan.name}
            </SheetTitle>
            {checkoutMode === "direct" && (
              <div className="shrink-0 text-right">
                <p className="font-mono text-xl font-semibold tracking-[-0.04em] tabular-nums">
                  {formatCents(dueNow)}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">per month</p>
              </div>
            )}
          </div>
          <SheetDescription className="max-w-md text-xs leading-5">
            {checkoutMode === "direct"
              ? "Your subscription starts after payment confirmation and renews monthly."
              : "Review the plan, then enter your payment details without leaving Cencori."}
          </SheetDescription>

          {reason && (
            <div className="mt-3 rounded-md border border-border/50 bg-secondary/25 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
              {reason}
            </div>
          )}
        </SheetHeader>

        {checkoutOptions && sessionId ? (
          <PaymentForm
            error={error}
            orgSlug={orgSlug}
            paymentFirst={checkoutMode === "direct"}
            sessionId={sessionId}
            onError={setError}
            onSubmittingChange={setPaymentSubmitting}
          >
            <CheckoutDetails
                availablePlans={availablePlans}
                checkoutMode={checkoutMode}
                clientSecret={clientSecret}
                dueNow={dueNow}
                interval={interval}
                monthlyEquivalent={monthlyEquivalent}
                plan={plan}
                selectedTier={selectedTier}
                setInterval={setInterval}
                setSelectedTier={setSelectedTier}
            />
          </PaymentForm>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="space-y-7 px-5 py-6 sm:px-7">
                {creatingSession && checkoutMode === "direct" && (
                  <PaymentFormSkeleton />
                )}

                <CheckoutDetails
                  availablePlans={availablePlans}
                  checkoutMode={checkoutMode}
                  clientSecret={clientSecret}
                  dueNow={dueNow}
                  interval={interval}
                  monthlyEquivalent={monthlyEquivalent}
                  plan={plan}
                  selectedTier={selectedTier}
                  setInterval={setInterval}
                  setSelectedTier={setSelectedTier}
                />

                {creatingSession && checkoutMode === "review" && (
                  <PaymentFormSkeleton bordered />
                )}

                {error && <CheckoutError message={error} />}
              </div>
            </div>

            <SheetFooter className="gap-3 border-t border-border/50 bg-background px-5 py-5 sm:px-7">
              <Button
                type="button"
                size="sm"
                className="h-10 w-full rounded-md text-xs font-medium transition-transform active:scale-[0.99]"
                onClick={startCheckout}
                disabled={creatingSession || availablePlans.length === 0}
              >
                {creatingSession ? (
                  checkoutMode === "review" ? "Continue to payment" : "Upgrade"
                ) : checkoutMode === "review" ? (
                  <>
                    Continue to payment
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </>
                ) : (
                  "Try again"
                )}
              </Button>
              <SecureCheckoutNotice />
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );

  if (checkoutOptions && sessionId) {
    return (
      <CheckoutElementsProvider
        key={clientSecret}
        stripe={stripePromise}
        options={checkoutOptions}
      >
        {checkoutSheet}
      </CheckoutElementsProvider>
    );
  }

  return checkoutSheet;
}

function CheckoutDetails({
  availablePlans,
  checkoutMode,
  clientSecret,
  dueNow,
  interval,
  monthlyEquivalent,
  plan,
  selectedTier,
  setInterval,
  setSelectedTier,
}: {
  availablePlans: PaidPlanTier[];
  checkoutMode: "review" | "direct";
  clientSecret: string | null;
  dueNow: number;
  interval: PlanBillingInterval;
  monthlyEquivalent: number;
  plan: (typeof CENCORI_PAID_PLANS)[PaidPlanTier];
  selectedTier: PaidPlanTier;
  setInterval: (interval: PlanBillingInterval) => void;
  setSelectedTier: (tier: PaidPlanTier) => void;
}) {
  const selectedInterval = checkoutMode === "direct" ? "month" : interval;

  if (checkoutMode === "direct") {
    return (
      <section
        aria-labelledby="plan-summary-heading"
        className="-mx-5 border-t border-border/50 px-5 pt-6 sm:-mx-7 sm:px-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id="plan-summary-heading" className="text-xs font-medium">
              Your {plan.name} plan
            </h3>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              {plan.description}
            </p>
          </div>
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Monthly
          </span>
        </div>

        <dl className="-mx-5 mt-6 border-t border-border/50 text-xs sm:-mx-7">
          <div className="flex items-center justify-between gap-4 border-b border-border/40 px-5 py-4 sm:px-7">
            <dt className="text-muted-foreground">{plan.name} plan</dt>
            <dd className="font-mono tabular-nums">{formatCents(dueNow)}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 border-b border-border/40 px-5 py-4 sm:px-7">
            <dt className="text-muted-foreground">Billing cycle</dt>
            <dd>Monthly</dd>
          </div>
          <div className="flex items-center justify-between gap-4 border-b border-border/50 px-5 py-4 sm:px-7">
            <dt className="text-muted-foreground">Renewal</dt>
            <dd>Automatic until canceled</dd>
          </div>
          <div className="flex items-end justify-between gap-4 px-5 py-4 sm:px-7">
            <dt>
              <span className="block font-medium">Due today</span>
              <span className="mt-0.5 block text-[10px] text-muted-foreground">
                Taxes, if applicable, are calculated during payment
              </span>
            </dt>
            <dd className="font-mono text-base font-semibold tabular-nums">
              {formatCents(dueNow)}
            </dd>
          </div>
        </dl>
      </section>
    );
  }

  return (
    <>
      {checkoutMode === "review" && (
        <section aria-labelledby="billing-cycle-heading">
          <div className="mb-3 flex items-center justify-between">
            <h3 id="billing-cycle-heading" className="text-xs font-medium">
              Billing cycle
            </h3>
            <span className="text-[11px] text-emerald-500">Two months free annually</span>
          </div>
          <div className="grid grid-cols-2 rounded-md border border-border/60 bg-secondary/20 p-1">
            {(["month", "year"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={interval === value}
                onClick={() => setInterval(value)}
                disabled={Boolean(clientSecret)}
                className={cn(
                  "h-8 rounded text-xs font-medium transition-[background-color,color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 active:scale-[0.99] disabled:cursor-default",
                  interval === value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {value === "month" ? "Monthly" : "Annual"}
              </button>
            ))}
          </div>
        </section>
      )}

      {checkoutMode === "review" && (
        <section aria-labelledby="plan-heading">
          <h3 id="plan-heading" className="mb-3 text-xs font-medium">
            Plan
          </h3>
          <div className={cn("grid gap-2", availablePlans.length > 1 && "sm:grid-cols-2")}>
            {availablePlans.map((tier) => {
              const option = CENCORI_PAID_PLANS[tier];
              const selected = selectedTier === tier;
              const optionMonthly = getMonthlyEquivalentCents(tier, interval);

              return (
                <button
                  key={tier}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedTier(tier)}
                  disabled={Boolean(clientSecret)}
                  className={cn(
                    "group rounded-lg border px-4 py-3.5 text-left transition-[border-color,background-color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 active:scale-[0.99] disabled:cursor-default",
                    selected
                      ? "border-foreground/35 bg-foreground/[0.035]"
                      : "border-border/60 hover:border-border hover:bg-secondary/20",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{option.name}</p>
                      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                        {option.requestLimit.toLocaleString()} requests/month
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-medium tabular-nums">
                        {formatCents(optionMonthly)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">per month</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section aria-labelledby="included-heading">
        <div className="mb-3">
          <h3 id="included-heading" className="text-xs font-medium">
            Included with {plan.name}
          </h3>
          <p className="mt-1 text-[11px] text-muted-foreground">{plan.description}</p>
        </div>
        <ul className="grid gap-x-5 gap-y-2.5 sm:grid-cols-2">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <Check className="mt-1 size-3 shrink-0 text-emerald-500" aria-hidden="true" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="summary-heading" className="border-t border-border/50 pt-6">
        <div className="mb-4 flex items-center gap-2">
          <CreditCard className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <h3 id="summary-heading" className="text-xs font-medium">
            Order summary
          </h3>
        </div>
        <dl className="space-y-3 text-xs">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">{plan.name} plan</dt>
            <dd className="font-mono tabular-nums">
              {formatCents(dueNow)} / {selectedInterval}
            </dd>
          </div>
          {selectedInterval === "year" && (
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Monthly equivalent</dt>
              <dd className="font-mono tabular-nums">{formatCents(monthlyEquivalent)} / month</dd>
            </div>
          )}
          <div className="flex items-end justify-between gap-4 border-t border-border/50 pt-3">
            <dt>
              <span className="block font-medium">Due now</span>
              <span className="mt-0.5 block text-[10px] text-muted-foreground">
                Taxes, if applicable, are calculated during payment
              </span>
            </dt>
            <dd className="font-mono text-base font-semibold tabular-nums">{formatCents(dueNow)}</dd>
          </div>
        </dl>
      </section>
    </>
  );
}

function CheckoutError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-red-500/25 bg-red-500/[0.06] px-3 py-2.5 text-xs leading-5 text-red-500"
    >
      {message}
    </div>
  );
}
