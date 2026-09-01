import type { User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { createServerClient } from "@/lib/supabaseServer";

export type BasecodePlanCode = "free" | "builder" | "pro" | "enterprise";
export type BasecodePaidPlanCode = Exclude<BasecodePlanCode, "free" | "enterprise">;
export type BasecodePaymentProvider = "flutterwave" | "bachs";
export type BasecodePaymentMethod = "auto" | "opay" | "banktransfer";

const BASECODE_PRODUCTION_ORIGIN = "https://cencori.com";

type Admin = ReturnType<typeof createAdminClient>;

export function resolveBasecodeCheckoutOrigin(
  requestOrigin: string,
  vercelEnvironment: string | undefined = process.env.VERCEL_ENV,
): string {
  if (vercelEnvironment === "production") return BASECODE_PRODUCTION_ORIGIN;
  try {
    return new URL(requestOrigin).origin;
  } catch {
    return "http://localhost:3000";
  }
}

export type BasecodeBillingSession = {
  admin: Admin;
  user: User;
};

export type BasecodeBillingAccount = {
  id: string;
  user_id: string;
  organization_id: string | null;
  plan_code: BasecodePlanCode;
  status: "active" | "past_due" | "cancelled" | "suspended";
  entitlement_starts_at: string | null;
  entitlement_ends_at: string | null;
};

export type BasecodePlanRow = {
  code: BasecodePlanCode;
  name: string;
  price_ngn_minor: number | null;
  price_usd_minor: number | null;
  billing_period_days: number;
  weekly_request_limit: number | null;
  weekly_budget_microusd: number | null;
  model_policy: "auto" | "open_weight" | "frontier" | "custom";
  max_concurrent_turns: number;
  enabled: boolean;
};

function isPaidPlan(value: unknown): value is BasecodePaidPlanCode {
  return value === "builder" || value === "pro";
}

export function parseBasecodeCheckoutInput(value: unknown): {
  paymentMethod: BasecodePaymentMethod;
  plan: BasecodePaidPlanCode;
  provider: BasecodePaymentProvider;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (!isPaidPlan(body.plan)) return null;
  const provider = body.provider === "bachs" ? "bachs" : body.provider === "flutterwave" ? "flutterwave" : null;
  if (!provider) return null;
  const paymentMethod =
    body.paymentMethod === "opay" || body.paymentMethod === "banktransfer"
      ? body.paymentMethod
      : "auto";
  if (provider === "bachs" && paymentMethod !== "auto") return null;
  return { paymentMethod, plan: body.plan, provider };
}

export function majorAmountToMinor(value: unknown): number | null {
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const minor = Math.round(amount * 100);
  return Number.isSafeInteger(minor) ? minor : null;
}

export function effectiveBasecodePlan(
  account: Pick<BasecodeBillingAccount, "plan_code" | "status" | "entitlement_ends_at">,
  now = new Date(),
): BasecodePlanCode {
  if (account.plan_code === "free") return "free";
  const endsAt = account.entitlement_ends_at ? new Date(account.entitlement_ends_at) : null;
  return account.status === "active" && endsAt && endsAt.getTime() > now.getTime()
    ? account.plan_code
    : "free";
}

export async function authenticateBasecodeBillingRequest(
  request: NextRequest,
): Promise<BasecodeBillingSession | null> {
  const authorization = request.headers.get("authorization");
  const admin = createAdminClient();
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice(7).trim();
    if (!token || token.length > 4096) return null;
    const { data, error } = await admin.auth.getUser(token);
    return error || !data.user ? null : { admin, user: data.user };
  }

  const client = await createServerClient();
  const { data, error } = await client.auth.getUser();
  return error || !data.user ? null : { admin, user: data.user };
}

async function findUserOrganizationId(admin: Admin, userId: string): Promise<string | null> {
  const { data: owned } = await admin
    .from("organizations")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (owned?.id) return owned.id as string;

  const { data: membership } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return (membership?.organization_id as string | undefined) ?? null;
}

export async function getOrCreateBasecodeBillingAccount(
  admin: Admin,
  userId: string,
): Promise<BasecodeBillingAccount> {
  const { data: existing, error: readError } = await admin
    .from("basecode_billing_accounts")
    .select("id, user_id, organization_id, plan_code, status, entitlement_starts_at, entitlement_ends_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) throw new Error("Could not load the Basecode billing account.");
  if (existing) return existing as BasecodeBillingAccount;

  const organizationId = await findUserOrganizationId(admin, userId);
  const { data, error } = await admin
    .from("basecode_billing_accounts")
    .upsert(
      { user_id: userId, organization_id: organizationId, plan_code: "free", status: "active" },
      { onConflict: "user_id" },
    )
    .select("id, user_id, organization_id, plan_code, status, entitlement_starts_at, entitlement_ends_at")
    .single();
  if (error || !data) throw new Error("Could not create the Basecode billing account.");
  return data as BasecodeBillingAccount;
}

export async function getBasecodePlan(
  admin: Admin,
  code: BasecodePlanCode,
): Promise<BasecodePlanRow> {
  const { data, error } = await admin
    .from("basecode_plans")
    .select(
      "code, name, price_ngn_minor, price_usd_minor, billing_period_days, weekly_request_limit, weekly_budget_microusd, model_policy, max_concurrent_turns, enabled",
    )
    .eq("code", code)
    .eq("enabled", true)
    .maybeSingle();
  if (error || !data) throw new Error("The selected Basecode plan is unavailable.");
  return data as BasecodePlanRow;
}

export async function getBasecodeBillingSnapshot(admin: Admin, userId: string) {
  const account = await getOrCreateBasecodeBillingAccount(admin, userId);
  const planCode = effectiveBasecodePlan(account);
  const plan = await getBasecodePlan(admin, planCode);
  const now = new Date().toISOString();
  const { data: period, error } = await admin
    .from("basecode_usage_periods")
    .select("starts_at, ends_at, request_limit, requests_used, budget_microusd, cost_used_microusd, cost_reserved_microusd")
    .eq("account_id", account.id)
    .eq("plan_code", planCode)
    .lte("starts_at", now)
    .gt("ends_at", now)
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Could not load Basecode usage.");

  const requestLimit = Number(period?.request_limit ?? plan.weekly_request_limit ?? 0);
  const requestsUsed = Number(period?.requests_used ?? 0);
  const budget = Number(period?.budget_microusd ?? plan.weekly_budget_microusd ?? 0);
  const cost = Number(period?.cost_used_microusd ?? 0) + Number(period?.cost_reserved_microusd ?? 0);
  const rawPercentage = requestLimit > 0 ? (requestsUsed / requestLimit) * 100 : budget > 0 ? (cost / budget) * 100 : 0;

  // Token spend across every device on this account. Deliberately separate from the meter above:
  // the plan is billed on requests and provider cost, never on tokens. Left off entirely when the
  // account has no rows yet, because absent has to read as unknown rather than as zero.
  const { data: tokenTotals, error: tokenError } = await admin.rpc("basecode_account_token_usage", {
    p_user_id: userId,
  });
  if (tokenError) {
    console.error("[Basecode Billing] Account token usage failed", tokenError);
  }
  const tokens = readAccountTokens(tokenTotals);

  return {
    plan: {
      code: plan.code,
      name: plan.name,
      modelPolicy: plan.model_policy,
      renewsAt: planCode === "free" ? null : account.entitlement_ends_at,
      // Both currencies, because nothing here knows which one a given account pays in -- checkout
      // decides that from the payment provider, not from the account. The client picks; a plan
      // priced in neither (enterprise) reports null rather than zero, which would read as free.
      price:
        plan.price_ngn_minor === null && plan.price_usd_minor === null
          ? null
          : {
              ngnMinor: plan.price_ngn_minor,
              periodDays: plan.billing_period_days,
              usdMinor: plan.price_usd_minor,
            },
    },
    usage: {
      percentageUsed: Math.max(0, Math.min(100, Math.round(rawPercentage))),
      resetsAt: period?.ends_at ?? null,
      ...(tokens ? { tokens } : {}),
    },
  };
}

/**
 * The summed figure, only when every field is a real count. Postgres returns bigint sums as
 * strings once they are large, which is exactly the case this has to survive.
 */
function readAccountTokens(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const fields = [
    "totalTokens",
    "inputTokens",
    "cachedInputTokens",
    "cacheWriteInputTokens",
    "outputTokens",
    "reasoningOutputTokens",
  ] as const;
  const tokens = {} as Record<(typeof fields)[number], number>;
  for (const field of fields) {
    const count = Number(source[field]);
    if (!Number.isFinite(count) || count < 0) return null;
    tokens[field] = count;
  }
  return tokens;
}

export function flutterwavePaymentOptions(method: BasecodePaymentMethod): string {
  if (method === "opay") return "opay";
  if (method === "banktransfer") return "banktransfer";
  return "opay,banktransfer,card,ussd";
}

export function basecodeCheckoutReference(id: string): string {
  return `basecode_${id.replaceAll("-", "")}`;
}

export type VerifiedBasecodePayment = {
  provider: BasecodePaymentProvider;
  providerTransactionId: string;
  reference: string;
  amountMinor: number;
  currency: "NGN" | "USD";
  paymentMethod?: string | null;
  paidAt?: string | null;
  providerCustomerId?: string | null;
  providerPayload: Record<string, unknown>;
  planCode?: BasecodePaidPlanCode;
};

export async function applyVerifiedBasecodePayment(
  admin: Admin,
  payment: VerifiedBasecodePayment,
) {
  const { data: checkout, error: checkoutError } = await admin
    .from("basecode_checkout_sessions")
    .select("id, account_id, plan_code, provider, reference, expected_amount_minor, currency, status, expires_at")
    .eq("reference", payment.reference)
    .maybeSingle();
  if (checkoutError || !checkout) throw new Error("Basecode checkout not found.");
  if (checkout.provider !== payment.provider) throw new Error("Payment provider mismatch.");
  if (payment.planCode && checkout.plan_code !== payment.planCode) {
    throw new Error("Payment plan mismatch.");
  }
  if (checkout.currency !== payment.currency) throw new Error("Payment currency mismatch.");
  if (payment.amountMinor < Number(checkout.expected_amount_minor)) {
    throw new Error("Payment amount is below the checkout total.");
  }
  if (checkout.status !== "pending" && checkout.status !== "paid") {
    throw new Error("Basecode checkout is not payable.");
  }

  const { data, error } = await admin.rpc("basecode_apply_verified_payment", {
    p_checkout_session_id: checkout.id,
    p_provider_transaction_id: payment.providerTransactionId,
    p_amount_minor: payment.amountMinor,
    p_currency: payment.currency,
    p_payment_method: payment.paymentMethod ?? null,
    p_paid_at: payment.paidAt ?? new Date().toISOString(),
    p_provider_payload: payment.providerPayload,
  });
  if (error) throw new Error(`Could not apply the Basecode payment: ${error.message}`);

  if (payment.providerCustomerId) {
    const { error: customerError } = await admin.from("basecode_billing_customers").upsert(
      {
        account_id: checkout.account_id,
        provider: payment.provider,
        provider_customer_id: payment.providerCustomerId,
      },
      { onConflict: "account_id,provider" },
    );
    if (customerError) {
      console.error("[Basecode Billing] Could not save provider customer", customerError);
    }
  }

  return data as {
    applied: boolean;
    duplicate?: boolean;
    account_id: string;
    plan?: BasecodePlanCode;
    period_start?: string;
    period_end?: string;
  };
}
