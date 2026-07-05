import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";

export type ScanStandaloneTier = "scan" | "scan_team";
type EntitlementSource = "platform" | "scan_subscription" | "free" | null;
type ScanPlan = "free" | "scan" | "scan_team" | "pro" | "team" | "enterprise";

export const FREE_SCAN_MAX_PROJECTS = 5;
export const FREE_SCAN_MAX_SCANS_PER_PROJECT = 2;

interface OrganizationRow {
    id: string;
    subscription_tier: string | null;
    subscription_status: string | null;
    subscription_id?: string | null;
    polar_customer_id?: string | null;
    bachs_customer_id?: string | null;
}

interface ScanSubscriptionRow {
    scan_tier: ScanStandaloneTier;
    status: string | null;
}

export interface ScanEntitlement {
    hasScanAccess: boolean;
    source: EntitlementSource;
    platformTier: "pro" | "team" | "enterprise" | null;
    scanTier: ScanStandaloneTier | null;
    scanStatus: string | null;
    plan: ScanPlan;
    limits: {
        maxProjects: number | null;
        maxScansPerProject: number | null;
    };
    usage: {
        projectsImported: number | null;
        remainingProjectImports: number | null;
    };
}

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
const PLATFORM_TIERS = new Set(["pro", "team", "enterprise"]);
const PLATFORM_TIER_PRIORITY: Record<"pro" | "team" | "enterprise", number> = {
    pro: 1,
    team: 2,
    enterprise: 3,
};

function normalizeStatus(status: string | null | undefined): string {
    return (status || "active").toLowerCase();
}

function normalizePlatformTier(
    tier: string | null | undefined
): "pro" | "team" | "enterprise" | null {
    const normalized = (tier || "").toLowerCase();
    if (normalized === "pro" || normalized === "team" || normalized === "enterprise") {
        return normalized;
    }
    return null;
}

function isActiveStatus(status: string | null | undefined): boolean {
    return ACTIVE_SUBSCRIPTION_STATUSES.has(normalizeStatus(status));
}

function hasBillingIdentity(org: OrganizationRow): boolean {
    const hasSubscriptionId = typeof org.subscription_id === "string" && org.subscription_id.length > 0;
    const hasPolarCustomerId = typeof org.polar_customer_id === "string" && org.polar_customer_id.length > 0;
    const hasBachsCustomerId = typeof org.bachs_customer_id === "string" && org.bachs_customer_id.length > 0;
    return hasSubscriptionId || hasPolarCustomerId || hasBachsCustomerId;
}

function hasEligiblePlatformAccess(org: OrganizationRow): boolean {
    const tier = normalizePlatformTier(org.subscription_tier);
    if (!tier || !PLATFORM_TIERS.has(tier)) {
        return false;
    }

    if (!isActiveStatus(org.subscription_status)) {
        return false;
    }

    if (tier === "enterprise") {
        return true;
    }

    return hasBillingIdentity(org);
}

function highestPlatformTier(organizations: OrganizationRow[]): "pro" | "team" | "enterprise" | null {
    let best: "pro" | "team" | "enterprise" | null = null;

    for (const org of organizations) {
        if (!hasEligiblePlatformAccess(org)) {
            continue;
        }

        const tier = normalizePlatformTier(org.subscription_tier);
        if (!tier) continue;

        if (!best || PLATFORM_TIER_PRIORITY[tier] > PLATFORM_TIER_PRIORITY[best]) {
            best = tier;
        }
    }

    return best;
}

async function getImportedProjectCount(
    userId: string,
    supabaseAdmin = createAdminClient()
): Promise<number> {
    const { count, error } = await supabaseAdmin
        .from("scan_projects")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);

    if (error) {
        throw new Error(`Failed to resolve imported scan project count: ${error.message}`);
    }

    return count ?? 0;
}

export function hasUnlimitedScanAccess(entitlement: ScanEntitlement): boolean {
    return entitlement.source === "platform" || entitlement.source === "scan_subscription";
}

export async function getScanEntitlementForUser(userId: string): Promise<ScanEntitlement> {
    const supabaseAdmin = createAdminClient();

    const [{ data: ownedOrgs, error: ownedOrgsError }, { data: memberships, error: membershipsError }] = await Promise.all([
        supabaseAdmin
            .from("organizations")
            .select("id, subscription_tier, subscription_status, subscription_id, polar_customer_id, bachs_customer_id")
            .eq("owner_id", userId),
        supabaseAdmin
            .from("organization_members")
            .select("organization_id")
            .eq("user_id", userId),
    ]);

    if (ownedOrgsError) {
        throw new Error(`Failed to resolve owned organizations: ${ownedOrgsError.message}`);
    }
    if (membershipsError) {
        throw new Error(`Failed to resolve organization memberships: ${membershipsError.message}`);
    }

    const organizationMap = new Map<string, OrganizationRow>();
    for (const org of ownedOrgs || []) {
        organizationMap.set(org.id, org as OrganizationRow);
    }

    const membershipOrgIds = Array.from(
        new Set((memberships || []).map((membership) => membership.organization_id).filter((id): id is string => typeof id === "string"))
    );

    if (membershipOrgIds.length > 0) {
        const { data: membershipOrgs, error: membershipOrgsError } = await supabaseAdmin
            .from("organizations")
            .select("id, subscription_tier, subscription_status, subscription_id, polar_customer_id, bachs_customer_id")
            .in("id", membershipOrgIds);

        if (membershipOrgsError) {
            throw new Error(`Failed to resolve membership organizations: ${membershipOrgsError.message}`);
        }

        for (const org of membershipOrgs || []) {
            organizationMap.set(org.id, org as OrganizationRow);
        }
    }

    const platformTier = highestPlatformTier(Array.from(organizationMap.values()));
    if (platformTier) {
        return {
            hasScanAccess: true,
            source: "platform",
            platformTier,
            scanTier: null,
            scanStatus: "active",
            plan: platformTier,
            limits: {
                maxProjects: null,
                maxScansPerProject: null,
            },
            usage: {
                projectsImported: null,
                remainingProjectImports: null,
            },
        };
    }

    const { data: scanSubscription, error: scanSubscriptionError } = await supabaseAdmin
        .from("scan_subscriptions")
        .select("scan_tier, status")
        .eq("user_id", userId)
        .maybeSingle();

    if (scanSubscriptionError) {
        throw new Error(`Failed to resolve scan subscription: ${scanSubscriptionError.message}`);
    }

    const typedScanSubscription = scanSubscription as ScanSubscriptionRow | null;
    if (typedScanSubscription && isActiveStatus(typedScanSubscription.status)) {
        return {
            hasScanAccess: true,
            source: "scan_subscription",
            platformTier: null,
            scanTier: typedScanSubscription.scan_tier,
            scanStatus: typedScanSubscription.status || "active",
            plan: typedScanSubscription.scan_tier,
            limits: {
                maxProjects: null,
                maxScansPerProject: null,
            },
            usage: {
                projectsImported: null,
                remainingProjectImports: null,
            },
        };
    }

    const projectsImported = await getImportedProjectCount(userId, supabaseAdmin);

    return {
        hasScanAccess: true,
        source: "free",
        platformTier: null,
        scanTier: typedScanSubscription?.scan_tier || null,
        scanStatus: typedScanSubscription?.status || null,
        plan: "free",
        limits: {
            maxProjects: FREE_SCAN_MAX_PROJECTS,
            maxScansPerProject: FREE_SCAN_MAX_SCANS_PER_PROJECT,
        },
        usage: {
            projectsImported,
            remainingProjectImports: Math.max(FREE_SCAN_MAX_PROJECTS - projectsImported, 0),
        },
    };
}

interface ScanPaywallOptions {
    error?: string;
    code?: string;
    upgradeUrl?: string;
    limitType?: "project_imports" | "scan_runs_per_project";
    limit?: number;
    used?: number;
    projectId?: string;
}

export function createScanPaywallResponse(
    entitlement: ScanEntitlement,
    options: ScanPaywallOptions = {}
) {
    return NextResponse.json(
        {
            error: options.error || "Scan subscription required",
            code: options.code || "SCAN_SUBSCRIPTION_REQUIRED",
            entitlement,
            upgradeUrl: options.upgradeUrl || "/scan?upgrade=scan",
            ...(options.limitType
                ? {
                    limit: {
                        type: options.limitType,
                        max: options.limit ?? null,
                        used: options.used ?? null,
                        ...(options.projectId ? { projectId: options.projectId } : {}),
                    },
                }
                : {}),
        },
        { status: 402 }
    );
}

export async function getScanPaywallForUser(userId: string): Promise<NextResponse | null> {
    const entitlement = await getScanEntitlementForUser(userId);
    if (entitlement.hasScanAccess) {
        return null;
    }

    return createScanPaywallResponse(entitlement);
}

export async function getScanProjectImportPaywallForUser(userId: string): Promise<NextResponse | null> {
    const entitlement = await getScanEntitlementForUser(userId);

    if (!entitlement.hasScanAccess || hasUnlimitedScanAccess(entitlement)) {
        return entitlement.hasScanAccess ? null : createScanPaywallResponse(entitlement);
    }

    const projectsImported = entitlement.usage.projectsImported ?? await getImportedProjectCount(userId);
    if (projectsImported < FREE_SCAN_MAX_PROJECTS) {
        return null;
    }

    return createScanPaywallResponse(entitlement, {
        error: "Free scan project limit reached",
        code: "SCAN_FREE_PROJECT_LIMIT_REACHED",
        limitType: "project_imports",
        limit: FREE_SCAN_MAX_PROJECTS,
        used: projectsImported,
    });
}

export async function getScanRunPaywallForProject(
    userId: string,
    projectId: string
): Promise<NextResponse | null> {
    const entitlement = await getScanEntitlementForUser(userId);

    if (!entitlement.hasScanAccess || hasUnlimitedScanAccess(entitlement)) {
        return entitlement.hasScanAccess ? null : createScanPaywallResponse(entitlement);
    }

    const supabaseAdmin = createAdminClient();
    const { count, error } = await supabaseAdmin
        .from("scan_runs")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId);

    if (error) {
        throw new Error(`Failed to resolve scan run count: ${error.message}`);
    }

    const scansUsed = count ?? 0;
    if (scansUsed < FREE_SCAN_MAX_SCANS_PER_PROJECT) {
        return null;
    }

    return createScanPaywallResponse(entitlement, {
        error: "Free scan run limit reached for this project",
        code: "SCAN_FREE_SCAN_LIMIT_REACHED",
        limitType: "scan_runs_per_project",
        limit: FREE_SCAN_MAX_SCANS_PER_PROJECT,
        used: scansUsed,
        projectId,
    });
}
