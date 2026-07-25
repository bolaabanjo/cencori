import { NextRequest, NextResponse } from "next/server";
import { getStripeBillingClient } from "@/lib/stripe-billing";
import { upsertStripeCustomerProfile } from "@/lib/billing/stripe-customer-profile";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { createServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SetupRequestBody = {
  orgSlug?: unknown;
  requestId?: unknown;
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: SetupRequestBody;
    try {
      body = (await req.json()) as SetupRequestBody;
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const orgSlug = typeof body.orgSlug === "string" ? body.orgSlug.trim() : "";
    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    if (!orgSlug || !/^[a-zA-Z0-9_-]{16,100}$/.test(requestId)) {
      return NextResponse.json(
        { error: "A valid organization and request identifier are required" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const { data: organization, error: orgError } = await admin
      .from("organizations")
      .select("id, slug, name, owner_id, billing_email, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip, billing_country, stripe_customer_id")
      .eq("slug", orgSlug)
      .maybeSingle();

    if (orgError || !organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    let canManageBilling = organization.owner_id === user.id;
    if (!canManageBilling) {
      const { data: membership, error: membershipError } = await admin
        .from("organization_members")
        .select("role")
        .eq("organization_id", organization.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (membershipError) {
        console.error("[Payment Method Setup] Permission lookup failed:", membershipError);
        return NextResponse.json(
          { error: "Could not verify billing permissions" },
          { status: 500 },
        );
      }

      canManageBilling = membership?.role === "owner" || membership?.role === "admin";
    }

    if (!canManageBilling) {
      return NextResponse.json(
        { error: "Only organization owners and admins can add payment methods" },
        { status: 403 },
      );
    }

    const stripe = getStripeBillingClient();
    const customer = await upsertStripeCustomerProfile({
      customerId: organization.stripe_customer_id as string | null,
      organizationId: organization.id,
      organizationSlug: organization.slug,
      name: organization.name,
      email: organization.billing_email || user.email || "",
      address: {
        line1: organization.billing_address_line1 || "",
        line2: organization.billing_address_line2 || "",
        city: organization.billing_city || "",
        state: organization.billing_state || "",
        postalCode: organization.billing_zip || "",
        country: organization.billing_country || "",
      },
    });
    const customerId = customer.id;

    if (!organization.stripe_customer_id) {

      const { error: customerUpdateError } = await admin
        .from("organizations")
        .update({ stripe_customer_id: customerId })
        .eq("id", organization.id);

      if (customerUpdateError) {
        console.error(
          "[Payment Method Setup] Failed to save Stripe customer:",
          customerUpdateError,
        );
        return NextResponse.json(
          { error: "Could not prepare the billing profile" },
          { status: 500 },
        );
      }
    }

    const setupIntent = await stripe.setupIntents.create(
      {
        customer: customerId,
        payment_method_types: ["card"],
        usage: "off_session",
        metadata: {
          org_id: organization.id,
          org_slug: organization.slug,
          purpose: "saved_payment_method",
        },
      },
      {
        idempotencyKey: `cencori-payment-method-${organization.id}-${requestId}`,
      },
    );

    if (!setupIntent.client_secret) {
      throw new Error("Stripe did not return a SetupIntent client secret");
    }

    return NextResponse.json(
      { clientSecret: setupIntent.client_secret },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[Payment Method Setup] SetupIntent creation failed:", error);
    return NextResponse.json(
      { error: "Payment setup is temporarily unavailable. Please try again." },
      { status: 502 },
    );
  }
}
