import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabaseServer";
import { hasFeature, type SubscriptionTier } from "@/lib/entitlements";
import { featureGateResponse, requireTierFeatureForOrg } from "@/lib/require-tier-feature";

const TEAM_ONLY_CATEGORIES = new Set(["member", "api_key", "sso"]);
const TEAM_ONLY_TIME_RANGES = new Set(["30d", "90d"]);

function getDevelopmentPreviewTier(url: URL): SubscriptionTier | null {
    if (process.env.NODE_ENV !== "development") return null;
    const previewTier = url.searchParams.get("preview_plan");
    return previewTier === "pro" || previewTier === "team" || previewTier === "enterprise"
        ? previewTier
        : null;
}

function escapeCSV(value: string): string {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

function parseTimeRange(timeRange: string): Date {
    const now = Date.now();
    switch (timeRange) {
        case "1h": return new Date(now - 60 * 60 * 1000);
        case "24h": return new Date(now - 24 * 60 * 60 * 1000);
        case "7d": return new Date(now - 7 * 24 * 60 * 60 * 1000);
        case "30d": return new Date(now - 30 * 24 * 60 * 60 * 1000);
        case "90d": return new Date(now - 90 * 24 * 60 * 60 * 1000);
        case "all": return new Date(0);
        default: return new Date(now - 7 * 24 * 60 * 60 * 1000);
    }
}

async function getOrgWithAccess(orgSlug: string) {
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return { error: "Unauthorized", status: 401 };

    const { data: org } = await supabase
        .from("organizations")
        .select("id, name, slug, subscription_tier")
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

    return { org, user, supabase };
}

// GET — paginated org-level audit logs or CSV/JSON export
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ orgSlug: string }> }
) {
    const { orgSlug } = await params;
    const result = await getOrgWithAccess(orgSlug);
    if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const { org, supabase } = result;
    const url = new URL(req.url);
    const previewTier = getDevelopmentPreviewTier(url);
    const effectiveTier = previewTier
        || (org.subscription_tier || "free") as SubscriptionTier;

    if (!previewTier) {
        const featureGate = await requireTierFeatureForOrg(org.id, "auditLogs");
        if (featureGate) return featureGate;
    }

    const format = url.searchParams.get("format");
    const category = url.searchParams.get("category") || "all";
    const timeRange = url.searchParams.get("time_range") || "7d";
    const search = url.searchParams.get("search") || "";
    const projectId = url.searchParams.get("project_id") || "";
    const page = parseInt(url.searchParams.get("page") || "1");
    const perPage = Math.min(parseInt(url.searchParams.get("per_page") || "50"), 100);

    if (format && !hasFeature(effectiveTier, "auditLogExports")) {
        return featureGateResponse("auditLogExports", "team");
    }
    if (TEAM_ONLY_TIME_RANGES.has(timeRange) && !hasFeature(effectiveTier, "auditLogExtendedHistory")) {
        return featureGateResponse("auditLogExtendedHistory", "team");
    }
    if (timeRange === "all" && !hasFeature(effectiveTier, "auditLogAllTimeHistory")) {
        return featureGateResponse("auditLogAllTimeHistory", "enterprise");
    }
    if (TEAM_ONLY_CATEGORIES.has(category) && !hasFeature(effectiveTier, "auditLogIdentityEvents")) {
        return featureGateResponse("auditLogIdentityEvents", "team");
    }

    const startDate = parseTimeRange(timeRange);

    // Build query
    let query = supabase
        .from("audit_logs")
        .select("*", { count: "exact" })
        .eq("organization_id", org.id)
        .gte("created_at", startDate.toISOString())
        .order("created_at", { ascending: false });

    if (category !== "all") {
        query = query.eq("category", category);
    } else if (!hasFeature(effectiveTier, "auditLogIdentityEvents")) {
        query = query.not("category", "in", "(member,api_key,sso)");
    }
    if (projectId) {
        query = query.eq("project_id", projectId);
    }
    if (search) {
        query = query.ilike("description", `%${search}%`);
    }

    // For exports, fetch all; for UI, paginate
    if (!format) {
        query = query.range((page - 1) * perPage, page * perPage - 1);
    } else {
        query = query.limit(50000);
    }

    const { data: logs, count, error } = await query;

    if (error) {
        console.error("[AuditLogs] Query error:", error);
        return NextResponse.json({ error: "Failed to fetch audit logs" }, { status: 500 });
    }

    const entries = logs || [];

    // CSV export
    if (format === "csv") {
        const rows: string[] = [
            ["Timestamp", "Category", "Action", "Resource Type", "Resource ID", "Project ID", "Actor", "IP Address", "Description", "Metadata"].join(","),
        ];
        for (const log of entries) {
            rows.push([
                escapeCSV(new Date(log.created_at).toISOString()),
                escapeCSV(log.category),
                escapeCSV(log.action),
                escapeCSV(log.resource_type),
                escapeCSV(log.resource_id || "-"),
                escapeCSV(log.project_id || "-"),
                escapeCSV(log.actor_email || log.actor_type || "System"),
                escapeCSV(log.actor_ip || "-"),
                escapeCSV(log.description),
                escapeCSV(log.metadata && Object.keys(log.metadata).length > 0 ? JSON.stringify(log.metadata) : "-"),
            ].join(","));
        }
        const filename = `audit-log-${org.slug}-${timeRange}-${new Date().toISOString().split("T")[0]}.csv`;
        return new NextResponse(rows.join("\n"), {
            headers: {
                "Content-Type": "text/csv",
                "Content-Disposition": `attachment; filename="${filename}"`,
            },
        });
    }

    // JSON export
    if (format === "json") {
        const filename = `audit-log-${org.slug}-${timeRange}-${new Date().toISOString().split("T")[0]}.json`;
        return new NextResponse(
            JSON.stringify({ organization: org.name, exported_at: new Date().toISOString(), logs: entries }, null, 2),
            {
                headers: {
                    "Content-Type": "application/json",
                    "Content-Disposition": `attachment; filename="${filename}"`,
                },
            }
        );
    }

    // Paginated response
    const total = count || 0;
    return NextResponse.json({
        logs: entries,
        pagination: {
            page,
            per_page: perPage,
            total,
            total_pages: Math.ceil(total / perPage),
        },
    });
}
