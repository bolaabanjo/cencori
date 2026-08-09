import { describe, expect, it } from "vitest";

import { hasFeature } from "@/lib/entitlements";
import { featureGateResponse } from "@/lib/require-tier-feature";

describe("subscription entitlements", () => {
    it.each([
        "security",
        "piiMasking",
        "customDataRules",
        "outputScanning",
        "securityIncidents",
        "auditTrails",
    ] as const)("reserves %s for paid plans", (feature) => {
        expect(hasFeature("free", feature)).toBe(false);
        expect(hasFeature("pro", feature)).toBe(true);
        expect(hasFeature("team", feature)).toBe(true);
        expect(hasFeature("enterprise", feature)).toBe(true);
    });

    it("gates team collaboration from the free tier", () => {
        expect(hasFeature("free", "teams")).toBe(false);
    });

    it.each(["pro", "team", "enterprise"] as const)(
        "includes team collaboration on the %s tier",
        (tier) => {
            expect(hasFeature(tier, "teams")).toBe(true);
        },
    );

    it("keeps governance readable while gating governance controls from Free", () => {
        expect(hasFeature("free", "governanceControls")).toBe(false);
    });

    it("keeps organization-wide governance controls locked on Pro", () => {
        expect(hasFeature("pro", "governanceControls")).toBe(false);
    });

    it.each(["team", "enterprise"] as const)(
        "includes governance controls on the %s tier",
        (tier) => {
            expect(hasFeature(tier, "governanceControls")).toBe(true);
        },
    );

    it("gates organization audit logs from the free tier", () => {
        expect(hasFeature("free", "auditLogs")).toBe(false);
    });

    it.each(["pro", "team", "enterprise"] as const)(
        "includes organization audit logs on the %s tier",
        (tier) => {
            expect(hasFeature(tier, "auditLogs")).toBe(true);
        },
    );

    it.each(["auditLogIdentityEvents", "auditLogExtendedHistory", "auditLogExports"] as const)(
        "reserves %s for Team and Enterprise",
        (feature) => {
            expect(hasFeature("free", feature)).toBe(false);
            expect(hasFeature("pro", feature)).toBe(false);
            expect(hasFeature("team", feature)).toBe(true);
            expect(hasFeature("enterprise", feature)).toBe(true);
        },
    );

    it.each([
        "auditLogAllTimeHistory",
        "auditLogApiAccess",
        "auditLogSiemStreaming",
        "auditLogComplianceArchives",
        "governanceCustomFrameworks",
        "governanceAdvancedEvidence",
        "governanceBespokeControls",
    ] as const)("reserves %s for Enterprise", (feature) => {
        expect(hasFeature("free", feature)).toBe(false);
        expect(hasFeature("pro", feature)).toBe(false);
        expect(hasFeature("team", feature)).toBe(false);
        expect(hasFeature("enterprise", feature)).toBe(true);
    });

    it("returns the standard API contract for a gated audit-log request", async () => {
        const response = featureGateResponse("auditLogs");

        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toMatchObject({
            error: "Organization audit log requires a paid plan",
            code: "FEATURE_NOT_INCLUDED",
            required_tier: "pro",
            upgrade_url: "/billing",
        });
    });

    it("returns the standard API contract for a gated governance action", async () => {
        const response = featureGateResponse("governanceControls", "team");

        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toMatchObject({
            error: "Governance control access requires the Team or Enterprise plan",
            code: "FEATURE_NOT_INCLUDED",
            required_tier: "team",
            upgrade_url: "/billing",
        });
    });

    it("returns a Team-specific API contract for extended audit history", async () => {
        const response = featureGateResponse("auditLogExtendedHistory", "team");

        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toMatchObject({
            error: "Extended audit-log history requires the Team or Enterprise plan",
            code: "FEATURE_NOT_INCLUDED",
            required_tier: "team",
        });
    });

    it("returns an Enterprise-specific API contract for all-time history", async () => {
        const response = featureGateResponse("auditLogAllTimeHistory", "enterprise");

        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toMatchObject({
            error: "All-time audit-log history requires the Enterprise plan",
            code: "FEATURE_NOT_INCLUDED",
            required_tier: "enterprise",
        });
    });

    it("returns an Enterprise-specific API contract for advanced evidence", async () => {
        const response = featureGateResponse("governanceAdvancedEvidence", "enterprise");

        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toMatchObject({
            error: "Advanced governance evidence requires the Enterprise plan",
            code: "FEATURE_NOT_INCLUDED",
            required_tier: "enterprise",
        });
    });
});
