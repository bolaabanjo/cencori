"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
    ChevronLeft,
    ChevronRight,
    Download,
    LockKeyhole,
    Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeatureUpgradeWall } from "@/components/billing/FeatureUpgradeWall";
import { UpgradeDialog } from "@/components/billing/UpgradeDialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { useOrganizationProject } from "@/lib/contexts/OrganizationProjectContext";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { hasFeature, type SubscriptionTier } from "@/lib/entitlements";
import { fetchJsonWithFeatureGate, isFeatureGateError } from "@/lib/feature-gate-client";
import { supabase } from "@/lib/supabaseClient";

interface AuditLogEntry {
    id: string;
    category: string;
    action: string;
    resource_type: string;
    resource_id: string | null;
    project_id: string | null;
    actor_email: string | null;
    actor_ip: string | null;
    actor_type: string;
    description: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
}

interface Project {
    id: string;
    name: string;
}

interface OrganizationContext {
    id: string;
    name: string;
    subscription_tier: SubscriptionTier;
    projects: Project[];
}

interface AuditLogResponse {
    logs: AuditLogEntry[];
    pagination: {
        page: number;
        per_page: number;
        total: number;
        total_pages: number;
    };
}

const CATEGORIES = [
    { value: "all", label: "All events" },
    { value: "project", label: "Projects" },
    { value: "api_key", label: "API keys" },
    { value: "agent", label: "Agents" },
    { value: "member", label: "Members" },
    { value: "security", label: "Security" },
    { value: "billing", label: "Billing" },
    { value: "provider", label: "Providers" },
    { value: "webhook", label: "Webhooks" },
    { value: "sso", label: "SSO" },
    { value: "settings", label: "Settings" },
    { value: "budget", label: "Budgets" },
    { value: "prompt", label: "Prompts" },
    { value: "cache", label: "Cache" },
    { value: "integration", label: "Integrations" },
    { value: "memory", label: "Memory" },
    { value: "export", label: "Exports" },
] as const;

const TIME_RANGES = [
    { value: "1h", label: "Last hour" },
    { value: "24h", label: "Last 24 hours" },
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
    { value: "90d", label: "Last 90 days" },
    { value: "all", label: "All time" },
] as const;

const TEAM_ONLY_CATEGORIES = new Set(["api_key", "member", "sso"]);
const TEAM_ONLY_TIME_RANGES = new Set(["30d", "90d"]);

const CATEGORY_MARKERS: Record<string, string> = {
    sso: "bg-emerald-500",
    security: "bg-red-500",
    billing: "bg-emerald-500",
};

const VALID_CATEGORIES: ReadonlySet<string> = new Set(CATEGORIES.map((category) => category.value));

function getDevelopmentPreviewTier(value: string | null): SubscriptionTier | null {
    if (process.env.NODE_ENV !== "development") return null;
    return value === "pro" || value === "team" || value === "enterprise"
        ? value
        : null;
}

function formatTimestamp(value: string) {
    const date = new Date(value);
    return {
        date: date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        }),
        time: date.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
        }),
    };
}

function formatRelativeTime(value: string) {
    const elapsed = Math.max(Date.now() - new Date(value).getTime(), 0);
    const minutes = Math.floor(elapsed / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function labelForValue<T extends readonly { value: string; label: string }[]>(
    options: T,
    value: string,
) {
    return options.find((option) => option.value === value)?.label || value;
}

function categoryLabel(value: string) {
    return labelForValue(CATEGORIES, value).replace(/s$/, "");
}

function categoryMarker(value: string) {
    return CATEGORY_MARKERS[value] || "bg-emerald-500";
}

function categoryTag(value: string) {
    return value === "security"
        ? "border-red-500/20 bg-red-500/[0.055] text-red-400"
        : "border-emerald-500/20 bg-emerald-500/[0.055] text-emerald-400";
}

function AuditLedgerSkeletonRows() {
    return Array.from({ length: 8 }).map((_, index) => (
        <tr key={index} className="border-b border-border/20 last:border-b-0">
            <td className="px-5 py-4 sm:px-6"><Skeleton className="h-7 w-24" /></td>
            <td className="px-4 py-4"><Skeleton className="h-8 w-full max-w-sm" /></td>
            <td className="px-4 py-4"><Skeleton className="h-7 w-28" /></td>
            <td className="px-4 py-4"><Skeleton className="h-7 w-20" /></td>
            <td className="px-4 py-4"><Skeleton className="size-4" /></td>
        </tr>
    ));
}

function AuditLedgerSkeleton() {
    return (
        <section className="mt-10 overflow-hidden rounded-lg bg-muted/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] dark:bg-[#111111]">
            <div className="flex items-center justify-between border-b border-border/25 bg-foreground/[0.018] px-5 py-4 sm:px-6">
                <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-3 w-20" />
            </div>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-left">
                    <thead>
                        <tr className="border-b border-border/25 text-[9px] tracking-[0.08em] text-muted-foreground">
                            <th className="w-[164px] px-5 py-3 font-medium sm:px-6">TIME</th>
                            <th className="px-4 py-3 font-medium">EVENT</th>
                            <th className="w-[190px] px-4 py-3 font-medium">ACTOR</th>
                            <th className="w-[130px] px-4 py-3 font-medium">SCOPE</th>
                            <th className="w-12 px-4 py-3"><span className="sr-only">Details</span></th>
                        </tr>
                    </thead>
                    <tbody><AuditLedgerSkeletonRows /></tbody>
                </table>
            </div>
        </section>
    );
}

interface PageProps {
    params: Promise<{ orgSlug: string }>;
}

export default function AuditLogPage({ params }: PageProps) {
    const { orgSlug } = use(params);
    const searchParams = useSearchParams();
    const routeCategory = searchParams.get("category");
    const checkoutId = searchParams.get("checkout_session_id") || searchParams.get("checkout_id");
    const previewTier = getDevelopmentPreviewTier(searchParams.get("preview_plan"));
    const [category, setCategory] = useState(() => (
        routeCategory && VALID_CATEGORIES.has(routeCategory) ? routeCategory : "all"
    ));
    const [timeRange, setTimeRange] = useState("7d");
    const [search, setSearch] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [projectFilter, setProjectFilter] = useState("all");
    const [page, setPage] = useState(1);
    const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
    const [teamUpgradeOpen, setTeamUpgradeOpen] = useState(false);
    const {
        organizations,
        projects: cachedProjects,
    } = useOrganizationProject();

    const cachedOrganizationContext = useMemo<OrganizationContext | undefined>(() => {
        const organization = organizations.find((item) => item.slug === orgSlug);
        if (!organization) return undefined;

        return {
            id: organization.id,
            name: organization.name,
            subscription_tier: (organization.subscription_tier || "free") as SubscriptionTier,
            projects: cachedProjects
                .filter((project) => project.organization_id === organization.id)
                .map((project) => ({ id: project.id, name: project.name }))
                .sort((left, right) => left.name.localeCompare(right.name)),
        };
    }, [organizations, cachedProjects, orgSlug]);

    useEffect(() => {
        if (routeCategory && VALID_CATEGORIES.has(routeCategory)) {
            setCategory(routeCategory);
            setPage(1);
            setSelectedEventId(null);
        }
    }, [routeCategory]);

    const {
        data: organizationContext,
        isLoading: isContextLoading,
        isError: isContextError,
        refetch: refetchOrganizationContext,
    } = useQuery<OrganizationContext>({
        queryKey: ["auditLogContext", orgSlug],
        queryFn: async () => {
            const { data: organization, error: organizationError } = await supabase
                .from("organizations")
                .select("id, name, subscription_tier")
                .eq("slug", orgSlug)
                .single();

            if (organizationError || !organization) {
                throw new Error("Organization not found");
            }

            const { data: projects } = await supabase
                .from("projects")
                .select("id, name")
                .eq("organization_id", organization.id)
                .order("name");

            return {
                id: organization.id,
                name: organization.name,
                subscription_tier: (organization.subscription_tier || "free") as SubscriptionTier,
                projects: (projects || []) as Project[],
            };
        },
        initialData: cachedOrganizationContext,
        initialDataUpdatedAt: cachedOrganizationContext ? 0 : undefined,
        staleTime: 60_000,
    });

    const effectiveTier = previewTier || organizationContext?.subscription_tier || "free";
    const auditLogsEnabled = hasFeature(effectiveTier, "auditLogs");
    const identityEventsEnabled = hasFeature(effectiveTier, "auditLogIdentityEvents");
    const extendedHistoryEnabled = hasFeature(effectiveTier, "auditLogExtendedHistory");
    const allTimeHistoryEnabled = hasFeature(effectiveTier, "auditLogAllTimeHistory");
    const auditExportsEnabled = hasFeature(effectiveTier, "auditLogExports");

    useEffect(() => {
        if (!organizationContext) return;
        if (!identityEventsEnabled && TEAM_ONLY_CATEGORIES.has(category)) {
            setCategory("all");
            setPage(1);
            setSelectedEventId(null);
        }
        if (!allTimeHistoryEnabled && timeRange === "all") {
            setTimeRange(extendedHistoryEnabled ? "90d" : "7d");
            setPage(1);
            setSelectedEventId(null);
        } else if (!extendedHistoryEnabled && TEAM_ONLY_TIME_RANGES.has(timeRange)) {
            setTimeRange("7d");
            setPage(1);
            setSelectedEventId(null);
        }
    }, [allTimeHistoryEnabled, category, extendedHistoryEnabled, identityEventsEnabled, organizationContext, timeRange]);

    const {
        data,
        isLoading,
        isFetching,
        isError,
        error: auditLogError,
        refetch,
    } = useQuery<AuditLogResponse>({
        queryKey: ["auditLogs", orgSlug, category, timeRange, search, projectFilter, page, previewTier],
        queryFn: async () => {
            const query = new URLSearchParams({
                category,
                time_range: timeRange,
                page: String(page),
                per_page: "50",
            });
            if (search) query.set("search", search);
            if (projectFilter !== "all") query.set("project_id", projectFilter);
            if (previewTier) query.set("preview_plan", previewTier);

            return fetchJsonWithFeatureGate<AuditLogResponse>(
                `/api/organizations/${orgSlug}/audit-logs?${query}`,
            );
        },
        enabled: auditLogsEnabled,
        placeholderData: (previousData) => previousData,
        retry: (failureCount, error) => !isFeatureGateError(error) && failureCount < 1,
    });

    const isAuditLogLocked = Boolean(organizationContext && !auditLogsEnabled)
        || isFeatureGateError(auditLogError);

    useEffect(() => {
        if (!checkoutId) return;

        let completed = false;
        const refreshEntitlement = async () => {
            const result = await refetchOrganizationContext();
            if (result.data && hasFeature(result.data.subscription_tier, "auditLogs")) {
                completed = true;
                window.clearInterval(refreshTimer);
                sessionStorage.removeItem(`cencori:stripe-checkout:${checkoutId}`);

                const currentUrl = new URL(window.location.href);
                currentUrl.searchParams.delete("checkout_session_id");
                currentUrl.searchParams.delete("checkout_id");
                window.history.replaceState({}, "", `${currentUrl.pathname}${currentUrl.search}`);
                toast.success("Audit log unlocked");
            }
        };

        const refreshTimer = window.setInterval(() => {
            if (!completed) void refreshEntitlement();
        }, 2_000);
        void refreshEntitlement();

        const stopTimer = window.setTimeout(() => {
            window.clearInterval(refreshTimer);
        }, 30_000);

        return () => {
            window.clearInterval(refreshTimer);
            window.clearTimeout(stopTimer);
        };
    }, [checkoutId, refetchOrganizationContext]);

    const projects = useMemo(
        () => organizationContext?.projects || [],
        [organizationContext?.projects],
    );
    const projectNames = useMemo(
        () => new Map(projects.map((project) => [project.id, project.name])),
        [projects],
    );
    const logs = data?.logs || [];
    const selectedEvent = selectedEventId
        ? logs.find((log) => log.id === selectedEventId) || null
        : null;
    const pagination = data?.pagination;
    const totalEvents = pagination?.total || 0;
    const firstVisibleEvent = totalEvents === 0 ? 0 : ((page - 1) * (pagination?.per_page || 50)) + 1;
    const lastVisibleEvent = Math.min(page * (pagination?.per_page || 50), totalEvents);

    const resetPageState = () => {
        setPage(1);
        setSelectedEventId(null);
    };

    const handleSearch = () => {
        setSearch(searchInput.trim());
        resetPageState();
    };

    const handleExport = (format: "csv" | "json") => {
        const query = new URLSearchParams({
            format,
            category,
            time_range: timeRange,
        });
        if (search) query.set("search", search);
        if (projectFilter !== "all") query.set("project_id", projectFilter);
        if (previewTier) query.set("preview_plan", previewTier);
        window.open(`/api/organizations/${orgSlug}/audit-logs?${query}`, "_blank", "noopener,noreferrer");
    };

    const pageHeader = (
        <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
                <h1 className="text-[2rem] font-medium leading-none tracking-[-0.055em]">Audit log</h1>
                <p className="mt-3 max-w-[62ch] text-xs leading-5 text-muted-foreground">
                    An administrative event stream for {organizationContext?.name || "this organization"}. Trace who changed what, where it happened, and when.
                </p>
            </div>

            {auditLogsEnabled && auditExportsEnabled && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button size="sm" className="h-8 rounded-md px-3 text-[10px] shadow-none active:scale-[0.98]">
                            <Download className="mr-1.5 size-3" />
                            Export ledger
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleExport("csv")}>Export CSV</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleExport("json")}>Export JSON</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
            {auditLogsEnabled && !auditExportsEnabled && (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-md border-border/25 bg-muted/15 px-3 text-[10px] text-muted-foreground shadow-none active:scale-[0.98]"
                            onClick={() => setTeamUpgradeOpen(true)}
                        >
                            <LockKeyhole className="mr-1.5 size-3" />
                            Export ledger
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={8}>Upgrade to Team</TooltipContent>
                </Tooltip>
            )}
        </header>
    );

    if (isContextLoading) {
        return (
            <main className="mx-auto w-full max-w-[1080px] px-4 py-8 pb-24 sm:px-6 sm:py-10 lg:px-8">
                {pageHeader}
                <AuditLedgerSkeleton />
            </main>
        );
    }

    if (isContextError || !organizationContext) {
        return (
            <main className="mx-auto w-full max-w-[1080px] px-4 py-8 pb-24 sm:px-6 sm:py-10 lg:px-8">
                {pageHeader}
                <section className="mt-10 rounded-lg border border-border/30 bg-muted/20 px-6 py-14 text-center">
                    <p className="text-sm font-medium">Organization unavailable</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">Cencori could not verify this organization&apos;s audit-log access.</p>
                    <Button variant="outline" size="sm" className="mt-4 h-8 text-[10px]" onClick={() => void refetchOrganizationContext()}>
                        Try again
                    </Button>
                </section>
            </main>
        );
    }

    if (isAuditLogLocked) {
        return (
            <main className="mx-auto w-full max-w-[1080px] px-4 py-8 pb-24 sm:px-6 sm:py-10 lg:px-8">
                {pageHeader}
                <FeatureUpgradeWall
                    orgSlug={orgSlug}
                    orgId={organizationContext.id}
                    orgName={organizationContext.name}
                    currentTier={organizationContext.subscription_tier}
                    feature="Audit log"
                    message="Audit logs are available on Pro, Team, and Enterprise. Upgrade to keep a searchable record of administrative changes."
                    className="mt-10"
                    returnPath={`/${orgSlug}/~/audit-log${routeCategory ? `?category=${encodeURIComponent(routeCategory)}` : ""}`}
                />
            </main>
        );
    }

    return (
        <main className="mx-auto w-full max-w-[1080px] px-4 py-8 pb-24 sm:px-6 sm:py-10 lg:px-8">
            {pageHeader}

            <section className="mt-10 border-b border-border/25 pb-4" aria-label="Audit log filters">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <form
                        className="min-w-0 flex-1"
                        onSubmit={(event) => {
                            event.preventDefault();
                            handleSearch();
                        }}
                    >
                        <div className="relative min-w-0 flex-1">
                            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                aria-label="Search audit events"
                                placeholder="Search event descriptions"
                                value={searchInput}
                                onChange={(event) => setSearchInput(event.target.value)}
                                className="h-8 rounded-md border-border/30 bg-muted/20 pl-9 text-[11px] shadow-none transition-colors focus-visible:bg-muted/35"
                            />
                        </div>
                    </form>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <Select
                            value={category}
                            onValueChange={(value) => {
                                setCategory(value);
                                resetPageState();
                            }}
                        >
                            <SelectTrigger className="h-8 w-full rounded-md border-border/30 bg-muted/20 text-[10px] shadow-none transition-colors hover:bg-muted/35 sm:w-40">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {CATEGORIES.map((option) => (
                                    !identityEventsEnabled && TEAM_ONLY_CATEGORIES.has(option.value)
                                        ? <LockedSelectOption key={option.value} label={option.label} />
                                        : (
                                            <SelectItem key={option.value} value={option.value} className="text-xs">
                                                {option.label}
                                            </SelectItem>
                                        )
                                ))}
                            </SelectContent>
                        </Select>

                        <Select
                            value={timeRange}
                            onValueChange={(value) => {
                                setTimeRange(value);
                                resetPageState();
                            }}
                        >
                            <SelectTrigger className="h-8 w-full rounded-md border-border/30 bg-muted/20 text-[10px] shadow-none transition-colors hover:bg-muted/35 sm:w-40">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {TIME_RANGES.map((option) => (
                                    option.value === "all" && !allTimeHistoryEnabled
                                        ? <LockedSelectOption key={option.value} label={option.label} requiredTier="Enterprise" />
                                        : !extendedHistoryEnabled && TEAM_ONLY_TIME_RANGES.has(option.value)
                                        ? <LockedSelectOption key={option.value} label={option.label} requiredTier="Team" />
                                        : (
                                            <SelectItem key={option.value} value={option.value} className="text-xs">
                                                {option.label}
                                            </SelectItem>
                                        )
                                ))}
                            </SelectContent>
                        </Select>

                        <Select
                            value={projectFilter}
                            onValueChange={(value) => {
                                setProjectFilter(value);
                                resetPageState();
                            }}
                        >
                            <SelectTrigger className="h-8 w-full rounded-md border-border/30 bg-muted/20 text-[10px] shadow-none transition-colors hover:bg-muted/35 sm:w-40">
                                <SelectValue placeholder="All projects" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all" className="text-xs">All projects</SelectItem>
                                {projects.map((project) => (
                                    <SelectItem key={project.id} value={project.id} className="text-xs">
                                        {project.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {(search || category !== "all" || projectFilter !== "all" || timeRange !== "7d") && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                        <span>Filtered ledger</span>
                        <span className="text-border">/</span>
                        <button
                            type="button"
                            className="text-foreground underline decoration-border underline-offset-4 transition-opacity hover:opacity-65"
                            onClick={() => {
                                setCategory("all");
                                setTimeRange("7d");
                                setProjectFilter("all");
                                setSearch("");
                                setSearchInput("");
                                resetPageState();
                            }}
                        >
                            Reset filters
                        </button>
                    </div>
                )}
            </section>

            <section className="mt-6 overflow-hidden rounded-lg bg-muted/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] dark:bg-[#111111]" aria-label="Organization audit events">
                <div className="relative flex items-center justify-between overflow-hidden border-b border-border/25 bg-foreground/[0.018] px-5 py-4 sm:px-6">
                    <div>
                        <h2 className="text-sm font-medium tracking-[-0.02em]">Event ledger</h2>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                            {isFetching && !isLoading ? "Refreshing events…" : totalEvents === 0 ? "No matching events" : `${firstVisibleEvent.toLocaleString()}–${lastVisibleEvent.toLocaleString()} of ${totalEvents.toLocaleString()} events`}
                        </p>
                    </div>
                    <div className="flex items-center gap-5">
                        <span className="font-mono text-[9px] tracking-[0.12em] text-muted-foreground">NEWEST FIRST</span>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] border-collapse text-left">
                        <thead>
                            <tr className="border-b border-border/25 text-[9px] tracking-[0.08em] text-muted-foreground">
                                <th className="w-[164px] px-5 py-3 font-medium sm:px-6">TIME</th>
                                <th className="px-4 py-3 font-medium">EVENT</th>
                                <th className="w-[190px] px-4 py-3 font-medium">ACTOR</th>
                                <th className="w-[130px] px-4 py-3 font-medium">SCOPE</th>
                                <th className="w-12 px-4 py-3"><span className="sr-only">Details</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <AuditLedgerSkeletonRows />
                            ) : isError ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-16 text-center">
                                        <p className="text-sm font-medium">Audit events unavailable</p>
                                        <p className="mt-1 text-[11px] text-muted-foreground">Cencori could not load the organization event stream.</p>
                                        <Button variant="outline" size="sm" className="mt-4 h-8 text-[10px]" onClick={() => void refetch()}>
                                            Try again
                                        </Button>
                                    </td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-16 text-center">
                                        <p className="text-sm font-medium">No events in this view</p>
                                        <p className="mx-auto mt-1 max-w-sm text-[11px] leading-5 text-muted-foreground">
                                            Administrative changes will appear here as they occur. Adjust the filters to inspect a different part of the ledger.
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => {
                                    const timestamp = formatTimestamp(log.created_at);
                                    const isSelected = selectedEventId === log.id;
                                    const scope = log.project_id ? projectNames.get(log.project_id) || "Project" : "Organization";

                                    return (
                                        <tr
                                            key={log.id}
                                            className={cn(
                                                "group border-b border-border/20 transition-colors last:border-b-0 odd:bg-foreground/[0.012] hover:bg-emerald-500/[0.028]",
                                                isSelected && "bg-emerald-500/[0.028]",
                                            )}
                                        >
                                            <td className="px-5 py-4 align-top sm:px-6">
                                                <time dateTime={log.created_at} className="block">
                                                    <span className="block font-mono text-[10px] tabular-nums text-foreground">{timestamp.date}</span>
                                                    <span className="mt-1 block font-mono text-[9px] tabular-nums text-muted-foreground">{timestamp.time}</span>
                                                    <span className="mt-1.5 block text-[9px] text-muted-foreground/70">{formatRelativeTime(log.created_at)}</span>
                                                </time>
                                            </td>
                                            <td className="px-4 py-4 align-top">
                                                <div className="flex items-center gap-2">
                                                    <span className={cn("inline-flex h-5 items-center gap-1.5 rounded-[3px] border px-2 font-mono text-[8px] uppercase tracking-[0.09em]", categoryTag(log.category))}>
                                                        <span className={cn("size-1.5 shrink-0", categoryMarker(log.category))} />
                                                        {categoryLabel(log.category)}
                                                    </span>
                                                    <span className="text-border">/</span>
                                                    <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">{log.action.replaceAll("_", " ")}</span>
                                                </div>
                                                <p className="mt-2.5 max-w-[60ch] text-[13px] font-medium leading-5 tracking-[-0.01em] text-foreground">{log.description}</p>
                                                <p className="mt-1.5 inline-flex rounded-[3px] bg-background/30 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground/75">{log.resource_type}</p>
                                            </td>
                                            <td className="px-4 py-4 align-top">
                                                <p className="max-w-[170px] truncate text-[10px] text-foreground">{log.actor_email || (log.actor_type === "system" ? "Cencori system" : log.actor_type)}</p>
                                                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground">{log.actor_type}</p>
                                                {log.actor_ip && <p className="mt-1 truncate font-mono text-[9px] text-muted-foreground/70">{log.actor_ip}</p>}
                                            </td>
                                            <td className="px-4 py-4 align-top">
                                                <p className="max-w-[120px] truncate text-[10px] font-medium text-foreground">{scope}</p>
                                                <p className="mt-1.5 inline-flex rounded-[3px] border border-border/25 px-1.5 py-0.5 font-mono text-[8px] tracking-[0.06em] text-muted-foreground">{log.project_id ? "PROJECT" : "ORG"}</p>
                                            </td>
                                            <td className="px-4 py-4 align-top">
                                                <button
                                                    type="button"
                                                    aria-label="View event details"
                                                    onClick={() => setSelectedEventId(log.id)}
                                                    className="flex size-7 items-center justify-center rounded-[4px] bg-foreground/[0.025] text-muted-foreground transition-[background-color,color,transform] hover:bg-emerald-500/10 hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:scale-[0.95]"
                                                >
                                                    <ChevronRight className="size-3.5" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <Dialog
                open={!!selectedEvent}
                onOpenChange={(open) => {
                    if (!open) setSelectedEventId(null);
                }}
            >
                <DialogContent className="max-h-[88vh] overflow-hidden border-border/35 bg-[#f2f2f0] p-0 shadow-2xl dark:bg-[#111111] sm:max-w-[780px]">
                    {selectedEvent && (
                        <>
                            <DialogHeader className="border-b border-border/25 px-6 pb-5 pt-6 text-left">
                                <div className="flex items-center gap-2">
                                    <span className={cn("size-1.5 shrink-0", categoryMarker(selectedEvent.category))} />
                                    <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">{categoryLabel(selectedEvent.category)}</span>
                                    <span className="text-border">/</span>
                                    <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">{selectedEvent.action.replaceAll("_", " ")}</span>
                                </div>
                                <DialogTitle className="pt-2 text-lg font-medium tracking-[-0.035em]">Event details</DialogTitle>
                                <DialogDescription className="max-w-[62ch] text-[11px] leading-5 text-muted-foreground">
                                    {selectedEvent.description}
                                </DialogDescription>
                            </DialogHeader>

                            <div className="grid max-h-[66vh] overflow-y-auto lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:divide-x lg:divide-border/25">
                                <section className="px-6 py-5" aria-label="Event record">
                                    <p className="text-[9px] font-medium tracking-[0.12em] text-muted-foreground">EVENT RECORD</p>
                                    <dl className="mt-5 space-y-4 text-[10px]">
                                        <ModalDetail label="Event ID" value={selectedEvent.id} mono />
                                        <ModalDetail
                                            label="Resource"
                                            value={`${selectedEvent.resource_type}${selectedEvent.resource_id ? ` / ${selectedEvent.resource_id}` : ""}`}
                                            mono
                                        />
                                        <ModalDetail label="Timestamp" value={new Date(selectedEvent.created_at).toISOString()} mono />
                                        <ModalDetail label="Actor" value={selectedEvent.actor_email || (selectedEvent.actor_type === "system" ? "Cencori system" : selectedEvent.actor_type)} />
                                        <ModalDetail label="Actor type" value={selectedEvent.actor_type.toUpperCase()} mono />
                                        <ModalDetail label="Source IP" value={selectedEvent.actor_ip || "Not recorded"} mono />
                                        <ModalDetail
                                            label="Scope"
                                            value={selectedEvent.project_id ? projectNames.get(selectedEvent.project_id) || "Project" : "Organization"}
                                        />
                                    </dl>
                                </section>

                                <section className="min-w-0 border-t border-border/25 px-6 py-5 lg:border-t-0" aria-label="Event metadata">
                                    <div className="flex items-center justify-between gap-4">
                                        <p className="text-[9px] font-medium tracking-[0.12em] text-muted-foreground">EVENT METADATA</p>
                                        <span className="font-mono text-[8px] text-muted-foreground">JSON</span>
                                    </div>
                                    <pre className="mt-4 max-h-[28rem] min-h-64 overflow-auto rounded-md bg-foreground/[0.035] p-4 font-mono text-[10px] leading-6 text-foreground">
                                        {JSON.stringify(selectedEvent.metadata || {}, null, 2)}
                                    </pre>
                                </section>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {pagination && pagination.total_pages > 1 && (
                <nav className="mt-5 flex items-center justify-between" aria-label="Audit log pagination">
                    <p className="text-[10px] text-muted-foreground">
                        Page <span className="font-mono text-foreground">{page}</span> of <span className="font-mono text-foreground">{pagination.total_pages}</span>
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-md border-border/30 bg-transparent px-3 text-[10px] shadow-none"
                            disabled={page <= 1}
                            onClick={() => {
                                setPage((currentPage) => currentPage - 1);
                                setSelectedEventId(null);
                            }}
                        >
                            <ChevronLeft className="mr-1 size-3" /> Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-md border-border/30 bg-transparent px-3 text-[10px] shadow-none"
                            disabled={page >= pagination.total_pages}
                            onClick={() => {
                                setPage((currentPage) => currentPage + 1);
                                setSelectedEventId(null);
                            }}
                        >
                            Next <ChevronRight className="ml-1 size-3" />
                        </Button>
                    </div>
                </nav>
            )}

            <footer className="mt-10 flex flex-col gap-2 border-t border-border/25 pt-5 text-[10px] leading-4 text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <p>Administrative events are recorded independently of the interface that produced them.</p>
                <p className="font-mono">LEDGER / {timeRange.toUpperCase()}</p>
            </footer>

            <UpgradeDialog
                open={teamUpgradeOpen}
                onOpenChange={setTeamUpgradeOpen}
                orgId={organizationContext.id}
                orgSlug={orgSlug}
                orgName={organizationContext.name}
                currentTier={effectiveTier === "pro" || effectiveTier === "team" ? effectiveTier : "free"}
                reason="Extended audit history, identity events, and ledger exports require Team or Enterprise."
                recommendedTier="team"
                checkoutMode="direct"
                returnPath={`/${orgSlug}/~/audit-log`}
            />
        </main>
    );
}

function LockedSelectOption({
    label,
    requiredTier = "Team",
}: {
    label: string;
    requiredTier?: "Team" | "Enterprise";
}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div
                    role="option"
                    aria-disabled="true"
                    aria-selected="false"
                    tabIndex={0}
                    className="flex w-full cursor-not-allowed items-center gap-2 rounded px-2 py-1.5 text-xs text-muted-foreground/45 outline-none transition-colors focus:bg-accent/40"
                >
                    <LockKeyhole className="size-3 shrink-0" />
                    <span>{label}</span>
                </div>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8} className="text-[10px]">
                {requiredTier === "Enterprise" ? "Enterprise plan required" : "Upgrade to Team"}
            </TooltipContent>
        </Tooltip>
    );
}

function ModalDetail({
    label,
    value,
    mono = false,
}: {
    label: string;
    value: string;
    mono?: boolean;
}) {
    return (
        <div>
            <dt className="text-[9px] text-muted-foreground">{label}</dt>
            <dd className={cn("mt-1.5 break-all text-[10px] leading-5 text-foreground", mono && "font-mono")}>{value}</dd>
        </div>
    );
}
