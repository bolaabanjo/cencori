import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabaseServer";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { writeAuditLog, getAuditActor } from "@/lib/audit-log";

async function getOrgAsAdmin(orgSlug: string) {
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return { error: "Not authenticated", status: 401 };

    const { data: org } = await supabase
        .from("organizations")
        .select("id, name, slug")
        .eq("slug", orgSlug)
        .single();

    if (!org) return { error: "Organization not found", status: 404 };

    const { data: membership } = await supabase
        .from("organization_members")
        .select("role")
        .eq("organization_id", org.id)
        .eq("user_id", user.id)
        .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
        return { error: "Insufficient permissions", status: 403 };
    }

    return { org, user };
}

// GET — get Stripe Connect account status
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ orgSlug: string }> }
) {
    const { orgSlug } = await params;
    const result = await getOrgAsAdmin(orgSlug);
    if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const admin = createAdminClient();
    const { data } = await admin
        .from("stripe_connect_accounts")
        .select("*")
        .eq("organization_id", result.org.id)
        .single();

    if (!data) {
        return NextResponse.json({ connected: false });
    }

    return NextResponse.json({
        connected: true,
        status: data.status,
        charges_enabled: data.charges_enabled,
        payouts_enabled: data.payouts_enabled,
        onboarding_completed: data.onboarding_completed,
        stripe_account_id: data.stripe_account_id,
    });
}

// POST — create Stripe Connect account and get onboarding URL
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ orgSlug: string }> }
) {
    const { orgSlug } = await params;
    const result = await getOrgAsAdmin(orgSlug);
    if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
    }

    try {
        const { createConnectAccount } = await import("@/lib/stripe-connect");
        const body = await req.json();
        const returnUrl = body.return_url || `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${orgSlug}/billing/stripe-connect`;
        const refreshUrl = body.refresh_url || returnUrl;

        const { accountId, onboardingUrl } = await createConnectAccount(
            result.org.id,
            returnUrl,
            refreshUrl
        );

        writeAuditLog({
            organizationId: result.org.id,
            category: "billing",
            action: "created",
            resourceType: "stripe_connect_account",
            resourceId: accountId,
            description: `Stripe Connect account created`,
            ...getAuditActor(result.user),
        });

        return NextResponse.json({
            stripe_account_id: accountId,
            onboarding_url: onboardingUrl,
        });
    } catch (error) {
        console.error("[StripeConnect] Failed to create account:", error);
        return NextResponse.json(
            { error: "Failed to create Stripe Connect account" },
            { status: 500 }
        );
    }
}
