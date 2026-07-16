import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { isPaidPlanTier, type PaidPlanTier } from "@/lib/billing/plans";
import {
  buildStripeOrganizationSubscriptionUpdate,
  type StripeSubscriptionSnapshot,
} from "@/lib/billing/stripe-subscription-reconciliation";
import {
  getStripeBillingClient,
  getStripeBillingWebhookSecret,
  getStripePlanFromPriceId,
} from "@/lib/stripe-billing";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type AdminClient = ReturnType<typeof createAdminClient>;

function getExpandableId(
  value: string | { id: string } | null | undefined,
): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function getSubscriptionPeriod(subscription: Stripe.Subscription) {
  const firstItem = subscription.items.data[0];
  return {
    start: firstItem?.current_period_start
      ? new Date(firstItem.current_period_start * 1_000).toISOString()
      : null,
    end: firstItem?.current_period_end
      ? new Date(firstItem.current_period_end * 1_000).toISOString()
      : null,
  };
}

function getSubscriptionTier(subscription: Stripe.Subscription): PaidPlanTier | null {
  const priceId = subscription.items.data[0]?.price.id;
  const configuredPlan = priceId ? getStripePlanFromPriceId(priceId) : null;
  if (configuredPlan) return configuredPlan.tier;

  return isPaidPlanTier(subscription.metadata.tier)
    ? subscription.metadata.tier
    : null;
}

function toSubscriptionSnapshot(
  subscription: Stripe.Subscription,
): StripeSubscriptionSnapshot {
  const customerId = getExpandableId(subscription.customer);
  if (!customerId) {
    throw new Error(`Subscription ${subscription.id} has no Stripe customer`);
  }

  const period = getSubscriptionPeriod(subscription);
  return {
    subscriptionId: subscription.id,
    customerId,
    status: subscription.status,
    tier: getSubscriptionTier(subscription),
    currentPeriodStart: period.start,
    currentPeriodEnd: period.end,
  };
}

async function resolveOrganizationId(
  admin: AdminClient,
  subscription: Stripe.Subscription,
  customerId: string,
): Promise<string | null> {
  const metadataOrgId = subscription.metadata.org_id?.trim();
  if (metadataOrgId) {
    const { data } = await admin
      .from("organizations")
      .select("id")
      .eq("id", metadataOrgId)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  const { data, error } = await admin
    .from("organizations")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (error) {
    throw new Error(`Organization lookup failed: ${error.message}`);
  }

  return data?.id ?? null;
}

async function reconcileSubscription(
  admin: AdminClient,
  subscription: Stripe.Subscription,
) {
  const snapshot = toSubscriptionSnapshot(subscription);
  const update = buildStripeOrganizationSubscriptionUpdate(snapshot);
  if (!update) {
    throw new Error(
      `Subscription ${subscription.id} uses an unrecognized Stripe price`,
    );
  }

  const organizationId = await resolveOrganizationId(
    admin,
    subscription,
    snapshot.customerId,
  );
  if (!organizationId) {
    throw new Error(
      `No organization found for Stripe subscription ${subscription.id}`,
    );
  }

  const { error } = await admin
    .from("organizations")
    .update(update)
    .eq("id", organizationId);

  if (error) {
    throw new Error(`Subscription reconciliation failed: ${error.message}`);
  }
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  return getExpandableId(invoice.parent?.subscription_details?.subscription);
}

async function getEventSubscription(
  event: Stripe.Event,
  stripe: Stripe,
): Promise<Stripe.Subscription | null> {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return event.data.object;

    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      const subscriptionId = getExpandableId(session.subscription);
      return subscriptionId
        ? stripe.subscriptions.retrieve(subscriptionId)
        : null;
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      const subscriptionId = getInvoiceSubscriptionId(event.data.object);
      return subscriptionId
        ? stripe.subscriptions.retrieve(subscriptionId)
        : null;
    }

    default:
      return null;
  }
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
  }

  const rawBody = await req.text();
  const stripe = getStripeBillingClient();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      getStripeBillingWebhookSecret(),
    );
  } catch (error) {
    console.error("[Stripe Billing Webhook] Signature verification failed:", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: existing, error: existingError } = await admin
    .from("webhook_events")
    .select("id")
    .eq("event_id", event.id)
    .maybeSingle();

  if (existingError) {
    console.error("[Stripe Billing Webhook] Deduplication lookup failed:", existingError);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
  if (existing) {
    return NextResponse.json({ received: true });
  }

  try {
    const subscription = await getEventSubscription(event, stripe);
    if (subscription) {
      await reconcileSubscription(admin, subscription);
    }

    const checkoutId = event.type.startsWith("checkout.session.")
      ? (event.data.object as Stripe.Checkout.Session).id
      : null;

    const { error: insertError } = await admin.from("webhook_events").insert({
      event_id: event.id,
      event_type: event.type,
      charge_id: null,
      checkout_id: checkoutId,
      processed_at: new Date().toISOString(),
    });

    if (insertError && insertError.code !== "23505") {
      throw new Error(`Could not record webhook event: ${insertError.message}`);
    }
  } catch (error) {
    console.error("[Stripe Billing Webhook] Processing failed:", error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
