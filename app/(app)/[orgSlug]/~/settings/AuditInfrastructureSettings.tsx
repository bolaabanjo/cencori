import Link from "next/link";
import {
    Archive,
    Blocks,
    Braces,
    Clock3,
    FileSearch2,
    LockKeyhole,
    RadioTower,
    ShieldCheck,
    SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { hasFeature, type SubscriptionTier, type TierFeatures } from "@/lib/entitlements";

interface AuditInfrastructureSettingsProps {
    orgSlug: string;
    tier: SubscriptionTier;
}

interface InfrastructureCapability {
    feature: keyof TierFeatures;
    title: string;
    description: string;
    availableState: string;
    icon: typeof Clock3;
}

const CAPABILITIES: InfrastructureCapability[] = [
    {
        feature: "governanceCustomFrameworks",
        title: "Custom frameworks",
        description: "Map Cencori enforcement and evidence to organization-specific control families and regulatory obligations.",
        availableState: "Contract provisioned",
        icon: Blocks,
    },
    {
        feature: "auditLogAllTimeHistory",
        title: "Custom retention",
        description: "Move beyond Team’s 90-day window with contract-defined retention and legal-hold policies.",
        availableState: "Contract policy",
        icon: Clock3,
    },
    {
        feature: "auditLogApiAccess",
        title: "Audit API",
        description: "Read immutable governance events programmatically with scoped audit.read permissions.",
        availableState: "Available",
        icon: Braces,
    },
    {
        feature: "auditLogSiemStreaming",
        title: "SIEM streaming",
        description: "Provision a continuous event stream for Splunk, Sentinel, Datadog, or a customer endpoint.",
        availableState: "Not connected",
        icon: RadioTower,
    },
    {
        feature: "auditLogComplianceArchives",
        title: "Compliance archives",
        description: "Preserve hash-chained WORM records anchored by independently verifiable signed checkpoints.",
        availableState: "Signed ledger",
        icon: Archive,
    },
    {
        feature: "governanceAdvancedEvidence",
        title: "Advanced evidence",
        description: "Generate regulator-ready proof packs from enforced controls, policy versions, and ledger integrity.",
        availableState: "Available",
        icon: FileSearch2,
    },
    {
        feature: "governanceBespokeControls",
        title: "Bespoke controls",
        description: "Provision contract-specific policy primitives and enforcement behavior for critical workloads.",
        availableState: "Contract provisioned",
        icon: SlidersHorizontal,
    },
];

export function AuditInfrastructureSettings({
    orgSlug,
    tier,
}: AuditInfrastructureSettingsProps) {
    const isEnterprise = tier === "enterprise";

    return (
        <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/30">
            <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-border/35 bg-background/30">
                        <ShieldCheck className="size-4 text-foreground" />
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-sm font-medium">Enterprise audit infrastructure</h2>
                            <span className="rounded-full border border-border/40 bg-background/25 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                                Enterprise
                            </span>
                        </div>
                        <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
                            Custom frameworks, compliance archives, advanced evidence, SIEM integrations, and bespoke controls for regulated operations.
                        </p>
                    </div>
                </div>

                <Button asChild size="sm" className="h-7 self-start px-3 text-xs">
                    <Link href={isEnterprise ? `/${orgSlug}/~/governance` : "/contact/sales"}>
                        {isEnterprise ? "Open governance" : "Talk to enterprise"}
                    </Link>
                </Button>
            </div>

            <div className="divide-y divide-border/30 border-t border-border/30">
                {CAPABILITIES.map((capability) => (
                    <CapabilityRow
                        key={capability.feature}
                        capability={capability}
                        enabled={hasFeature(tier, capability.feature)}
                    />
                ))}
            </div>

            <div className="border-t border-border/30 bg-background/20 px-5 py-3">
                <p className="max-w-2xl text-[11px] leading-5 text-muted-foreground">
                    Enterprise controls are provisioned against the organization’s contract and deployment. Cencori does not present unconfigured delivery pipelines as active infrastructure.
                </p>
            </div>
        </div>
    );
}

function CapabilityRow({
    capability,
    enabled,
}: {
    capability: InfrastructureCapability;
    enabled: boolean;
}) {
    const Icon = capability.icon;

    return (
        <div className="grid min-h-[76px] gap-4 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_150px] sm:items-center">
            <div className="flex min-w-0 items-start gap-3">
                <Icon className={`mt-0.5 size-3.5 shrink-0 ${enabled ? "text-foreground" : "text-muted-foreground/45"}`} />
                <div className="min-w-0">
                    <p className={`text-[13px] font-medium ${enabled ? "text-foreground" : "text-muted-foreground"}`}>
                        {capability.title}
                    </p>
                    <p className="mt-1 max-w-xl text-[11px] leading-5 text-muted-foreground">
                        {capability.description}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-2 sm:justify-end">
                {!enabled && <LockKeyhole className="size-3 text-muted-foreground/45" />}
                <span className={`text-[11px] font-medium ${enabled ? "text-foreground" : "text-muted-foreground/55"}`}>
                    {enabled ? capability.availableState : "Enterprise"}
                </span>
            </div>
        </div>
    );
}
