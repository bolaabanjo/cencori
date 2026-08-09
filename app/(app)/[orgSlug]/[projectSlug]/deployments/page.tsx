"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FrameworkLogo } from "@/components/icons/FrameworkLogo";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProjectIdBySlug } from "@/lib/hooks/useQueries";
import {
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    GitBranch,
    GitCommitHorizontal,
    KeyRound,
    Loader2,
    MoreVertical,
    Plus,
    ScanSearch,
    Search,
    Settings2,
    Trash2,
} from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { AccessIcon, AlertCircleIcon, CheckmarkBadge02Icon, UploadCircle01Icon, UserCircleIcon, ViewIcon } from "@hugeicons/core-free-icons";
import { LogoGitlab } from "@carbon/icons-react";

interface PageProps {
    params: Promise<{ orgSlug: string; projectSlug: string }>;
}

const GitHubLogo = ({ className }: { className?: string }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
        <path
            d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
            fill="currentColor"
        />
    </svg>
);

const BitbucketLogo = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path
            fill="currentColor"
            d="M.778 1.213a.768.768 0 0 0-.768.892l3.263 19.81c.084.5.515.868 1.022.873H19.95a.772.772 0 0 0 .77-.646l3.27-20.03a.768.768 0 0 0-.768-.891zM14.52 15.53H9.522L8.17 8.466h7.561z"
        />
    </svg>
);

function GitHubAccountAvatar({ login, name, className = "size-6" }: { login: string; name?: string | null; className?: string }) {
    const [imageFailed, setImageFailed] = useState(false);
    const label = name?.trim() || login;
    const initials = label
        .split(/\s+/)
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();

    return (
        <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/40 bg-secondary text-[9px] font-medium text-muted-foreground ${className}`}>
            {!imageFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={`https://github.com/${encodeURIComponent(login)}.png?size=64`}
                    alt={`${label} GitHub avatar`}
                    className="size-full object-cover"
                    onError={() => setImageFailed(true)}
                />
            ) : initials}
        </span>
    );
}

function ConfigSection({
    icon,
    title,
    description,
    children,
}: {
    icon: React.ReactNode;
    title: string;
    description: string;
    children: React.ReactNode;
}) {
    return (
        <section className="border-b border-border/30 bg-[#f3f3f1] px-6 py-5 last:border-b-0 dark:bg-[#111111]">
            <div>
                <div className="flex items-center gap-2 text-[11px] font-medium">
                    <span className="text-muted-foreground">{icon}</span>
                    {title}
                </div>
                <p className="mt-1.5 max-w-[58ch] text-[9px] leading-4 text-muted-foreground">{description}</p>
            </div>
            <div className="mt-4 min-w-0">{children}</div>
        </section>
    );
}

const FRAMEWORKS = [
    { value: "arcie", label: "Arcie" },
    { value: "langgraph", label: "LangGraph" },
    { value: "crewai", label: "CrewAI" },
    { value: "openai-agents", label: "OpenAI Agents SDK" },
    { value: "mastra", label: "Mastra" },
    { value: "vercel-eve", label: "eve" },
];

interface Agent {
    id: string;
    slug: string;
    name: string;
    framework: string;
    repo_full_name: string | null;
    branch: string;
    status: string;
    hostname: string | null;
    current_deployment_id: string | null;
}
interface Deployment {
    id: string;
    version: number;
    status: string;
    commit_sha: string | null;
    created_at: string;
    updated_at: string;
    // Real commit metadata (populated by the push webhook); null on older rows.
    commit_message?: string | null;
    commit_author_name?: string | null;
    commit_author_login?: string | null;
    commit_author_email?: string | null;
    commit_author_is_team_member?: boolean | null;
    branch?: string | null;
    environment?: string | null;
    source?: string | null;
}
interface Repo {
    id: number;
    full_name: string;
    html_url: string | null;
    description: string | null;
}
interface GithubStatus {
    status: "installed" | "not_installed";
    organizationId: string;
    connectedAccounts?: { installationId: number; login: string; accountType?: string | null; name?: string | null }[];
    repositories?: Repo[];
}

interface SecretDraft {
    id: string;
    key: string;
    value: string;
}

const REPOSITORIES_PER_PAGE = 8;

const RESERVED_SECRET_KEYS = new Set([
    "PORT",
    "CENCORI_API_KEY",
    "CENCORI_API_URL",
    "REPO_FULL_NAME",
    "COMMIT_SHA",
    "ROOT_DIR",
    "FRAMEWORK",
    "INSTALL_COMMAND",
    "BUILD_COMMAND",
    "START_COMMAND",
    "GITHUB_TOKEN",
]);

// Deployment status → a colored signal dot with a neutral label.
const DSTATUS: Record<string, { label: string; dot: string }> = {
    active: { label: "Done", dot: "bg-emerald-400" },
    running: { label: "Done", dot: "bg-emerald-400" },
    building: { label: "Building", dot: "bg-amber-400" },
    failed: { label: "Failed", dot: "bg-red-400" },
    stopped: { label: "Paused", dot: "bg-zinc-400" },
    created: { label: "Queued", dot: "bg-sky-400" },
    archived: { label: "Archived", dot: "bg-zinc-500" },
};

// Agent-level sections (project ↔ agent 1:1). "Deployments" is the version
// history; the rest are the agent's config, not a single deployment's.
const AGENT_TABS = ["deployments", "channels", "schedules", "logs", "settings"] as const;

const DATE_RANGE_MS: Record<string, number> = {
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    "90d": 90 * 24 * 60 * 60 * 1000,
};

// ── Commit metadata the build pipeline will populate (backend plug-and-play). ──
// UI reads this shape; today we synthesize it per version until the pipeline
// captures commit author/message/branch/env from GitHub + a git→org-member lookup.
interface CommitMeta {
    message: string;
    branch: string;
    environment: "Production" | "Preview";
    author: { name: string; login: string; email: string; avatarUrl: string | null; isTeamMember: boolean };
}
const MOCK_COMMITS: Record<number, CommitMeta> = {
    4: { message: "feat: add Slack channel + approval flow", branch: "main", environment: "Production", author: { name: "Bola Banjo", login: "bolaabanjo", email: "bola@cencori.com", avatarUrl: "https://github.com/bolaabanjo.png?size=96", isTeamMember: true } },
    3: { message: "fix: retry on 429 from the gateway", branch: "fix/gateway-retry", environment: "Preview", author: { name: "Ada Obi", login: "ada-contrib", email: "ada-contrib@users.noreply.github.com", avatarUrl: null, isTeamMember: false } },
    2: { message: "chore: bump arcie to 0.4.1", branch: "main", environment: "Production", author: { name: "Bola Banjo", login: "bolaabanjo", email: "bola@cencori.com", avatarUrl: "https://github.com/bolaabanjo.png?size=96", isTeamMember: true } },
    1: { message: "initial deploy", branch: "main", environment: "Production", author: { name: "Bola Banjo", login: "bolaabanjo", email: "bola@cencori.com", avatarUrl: "https://github.com/bolaabanjo.png?size=96", isTeamMember: true } },
};
function commitMeta(d: Deployment): CommitMeta {
    // Real commit data from the push webhook, when present.
    if (d.commit_message) {
        const login = d.commit_author_login ?? "";
        return {
            message: d.commit_message,
            branch: d.branch ?? "main",
            environment: (d.environment ?? "").toLowerCase() === "preview" ? "Preview" : "Production",
            author: {
                name: d.commit_author_name || login || "unknown",
                login,
                email: d.commit_author_email ?? "",
                avatarUrl: login ? `https://github.com/${login}.png?size=96` : null,
                isTeamMember: !!d.commit_author_is_team_member,
            },
        };
    }
    // Fallback for older / seeded / manual rows without captured commit metadata.
    return MOCK_COMMITS[d.version] ?? { message: `deploy v${d.version}`, branch: "main", environment: "Production", author: { name: "Bola Banjo", login: "bolaabanjo", email: "bola@cencori.com", avatarUrl: "https://github.com/bolaabanjo.png?size=96", isTeamMember: true } };
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

function buildDuration(deployment: Deployment, now: number | null): string {
    const isInProgress = deployment.status === "building" || deployment.status === "created";
    const start = new Date(deployment.created_at).getTime();
    const end = isInProgress ? now : new Date(deployment.updated_at).getTime();
    if (end === null || !Number.isFinite(start) || !Number.isFinite(end)) return "0s";

    const elapsedSeconds = Math.max(0, Math.floor((end - start) / 1000));
    const totalSeconds = isInProgress ? elapsedSeconds : Math.min(60, elapsedSeconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (!isInProgress && totalSeconds === 60) return "1m";
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

function AuthorFace({ author, className }: { author: CommitMeta["author"]; className: string }) {
    const [imageFailed, setImageFailed] = useState(false);
    const initials = author.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

    return (
        <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/50 bg-secondary font-medium text-muted-foreground ${className}`}>
            {author.avatarUrl && !imageFailed ? (
                // The browser load lets us immediately fall back when GitHub has no usable avatar.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={author.avatarUrl}
                    alt=""
                    className="size-full object-cover"
                    onError={() => setImageFailed(true)}
                />
            ) : initials}
        </span>
    );
}

function Avatar({ author }: { author: CommitMeta["author"] }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span
                    className="relative size-8 shrink-0 cursor-pointer"
                    role="img"
                    aria-label={`${author.name}, @${author.login}`}
                >
                    <AuthorFace author={author} className="size-8 text-[11px]" />
                    {author.isTeamMember && (
                        <HugeiconsIcon
                            icon={CheckmarkBadge02Icon}
                            className="absolute -right-1 -bottom-1 size-4 rounded-full bg-background text-emerald-400"
                            strokeWidth={2}
                            aria-hidden="true"
                        />
                    )}
                </span>
            </TooltipTrigger>
            <TooltipContent
                side="top"
                sideOffset={10}
                className="w-72 rounded-lg border border-border bg-popover p-0 text-popover-foreground shadow-xl"
            >
                <div className="flex items-center gap-3 p-3">
                    <AuthorFace author={author} className="size-9 text-xs" />
                    <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-foreground">{author.name}</p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">@{author.login}</p>
                    </div>
                </div>
                <div className="space-y-2 border-t border-border/60 px-3 py-2.5 text-[11px]">
                    <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
                        <span className="text-muted-foreground">GitHub</span>
                        <span className="truncate font-mono text-foreground">@{author.login}</span>
                    </div>
                    <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
                        <span className="text-muted-foreground">Commit email</span>
                        <span className="break-all font-mono text-foreground">{author.email}</span>
                    </div>
                </div>
                <div className={`flex items-center gap-2 border-t border-border/60 px-3 py-2.5 text-[11px] ${author.isTeamMember ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                    {author.isTeamMember ? (
                        <HugeiconsIcon
                            icon={UserCircleIcon}
                            className="size-4 shrink-0"
                            strokeWidth={2}
                            aria-hidden="true"
                        />
                    ) : (
                        <HugeiconsIcon
                            icon={AlertCircleIcon}
                            className="size-4 shrink-0"
                            strokeWidth={2}
                            aria-hidden="true"
                        />
                    )}
                    {author.isTeamMember
                        ? "Member of this Cencori organization"
                        : "Not a member of this Cencori organization"}
                </div>
            </TooltipContent>
        </Tooltip>
    );
}

function DeploymentActionsMenu({
    deployment,
    isCurrent,
    isBusy,
    onRedeploy,
    onRollback,
    onCopyCommit,
}: {
    deployment: Deployment;
    isCurrent: boolean;
    isBusy: boolean;
    onRedeploy: () => void;
    onRollback: () => void;
    onCopyCommit: () => void;
}) {
    const cannotStartDeployment = isBusy || deployment.status === "building" || deployment.status === "created";

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                    aria-label={`Actions for deployment v${deployment.version}`}
                >
                    <MoreVertical className="size-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="w-40">
                <DropdownMenuItem disabled={cannotStartDeployment} onSelect={onRedeploy}>
                    Redeploy
                </DropdownMenuItem>
                <DropdownMenuItem
                    disabled={cannotStartDeployment || isCurrent || !deployment.commit_sha}
                    onSelect={onRollback}
                >
                    Rollback
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!deployment.commit_sha} onSelect={onCopyCommit}>
                    Copy
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function useProjectId(orgSlug: string, projectSlug: string) {
    return useProjectIdBySlug(orgSlug, projectSlug);
}

export default function DeploymentsPage({ params }: PageProps) {
    const { orgSlug, projectSlug } = use(params);
    const queryClient = useQueryClient();

    const { data: projectId, isLoading: projectLoading } = useProjectId(orgSlug, projectSlug);

    const { data: agentsData, isLoading: agentsLoading } = useQuery<{ agents: Agent[] }>({
        queryKey: ["agents", projectId],
        queryFn: async () => {
            const res = await fetch(`/api/projects/${projectId}/agents`);
            if (!res.ok) throw new Error("Failed to load deployments");
            return res.json();
        },
        enabled: !!projectId,
    });
    const agent = agentsData?.agents?.[0];

    // The agent's deployment history (once it exists).
    const { data: detail } = useQuery<{ agent: Agent; deployments: Deployment[] }>({
        queryKey: ["agent-detail", projectId, agent?.id],
        queryFn: async () => {
            const res = await fetch(`/api/projects/${projectId}/agents/${agent!.id}`);
            if (!res.ok) throw new Error("Failed to load agent");
            return res.json();
        },
        enabled: !!projectId && !!agent,
        refetchInterval: (q) => (q.state.data?.deployments?.some((d) => d.status === "building") ? 4000 : false),
    });
    const deployments = detail?.deployments ?? [];
    const hasDeploymentInProgress = deployments.some((d) => d.status === "building" || d.status === "created");
    const [now, setNow] = useState<number | null>(null);

    useEffect(() => {
        if (!hasDeploymentInProgress) return;
        setNow(Date.now());
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [hasDeploymentInProgress]);

    // GitHub repos only matter when there's no agent yet.
    const { data: github, isLoading: githubLoading } = useQuery<GithubStatus>({
        queryKey: ["github-status", orgSlug],
        queryFn: async () => {
            const res = await fetch(`/api/github/status?orgSlug=${encodeURIComponent(orgSlug)}`);
            if (!res.ok) throw new Error("Failed to load GitHub status");
            return res.json();
        },
        enabled: !!projectId && !agentsLoading && !agent,
        staleTime: 60 * 1000,
    });

    const [repoSearch, setRepoSearch] = useState("");
    const [repoPage, setRepoPage] = useState(1);
    const [githubAccountFilter, setGithubAccountFilter] = useState("all");
    const [addingGithubAccount, setAddingGithubAccount] = useState(false);
    const [configRepo, setConfigRepo] = useState<Repo | null>(null);
    const [form, setForm] = useState({ name: "", branch: "main", rootDir: "/", framework: "arcie" });
    const [detecting, setDetecting] = useState(false);
    const [detected, setDetected] = useState<{ framework: string | null; displayName?: string; compatibility?: string } | null>(null);
    const [secrets, setSecrets] = useState<SecretDraft[]>([]);
    const [deploymentSearch, setDeploymentSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [environmentFilter, setEnvironmentFilter] = useState("all");
    const [dateFilter, setDateFilter] = useState("all");
    const [authorFilter, setAuthorFilter] = useState("all");
    const [branchFilter, setBranchFilter] = useState("all");
    const [rollbackTarget, setRollbackTarget] = useState<Deployment | null>(null);
    const [section, setSection] = useState<(typeof AGENT_TABS)[number]>("deployments");
    const [confirmDelete, setConfirmDelete] = useState(false);

    const addGithubAccount = async () => {
        if (addingGithubAccount) return;
        setAddingGithubAccount(true);
        try {
            const response = await fetch(`/api/github/install-url?orgSlug=${encodeURIComponent(orgSlug)}`);
            if (!response.ok) throw new Error("Failed to create GitHub installation URL");
            const { url } = await response.json();
            window.location.assign(url);
        } catch {
            setAddingGithubAccount(false);
            toast.error("Could not open GitHub. Please try again.");
        }
    };

    useEffect(() => {
        setRepoPage(1);
    }, [repoSearch, githubAccountFilter]);

    const deleteAgent = useMutation({
        mutationFn: async () => {
            const res = await fetch(`/api/projects/${projectId}/agents/${agent!.id}`, { method: "DELETE" });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || err.error || "Failed to delete agent");
            }
            return res.json();
        },
        onSuccess: () => {
            setConfirmDelete(false);
            setSection("deployments");
            queryClient.invalidateQueries({ queryKey: ["agents", projectId] });
            toast.success("Agent deleted");
        },
        onError: (e: Error) => toast.error(e.message),
    });

    const deployMutation = useMutation({
        mutationFn: async (data: {
            repoFullName: string;
            repoId: number;
            name: string;
            branch: string;
            rootDir: string;
            framework: string;
            secrets: Array<{ key: string; value: string }>;
        }) => {
            const createRes = await fetch(`/api/projects/${projectId}/agents`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (!createRes.ok) {
                const err = await createRes.json().catch(() => ({}));
                throw new Error(err.message || err.error || "Failed to create deployment");
            }
            const { agent: created } = await createRes.json();
            const deployRes = await fetch(`/api/projects/${projectId}/agents/${created.id}/deploy`, { method: "POST" });
            if (!deployRes.ok) {
                const err = await deployRes.json().catch(() => ({}));
                throw new Error(err.message || err.error || "Created, but deploy failed to start");
            }
            return created as Agent;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["agents", projectId] });
            setConfigRepo(null);
            toast.success("Deploy started");
        },
        onError: (e: Error) => toast.error(e.message),
    });

    const deploymentActionMutation = useMutation({
        mutationFn: async ({ sourceDeploymentId }: { sourceDeploymentId?: string }) => {
            if (!agent) throw new Error("Agent not found");
            const res = await fetch(`/api/projects/${projectId}/agents/${agent.id}/deploy`, {
                method: "POST",
                headers: sourceDeploymentId ? { "Content-Type": "application/json" } : undefined,
                body: sourceDeploymentId ? JSON.stringify({ sourceDeploymentId }) : undefined,
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || err.error || "Failed to start deployment");
            }
            return res.json();
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ["agent-detail", projectId, agent?.id] });
            queryClient.invalidateQueries({ queryKey: ["agents", projectId] });
            setRollbackTarget(null);
            toast.success(variables.sourceDeploymentId ? "Rollback started" : "Redeploy started");
        },
        onError: (e: Error) => toast.error(e.message),
    });

    const copyCommitSha = async (sha: string) => {
        try {
            await navigator.clipboard.writeText(sha);
            toast.success("Commit SHA copied");
        } catch {
            toast.error("Could not copy commit SHA");
        }
    };

    // Detect the framework the instant a repo is picked → pre-select the dropdown.
    const detectFramework = async (repo: Repo) => {
        setDetecting(true);
        setDetected(null);
        try {
            const res = await fetch("/api/github/detect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orgSlug, repoFullName: repo.full_name, branch: "main", rootDir: "/" }),
            });
            const data = await res.json();
            if (data.detected && data.framework && FRAMEWORKS.some((f) => f.value === data.framework)) {
                setForm((p) => ({ ...p, framework: data.framework }));
                setDetected({ framework: data.framework, displayName: data.displayName, compatibility: data.compatibility });
            } else {
                setForm((p) => ({ ...p, framework: "custom" }));
                setDetected({ framework: null });
            }
        } catch {
            setDetected(null);
        } finally {
            setDetecting(false);
        }
    };

    const openConfigure = (repo: Repo) => {
        setConfigRepo(repo);
        setForm({ name: repo.full_name.split("/")[1] ?? "", branch: "main", rootDir: "/", framework: "arcie" });
        setSecrets([]);
        detectFramework(repo);
    };

    const addSecret = () => {
        setSecrets((current) => [
            ...current,
            { id: `secret-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, key: "", value: "" },
        ]);
    };

    const updateSecret = (id: string, field: "key" | "value", value: string) => {
        setSecrets((current) => current.map((secret) => secret.id === id ? { ...secret, [field]: value } : secret));
    };

    const removeSecret = (id: string) => {
        setSecrets((current) => current.filter((secret) => secret.id !== id));
    };

    const configuredSecrets = secrets
        .map((secret) => ({ key: secret.key.trim(), value: secret.value }))
        .filter((secret) => secret.key || secret.value);
    const secretKeys = configuredSecrets.map((secret) => secret.key.toUpperCase());
    const hasInvalidSecret = configuredSecrets.some((secret) =>
        !/^[A-Za-z_][A-Za-z0-9_]*$/.test(secret.key)
        || !secret.value
        || RESERVED_SECRET_KEYS.has(secret.key.toUpperCase())
    )
        || new Set(secretKeys).size !== secretKeys.length;

    const connectedGithubAccounts = (github?.connectedAccounts ?? []).filter((account) => !!account.login);
    const selectedGithubAccount = githubAccountFilter === "all"
        ? connectedGithubAccounts.length === 1 ? connectedGithubAccounts[0] : null
        : connectedGithubAccounts.find((account) => account.login.toLowerCase() === githubAccountFilter);
    const normalizedRepoSearch = repoSearch.trim().toLowerCase();
    const repos = (github?.repositories ?? []).filter((repo) => {
        const [owner] = repo.full_name.split("/");
        const matchesAccount = githubAccountFilter === "all" || owner?.toLowerCase() === githubAccountFilter;
        return matchesAccount && (!normalizedRepoSearch || repo.full_name.toLowerCase().includes(normalizedRepoSearch));
    });
    const repoPageCount = Math.max(1, Math.ceil(repos.length / REPOSITORIES_PER_PAGE));
    const safeRepoPage = Math.min(repoPage, repoPageCount);
    const visibleRepos = repos.slice(
        (safeRepoPage - 1) * REPOSITORIES_PER_PAGE,
        safeRepoPage * REPOSITORIES_PER_PAGE,
    );
    const visibleRepoStart = repos.length === 0 ? 0 : (safeRepoPage - 1) * REPOSITORIES_PER_PAGE + 1;
    const visibleRepoEnd = Math.min(safeRepoPage * REPOSITORIES_PER_PAGE, repos.length);
    const deploymentRows = deployments.map((deployment) => ({ deployment, meta: commitMeta(deployment) }));
    const branches = Array.from(new Set(deploymentRows.map(({ meta }) => meta.branch))).sort();
    const organizationAuthors = Array.from(
        new Map(
            deploymentRows
                .map(({ meta }) => meta.author)
                .filter((author) => author.isTeamMember)
                .map((author) => [author.login, author]),
        ).values(),
    ).sort((a, b) => a.name.localeCompare(b.name));
    const normalizedDeploymentSearch = deploymentSearch.trim().toLowerCase();
    const filteredDeploymentRows = deploymentRows.filter(({ deployment, meta }) => {
        const statusLabel = (DSTATUS[deployment.status] ?? DSTATUS.created).label.toLowerCase();
        const deploymentCreatedAt = new Date(deployment.created_at).getTime();
        const matchesDate = dateFilter === "all" || (
            Number.isFinite(deploymentCreatedAt) &&
            deploymentCreatedAt >= Date.now() - DATE_RANGE_MS[dateFilter]
        );
        const searchable = [
            meta.message,
            meta.branch,
            meta.environment,
            meta.author.name,
            meta.author.login,
            meta.author.email,
            deployment.commit_sha,
            `v${deployment.version}`,
        ].filter(Boolean).join(" ").toLowerCase();

        return (
            (!normalizedDeploymentSearch || searchable.includes(normalizedDeploymentSearch)) &&
            (statusFilter === "all" || statusLabel === statusFilter) &&
            (environmentFilter === "all" || meta.environment.toLowerCase() === environmentFilter) &&
            matchesDate &&
            (authorFilter === "all" || meta.author.login === authorFilter) &&
            (branchFilter === "all" || meta.branch === branchFilter)
        );
    });
    const hasDeploymentFilters = Boolean(normalizedDeploymentSearch) || statusFilter !== "all" || environmentFilter !== "all" || dateFilter !== "all" || authorFilter !== "all" || branchFilter !== "all";

    const clearDeploymentFilters = () => {
        setDeploymentSearch("");
        setStatusFilter("all");
        setEnvironmentFilter("all");
        setDateFilter("all");
        setAuthorFilter("all");
        setBranchFilter("all");
    };

    if (projectLoading || agentsLoading) {
        return (
            <div className="w-full max-w-4xl mx-auto px-6 py-8">
                <Skeleton className="h-5 w-32 mb-2" />
                <Skeleton className="h-3 w-72 mb-6" />
                <Skeleton className="h-40 w-full" />
            </div>
        );
    }

    // ── AGENT EXISTS → the deployment history (list is the primary view) ──
    if (agent) {
        return (
            <div className="w-full max-w-4xl mx-auto px-6 py-8">
                {/* Agent-level sections */}
                <div className="flex gap-0.5 border-b border-border/40 mb-6">
                    {AGENT_TABS.map((t) => (
                        <button
                            key={t}
                            onClick={() => setSection(t)}
                            className={`px-3 py-2 text-xs -mb-px border-b-2 capitalize transition-colors ${section === t ? "text-foreground border-foreground" : "text-muted-foreground border-transparent hover:text-foreground"}`}
                        >
                            {t}
                        </button>
                    ))}
                </div>

                {section === "settings" ? (
                    <div className="space-y-4">
                        <div className="border border-border/40 rounded-lg bg-card">
                            <div className="px-4 py-3 border-b border-border/40"><p className="text-[13px] font-medium">Agent</p></div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 p-4 text-[12.5px]">
                                <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground font-mono mb-1">Name</div>{agent?.name}</div>
                                <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground font-mono mb-1">Repo</div><span className="font-mono">{agent?.repo_full_name}</span></div>
                                <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground font-mono mb-1">Branch</div><span className="font-mono">{agent?.branch}</span></div>
                            </div>
                        </div>
                        <div className="border border-red-500/30 rounded-lg bg-red-500/[0.03]">
                            <div className="px-4 py-3 border-b border-red-500/20"><p className="text-[13px] font-medium text-red-400">Danger zone</p></div>
                            <div className="flex items-center justify-between p-4 gap-4">
                                <div>
                                    <p className="text-[13px] font-medium">Delete this agent</p>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">Stops its machines and removes the agent and all its deployments. The project can then deploy a new one.</p>
                                </div>
                                <Button size="sm" variant="outline" className="h-8 text-xs border-red-500/40 text-red-400 hover:bg-red-500/10 shrink-0" onClick={() => setConfirmDelete(true)}>
                                    Delete agent
                                </Button>
                            </div>
                        </div>
                    </div>
                ) : section !== "deployments" ? (
                    <div className="border border-border/40 rounded-lg bg-card py-16 text-center">
                        <p className="text-sm font-medium mb-1 capitalize">{section}</p>
                        <p className="text-xs text-muted-foreground">Agent-level {section} — coming soon.</p>
                    </div>
                ) : (
                    <>
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-[13px] font-medium">Deployments</h2>
                    <span className="font-mono text-[10px] text-muted-foreground">
                        {filteredDeploymentRows.length} / {deployments.length}
                    </span>
                </div>

                <div className="mb-3 space-y-2">
                    <div className="relative min-w-0">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/80" />
                        <Input
                            value={deploymentSearch}
                            onChange={(event) => setDeploymentSearch(event.target.value)}
                            placeholder="Search commits, authors, branches, SHA…"
                            aria-label="Search deployments"
                            className="h-9 border-border/40 bg-background/50 pl-9 pr-16 text-xs shadow-none focus-visible:border-border"
                        />
                        {hasDeploymentFilters && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="absolute right-1 top-1/2 h-7 -translate-y-1/2 px-2.5 text-[11px] text-muted-foreground"
                                onClick={clearDeploymentFilters}
                            >
                                Clear
                            </Button>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger aria-label="Filter by status" className="h-8 min-w-0 border-border/40 bg-background/40 px-2.5 py-0 text-[11px] shadow-none">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All statuses</SelectItem>
                                <SelectItem value="building">Building</SelectItem>
                                <SelectItem value="done">Done</SelectItem>
                                <SelectItem value="failed">Failed</SelectItem>
                                <SelectItem value="paused">Paused</SelectItem>
                                <SelectItem value="queued">Queued</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={environmentFilter} onValueChange={setEnvironmentFilter}>
                            <SelectTrigger aria-label="Filter by environment" className="h-8 min-w-0 border-border/40 bg-background/40 px-2.5 py-0 text-[11px] shadow-none">
                                <SelectValue placeholder="Environment" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All environments</SelectItem>
                                <SelectItem value="production">Production</SelectItem>
                                <SelectItem value="preview">Preview</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={dateFilter} onValueChange={setDateFilter}>
                            <SelectTrigger aria-label="Filter by deployment date" className="h-8 min-w-0 border-border/40 bg-background/40 px-2.5 py-0 text-[11px] shadow-none">
                                <SelectValue placeholder="Date" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All time</SelectItem>
                                <SelectItem value="24h">Last 24 hours</SelectItem>
                                <SelectItem value="7d">Last 7 days</SelectItem>
                                <SelectItem value="30d">Last 30 days</SelectItem>
                                <SelectItem value="90d">Last 90 days</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={authorFilter} onValueChange={setAuthorFilter}>
                            <SelectTrigger aria-label="Filter by author" className="h-8 min-w-0 border-border/40 bg-background/40 px-2.5 py-0 text-[11px] shadow-none">
                                <SelectValue placeholder="Author" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All authors</SelectItem>
                                {organizationAuthors.map((author) => (
                                    <SelectItem key={author.login} value={author.login} textValue={author.name}>
                                        <span className="flex items-center gap-2">
                                            <AuthorFace author={author} className="size-5 text-[8px]" />
                                            <span className="truncate">{author.name}</span>
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={branchFilter} onValueChange={setBranchFilter}>
                            <SelectTrigger aria-label="Filter by branch" className="h-8 min-w-0 border-border/40 bg-background/40 px-2.5 py-0 text-[11px] shadow-none">
                                <SelectValue placeholder="Branch" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All branches</SelectItem>
                                {branches.map((branch) => (
                                    <SelectItem key={branch} value={branch}>{branch}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="overflow-hidden rounded-xl bg-[#f3f3f1] ring-1 ring-inset ring-black/[0.055] dark:bg-[#111111] dark:ring-white/[0.055]">
                    {deployments.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-10">No deployments yet.</p>
                    ) : filteredDeploymentRows.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                            <p className="text-xs text-muted-foreground">No deployments match these filters.</p>
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearDeploymentFilters}>Clear filters</Button>
                        </div>
                    ) : filteredDeploymentRows.map(({ deployment: d, meta: c }) => {
                        const s = DSTATUS[d.status] ?? DSTATUS.created;
                        const isDeploymentBuilding = d.status === "building" || d.status === "created";
                        const detailsHref = `/${orgSlug}/${projectSlug}/deployments/${agent.id}?d=${d.id}`;
                        return (
                            <div
                                key={d.id}
                                className="flex items-stretch border-b border-black/[0.055] transition-colors last:border-b-0 hover:bg-black/[0.025] dark:border-white/[0.055] dark:hover:bg-white/[0.025]"
                            >
                                <Link
                                    href={detailsHref}
                                    className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3 md:grid md:grid-cols-[8rem_minmax(0,18rem)_7rem_minmax(0,1fr)_auto]"
                                >
                                    {/* Status */}
                                    <div className="flex w-32 shrink-0 items-center gap-2">
                                        <span className="inline-flex items-center gap-2 text-[11px] font-medium text-foreground">
                                            <span className={`size-2 shrink-0 rounded-full ${s.dot}`} aria-hidden="true" />
                                            <span
                                                className={d.status === "building" ? "deployment-building-shimmer" : undefined}
                                                data-text={d.status === "building" ? s.label : undefined}
                                            >
                                                {s.label}
                                            </span>
                                        </span>
                                        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                                            {buildDuration(d, now)}
                                        </span>
                                    </div>
                                    {/* Commit */}
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[13px]">{c.message}</p>
                                        <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                                            <GitCommitHorizontal className="h-3 w-3" />
                                            {d.commit_sha ? d.commit_sha.slice(0, 7) : "—"}
                                            <span className="text-muted-foreground/40">·</span>
                                            <GitBranch className="h-3 w-3" />{c.branch}
                                        </div>
                                    </div>
                                    {/* Environment */}
                                    <div className="hidden w-28 shrink-0 justify-center md:flex">
                                        <span className={`inline-flex h-6 items-center gap-1.5 rounded-md border pl-2.5 pr-1 text-[10px] font-mono transition-colors ${isDeploymentBuilding ? "border-zinc-400/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300" : c.environment === "Production" ? "border-blue-500/20 bg-blue-500/[0.08] text-blue-600 dark:text-blue-400" : "border-violet-500/20 bg-violet-500/[0.08] text-violet-600 dark:text-violet-400"}`}>
                                            {c.environment}
                                            {c.environment === "Production" && (
                                                <HugeiconsIcon icon={UploadCircle01Icon} className="size-4" strokeWidth={1.8} aria-hidden="true" />
                                            )}
                                            {c.environment === "Preview" && (
                                                <HugeiconsIcon icon={ViewIcon} className="size-4" strokeWidth={1.8} aria-hidden="true" />
                                            )}
                                        </span>
                                    </div>
                                    {/* Time + author */}
                                    <div className="flex shrink-0 items-center gap-2 md:col-start-5">
                                        <span className="w-16 text-right font-mono text-[11px] text-muted-foreground">{rel(d.created_at)}</span>
                                        <div className="hidden sm:block">
                                            <Avatar author={c.author} />
                                        </div>
                                    </div>
                                </Link>
                                <div className="flex shrink-0 items-center pr-2">
                                    <DeploymentActionsMenu
                                        deployment={d}
                                        isCurrent={agent.current_deployment_id === d.id}
                                        isBusy={hasDeploymentInProgress || deploymentActionMutation.isPending}
                                        onRedeploy={() => deploymentActionMutation.mutate({})}
                                        onRollback={() => setRollbackTarget(d)}
                                        onCopyCommit={() => d.commit_sha && void copyCommitSha(d.commit_sha)}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>

                <Dialog open={!!rollbackTarget} onOpenChange={(open) => !open && setRollbackTarget(null)}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Roll back to deployment v{rollbackTarget?.version}</DialogTitle>
                            <DialogDescription>
                                This creates a new production deployment from commit {rollbackTarget?.commit_sha?.slice(0, 7)}.
                                The current deployment stays live until the rollback build succeeds.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setRollbackTarget(null)}
                                disabled={deploymentActionMutation.isPending}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={() => rollbackTarget && deploymentActionMutation.mutate({ sourceDeploymentId: rollbackTarget.id })}
                                disabled={!rollbackTarget || deploymentActionMutation.isPending}
                            >
                                {deploymentActionMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                                Roll back
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
                    </>
                )}

                {/* Confirm delete — outside the section conditional so it renders on any tab (incl. Settings). */}
                <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                    <DialogContent className="sm:max-w-[440px]">
                        <DialogHeader>
                            <DialogTitle className="text-base">Delete agent?</DialogTitle>
                            <DialogDescription className="text-xs">
                                This stops <span className="font-mono">{agent?.name}</span>&apos;s machines and permanently removes the agent and all its deployments. This can&apos;t be undone.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" size="sm" className="h-8 text-xs" disabled={deleteAgent.isPending} onClick={() => setConfirmDelete(false)}>Cancel</Button>
                            <Button size="sm" className="h-8 text-xs bg-red-600 text-white hover:bg-red-600/90" disabled={deleteAgent.isPending} onClick={() => deleteAgent.mutate()}>
                                {deleteAgent.isPending ? (<><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />Deleting…</>) : "Delete agent"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        );
    }

    // ── NO AGENT → deploy the project's one agent ──
    const notInstalled = !githubLoading && github?.status !== "installed";
    return (
        <div className="w-full max-w-4xl mx-auto px-6 py-8">
            <div className="mb-6">
                <h1 className="text-lg font-semibold">Deployments</h1>
                <p className="text-xs text-muted-foreground mt-0.5 max-w-[60ch]">
                    Deploy this project&apos;s agent from a repo. Cencori builds and hosts it — endpoint, channels, and
                    schedules included. One agent per project; its versions live here.
                </p>
            </div>

            {notInstalled ? (
                <div className="text-center py-16 border border-border/40 rounded-lg bg-card">
                    <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center mx-auto mb-4">
                        <GitHubLogo className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium mb-1">Connect GitHub to deploy</p>
                    <p className="text-xs text-muted-foreground max-w-[320px] mx-auto mb-4">
                        Install the Cencori GitHub App on this organization, then deploy this project&apos;s agent from any of your repos.
                    </p>
                    <Button asChild size="sm" className="h-8 text-xs">
                        <a href={`/${orgSlug}/~/projects/import/github`}>Connect GitHub</a>
                    </Button>
                </div>
            ) : (
                <>
                    <div className="mb-3 grid gap-2 sm:grid-cols-2">
                        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-border/30 bg-[#f3f3f1] px-3 transition-colors focus-within:border-foreground/20 dark:bg-[#111111]">
                            <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                            <input
                                value={repoSearch}
                                onChange={(e) => setRepoSearch(e.target.value)}
                                placeholder="Search repositories"
                                className="w-full border-none bg-transparent text-xs outline-none placeholder:text-muted-foreground/65"
                                aria-label="Search repositories"
                            />
                            {repoSearch && (
                                <button type="button" onClick={() => setRepoSearch("")} className="text-[9px] text-muted-foreground transition-colors hover:text-foreground">
                                    Clear
                                </button>
                            )}
                        </label>
                        {githubLoading ? (
                            <Skeleton className="h-9 w-full rounded-md" aria-hidden="true" />
                        ) : connectedGithubAccounts.length > 0 ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-9 w-full shrink-0 gap-2 rounded-md border-border/30 bg-[#f3f3f1] px-2.5 shadow-none transition-colors hover:bg-secondary dark:bg-[#111111]"
                                        aria-label="Select GitHub account"
                                    >
                                        {selectedGithubAccount ? (
                                            <GitHubAccountAvatar
                                                login={selectedGithubAccount.login}
                                                name={selectedGithubAccount.name}
                                                className="size-5"
                                            />
                                        ) : (
                                            <span className="flex size-5 items-center justify-center rounded-md border border-border/40 bg-secondary">
                                                <GitHubLogo className="size-3 text-muted-foreground" />
                                            </span>
                                        )}
                                        <span className="min-w-0 truncate font-mono text-[10px]">
                                            {selectedGithubAccount ? selectedGithubAccount.login : "All accounts"}
                                        </span>
                                        <ChevronDown className="ml-auto size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    align="end"
                                    className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[var(--radix-dropdown-menu-trigger-width)] p-1.5"
                                >
                                    {connectedGithubAccounts.length > 1 && (
                                        <DropdownMenuItem
                                            onClick={() => setGithubAccountFilter("all")}
                                            className="flex items-center gap-2.5 rounded-md px-2 py-2"
                                        >
                                            <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/40 bg-secondary">
                                                <GitHubLogo className="size-3.5 text-muted-foreground" />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-[11px] font-medium">All accounts</span>
                                                <span className="block text-[9px] text-muted-foreground">Every connected repository</span>
                                            </span>
                                            {githubAccountFilter === "all" && <Check className="size-3.5" aria-hidden="true" />}
                                        </DropdownMenuItem>
                                    )}
                                    {connectedGithubAccounts.map((account) => {
                                        const accountValue = account.login.toLowerCase();
                                        const isSelected = githubAccountFilter === accountValue
                                            || (connectedGithubAccounts.length === 1 && githubAccountFilter === "all");
                                        return (
                                            <DropdownMenuItem
                                                key={account.installationId}
                                                onClick={() => setGithubAccountFilter(accountValue)}
                                                className="flex items-center gap-2.5 rounded-md px-2 py-2"
                                            >
                                                <GitHubAccountAvatar login={account.login} name={account.name} className="size-7" />
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-[11px] font-medium">{account.name || account.login}</span>
                                                </span>
                                                {isSelected && <Check className="size-3.5" aria-hidden="true" />}
                                            </DropdownMenuItem>
                                            );
                                        })}
                                    <DropdownMenuItem
                                        onSelect={() => void addGithubAccount()}
                                        disabled={addingGithubAccount}
                                        className="flex items-center gap-2.5 rounded-md px-2 py-2"
                                    >
                                        <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/40 bg-secondary">
                                            <Plus className="size-3.5" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-[11px] font-medium">
                                                {addingGithubAccount ? "Opening GitHub…" : "Add GitHub account"}
                                            </span>
                                        </span>
                                    </DropdownMenuItem>
                                    <DropdownMenuSub>
                                        <DropdownMenuSubTrigger className="flex items-center gap-2.5 rounded-md px-2 py-2">
                                            <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/40 bg-secondary">
                                                <HugeiconsIcon icon={AccessIcon} className="size-3.5" />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-[11px] font-medium">Switch Git provider</span>
                                            </span>
                                        </DropdownMenuSubTrigger>
                                        <DropdownMenuSubContent className="w-56 p-1.5">
                                            <DropdownMenuLabel className="px-2 pb-1 pt-1.5 text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                                                Git provider
                                            </DropdownMenuLabel>
                                            <DropdownMenuItem className="flex items-center gap-2.5 rounded-md px-2 py-2">
                                                <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/40 bg-secondary">
                                                    <GitHubLogo className="size-3.5 text-muted-foreground" />
                                                </span>
                                                <span className="flex-1 text-[11px] font-medium">GitHub</span>
                                                <Check className="size-3.5" />
                                            </DropdownMenuItem>
                                            <DropdownMenuItem disabled className="flex items-center gap-2.5 rounded-md px-2 py-2">
                                                <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/40 bg-secondary">
                                                    <LogoGitlab size={14} className="text-muted-foreground" />
                                                </span>
                                                <span className="flex-1 text-[11px] font-medium">GitLab</span>
                                                <span className="text-[8px] text-muted-foreground">Coming soon</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem disabled className="flex items-center gap-2.5 rounded-md px-2 py-2">
                                                <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/40 bg-secondary">
                                                    <BitbucketLogo className="size-3.5 text-muted-foreground" />
                                                </span>
                                                <span className="flex-1 text-[11px] font-medium">Bitbucket</span>
                                                <span className="text-[8px] text-muted-foreground">Coming soon</span>
                                            </DropdownMenuItem>
                                        </DropdownMenuSubContent>
                                    </DropdownMenuSub>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : null}
                    </div>
                    <section className="overflow-hidden rounded-xl border border-border/25 bg-[#f3f3f1] dark:bg-[#111111]">
                    <div className="min-h-96 bg-background/15">
                        {githubLoading ? (
                            <div className="divide-y divide-border/25">
                                {Array.from({ length: REPOSITORIES_PER_PAGE }).map((_, index) => (
                                    <div key={index} className="flex h-12 items-center gap-3 px-4">
                                        <Skeleton className="size-8 shrink-0 rounded-md" />
                                        <div className="min-w-0 flex-1">
                                            <Skeleton className="h-3 w-52 max-w-[55%]" />
                                        </div>
                                        <Skeleton className="h-7 w-16 shrink-0 rounded-md" />
                                    </div>
                                ))}
                            </div>
                        ) : repos.length === 0 ? (
                            <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
                                <span className="flex size-9 items-center justify-center rounded-lg border border-border/30 bg-background/45">
                                    <Search className="size-4 text-muted-foreground" />
                                </span>
                                <p className="mt-3 text-xs font-medium">No repositories found</p>
                                <p className="mt-1 max-w-xs text-[10px] leading-4 text-muted-foreground">
                                    Try another name or switch to a different GitHub account.
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-border/25">
                                {visibleRepos.map((repo) => {
                                    const [owner, name] = repo.full_name.split("/");
                                    return (
                                        <div key={repo.id} className="group flex h-12 items-center gap-3 px-4 transition-colors hover:bg-foreground/[0.025]">
                                            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/25 bg-background/45">
                                                <GitHubLogo className="size-3.5 text-muted-foreground" />
                                            </span>
                                            <p className="min-w-0 flex-1 truncate text-[12px]">
                                                <span className="text-muted-foreground">{owner}/</span>
                                                <span className="font-medium text-foreground">{name}</span>
                                            </p>
                                            <Button size="sm" className="h-7 shrink-0 px-3 text-[10px]" onClick={() => openConfigure(repo)}>
                                                Import
                                            </Button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    <footer className="flex min-h-11 items-center justify-between gap-3 border-t border-border/30 px-4 py-2.5">
                        {githubLoading ? (
                            <>
                                <Skeleton className="h-3 w-16" aria-hidden="true" />
                                <Skeleton className="h-7 w-24 rounded-md" aria-hidden="true" />
                            </>
                        ) : (
                            <>
                                <p className="text-[10px] tabular-nums text-muted-foreground">
                                    {repos.length > 0
                                        ? `${visibleRepoStart.toLocaleString()}–${visibleRepoEnd.toLocaleString()} of ${repos.length.toLocaleString()}`
                                        : "0 repositories"}
                                </p>
                                <div className="flex items-center gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-7"
                                        disabled={safeRepoPage <= 1}
                                        onClick={() => setRepoPage((page) => Math.max(1, page - 1))}
                                        aria-label="Previous repositories"
                                    >
                                        <ChevronLeft className="size-3.5" />
                                    </Button>
                                    <span className="min-w-12 text-center text-[9px] tabular-nums text-muted-foreground">
                                        {safeRepoPage} / {repoPageCount}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-7"
                                        disabled={safeRepoPage >= repoPageCount}
                                        onClick={() => setRepoPage((page) => Math.min(repoPageCount, page + 1))}
                                        aria-label="Next repositories"
                                    >
                                        <ChevronRight className="size-3.5" />
                                    </Button>
                                </div>
                            </>
                        )}
                    </footer>
                    </section>
                </>
            )}

            <Dialog open={!!configRepo} onOpenChange={(o) => !o && setConfigRepo(null)}>
                <DialogContent
                    className="gap-0 overflow-hidden border-border/20 p-0 dark:border-white/[0.08] sm:max-w-[580px]"
                    onOpenAutoFocus={(event) => event.preventDefault()}
                >
                    <DialogHeader className="px-6 pb-5 pt-6 pr-14">
                        <DialogTitle className="text-lg tracking-[-0.025em]">Configure agent deployment</DialogTitle>
                        <DialogDescription className="mt-1.5 flex items-center gap-2 text-[11px]">
                            <GitHubLogo className="size-3.5" />
                            <span className="font-mono text-foreground/80">{configRepo?.full_name}</span>
                            <span className="text-muted-foreground/50">·</span>
                            <span>Production deployment</span>
                        </DialogDescription>
                    </DialogHeader>

                    <div className="max-h-[68vh] overflow-y-auto border-y border-border/30">
                        <ConfigSection
                            icon={<Settings2 className="size-4" />}
                            title="Source"
                            description="Name the agent and choose which code Cencori should deploy."
                        >
                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <Label htmlFor="name" className="text-[11px]">Agent name</Label>
                                    <Input
                                        id="name"
                                        className="h-9 bg-background/45 text-xs shadow-none"
                                        value={form.name}
                                        onChange={(e) => setForm((previous) => ({ ...previous, name: e.target.value }))}
                                    />
                                    <p className="text-[9px] leading-4 text-muted-foreground">Used for the agent endpoint and dashboard identity.</p>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="branch" className="text-[11px]">Production branch</Label>
                                        <Input
                                            id="branch"
                                            className="h-9 bg-background/45 font-mono text-xs shadow-none"
                                            value={form.branch}
                                            onChange={(e) => setForm((previous) => ({ ...previous, branch: e.target.value }))}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="rootDir" className="text-[11px]">Root directory</Label>
                                        <Input
                                            id="rootDir"
                                            className="h-9 bg-background/45 font-mono text-xs shadow-none"
                                            value={form.rootDir}
                                            onChange={(e) => setForm((previous) => ({ ...previous, rootDir: e.target.value }))}
                                        />
                                    </div>
                                </div>
                            </div>
                        </ConfigSection>

                        <ConfigSection
                            icon={<ScanSearch className="size-4" />}
                            title="Detection"
                            description="Cencori scans the repository without executing its code."
                        >
                            <div className="rounded-md border border-border/30 bg-background/30 p-3.5">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-medium">Automatic agent detection</p>
                                        <p className="mt-1.5 text-[9px] leading-4 text-muted-foreground">
                                            Framework, language, package manager, entry point, tools, and runtime commands are detected during preflight.
                                        </p>
                                    </div>
                                    <span className="shrink-0 rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[8px] text-emerald-600 dark:text-emerald-400">
                                        ENABLED
                                    </span>
                                </div>
                                <div className="mt-3 border-t border-border/25 pt-3">
                                    <Label className="text-[10px] text-muted-foreground">Fallback framework</Label>
                                    <Select value={form.framework} onValueChange={(value) => setForm((previous) => ({ ...previous, framework: value }))}>
                                        <SelectTrigger className="mt-1.5 h-8 bg-background/45 text-[11px] shadow-none">
                                            <SelectValue>
                                                <span className="flex items-center gap-2">
                                                    <FrameworkLogo framework={form.framework} />
                                                    {FRAMEWORKS.find((framework) => framework.value === form.framework)?.label}
                                                </span>
                                            </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                            {FRAMEWORKS.map((framework) => (
                                                <SelectItem key={framework.value} value={framework.value} className="text-xs">
                                                    <span className="flex items-center gap-2.5">
                                                        <FrameworkLogo framework={framework.value} />
                                                        {framework.label}
                                                    </span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="mt-1.5 text-[9px] leading-4 text-muted-foreground">
                                        {detecting ? (
                                            <span className="inline-flex items-center gap-1.5"><Loader2 className="h-2.5 w-2.5 animate-spin" />Detecting framework…</span>
                                        ) : detected?.framework ? (
                                            <>Detected <span className="text-emerald-400 font-medium">{detected.displayName}</span>{detected.compatibility ? ` (${detected.compatibility})` : ""} — override if needed.</>
                                        ) : detected ? (
                                            <>Couldn&apos;t detect a framework — pick one, or use Custom.</>
                                        ) : (
                                            <>Auto-detected when a repo is picked — override if needed.</>
                                        )}
                                    </p>
                                </div>
                            </div>
                        </ConfigSection>

                        <ConfigSection
                            icon={<KeyRound className="size-4" />}
                            title="Secrets"
                            description="Encrypted environment variables injected only at runtime."
                        >
                            <div className="space-y-3">
                                <div className="flex items-center justify-between gap-3 rounded-md border border-border/25 bg-background/25 px-3 py-2.5">
                                    <div className="min-w-0">
                                        <p className="font-mono text-[10px]">CENCORI_API_KEY</p>
                                        <p className="mt-0.5 text-[9px] text-muted-foreground">Project-scoped gateway key</p>
                                    </div>
                                    <span className="rounded border border-border/30 bg-secondary/60 px-1.5 py-0.5 font-mono text-[8px] text-muted-foreground">INJECTED</span>
                                </div>

                                {secrets.map((secret) => (
                                    <div key={secret.id} className="grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)_2rem] gap-2">
                                        <Input
                                            aria-label="Secret name"
                                            placeholder="SECRET_NAME"
                                            className="h-9 bg-background/45 font-mono text-[10px] uppercase shadow-none"
                                            value={secret.key}
                                            onChange={(event) => updateSecret(secret.id, "key", event.target.value.toUpperCase())}
                                        />
                                        <Input
                                            aria-label={`Value for ${secret.key || "secret"}`}
                                            type="password"
                                            placeholder="Secret value"
                                            autoComplete="new-password"
                                            className="h-9 bg-background/45 font-mono text-[10px] shadow-none"
                                            value={secret.value}
                                            onChange={(event) => updateSecret(secret.id, "value", event.target.value)}
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="size-9 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                                            onClick={() => removeSecret(secret.id)}
                                            aria-label={`Remove ${secret.key || "secret"}`}
                                        >
                                            <Trash2 className="size-3.5" />
                                        </Button>
                                    </div>
                                ))}

                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-1.5 border-dashed bg-transparent px-2.5 text-[10px] shadow-none"
                                    onClick={addSecret}
                                >
                                    <Plus className="size-3" />
                                    Add secret
                                </Button>

                                {hasInvalidSecret && (
                                    <p className="text-[9px] leading-4 text-red-500">
                                        Secret names must be unique environment-variable names and every secret needs a value.
                                    </p>
                                )}
                                <p className="text-[9px] leading-4 text-muted-foreground">
                                    Values are encrypted at rest and cannot be read back after deployment. Add provider keys only when the agent does not route models through the Cencori gateway.
                                </p>
                            </div>
                        </ConfigSection>

                    </div>

                    <DialogFooter className="flex-row items-center justify-between gap-3 px-6 py-4 sm:justify-between">
                        <p className="hidden text-[9px] text-muted-foreground sm:block">
                            Secrets: <span className="font-mono text-foreground">{configuredSecrets.length}</span>
                            <span className="mx-1.5 text-border">/</span>
                            Runtime: <span className="font-mono text-foreground">Auto</span>
                        </p>
                        <div className="ml-auto flex items-center gap-2">
                            <Button variant="outline" size="sm" className="h-8 bg-transparent text-xs shadow-none" onClick={() => setConfigRepo(null)}>Cancel</Button>
                        <Button
                            size="sm"
                            className="h-8 text-xs"
                            disabled={deployMutation.isPending || !form.name.trim() || !form.branch.trim() || !form.rootDir.trim() || !configRepo || hasInvalidSecret}
                            onClick={() =>
                                configRepo &&
                                deployMutation.mutate({
                                    repoFullName: configRepo.full_name,
                                    repoId: configRepo.id,
                                    name: form.name,
                                    branch: form.branch,
                                    rootDir: form.rootDir,
                                    framework: form.framework,
                                    secrets: configuredSecrets,
                                })
                            }
                        >
                                {deployMutation.isPending ? "Deploying..." : "Deploy"}
                        </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
