import { NextRequest, NextResponse } from "next/server";
import { getStripeCheckoutReturnUrl, parseCheckoutSelection } from "@/lib/billing/checkout-contract";
import { getAvailableUpgradePlans } from "@/lib/billing/plans";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { createServerClient } from "@/lib/supabaseServer";
import {
  getStripeBillingClient,
  getStripePlanPriceId,
} from "@/lib/stripe-billing";

type CheckoutRequestBody = {
  orgId?: unknown;
  interval?: unknown;
  tier?: unknown;
};

function getAppBaseUrl(req: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_URL ||
    req.nextUrl.origin
  ).replace(/\/$/, "");
}

function getIdempotencyKey(req: NextRequest, orgId: string): string | undefined {
  const requestKey = req.headers.get("x-checkout-idempotency-key")?.trim();
  if (!requestKey || !/^[a-zA-Z0-9_-]{16,100}$/.test(requestKey)) return undefined;
  return `cencori-plan-${orgId}-${requestKey}`;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: CheckoutRequestBody;
    try {
      body = (await req.json()) as CheckoutRequestBody;
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const orgId = typeof body.orgId === "string" ? body.orgId : null;
    const selection = parseCheckoutSelection(body);
    if (!orgId || !selection) {
      return NextResponse.json(
        { error: "Choose a valid organization, plan, and billing interval" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const { data: organization, error: orgError } = await admin
      .from("organizations")
      .select(
        "id, slug, name, owner_id, billing_email, subscription_tier, subscription_status, subscription_id, billing_provider, stripe_customer_id",
      )
      .eq("id", orgId)
      .maybeSingle();

    if (orgError || !organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    let canManageBilling = organization.owner_id === user.id;
    if (!canManageBilling) {
      const { data: membership, error: membershipError } = await admin
        .from("organization_members")
        .select("role")
        .eq("organization_id", orgId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (membershipError) {
        console.error("[Stripe Checkout] Billing permission lookup failed:", membershipError);
        return NextResponse.json(
          { error: "Could not verify billing permissions" },
          { status: 500 },
        );
      }

      canManageBilling = membership?.role === "owner" || membership?.role === "admin";
    }

    if (!canManageBilling) {
      return NextResponse.json(
        { error: "Only organization owners and admins can change the plan" },
        { status: 403 },
      );
    }

    const currentTier =
      organization.subscription_tier === "pro" || organization.subscription_tier === "team"
        ? organization.subscription_tier
        : "free";

    if (!getAvailableUpgradePlans(currentTier).includes(selection.tier)) {
      return NextResponse.json(
        { error: "This plan is not a valid upgrade for the organization" },
        { status: 409 },
      );
    }

    if (currentTier !== "free") {
      return NextResponse.json(
        { error: "Plan changes for an active subscription must be managed from Billing" },
        { status: 409 },
      );
    }

    const stripe = getStripeBillingClient();
    let stripeCustomerId = organization.stripe_customer_id as string | null;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create(
        {
          email: organization.billing_email || user.email,
          name: user.user_metadata?.full_name || organization.name || user.email.split("@")[0],
          metadata: {
            org_id: organization.id,
            org_slug: organization.slug,
          },
        },
        { idempotencyKey: `cencori-org-${organization.id}-customer` },
      );
      stripeCustomerId = customer.id;

      const { error: customerUpdateError } = await admin
        .from("organizations")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", organization.id);

      if (customerUpdateError) {
        console.error("[Stripe Checkout] Failed to save Stripe customer:", customerUpdateError);
        return NextResponse.json(
          { error: "Could not prepare the billing profile" },
          { status: 500 },
        );
      }
    }

    const metadata = {
      org_id: organization.id,
      org_slug: organization.slug,
      tier: selection.tier,
      interval: selection.interval,
      purchase_type: "subscription",
    };

    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        ui_mode: "custom",
        customer: stripeCustomerId,
        billing_address_collection: "required",
        customer_update: {
          address: "auto",
          name: "auto",
        },
        client_reference_id: organization.id,
        line_items: [
          {
            price: getStripePlanPriceId(selection.tier, selection.interval),
            quantity: 1,
          },
        ],
        payment_method_types: ["card"],
        return_url: getStripeCheckoutReturnUrl(
          getAppBaseUrl(req),
          organization.slug,
        ),
        metadata,
        subscription_data: {
          metadata,
        },
      },
      {
        idempotencyKey: getIdempotencyKey(req, organization.id),
      },
    );

    if (!session.client_secret) {
      throw new Error("Stripe did not return a Checkout Session client secret");
    }

    return NextResponse.json(
      {
        clientSecret: session.client_secret,
        sessionId: session.id,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[Stripe Checkout] Session creation failed:", error);
    return NextResponse.json(
      { error: "Checkout is temporarily unavailable. Please try again." },
      { status: 502 },
    );
  }
}
