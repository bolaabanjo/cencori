import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabaseServer";
import { createSSOProvider, deleteSSOProvider, updateSSOProvider } from "@/lib/supabase-sso";
import { writeAuditLogAsync } from "@/lib/audit-log";

async function getOrgAsOwnerOrAdmin(orgSlug: string) {
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return { error: "Not authenticated", status: 401 };

    const { data: org } = await supabase
        .from("organizations")
        .select("id, name, slug, owner_id, sso_enabled, sso_provider_id, sso_domain, sso_enforce, sso_configured_at, subscription_tier")
        .eq("slug", orgSlug)
        .single();

    if (!org) return { error: "Organization not found", status: 404 };

    const { data: membership } = await supabase
        .from("organization_members")
        .select("role")
        .eq("organization_id", org.id)
        .eq("user_id", user.id)
        .maybeSingle();

    const isOwner = org.owner_id === user.id;
    if (!isOwner && (!membership || !["owner", "admin"].includes(membership.role))) {
        return { error: "Insufficient permissions", status: 403 };
    }

    return { org, user };
}

// GET — fetch SSO configuration
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ orgSlug: string }> }
) {
    const { orgSlug } = await params;
    const result = await getOrgAsOwnerOrAdmin(orgSlug);
    if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const { org } = result;
    return NextResponse.json({
        sso_enabled: org.sso_enabled,
        sso_domain: org.sso_domain,
        sso_enforce: org.sso_enforce,
        sso_provider_id: org.sso_provider_id,
        sso_configured_at: org.sso_configured_at,
        subscription_tier: org.subscription_tier,
    });
}

// POST — configure SSO
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ orgSlug: string }> }
) {
    const { orgSlug } = await params;
    const result = await getOrgAsOwnerOrAdmin(orgSlug);
    if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const { org, user } = result;

    if (!["enterprise", "team"].includes(org.subscription_tier || "")) {
        return NextResponse.json(
            { error: "SSO is available on Team and Enterprise plans" },
            { status: 403 }
        );
    }

    const body = await req.json();
    const metadata_url = typeof body.metadata_url === "string" ? body.metadata_url.trim() : "";
    const metadata_xml = typeof body.metadata_xml === "string" ? body.metadata_xml.trim() : "";
    const domain = typeof body.domain === "string" ? body.domain.trim().toLowerCase().replace(/^@/, "") : "";

    const domainPattern = /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
    if (!domainPattern.test(domain)) {
        return NextResponse.json({ error: "A valid SSO email domain is required" }, { status: 400 });
    }
    if (!metadata_url && !metadata_xml) {
        return NextResponse.json(
            { error: "Either metadata_url or metadata_xml is required" },
            { status: 400 }
        );
    }

    if (metadata_url) {
        try {
            const parsedMetadataUrl = new URL(metadata_url);
            if (parsedMetadataUrl.protocol !== "https:") throw new Error("invalid protocol");
        } catch {
            return NextResponse.json({ error: "Metadata URL must be a valid HTTPS URL" }, { status: 400 });
        }
    }

    if (metadata_xml && metadata_xml.length > 250_000) {
        return NextResponse.json({ error: "Metadata XML must be smaller than 250 KB" }, { status: 400 });
    }

    try {
        // Create new SAML provider via GoTrue REST API
        const providerDetails = {
            domains: [domain],
            ...(metadata_url ? { metadata_url } : { metadata_xml }),
        };

        const isNewProvider = !org.sso_provider_id;
        const provider = org.sso_provider_id
            ? await updateSSOProvider(org.sso_provider_id, providerDetails)
            : await createSSOProvider({ type: "saml", ...providerDetails });

        // Save to organization
        const supabase = await createServerClient();
        const { error: updateError } = await supabase
            .from("organizations")
            .update({
                sso_enabled: true,
                sso_provider_id: provider.id,
                sso_domain: domain,
                sso_configured_at: new Date().toISOString(),
                sso_configured_by: user.id,
            })
            .eq("id", org.id);

        if (updateError) {
            if (isNewProvider) await deleteSSOProvider(provider.id);
            return NextResponse.json({ error: "Failed to save SSO configuration" }, { status: 500 });
        }

        await writeAuditLogAsync({
            organizationId: org.id,
            category: 'sso',
            action: 'configured',
            resourceType: 'sso_provider',
            resourceId: provider.id,
            actorId: user.id,
            actorEmail: user.email ?? null,
            actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
            description: `SSO configured for domain ${domain}`,
            metadata: { domain, providerId: provider.id },
        }).catch(() => undefined);

        return NextResponse.json({
            sso_enabled: true,
            sso_provider_id: provider.id,
            sso_domain: domain,
        });
    } catch (err: unknown) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to configure SSO" },
            { status: 500 }
        );
    }
}

// PATCH — update enforcement
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ orgSlug: string }> }
) {
    const { orgSlug } = await params;
    const result = await getOrgAsOwnerOrAdmin(orgSlug);
    if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const { org, user } = result;
    if (!org.sso_enabled) {
        return NextResponse.json(
            { error: "SSO must be configured first" },
            { status: 400 }
        );
    }

    const body = await req.json();
    if (typeof body.sso_enforce !== "boolean") {
        return NextResponse.json({ error: "sso_enforce must be a boolean" }, { status: 400 });
    }
    if (body.sso_enforce && !["enterprise", "team"].includes(org.subscription_tier || "")) {
        return NextResponse.json(
            { error: "SSO enforcement is available on Team and Enterprise plans" },
            { status: 403 }
        );
    }
    const supabase = await createServerClient();
    const { error } = await supabase
        .from("organizations")
        .update({ sso_enforce: body.sso_enforce })
        .eq("id", org.id);

    if (error) {
        return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    await writeAuditLogAsync({
        organizationId: org.id,
        category: 'sso',
        action: body.sso_enforce ? 'enforced' : 'updated',
        resourceType: 'sso_enforcement',
        resourceId: org.sso_provider_id,
        actorId: user.id,
        actorEmail: user.email ?? null,
        actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        description: `SSO enforcement ${body.sso_enforce ? 'enabled' : 'disabled'}`,
        metadata: { ssoEnforce: body.sso_enforce },
    }).catch(() => undefined);

    return NextResponse.json({ sso_enforce: body.sso_enforce });
}

// DELETE — remove SSO
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ orgSlug: string }> }
) {
    const { orgSlug } = await params;
    const result = await getOrgAsOwnerOrAdmin(orgSlug);
    if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const { org, user } = result;
    if (!org.sso_provider_id) {
        return NextResponse.json({ error: "No SSO configured" }, { status: 400 });
    }

    const supabase = await createServerClient();
    const { error: updateError } = await supabase
        .from("organizations")
        .update({
            sso_enabled: false,
            sso_provider_id: null,
            sso_domain: null,
            sso_enforce: false,
            sso_configured_at: null,
            sso_configured_by: null,
        })
        .eq("id", org.id);

    if (updateError) {
        return NextResponse.json({ error: "Failed to remove SSO configuration" }, { status: 500 });
    }

    // Disable the organization first. If provider cleanup fails, members can
    // still sign in normally and the orphan can be removed administratively.
    try { await deleteSSOProvider(org.sso_provider_id); } catch {}

    await writeAuditLogAsync({
        organizationId: org.id,
        category: "sso",
        action: "removed",
        resourceType: "sso_provider",
        resourceId: org.sso_provider_id,
        actorId: user.id,
        actorEmail: user.email ?? null,
        actorIp: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
        description: `SSO configuration removed for domain ${org.sso_domain || "unknown"}`,
        metadata: { domain: org.sso_domain },
    }).catch(() => undefined);

    return NextResponse.json({ sso_enabled: false });
}
