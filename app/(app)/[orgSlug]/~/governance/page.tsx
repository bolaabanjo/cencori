"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ShieldAlert, Download, Check, X, ChevronRight, ArrowRight, AlertTriangle, LockKeyhole } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import CheckmarkBadge01Icon from "@hugeicons/core-free-icons/CheckmarkBadge01Icon";
import { FeatureUpgradeWall } from "@/components/billing/FeatureUpgradeWall";
import { hasFeature, type SubscriptionTier, type TierFeatures } from "@/lib/entitlements";
import { supabase } from "@/lib/supabaseClient";

// ── types ────────────────────────────────────────────────────────────────────
interface Predicate { field: string; equals?: unknown; gte?: number; gt?: number; lte?: number; lt?: number; present?: boolean; matches?: string; in?: unknown[] }
interface Rule { name: string; action: string; severity?: string; direction?: string; when?: { all?: Predicate[]; any?: Predicate[] }; params?: Record<string, unknown> }
interface PolicySpec { rules?: Rule[]; controls?: string[] }
interface Health { chain_ok: boolean; entries: number; pending_deadletter: number; complete: boolean }
interface PolicyRow { id: string; name: string; version: number; status: string; spec?: PolicySpec; created_at: string }
interface ChangeRequest { id: string; action_type: string; payload: { policy_id?: string } & Record<string, unknown>; requested_by: string; requested_at: string }
interface TemplateRow { id: string; title: string; description: string; frameworks: string[] }
interface LedgerRow { seq: number; ts: string; event_type: string; decision: string | null; model: string | null; rationale: string | null }
interface Organization { id: string; name: string; subscription_tier: SubscriptionTier }

const FRAMEWORKS = ["CBN-AML", "NDPR", "PCI-DSS", "ISO-42001", "SR-11-7"];

const ENTERPRISE_CAPABILITIES: Array<{
    feature: keyof TierFeatures;
    title: string;
    description: string;
}> = [
    {
        feature: "governanceCustomFrameworks",
        title: "Custom frameworks",
        description: "Organization-specific control families and regulatory mappings.",
    },
    {
        feature: "auditLogComplianceArchives",
        title: "Compliance archives",
        description: "Contract-defined retention, legal hold, and verifiable WORM records.",
    },
    {
        feature: "governanceAdvancedEvidence",
        title: "Advanced evidence",
        description: "Regulator-ready proof generated from enforcement and ledger integrity.",
    },
    {
        feature: "auditLogSiemStreaming",
        title: "SIEM integrations",
        description: "Continuous governance event delivery to external security operations.",
    },
    {
        feature: "governanceBespokeControls",
        title: "Bespoke controls",
        description: "Contract-specific policy primitives for critical AI workloads.",
    },
];

type Tone = "good" | "warn" | "bad" | undefined;
const toneText: Record<NonNullable<Tone>, string> = {
    good: "text-emerald-600 dark:text-emerald-400",
    warn: "text-amber-600 dark:text-amber-400",
    bad: "text-red-600 dark:text-red-400",
};
const tonePill: Record<NonNullable<Tone>, string> = {
    good: "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-600 dark:text-emerald-400",
    warn: "border-amber-500/20 bg-amber-500/[0.06] text-amber-600 dark:text-amber-400",
    bad: "border-red-500/20 bg-red-500/[0.06] text-red-600 dark:text-red-400",
};

// ── human-readable policy rendering ──────────────────────────────────────────
const ACTION_LABEL: Record<string, string> = {
    block: "Block", require_approval: "Require approval", redact: "Redact",
    tokenize: "Tokenize", route: "Route", rate_limit: "Rate limit", allow: "Allow",
};
function actionTone(a: string): Tone {
    if (a === "block") return "bad";
    if (a === "require_approval" || a === "rate_limit" || a === "redact" || a === "tokenize") return "warn";
    if (a === "allow") return "good";
    return undefined;
}
function friendlyField(f: string): string {
    const map: Record<string, string> = {
        "signals.jailbreak_score": "jailbreak score", "signals.prompt_injection": "prompt injection",
        "signals.exfiltration": "data exfiltration", "signals.pci": "PCI data", "signals.toxicity": "toxicity",
        "content": "content", "amount": "amount", "user.region": "region", "region": "region", "model": "model",
    };
    if (map[f]) return map[f];
    if (f.startsWith("signals.pii.")) return `PII: ${f.slice("signals.pii.".length).replace(/_/g, " ")}`;
    if (f.startsWith("signals.")) return f.slice("signals.".length).replace(/_/g, " ");
    return f;
}
function describePredicate(p: Predicate): string {
    const f = friendlyField(p.field);
    if (p.present !== undefined) return `${f} ${p.present ? "present" : "absent"}`;
    if (p.gte !== undefined) return `${f} ≥ ${p.gte}`;
    if (p.gt !== undefined) return `${f} > ${p.gt}`;
    if (p.lte !== undefined) return `${f} ≤ ${p.lte}`;
    if (p.lt !== undefined) return `${f} < ${p.lt}`;
    if (p.matches !== undefined) return `${f} matches /${p.matches}/`;
    if (p.in !== undefined) return `${f} in [${(p.in as unknown[]).join(", ")}]`;
    if (p.equals !== undefined) return `${f} is ${String(p.equals)}`;
    return f;
}
function describeCondition(rule: Rule): string {
    const all = (rule.when?.all ?? []).map(describePredicate);
    const any = (rule.when?.any ?? []).map(describePredicate);
    const parts: string[] = [];
    if (all.length) parts.push(all.join(" and "));
    if (any.length) parts.push(`(${any.join(" or ")})`);
    return parts.join(" and ") || "always";
}

export default function GovernanceConsole({ params }: { params: Promise<{ orgSlug: string }> }) {
    const { orgSlug } = use(params);
    const qc = useQueryClient();
    const [framework, setFramework] = useState(FRAMEWORKS[0]);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [actionError, setActionError] = useState<string | null>(null);

    const { data: org } = useQuery({
        queryKey: ["gov-org", orgSlug],
        queryFn: async () => {
            const { data, error } = await supabase.from("organizations").select("id, name, subscription_tier").eq("slug", orgSlug).single();
            if (error) throw error;
            return {
                ...data,
                subscription_tier: (data.subscription_tier || "free") as SubscriptionTier,
            } as Organization;
        },
    });
    const orgId = org?.id;
    const governanceControlsEnabled = org ? hasFeature(org.subscription_tier, "governanceControls") : false;
    const advancedEvidenceEnabled = org ? hasFeature(org.subscription_tier, "governanceAdvancedEvidence") : false;

    const gov = useMemo(() => async (path: string, init?: RequestInit) => {
        const res = await fetch(`/api/v1/governance/${path}`, {
            ...init,
            headers: { "X-Organization-ID": orgId!, "Content-Type": "application/json", ...(init?.headers || {}) },
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `Request failed (${res.status})`);
        return res.status === 204 ? null : res.json();
    }, [orgId]);

    const enabled = !!orgId;
    const health = useQuery<Health>({ queryKey: ["gov-health", orgId], queryFn: () => gov("health"), enabled });
    const policies = useQuery<{ data: PolicyRow[] }>({ queryKey: ["gov-policies", orgId], queryFn: () => gov("policies"), enabled });
    const requests = useQuery<{ data: ChangeRequest[] }>({ queryKey: ["gov-requests", orgId], queryFn: () => gov("change-requests?status=pending"), enabled });
    const templates = useQuery<{ data: TemplateRow[] }>({ queryKey: ["gov-templates", orgId], queryFn: () => gov("templates"), enabled });
    const ledger = useQuery<{ data: LedgerRow[] }>({ queryKey: ["gov-ledger", orgId], queryFn: () => gov("ledger?limit=15"), enabled });

    const invalidate = (...keys: string[]) => keys.forEach(k => qc.invalidateQueries({ queryKey: [k, orgId] }));

    const install = useMutation({
        mutationFn: (templateId: string) => gov(`templates/${templateId}/install`, { method: "POST", body: "{}" }),
        onSuccess: () => invalidate("gov-policies"),
        onError: (e: Error) => setActionError(e.message),
    });
    const requestActivation = useMutation({
        mutationFn: (policyId: string) => gov(`policies/${policyId}/activate`, { method: "POST", body: "{}" }),
        onSuccess: () => { setActionError(null); invalidate("gov-requests", "gov-policies"); },
        onError: (e: Error) => setActionError(e.message),
    });
    const resolve = useMutation({
        mutationFn: ({ id, decision }: { id: string; decision: "approved" | "rejected" }) =>
            gov(`change-requests/${id}`, { method: "POST", body: JSON.stringify({ decision }) }),
        onSuccess: () => { setActionError(null); invalidate("gov-requests", "gov-policies", "gov-ledger", "gov-health"); },
        onError: (e: Error) => setActionError(e.message),
    });

    async function downloadEvidence() {
        try {
            const pack = await gov(`evidence?framework=${encodeURIComponent(framework)}`);
            const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = `evidence-${framework}-${new Date().toISOString().slice(0, 10)}.json`;
            a.click(); URL.revokeObjectURL(url);
        } catch (e) { setActionError((e as Error).message); }
    }

    const toggle = (id: string) => setExpanded((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });

    const h = health.data;
    const pending = requests.data?.data ?? [];
    const pendingActivationIds = new Set(pending.filter(r => r.action_type === "policy.activate").map(r => r.payload.policy_id));
    const policyById = new Map((policies.data?.data ?? []).map(p => [p.id, p]));

    return (
        <main className="mx-auto w-full max-w-[1120px] px-4 py-8 pb-28 sm:px-6 sm:py-10 lg:px-8">
            <header className="mb-6">
                <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Governance</div>
                <h1 className="mt-3 text-3xl font-medium tracking-[-0.04em]">AI Governance</h1>
                <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                    Policy enforcement, human approvals, and the immutable, verifiable audit ledger for {org?.name ?? "your organization"}.
                </p>
                <a
                    href="/docs/security/governance"
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                    How governance works
                    <ArrowRight className="size-3" />
                </a>
            </header>

            {org && !governanceControlsEnabled && (
                <FeatureUpgradeWall
                    orgSlug={orgSlug}
                    orgId={org.id}
                    orgName={org.name}
                    currentTier={org.subscription_tier}
                    feature="Governance controls"
                    message="Explore governance in read-only mode. Team unlocks organization-wide policies, approvals, and shared governance."
                    variant="inline"
                    className="mb-5"
                    recommendedTier="team"
                    returnPath={`/${orgSlug}/~/governance`}
                />
            )}

            {actionError && (
                <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    <div className="flex-1">{actionError}</div>
                    <button onClick={() => setActionError(null)} className="opacity-60 hover:opacity-100"><X className="size-3.5" /></button>
                </div>
            )}

            {/* Ledger integrity */}
            <Section title="Ledger integrity" desc="Immutable, hash-chained, tamper-evident audit trail of every AI decision.">
                <Card>
                    <div className="flex items-center gap-2.5 bg-muted/50 p-5 sm:p-6">
                        <div>
                            <div className="text-sm font-medium">{h ? (h.complete ? "Complete & verified" : "Attention needed") : "Loading…"}</div>
                            <div className="text-xs text-muted-foreground">Hash-chained · WORM · signed checkpoints</div>
                        </div>
                        {h ? (h.complete
                            ? <HugeiconsIcon icon={CheckmarkBadge01Icon} className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                            : <ShieldAlert className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />)
                            : <div className="size-5" />}
                    </div>
                    <dl className="divide-y divide-border/30 border-t border-border/30 text-xs">
                        <StatRow label="Chain integrity" value={h ? (h.chain_ok ? "valid" : "BROKEN") : "—"} tone={h?.chain_ok ? "good" : h ? "bad" : undefined} />
                        <StatRow label="Ledger entries" value={(h?.entries ?? 0).toLocaleString()} mono />
                        <StatRow label="Pending (dead-letter)" value={(h?.pending_deadletter ?? 0).toLocaleString()} mono tone={(h?.pending_deadletter ?? 0) > 0 ? "warn" : undefined} />
                    </dl>
                </Card>
            </Section>

            {/* Approvals */}
            <Section title="Approvals" desc="Maker-checker queue. Approving your own request is blocked — a different person must sign off.">
                <Card>
                    {pending.length === 0 ? (
                        <div className="p-5 text-xs text-muted-foreground sm:p-6">No pending approvals.</div>
                    ) : (
                        <div className="divide-y divide-border/30 text-xs">
                            {pending.map((r) => {
                                const pol = r.payload.policy_id ? policyById.get(r.payload.policy_id) : undefined;
                                return (
                                    <div key={r.id} className="flex flex-col gap-3 p-4 hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                                {pol && <span className="font-medium">{pol.name}</span>}
                                                <Pill label={r.action_type} />
                                            </div>
                                            <span className="text-muted-foreground">Requested by <span className="font-mono">{r.requested_by.slice(0, 8)}…</span> · {new Date(r.requested_at).toLocaleString()}</span>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                disabled={!governanceControlsEnabled || resolve.isPending}
                                                onClick={() => resolve.mutate({ id: r.id, decision: "approved" })}
                                                className="h-7 rounded-md bg-emerald-500 px-2.5 text-[11px] text-white hover:bg-emerald-600 dark:bg-emerald-500 dark:text-black dark:hover:bg-emerald-400"
                                            >
                                                <Check className="mr-1 size-3" />Approve
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                disabled={!governanceControlsEnabled || resolve.isPending}
                                                onClick={() => resolve.mutate({ id: r.id, decision: "rejected" })}
                                                className="h-7 rounded-md px-2.5 text-[11px] text-red-500 shadow-none hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                                            >
                                                <X className="mr-1 size-3" />Reject
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Card>
            </Section>

            {/* Policies */}
            <Section title="Policies" desc="Click a policy to see exactly what it enforces. Drafts must be activated through maker-checker before they go live.">
                <Card>
                    {policies.data?.data.length ? (
                        <div className="divide-y divide-border/30 text-xs">
                            {policies.data.data.map((p) => {
                                const isOpen = expanded.has(p.id);
                                const isPending = pendingActivationIds.has(p.id);
                                const statusTone: Tone = p.status === "active" ? "good" : isPending ? "warn" : p.status === "draft" ? "warn" : undefined;
                                const statusLabel = p.status === "active" ? "active" : isPending ? "pending approval" : p.status;
                                return (
                                    <div key={p.id}>
                                        <div className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/30 sm:px-6">
                                            <button onClick={() => toggle(p.id)} className="flex flex-1 items-center gap-3 text-left">
                                                <ChevronRight className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
                                                <span className="font-medium">{p.name}</span>
                                                <span className="font-mono tabular-nums text-muted-foreground">v{p.version}</span>
                                                <Pill label={statusLabel} tone={statusTone} />
                                            </button>
                                            {p.status === "draft" && !isPending && (
                                                <Button
                                                    size="sm"
                                                    disabled={!governanceControlsEnabled || requestActivation.isPending}
                                                    onClick={() => requestActivation.mutate(p.id)}
                                                    className="h-7 shrink-0 rounded-md px-2.5 text-[11px]"
                                                >
                                                    Request activation
                                                </Button>
                                            )}
                                        </div>
                                        {isOpen && (
                                            <div className="border-t border-border/20 bg-muted/20 px-5 py-4 sm:px-6">
                                                {(p.spec?.controls?.length ?? 0) > 0 && (
                                                    <div className="mb-3 flex flex-wrap items-center gap-1.5">
                                                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Controls</span>
                                                        {p.spec!.controls!.map(c => <Pill key={c} label={c} />)}
                                                    </div>
                                                )}
                                                <div className="space-y-2">
                                                    {(p.spec?.rules ?? []).map((rule) => (
                                                        <div key={rule.name} className="flex flex-wrap items-center gap-x-2 gap-y-1 leading-5">
                                                            <Pill label={ACTION_LABEL[rule.action] ?? rule.action} tone={actionTone(rule.action)} />
                                                            {rule.severity && <span className="text-[10px] uppercase text-muted-foreground">{rule.severity}</span>}
                                                            <span className="text-muted-foreground">when</span>
                                                            <span className="font-mono text-foreground/80">{describeCondition(rule)}</span>
                                                            {rule.direction && <span className="text-[10px] text-muted-foreground/70">({rule.direction})</span>}
                                                        </div>
                                                    ))}
                                                    {(p.spec?.rules?.length ?? 0) === 0 && <div className="text-muted-foreground">No rules.</div>}
                                                </div>
                                                {isPending && <div className="mt-3 text-amber-600 dark:text-amber-400">Awaiting a second approver — activation was requested and must be approved by a different teammate.</div>}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="p-5 text-xs text-muted-foreground sm:p-6">No policies yet — install a template below to get started.</div>
                    )}
                </Card>
            </Section>

            {/* Templates */}
            <Section title="Templates" desc="Framework-mapped starter policies. Installing drops a draft you can review, then activate.">
                <div className="grid gap-3 sm:grid-cols-2">
                    {templates.data?.data.map((t) => (
                        <div key={t.id} className="flex flex-col rounded-lg border border-border/40 bg-muted/20 p-4">
                            <div className="flex items-start justify-between gap-3">
                                <span className="text-sm font-medium leading-tight">{t.title}</span>
                                <Button
                                    size="sm"
                                    disabled={!governanceControlsEnabled || install.isPending}
                                    onClick={() => install.mutate(t.id)}
                                    className="h-7 shrink-0 rounded-md px-2.5 text-[11px]"
                                >
                                    Install
                                </Button>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-muted-foreground">{t.description}</p>
                            <div className="mt-3 flex flex-wrap gap-1.5">{t.frameworks.map((f) => <Pill key={f} label={f} />)}</div>
                        </div>
                    ))}
                </div>
            </Section>

            {org && (
                <EnterpriseGovernance
                    orgSlug={orgSlug}
                    tier={org.subscription_tier}
                />
            )}

            {/* Evidence pack */}
            <Section title="Evidence pack" desc="Regulator-ready proof, generated from the ledger.">
                <Card>
                    <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                        <p className="max-w-md text-xs leading-5 text-muted-foreground">
                            Machine-generated proof that each {framework} control fired, with chain-completeness attached — the artifact an auditor can verify.
                        </p>
                        <div className="flex shrink-0 items-center gap-2">
                            {!advancedEvidenceEnabled && (
                                <span className="hidden items-center gap-1 text-[10px] font-medium text-muted-foreground sm:inline-flex">
                                    <LockKeyhole className="size-3" />
                                    Enterprise
                                </span>
                            )}
                            <Select value={framework} onValueChange={setFramework}>
                                <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>{FRAMEWORKS.map((f) => <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>)}</SelectContent>
                            </Select>
                            <Button
                                size="sm"
                                disabled={!advancedEvidenceEnabled}
                                onClick={downloadEvidence}
                                title={!advancedEvidenceEnabled ? "Advanced evidence requires Enterprise" : undefined}
                                className="h-7 rounded-md px-3 text-[11px] font-medium shadow-none"
                            >
                                <Download className="mr-1 size-3" />Export
                            </Button>
                        </div>
                    </div>
                </Card>
            </Section>

            {/* Recent decisions */}
            <Section title="Ledger activity" desc="The most recent immutable decision records.">
                <Card>
                    {ledger.data?.data.length ? (
                        <div className="divide-y divide-border/30 text-xs">
                            {ledger.data.data.map((r) => (
                                <div key={r.seq} className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 hover:bg-muted/30 sm:px-6">
                                    <span className="font-mono tabular-nums text-muted-foreground">#{r.seq}</span>
                                    <div className="flex min-w-0 items-center gap-2">
                                        <span className="font-mono text-muted-foreground">{r.event_type}</span>
                                        {r.rationale && <span className="truncate text-muted-foreground/70">{r.rationale}</span>}
                                    </div>
                                    <div className="flex items-center gap-3 justify-self-end">
                                        {r.decision && <Pill label={r.decision} tone={actionTone(r.decision)} />}
                                        <span className="hidden font-mono text-muted-foreground/60 sm:inline">{new Date(r.ts).toLocaleTimeString()}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="p-5 text-xs text-muted-foreground sm:p-6">No decisions recorded yet — they appear here as traffic flows through your policies.</div>
                    )}
                </Card>
            </Section>

        </main>
    );
}

function EnterpriseGovernance({
    orgSlug,
    tier,
}: {
    orgSlug: string;
    tier: SubscriptionTier;
}) {
    const isEnterprise = tier === "enterprise";

    return (
        <Section
            title="Enterprise controls"
            desc="Enterprise unlocks custom frameworks, compliance archives, advanced evidence, SIEM integrations, and bespoke controls."
        >
            <Card>
                <div className="flex flex-col gap-4 bg-muted/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div>
                        <p className="text-sm font-medium">Regulated infrastructure</p>
                        <p className="mt-1 max-w-lg text-xs leading-5 text-muted-foreground">
                            Provisioned against your organization’s contract, deployment model, and compliance obligations.
                        </p>
                    </div>
                    <Button asChild size="sm" className="h-7 shrink-0 self-start rounded-md px-3 text-[11px] sm:self-auto">
                        <Link href={isEnterprise ? `/${orgSlug}/~/settings?section=advanced` : "/contact/sales"}>
                            {isEnterprise ? "Configure infrastructure" : "Talk to enterprise"}
                        </Link>
                    </Button>
                </div>

                <div className="divide-y divide-border/30 border-t border-border/30">
                    {ENTERPRISE_CAPABILITIES.map((capability) => {
                        const enabled = hasFeature(tier, capability.feature);
                        return (
                            <div
                                key={capability.feature}
                                className="grid gap-3 px-5 py-3.5 sm:grid-cols-[minmax(0,1fr)_110px] sm:items-center sm:px-6"
                            >
                                <div className="min-w-0">
                                    <p className={enabled ? "text-xs font-medium" : "text-xs font-medium text-muted-foreground"}>
                                        {capability.title}
                                    </p>
                                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                                        {capability.description}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1.5 sm:justify-end">
                                    {enabled
                                        ? <Check className="size-3 text-emerald-600 dark:text-emerald-400" />
                                        : <LockKeyhole className="size-3 text-muted-foreground/50" />}
                                    <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                                        {enabled ? "Included" : "Enterprise"}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Card>
        </Section>
    );
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
    return (
        <section className="grid gap-6 border-t border-border/30 py-9 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
            <div>
                <h2 className="text-sm font-medium">{title}</h2>
                {desc && <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{desc}</p>}
            </div>
            <div>{children}</div>
        </section>
    );
}
function Card({ children }: { children: React.ReactNode }) {
    return <div className="overflow-hidden rounded-lg border border-border/40 bg-muted/20">{children}</div>;
}
function StatRow({ label, value, mono, tone }: { label: string; value: React.ReactNode; mono?: boolean; tone?: Tone }) {
    return (
        <div className="grid gap-1 px-5 py-3.5 transition-colors hover:bg-muted/30 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className={`${mono ? "font-mono tabular-nums" : ""} ${tone ? toneText[tone] : ""}`}>{value}</dd>
        </div>
    );
}
function Pill({ label, tone }: { label: string; tone?: Tone }) {
    return (
        <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${tone ? tonePill[tone] : "border-border bg-muted/50 text-muted-foreground"}`}>
            {label}
        </span>
    );
}
