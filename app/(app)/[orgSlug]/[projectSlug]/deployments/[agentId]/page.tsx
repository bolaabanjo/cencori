"use client";

import { useState, use } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RunTimeline } from "@/components/compute/RunTimeline";
import { useProjectIdBySlug } from "@/lib/hooks/useQueries";
import {
    ChevronDown,
    ChevronRight,
    GitBranch,
    RotateCw,
    Wrench,
    Radio,
    Clock,
} from "lucide-react";

interface PageProps {
    params: Promise<{ orgSlug: string; projectSlug: string; agentId: string }>;
}

const GitHubLogo = ({ className }: { className?: string }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
        <path
            d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
            fill="currentColor"
        />
    </svg>
);

const FW_LABEL: Record<string, string> = {
    arcie: "Arcie", langgraph: "LangGraph", crewai: "CrewAI",
    "openai-agents": "OpenAI Agents SDK", mastra: "Mastra", "vercel-eve": "eve", "vercel-ai": "Vercel AI SDK", custom: "Custom (Runtime Contract)",
};
const STATUS: Record<string, { dot: string; label: string; text: string }> = {
    created: { dot: "bg-muted-foreground", label: "Not deployed", text: "text-muted-foreground" },
    building: { dot: "bg-amber-500 animate-pulse", label: "Building", text: "text-amber-500" },
    active: { dot: "bg-emerald-500", label: "Live", text: "text-emerald-500" },
    running: { dot: "bg-emerald-500", label: "Live", text: "text-emerald-500" },
    stopped: { dot: "bg-muted-foreground", label: "Stopped", text: "text-muted-foreground" },
    failed: { dot: "bg-red-500", label: "Failed", text: "text-red-500" },
    archived: { dot: "bg-zinc-500", label: "Archived", text: "text-muted-foreground" },
};

interface Agent {
    id: string; slug: string; name: string; framework: string;
    repo_full_name: string | null; branch: string; root_dir: string;
    status: string; hostname: string | null; created_at: string;
}
interface Deployment {
    id: string; version: number; status: string; commit_sha: string | null;
    machine_id: string | null; image_ref: string | null; error_message: string | null; created_at: string;
}

function useProjectId(orgSlug: string, projectSlug: string) {
    return useProjectIdBySlug(orgSlug, projectSlug);
}

export default function AgentDetailPage({ params }: PageProps) {
    const { orgSlug, projectSlug, agentId } = use(params);
    const { data: projectId } = useProjectId(orgSlug, projectSlug);
    const selectedId = useSearchParams().get("d");

    const { data, isLoading } = useQuery<{ agent: Agent; deployments: Deployment[] }>({
        queryKey: ["agent", projectId, agentId],
        queryFn: async () => {
            const res = await fetch(`/api/projects/${projectId}/agents/${agentId}`);
            if (!res.ok) throw new Error("Failed to load agent");
            return res.json();
        },
        enabled: !!projectId,
        refetchInterval: (q) => (q.state.data?.agent?.status === "building" ? 4000 : false),
    });

    const queryClient = useQueryClient();
    const redeploy = useMutation({
        mutationFn: async () => {
            const res = await fetch(`/api/projects/${projectId}/agents/${agentId}/deploy`, { method: "POST" });
            if (!res.ok) throw new Error("Failed to redeploy");
            return res.json();
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agent", projectId, agentId] }),
    });

    if (isLoading || !data) {
        return (
            <div className="w-full max-w-4xl mx-auto px-6 py-8">
                <Skeleton className="h-4 w-24 mb-6" />
                <Skeleton className="h-7 w-48 mb-2" />
                <Skeleton className="h-4 w-80 mb-8" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    const { agent, deployments } = data;
    // The deployment being viewed — the one from ?d, else the latest.
    const selected = deployments.find((d) => d.id === selectedId) ?? deployments[0];
    const s = STATUS[selected?.status ?? agent.status] ?? STATUS.created;
    const url = agent.hostname ? `https://${agent.hostname}` : null;

    return (
        <div className="w-full max-w-4xl mx-auto px-6 py-8">
            {(() => {
                const sha = selected?.commit_sha?.slice(0, 7);
                const buildLog = getBuildLog(selected);
                return (
                    <div className="space-y-4">
                        {/* Deployment details — dense metadata grid */}
                        <div className="rounded-lg border border-border/25 bg-[#f3f3f1] dark:bg-[#111111]">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
                                <p className="text-[13px] font-medium">Deployment details</p>
                                <div className="flex items-center gap-2">
                                    {url && (
                                        <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                                            <a href={url} target="_blank" rel="noopener noreferrer">Visit</a>
                                        </Button>
                                    )}
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs"
                                        disabled={redeploy.isPending || agent.status === "building"}
                                        onClick={() => redeploy.mutate()}
                                    >
                                        <RotateCw className={`h-3 w-3 mr-1.5 ${redeploy.isPending ? "animate-spin" : ""}`} />
                                        Redeploy
                                    </Button>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 p-4">
                                <Meta label="Created">{rel(agent.created_at)}</Meta>
                                <Meta label="Status">
                                    <span className="inline-flex items-center gap-1.5">
                                        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                                        <span className={s.text}>{s.label}</span>
                                        {(agent.status === "active" || agent.status === "running") && (
                                            <span className="text-muted-foreground text-[11px]">· healthy</span>
                                        )}
                                    </span>
                                </Meta>
                                <Meta label="Build duration" mono>47s</Meta>
                                <Meta label="Environment"><Chip>Production</Chip></Meta>
                                <Meta label="Region"><Chip>US-East · iad</Chip></Meta>
                                <Meta label="Machine">
                                    <span className="flex gap-1"><Chip>1 vCPU</Chip><Chip>512 MB</Chip></span>
                                </Meta>
                                <Meta label="Model" mono>claude-sonnet-5</Meta>
                                <Meta label="Framework">{FW_LABEL[agent.framework] ?? agent.framework}</Meta>
                            </div>
                            <div className="grid md:grid-cols-2 gap-x-6 gap-y-4 px-4 pb-4 border-t border-border/30 pt-4">
                                <Meta label="Endpoint">
                                    {url ? (
                                        <a href={url} target="_blank" rel="noopener noreferrer" className="font-mono text-sky-400 hover:text-sky-300">
                                            {agent.hostname}
                                        </a>
                                    ) : <span className="text-muted-foreground">— not deployed —</span>}
                                </Meta>
                                <Meta label="Source">
                                    <span className="font-mono inline-flex items-center gap-1.5 flex-wrap">
                                        <GitHubLogo className="h-3 w-3" />{agent.repo_full_name}
                                        <span className="text-muted-foreground/50">@</span>
                                        <GitBranch className="h-3 w-3" />{agent.branch}
                                        <span className="text-muted-foreground/50">·</span>{agent.root_dir}
                                        {sha && <><span className="text-muted-foreground/50">·</span><span className="text-muted-foreground">{sha}</span></>}
                                    </span>
                                </Meta>
                            </div>
                        </div>

                        {/* Run — live timeline against the deployed runtime */}
                        <Section title="Run" defaultOpen={agent.status === "active" || agent.status === "running"}>
                            <RunTimeline projectId={projectId!} agentId={agentId} />
                        </Section>

                        {/* Runtime settings */}
                        <Section title="Runtime" defaultOpen>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 p-4">
                                <Meta label="Machine"><span className="flex gap-1"><Chip>1 vCPU</Chip><Chip>512 MB</Chip></span></Meta>
                                <Meta label="Region"><Chip>iad</Chip></Meta>
                                <Meta label="Instances">min 0 · max 3 <span className="text-muted-foreground">(scale to zero)</span></Meta>
                                <Meta label="Cold start" mono>~700ms</Meta>
                                <Meta label="Node.js" mono>23.x</Meta>
                                <Meta label="Image" mono>{selected?.image_ref ?? "—"}</Meta>
                                <Meta label="Budget">
                                    <div className="font-mono">$12.40 <span className="text-muted-foreground">/ $50.00</span></div>
                                    <div className="h-1.5 rounded bg-secondary mt-1.5 overflow-hidden w-32"><div className="h-full bg-emerald-500" style={{ width: "25%" }} /></div>
                                </Meta>
                            </div>
                        </Section>

                        {/* Deployment summary — what's inside this agent */}
                        <Section title="Deployment summary" right={<span className="font-mono">{FW_LABEL[agent.framework] ?? agent.framework}</span>}>
                            <div className="divide-y divide-border/30">
                                <SummaryRow icon={<Wrench className="h-3.5 w-3.5" />} label="Tools" chips={["6"]} />
                                <SummaryRow icon={<Radio className="h-3.5 w-3.5" />} label="Channels" chips={["1", "slack"]} />
                                <SummaryRow icon={<Clock className="h-3.5 w-3.5" />} label="Schedules" chips={["2"]} />
                            </div>
                        </Section>

                        {/* Build logs */}
                        <Section title="Build logs" right={<span className="font-mono">47s · {buildLog.length} lines</span>}>
                            <div className="max-h-72 overflow-x-auto p-3 font-mono text-[11px] leading-[1.9] text-muted-foreground">
                                {buildLog.map(({ time, message, level }, i) => (
                                    <div
                                        key={`${time}-${i}`}
                                        className={`whitespace-pre px-2.5 ${level === "warning" ? "bg-amber-500/15 text-amber-400" : level === "error" ? "bg-red-500/15 text-red-400" : "text-muted-foreground"}`}
                                    >
                                        <span className={`mr-3 ${level === "info" ? "text-muted-foreground/40" : "text-current"}`}>{time}</span>
                                        <span className={level === "info" ? "text-white" : "text-current"}>{message}</span>
                                    </div>
                                ))}
                            </div>
                        </Section>

                        {/* Related surfaces */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <LinkCard title="Logs" desc="Runtime logs & errors" href={`/${orgSlug}/${projectSlug}/logs`} />
                            <LinkCard title="Observability" desc="Health & performance" href={`/${orgSlug}/${projectSlug}/observability`} />
                            <LinkCard title="Memory" desc="Agent memory" href={`/${orgSlug}/${projectSlug}/memory`} />
                            <LinkCard title="AI Gateway" desc="Models & spend" href={`/${orgSlug}/${projectSlug}/ai-gateway`} />
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}

type BuildLogLevel = "info" | "warning" | "error";
type BuildLogEntry = { time: string; message: string; level: BuildLogLevel };

// Mock build log for the density pass — replaced by the real pipeline stream.
const BUILD_LOG: BuildLogEntry[] = [
    { time: "10:41:02.118", message: "Cloning bolaabanjo/arcie@main", level: "info" },
    { time: "10:41:03.402", message: "Detected framework: arcie", level: "info" },
    { time: "10:41:03.410", message: "6 tools · 1 channel · 2 schedules", level: "info" },
    { time: "10:41:11.204", message: "Installing 214 packages…", level: "info" },
    { time: "10:41:19.880", message: "Compiled bundle — 1.2 MB", level: "info" },
    { time: "10:41:24.310", message: "Building container image…", level: "info" },
    { time: "10:41:28.905", message: "Image sha256:9f3a1c… (86 MB)", level: "info" },
    { time: "10:41:30.451", message: "Booting machine in us-east (iad)…", level: "info" },
    { time: "10:41:31.002", message: "GET /_health → 200 OK", level: "info" },
    { time: "10:41:31.118", message: "Deployment live", level: "info" },
];

function getBuildLog(deployment: Deployment | undefined): BuildLogEntry[] {
    if (deployment?.status !== "failed") return BUILD_LOG;

    return [
        ...BUILD_LOG.slice(0, -2),
        { time: "10:41:31.002", message: "Readiness check did not pass; retrying…", level: "warning" },
        {
            time: "10:41:31.118",
            message: deployment.error_message || "Deployment failed during the readiness check",
            level: "error",
        },
    ];
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

function Meta({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
    return (
        <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-mono mb-1">{label}</div>
            <div className={`text-[12.5px] ${mono ? "font-mono" : ""}`}>{children}</div>
        </div>
    );
}

function Chip({ children }: { children: React.ReactNode }) {
    return <span className="text-[10px] font-mono bg-secondary/60 border border-border/40 rounded px-1.5 py-0.5">{children}</span>;
}

function Section({ title, right, defaultOpen, children }: { title: string; right?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }) {
    const [open, setOpen] = useState(!!defaultOpen);
    return (
        <div className="rounded-lg border border-border/25 bg-[#f3f3f1] dark:bg-[#111111]">
            <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-4 py-3">
                <span className="flex items-center gap-2 text-[13px] font-medium">
                    {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                    {title}
                </span>
                {right && <span className="text-[11px] text-muted-foreground">{right}</span>}
            </button>
            {open && <div className="border-t border-border/40">{children}</div>}
        </div>
    );
}

function SummaryRow({ icon, label, chips }: { icon: React.ReactNode; label: string; chips: string[] }) {
    return (
        <div className="flex items-center gap-3 px-4 py-3">
            <span className="text-muted-foreground">{icon}</span>
            <span className="text-[12.5px] flex-1">{label}</span>
            <span className="flex gap-1">{chips.map((c, i) => <Chip key={i}>{c}</Chip>)}</span>
        </div>
    );
}

function LinkCard({ title, desc, href }: { title: string; desc: string; href: string }) {
    return (
        <Link
            href={href}
            className="rounded-lg border border-border/25 bg-[#f3f3f1] p-3 transition-colors hover:bg-[#ededeb] dark:bg-[#111111] dark:hover:bg-[#171717]"
        >
            <div className="text-[12.5px] font-medium">{title}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{desc}</div>
        </Link>
    );
}
