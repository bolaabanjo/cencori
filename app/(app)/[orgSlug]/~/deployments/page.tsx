"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkBadge02Icon, UploadCircle01Icon, UserCircleIcon, AlertCircleIcon } from "@hugeicons/core-free-icons";
import { GitBranch, GitCommitHorizontal, MoreVertical, Search, ArrowUpRight, Boxes, Plus } from "lucide-react";

interface PageProps {
    params: Promise<{ orgSlug: string }>;
}

interface FleetDeployment {
    id: string;
    version: number;
    status: string;
    commit_sha: string | null;
    commit_message: string | null;
    commit_author_name: string | null;
    commit_author_login: string | null;
    commit_author_email: string | null;
    commit_author_is_team_member: boolean | null;
    branch: string | null;
    created_at: string;
    updated_at: string;
}
interface FleetAgent {
    agentId: string;
    projectId: string;
    projectSlug: string | null;
    name: string;
    framework: string;
    status: string;
    hostname: string | null;
    repoFullName: string | null;
    repoOwnerIsTeamMember: boolean;
    created_at: string;
    updated_at: string;
    previewCount: number;
    deployment: FleetDeployment | null;
}

const DSTATUS: Record<string, { label: string; dot: string }> = {
    active: { label: "Done", dot: "bg-emerald-400" },
    running: { label: "Done", dot: "bg-emerald-400" },
    building: { label: "Building", dot: "bg-amber-400" },
    created: { label: "Queued", dot: "bg-zinc-400" },
    stopped: { label: "Stopped", dot: "bg-muted-foreground" },
    failed: { label: "Failed", dot: "bg-red-500" },
    archived: { label: "Archived", dot: "bg-zinc-500" },
};

// Needs-attention-first, then most-recently-updated.
const WEIGHT: Record<string, number> = { failed: 0, building: 1, active: 2, running: 2, stopped: 3, created: 4, archived: 5 };

interface Author { name: string; login: string; email: string; avatarUrl: string | null; isTeamMember: boolean }

function authorOf(d: FleetDeployment | null, repoFullName?: string | null, repoOwnerIsTeamMember = false): Author {
    const repositoryOwner = repoFullName?.split('/')[0]?.trim() ?? "";
    const login = d?.commit_author_login || repositoryOwner;
    const hasCapturedAuthor = Boolean(
        d?.commit_author_login || d?.commit_author_name || d?.commit_author_email,
    );
    return {
        name: d?.commit_author_name || login || "Unknown",
        login,
        email: d?.commit_author_email || "",
        avatarUrl: login ? `https://github.com/${encodeURIComponent(login)}.png?size=96` : null,
        isTeamMember: hasCapturedAuthor
            ? !!d?.commit_author_is_team_member
            : repoOwnerIsTeamMember,
    };
}

export default function OrgDeploymentsPage({ params }: PageProps) {
    const { orgSlug } = use(params);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [envFilter, setEnvFilter] = useState("all");
    const [dateFilter, setDateFilter] = useState("all");
    const [authorFilter, setAuthorFilter] = useState("all");
    const [branchFilter, setBranchFilter] = useState("all");
    const [now, setNow] = useState<number | null>(null);
    useEffect(() => {
        setNow(Date.now());
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);

    const { data, isLoading } = useQuery<{ agents: FleetAgent[] }>({
        queryKey: ["org-fleet", orgSlug],
        queryFn: async () => {
            const res = await fetch(`/api/organizations/${orgSlug}/agents`);
            if (!res.ok) throw new Error("Failed to load deployments");
            return res.json();
        },
        refetchInterval: (q) => (q.state.data?.agents?.some((a) => a.status === "building") ? 4000 : false),
    });

    const agents = useMemo(() => {
        const list = [...(data?.agents ?? [])];
        list.sort((a, b) => {
            const wa = WEIGHT[a.status] ?? 9;
            const wb = WEIGHT[b.status] ?? 9;
            if (wa !== wb) return wa - wb;
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });
        return list;
    }, [data]);

    const authors = useMemo(() => {
        const map = new Map<string, Author>();
        for (const a of agents) {
            const au = authorOf(a.deployment, a.repoFullName, a.repoOwnerIsTeamMember);
            if (au.login && !map.has(au.login)) map.set(au.login, au);
        }
        return [...map.values()];
    }, [agents]);

    const branches = useMemo(() => {
        const set = new Set<string>();
        for (const a of agents) if (a.deployment?.branch) set.add(a.deployment.branch);
        return [...set];
    }, [agents]);

    const filtered = agents.filter((a) => {
        const st = (DSTATUS[a.status] ?? DSTATUS.created).label.toLowerCase();
        if (statusFilter !== "all" && st !== statusFilter) return false;
        if (envFilter === "preview") return false; // fleet is production-only
        if (authorFilter !== "all" && authorOf(a.deployment, a.repoFullName).login !== authorFilter) return false;
        if (branchFilter !== "all" && a.deployment?.branch !== branchFilter) return false;
        if (dateFilter !== "all" && a.deployment) {
            const ageMs = Date.now() - new Date(a.deployment.created_at).getTime();
            const limit = { "24h": 864e5, "7d": 6048e5, "30d": 2592e6, "90d": 7776e6 }[dateFilter] ?? Infinity;
            if (ageMs > limit) return false;
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            const hay = [a.name, a.deployment?.commit_message, a.deployment?.commit_sha, a.deployment?.branch, a.deployment?.commit_author_name, a.deployment?.commit_author_login]
                .filter(Boolean).join(" ").toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });

    const hasFilters = !!search.trim() || statusFilter !== "all" || envFilter !== "all" || dateFilter !== "all" || authorFilter !== "all" || branchFilter !== "all";
    const clearFilters = () => { setSearch(""); setStatusFilter("all"); setEnvFilter("all"); setDateFilter("all"); setAuthorFilter("all"); setBranchFilter("all"); };
    const newAgentHref = `/${orgSlug}/~/projects/new-agent`;

    if (isLoading) {
        return (
            <div className="w-full max-w-5xl mx-auto px-6 py-8">
                <Skeleton className="h-5 w-32 mb-4" />
                <Skeleton className="h-9 w-full mb-2" />
                <Skeleton className="h-8 w-full mb-4" />
                <Skeleton className="h-40 w-full" />
            </div>
        );
    }

    if (agents.length === 0) {
        return (
            <div className="w-full max-w-5xl mx-auto px-6 py-8">
                <div className="mb-6 flex items-start justify-between">
                    <div>
                        <h2 className="text-[13px] font-medium">Deployments</h2>
                        <p className="text-[12px] text-muted-foreground mt-0.5">Every deployed agent in this organization.</p>
                    </div>
                </div>
                <div className="rounded-lg border border-border/40 bg-card px-6 py-14 text-center">
                    <span className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-border/40 bg-secondary/40">
                        <Boxes className="h-5 w-5 text-muted-foreground" />
                    </span>
                    <h3 className="text-[15px] font-medium">No agents deployed yet</h3>
                    <p className="mx-auto mt-1.5 max-w-md text-[13px] text-muted-foreground">
                        Deploy any agent repo from GitHub, or add an agent to an existing project — Cencori detects the framework, builds it, and runs it 24/7. Agent-less projects live under{" "}
                        <Link href={`/${orgSlug}/~/projects`} className="underline underline-offset-2 hover:text-foreground">Projects</Link>.
                    </p>
                    <div className="mt-5">
                        <Button asChild size="sm" className="h-8 text-xs">
                            <Link href={newAgentHref}><Plus className="h-3.5 w-3.5 mr-1.5" /> Deploy an agent</Link>
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-5xl mx-auto px-6 py-8">
            {/* Header */}
            <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[13px] font-medium">Deployments</h2>
                <span className="font-mono text-[10px] text-muted-foreground">{filtered.length} / {agents.length}</span>
            </div>

            {/* Search + filters */}
            <div className="mb-3 space-y-2">
                <div className="relative min-w-0">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/80" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search agents, commits, authors, branches, SHA…"
                        aria-label="Search deployments"
                        className="h-9 border-border/40 bg-background/50 pl-9 pr-16 text-xs shadow-none focus-visible:border-border"
                    />
                    {hasFilters && (
                        <Button variant="ghost" size="sm" className="absolute right-1 top-1/2 h-7 -translate-y-1/2 px-2.5 text-[11px] text-muted-foreground" onClick={clearFilters}>Clear</Button>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger aria-label="Filter by status" className="h-8 min-w-0 border-border/40 bg-background/40 px-2.5 py-0 text-[11px] shadow-none"><SelectValue placeholder="Status" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All statuses</SelectItem>
                            <SelectItem value="done">Done</SelectItem>
                            <SelectItem value="building">Building</SelectItem>
                            <SelectItem value="failed">Failed</SelectItem>
                            <SelectItem value="stopped">Stopped</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={envFilter} onValueChange={setEnvFilter}>
                        <SelectTrigger aria-label="Filter by environment" className="h-8 min-w-0 border-border/40 bg-background/40 px-2.5 py-0 text-[11px] shadow-none"><SelectValue placeholder="Environment" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All environments</SelectItem>
                            <SelectItem value="production">Production</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={dateFilter} onValueChange={setDateFilter}>
                        <SelectTrigger aria-label="Filter by date" className="h-8 min-w-0 border-border/40 bg-background/40 px-2.5 py-0 text-[11px] shadow-none"><SelectValue placeholder="Date" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All time</SelectItem>
                            <SelectItem value="24h">Last 24 hours</SelectItem>
                            <SelectItem value="7d">Last 7 days</SelectItem>
                            <SelectItem value="30d">Last 30 days</SelectItem>
                            <SelectItem value="90d">Last 90 days</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={authorFilter} onValueChange={setAuthorFilter}>
                        <SelectTrigger aria-label="Filter by author" className="h-8 min-w-0 border-border/40 bg-background/40 px-2.5 py-0 text-[11px] shadow-none"><SelectValue placeholder="Author" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All authors</SelectItem>
                            {authors.map((au) => (
                                <SelectItem key={au.login} value={au.login} textValue={au.name}>
                                    <span className="flex items-center gap-2"><AuthorFace author={au} className="size-5 text-[8px]" /><span className="truncate">{au.name}</span></span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={branchFilter} onValueChange={setBranchFilter}>
                        <SelectTrigger aria-label="Filter by branch" className="h-8 min-w-0 border-border/40 bg-background/40 px-2.5 py-0 text-[11px] shadow-none"><SelectValue placeholder="Branch" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All branches</SelectItem>
                            {branches.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Fleet list */}
            <div className="overflow-hidden rounded-xl bg-[#f3f3f1] ring-1 ring-inset ring-black/[0.055] dark:bg-[#111111] dark:ring-white/[0.055]">
                {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                        <p className="text-xs text-muted-foreground">No agents match these filters.</p>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearFilters}>Clear filters</Button>
                    </div>
                ) : filtered.map((a) => <FleetRow key={a.agentId} orgSlug={orgSlug} a={a} now={now} />)}
            </div>
        </div>
    );
}

function FleetRow({ orgSlug, a, now }: { orgSlug: string; a: FleetAgent; now: number | null }) {
    const d = a.deployment;
    const s = DSTATUS[d?.status ?? a.status] ?? DSTATUS.created;
    const author = authorOf(d, a.repoFullName, a.repoOwnerIsTeamMember);
    const isBuilding = a.status === "building" || a.status === "created";
    const detailsHref = a.projectSlug
        ? `/${orgSlug}/${a.projectSlug}/deployments/${a.agentId}${d ? `?d=${d.id}` : ""}`
        : "#";

    return (
        <div className="flex items-stretch border-b border-black/[0.055] transition-colors last:border-b-0 hover:bg-black/[0.025] dark:border-white/[0.055] dark:hover:bg-white/[0.025]">
            <Link href={detailsHref} className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3 md:grid md:grid-cols-[8rem_minmax(0,20rem)_7rem_minmax(0,1fr)_auto]">
                {/* Status + build duration */}
                <div className="flex w-32 shrink-0 items-center gap-2">
                    <span className="inline-flex items-center gap-2 text-[11px] font-medium text-foreground">
                        <span className={`size-2 shrink-0 rounded-full ${s.dot}`} aria-hidden="true" />
                        {s.label}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{buildDuration(d, a, now)}</span>
                </div>
                {/* Identity: AGENT NAME (primary) + commit sub-line */}
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{a.name}</p>
                    <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                        <GitCommitHorizontal className="h-3 w-3 shrink-0" />
                        {d?.commit_sha ? d.commit_sha.slice(0, 7) : "—"}
                        {d?.branch && (<><span className="text-muted-foreground/40">·</span><GitBranch className="h-3 w-3 shrink-0" />{d.branch}</>)}
                        {d?.commit_message && (<><span className="text-muted-foreground/40">·</span><span className="truncate text-muted-foreground/80">{d.commit_message}</span></>)}
                    </div>
                </div>
                {/* Environment (fleet = production) */}
                <div className="hidden w-28 shrink-0 justify-center md:flex">
                    {d && (
                        <span className={`inline-flex h-6 items-center gap-1.5 rounded-md border pl-2.5 pr-1 text-[10px] font-mono ${isBuilding ? "border-zinc-400/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300" : "border-blue-500/20 bg-blue-500/[0.08] text-blue-600 dark:text-blue-400"}`}>
                            Production
                            <HugeiconsIcon icon={UploadCircle01Icon} className="size-4" strokeWidth={1.8} aria-hidden="true" />
                        </span>
                    )}
                </div>
                {/* Time + author */}
                <div className="flex shrink-0 items-center gap-2 md:col-start-5">
                    <span className="w-16 text-right font-mono text-[11px] text-muted-foreground">{d ? rel(d.created_at) : "—"}</span>
                    <div className="hidden sm:block"><Avatar author={author} /></div>
                </div>
            </Link>
            <div className="flex shrink-0 items-center pr-2">
                <RowActions orgSlug={orgSlug} a={a} detailsHref={detailsHref} />
            </div>
        </div>
    );
}

function RowActions({ orgSlug, a, detailsHref }: { orgSlug: string; a: FleetAgent; detailsHref: string }) {
    void orgSlug;
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8 shrink-0 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
                    <MoreVertical className="size-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem asChild><Link href={detailsHref}>Open deployment</Link></DropdownMenuItem>
                {a.hostname && (
                    <DropdownMenuItem onClick={() => window.open(`https://${a.hostname}`, "_blank", "noopener,noreferrer")}>
                        Visit endpoint <ArrowUpRight className="ml-auto size-3.5" />
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function buildDuration(d: FleetDeployment | null, a: FleetAgent, now: number | null): string {
    if (!d) return "—";
    const inProgress = a.status === "building" || a.status === "created";
    const start = new Date(d.created_at).getTime();
    const end = inProgress ? now : new Date(d.updated_at).getTime();
    if (end === null || !Number.isFinite(start) || !Number.isFinite(end)) return "0s";
    const elapsed = Math.max(0, Math.floor((end - start) / 1000));
    const total = inProgress ? elapsed : Math.min(60, elapsed);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    if (!inProgress && total === 60) return "1m";
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
}

function AuthorFace({ author, className }: { author: Author; className: string }) {
    const [failed, setFailed] = useState(false);
    const initials = author.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
    return (
        <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/50 bg-secondary font-medium text-muted-foreground ${className}`}>
            {author.avatarUrl && !failed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={author.avatarUrl} alt="" className="size-full object-cover" onError={() => setFailed(true)} />
            ) : initials}
        </span>
    );
}

function Avatar({ author }: { author: Author }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span className="relative size-8 shrink-0 cursor-pointer" role="img" aria-label={`${author.name}, @${author.login}`}>
                    <AuthorFace author={author} className="size-8 text-[11px]" />
                    {author.isTeamMember && (
                        <HugeiconsIcon icon={CheckmarkBadge02Icon} className="absolute -right-1 -bottom-1 size-4 rounded-full bg-background text-emerald-400" strokeWidth={2} aria-hidden="true" />
                    )}
                </span>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={10} className="w-72 rounded-lg border border-border bg-popover p-0 text-popover-foreground shadow-xl">
                <div className="flex items-center gap-3 p-3">
                    <AuthorFace author={author} className="size-9 text-xs" />
                    <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-foreground">{author.name}</p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">@{author.login || "unknown"}</p>
                    </div>
                </div>
                {author.email && (
                    <div className="space-y-2 border-t border-border/60 px-3 py-2.5 text-[11px]">
                        <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
                            <span className="text-muted-foreground">Commit email</span>
                            <span className="break-all font-mono text-foreground">{author.email}</span>
                        </div>
                    </div>
                )}
                <div className={`flex items-center gap-2 border-t border-border/60 px-3 py-2.5 text-[11px] ${author.isTeamMember ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                    <HugeiconsIcon icon={author.isTeamMember ? UserCircleIcon : AlertCircleIcon} className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
                    {author.isTeamMember ? "Member of this Cencori organization" : "Not a member of this Cencori organization"}
                </div>
            </TooltipContent>
        </Tooltip>
    );
}

function rel(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}
