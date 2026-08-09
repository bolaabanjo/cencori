"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
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
import { FrameworkLogo } from "@/components/icons/FrameworkLogo";
import { Loader2, Search } from "lucide-react";
import { deployAgentProject } from "./actions";

interface PageProps {
    params: Promise<{ orgSlug: string }>;
}

const GitHubLogo = ({ className }: { className?: string }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
        <path
            d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
            fill="currentColor"
        />
    </svg>
);

const FRAMEWORKS = [
    { value: "arcie", label: "Arcie" },
    { value: "langgraph", label: "LangGraph" },
    { value: "crewai", label: "CrewAI" },
    { value: "openai-agents", label: "OpenAI Agents SDK" },
    { value: "mastra", label: "Mastra" },
    { value: "vercel-eve", label: "eve" },
];

interface Repo {
    id: number;
    full_name: string;
    html_url: string | null;
    description: string | null;
}
interface GithubStatus {
    status: "installed" | "not_installed";
    organizationId: string;
    connectedAccounts?: { installationId: number; login: string }[];
    repositories?: Repo[];
}

export default function NewAgentPage({ params }: PageProps) {
    const { orgSlug } = use(params);
    const router = useRouter();

    const { data: github, isLoading } = useQuery<GithubStatus>({
        queryKey: ["github-status", orgSlug],
        queryFn: async () => {
            const res = await fetch(`/api/github/status?orgSlug=${encodeURIComponent(orgSlug)}`);
            if (!res.ok) throw new Error("Failed to load GitHub status");
            return res.json();
        },
        staleTime: 60 * 1000,
    });

    const [repoSearch, setRepoSearch] = useState("");
    const [configRepo, setConfigRepo] = useState<Repo | null>(null);
    const [pending, setPending] = useState(false);
    const [form, setForm] = useState({ name: "", branch: "main", rootDir: "/", framework: "arcie" });
    const [detecting, setDetecting] = useState(false);
    const [detected, setDetected] = useState<{ framework: string | null; displayName?: string; compatibility?: string } | null>(null);

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
        detectFramework(repo);
    };

    const onDeploy = async () => {
        if (!configRepo || !github?.organizationId) return;
        setPending(true);
        const res = await deployAgentProject({
            orgSlug,
            organizationId: github.organizationId,
            repoId: configRepo.id,
            repoFullName: configRepo.full_name,
            repoHtmlUrl: configRepo.html_url ?? `https://github.com/${configRepo.full_name}`,
            repoDescription: configRepo.description,
            name: form.name,
            branch: form.branch,
            rootDir: form.rootDir,
            framework: form.framework,
        });
        if (res.ok) router.push(res.redirectTo);
        else {
            toast.error(res.error);
            setPending(false);
        }
    };

    const repos = (github?.repositories ?? []).filter((r) => r.full_name.toLowerCase().includes(repoSearch.toLowerCase()));
    const notInstalled = !isLoading && github?.status !== "installed";

    return (
        <div className="w-full max-w-3xl mx-auto px-6 py-10">
            <div className="mb-6">
                <h1 className="text-lg font-semibold">Deploy an agent</h1>
                <p className="text-xs text-muted-foreground mt-0.5 max-w-[60ch]">
                    Pick a repo — Cencori creates the project and deploys the agent together. One project, one agent; its
                    endpoint, versions, and logs live under the project.
                </p>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-16 border border-border/40 rounded-lg bg-card">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
            ) : notInstalled ? (
                <div className="text-center py-16 border border-border/40 rounded-lg bg-card">
                    <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center mx-auto mb-4">
                        <GitHubLogo className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium mb-1">Connect GitHub to deploy</p>
                    <p className="text-xs text-muted-foreground max-w-[320px] mx-auto mb-4">
                        Install the Cencori GitHub App on this organization, then deploy an agent from any of your repos.
                    </p>
                    <Button asChild size="sm" className="h-8 text-xs">
                        <a href={`/${orgSlug}/~/projects/import/github`}>Connect GitHub</a>
                    </Button>
                </div>
            ) : (
                <div className="border border-border/40 rounded-lg bg-card">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
                        <div>
                            <p className="text-[13px] font-medium">Choose a repository</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">From your connected GitHub accounts</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                            {(github?.connectedAccounts ?? []).map((a) => (
                                <span key={a.installationId} className="text-[10px] font-mono text-muted-foreground border border-border/50 rounded px-1.5 py-0.5">
                                    @{a.login}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="px-4 pt-3">
                        <div className="flex items-center gap-2 border border-border/50 rounded-md h-8 px-2.5 mb-1">
                            <Search className="h-3.5 w-3.5 text-muted-foreground" />
                            <input
                                value={repoSearch}
                                onChange={(e) => setRepoSearch(e.target.value)}
                                placeholder="Search repositories…"
                                className="bg-transparent border-none outline-none text-xs w-full"
                            />
                        </div>
                    </div>
                    <div className="pb-1 max-h-[420px] overflow-auto">
                        {repos.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-8">No repositories found.</p>
                        ) : (
                            repos.map((repo) => (
                                <div key={repo.id} className="flex items-center gap-3 px-4 py-3 border-b border-border/30 last:border-b-0">
                                    <GitHubLogo className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[13px] font-mono truncate">{repo.full_name}</p>
                                        {repo.description && <p className="text-[11px] text-muted-foreground truncate">{repo.description}</p>}
                                    </div>
                                    <Button size="sm" className="h-7 text-xs shrink-0" onClick={() => openConfigure(repo)}>
                                        Deploy
                                    </Button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Configure — one name for the project and its agent */}
            <Dialog open={!!configRepo} onOpenChange={(o) => !o && !pending && setConfigRepo(null)}>
                <DialogContent className="sm:max-w-[480px]">
                    <DialogHeader>
                        <DialogTitle className="text-base">New project from repo</DialogTitle>
                        <DialogDescription className="text-xs flex items-center gap-1.5">
                            <GitHubLogo className="h-3.5 w-3.5" />
                            <span className="font-mono">{configRepo?.full_name}</span>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-3">
                        <div className="space-y-2">
                            <Label htmlFor="name" className="text-xs">Project name</Label>
                            <Input id="name" className="h-8 text-xs" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
                            <p className="text-[10px] text-muted-foreground">This names the project and its agent — they&apos;re one and the same.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="branch" className="text-xs">Branch</Label>
                                <Input id="branch" className="h-8 text-xs font-mono" value={form.branch} onChange={(e) => setForm((p) => ({ ...p, branch: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="rootDir" className="text-xs">Root directory</Label>
                                <Input id="rootDir" className="h-8 text-xs font-mono" value={form.rootDir} onChange={(e) => setForm((p) => ({ ...p, rootDir: e.target.value }))} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">Framework</Label>
                            <Select value={form.framework} onValueChange={(v) => setForm((p) => ({ ...p, framework: v }))}>
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue>
                                        <span className="flex items-center gap-2">
                                            <FrameworkLogo framework={form.framework} />
                                            {FRAMEWORKS.find((framework) => framework.value === form.framework)?.label}
                                        </span>
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    {FRAMEWORKS.map((f) => (
                                        <SelectItem key={f.value} value={f.value} className="text-xs">
                                            <span className="flex items-center gap-2.5">
                                                <FrameworkLogo framework={f.value} />
                                                {f.label}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-[10px] text-muted-foreground">
                                {detecting ? (
                                    <span className="inline-flex items-center gap-1.5"><Loader2 className="h-2.5 w-2.5 animate-spin" />Detecting framework…</span>
                                ) : detected?.framework ? (
                                    <>Detected <span className="text-emerald-400 font-medium">{detected.displayName}</span>{detected.compatibility ? ` (${detected.compatibility})` : ""} — override if needed.</>
                                ) : detected ? (
                                    <>Couldn&apos;t detect a framework — pick one, or use Custom (Runtime Contract).</>
                                ) : (
                                    <>Auto-detected where possible — override if needed.</>
                                )}
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" size="sm" className="h-8 text-xs" disabled={pending} onClick={() => setConfigRepo(null)}>Cancel</Button>
                        <Button size="sm" className="h-8 text-xs" disabled={pending || !form.name.trim()} onClick={onDeploy}>
                            {pending ? (<><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />Creating…</>) : "Create & deploy"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
