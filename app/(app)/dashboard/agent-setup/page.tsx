"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Check, Loader2, Terminal, Shield } from "lucide-react";
import { Logo } from "@/components/logo";
import { toast } from "sonner";

interface Project {
    id: string;
    name: string;
    slug: string;
    orgSlug: string;
    orgName: string;
}

interface Agent {
    id: string;
    name: string;
    blueprint: string;
}

export default function AgentSetupPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get("token");

    const [step, setStep] = useState<"auth_check" | "select" | "creating" | "done">("auth_check");
    const [selectedProjectId, setSelectedProjectId] = useState<string>("");
    const [selectedAgentId, setSelectedAgentId] = useState<string>("new");
    const [agentName, setAgentName] = useState("My OpenClaw Agent");
    const [sending, setSending] = useState(false);

    // Check auth on mount — redirect to login if not signed in
    useEffect(() => {
        if (!token) return;
        supabase.auth.getUser().then(({ data: { user } }: { data: { user: unknown } }) => {
            if (!user) {
                const returnUrl = `/dashboard/agent-setup?token=${token}`;
                router.replace(`/login?redirect=${encodeURIComponent(returnUrl)}`);
            } else {
                setStep("select");
            }
        });
    }, [token, router]);

    // Fetch user's projects
    const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({
        queryKey: ["setupProjects"],
        enabled: step !== "auth_check",
        queryFn: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return [];

            const { data: memberships } = await supabase
                .from("organization_members")
                .select("organization_id, organizations(id, name, slug)")
                .eq("user_id", user.id);

            if (!memberships) return [];

            const allProjects: Project[] = [];
            for (const m of memberships) {
                const org = m.organizations as any;
                const { data: orgProjects } = await supabase
                    .from("projects")
                    .select("id, name, slug")
                    .eq("organization_id", org.id);

                if (orgProjects) {
                    for (const p of orgProjects) {
                        allProjects.push({
                            id: p.id,
                            name: p.name,
                            slug: p.slug,
                            orgSlug: org.slug,
                            orgName: org.name,
                        });
                    }
                }
            }
            return allProjects;
        },
    });

    // Fetch agents for selected project
    const { data: agents, isLoading: agentsLoading } = useQuery<Agent[]>({
        queryKey: ["setupAgents", selectedProjectId],
        enabled: !!selectedProjectId,
        queryFn: async () => {
            const { data } = await supabase
                .from("agents")
                .select("id, name, blueprint")
                .eq("project_id", selectedProjectId)
                .eq("is_active", true);
            return (data || []) as Agent[];
        },
    });

    // Auto-select first project
    useEffect(() => {
        if (projects?.length && !selectedProjectId) {
            setSelectedProjectId(projects[0].id);
        }
    }, [projects, selectedProjectId]);

    if (!token) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center space-y-3">
                    <p className="text-sm text-muted-foreground">Missing setup token</p>
                    <p className="text-xs text-muted-foreground">
                        Run <code className="bg-muted px-1.5 py-0.5 rounded text-xs">curl -sSL https://cencori.com/install.sh | bash</code> in your terminal.
                    </p>
                </div>
            </div>
        );
    }

    if (step === "auth_check") {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const handleConnect = async () => {
        if (!selectedProjectId) {
            toast.error("Select a project");
            return;
        }

        setSending(true);
        setStep("creating");

        try {
            const project = projects?.find(p => p.id === selectedProjectId);
            let agentId = selectedAgentId !== "new" ? selectedAgentId : null;
            let finalAgentName = agentName;

            // Create new agent if needed
            if (selectedAgentId === "new") {
                const { data: agent, error: agentError } = await supabase
                    .from("agents")
                    .insert({
                        project_id: selectedProjectId,
                        name: agentName,
                        blueprint: "openclaw",
                        is_active: true,
                        shadow_mode: true,
                    })
                    .select("id, name")
                    .single();

                if (agentError || !agent) {
                    toast.error("Failed to create agent");
                    setStep("select");
                    setSending(false);
                    return;
                }

                agentId = agent.id;
                finalAgentName = agent.name;

                // Create default config
                await supabase.from("agent_configs").insert({
                    agent_id: agent.id,
                    model: "gpt-4o-mini",
                    system_prompt: "You are a helpful desktop assistant powered by OpenClaw.",
                    temperature: 0.7,
                });
            } else {
                const existingAgent = agents?.find(a => a.id === selectedAgentId);
                if (existingAgent) finalAgentName = existingAgent.name;
            }

            // Generate API key for this agent
            const rawKey = `cake_${crypto.randomUUID().replace(/-/g, "")}`;
            const keyHash = await hashKey(rawKey);

            const { error: keyError } = await supabase
                .from("api_keys")
                .insert({
                    project_id: selectedProjectId,
                    agent_id: agentId,
                    name: `${finalAgentName} (CLI Setup)`,
                    key_hash: keyHash,
                    key_prefix: rawKey.substring(0, 12),
                    key_type: "secret",
                    environment: "production",
                });

            if (keyError) {
                toast.error("Failed to generate API key");
                setStep("select");
                setSending(false);
                return;
            }

            // Send the result to the poll endpoint so the CLI picks it up
            await fetch("/api/agent/setup/poll", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    token,
                    api_key: rawKey,
                    agent_id: agentId,
                    agent_name: finalAgentName,
                    project_name: project?.name || "",
                }),
            });

            setStep("done");
        } catch (err) {
            console.error(err);
            toast.error("Setup failed");
            setStep("select");
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-md space-y-6">
                <div className="text-center space-y-2">
                    <Logo variant="mark" className="h-6 mx-auto mb-4" />
                    <h1 className="text-lg font-semibold">Connect Agent</h1>
                    <p className="text-xs text-muted-foreground">
                        Your terminal is waiting. Select a project and agent to connect.
                    </p>
                </div>

                {step === "select" && (
                    <div className="space-y-4 bg-card border rounded-lg p-5">
                        {/* Project selector */}
                        <div className="space-y-2">
                            <Label className="text-xs">Project</Label>
                            {projectsLoading ? (
                                <div className="h-9 bg-muted animate-pulse rounded-md" />
                            ) : (
                                <Select
                                    value={selectedProjectId}
                                    onValueChange={setSelectedProjectId}
                                >
                                    <SelectTrigger className="h-9 text-xs">
                                        <SelectValue placeholder="Select project" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {projects?.map(p => (
                                            <SelectItem key={p.id} value={p.id} className="text-xs">
                                                {p.orgName} / {p.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>

                        {/* Agent selector */}
                        {selectedProjectId && (
                            <div className="space-y-2">
                                <Label className="text-xs">Agent</Label>
                                {agentsLoading ? (
                                    <div className="h-9 bg-muted animate-pulse rounded-md" />
                                ) : (
                                    <Select
                                        value={selectedAgentId}
                                        onValueChange={setSelectedAgentId}
                                    >
                                        <SelectTrigger className="h-9 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="new" className="text-xs">
                                                + Create new agent
                                            </SelectItem>
                                            {agents?.map(a => (
                                                <SelectItem key={a.id} value={a.id} className="text-xs">
                                                    {a.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                        )}

                        {/* Name for new agent */}
                        {selectedAgentId === "new" && (
                            <div className="space-y-2">
                                <Label className="text-xs">Agent Name</Label>
                                <Input
                                    value={agentName}
                                    onChange={(e) => setAgentName(e.target.value)}
                                    placeholder="My OpenClaw Agent"
                                    className="h-9 text-xs"
                                />
                            </div>
                        )}

                        {/* Info cards */}
                        <div className="grid grid-cols-2 gap-2 pt-2">
                            <div className="flex items-start gap-2 rounded-md bg-muted/50 p-2.5">
                                <Terminal className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-[10px] font-medium">OpenClaw</p>
                                    <p className="text-[10px] text-muted-foreground">Runs on your machine</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-2 rounded-md bg-muted/50 p-2.5">
                                <Shield className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-[10px] font-medium">Shadow Mode</p>
                                    <p className="text-[10px] text-muted-foreground">Enabled by default</p>
                                </div>
                            </div>
                        </div>

                        <Button
                            className="w-full"
                            size="sm"
                            onClick={handleConnect}
                            disabled={!selectedProjectId || sending}
                        >
                            Connect to Terminal
                        </Button>
                    </div>
                )}

                {step === "creating" && (
                    <div className="bg-card border rounded-lg p-8 text-center space-y-4">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                        <div>
                            <p className="text-sm font-medium">Setting up your agent...</p>
                            <p className="text-xs text-muted-foreground mt-1">Creating agent and generating API key</p>
                        </div>
                    </div>
                )}

                {step === "done" && (
                    <div className="bg-card border rounded-lg p-8 text-center space-y-4">
                        <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                            <Check className="h-6 w-6 text-green-500" />
                        </div>
                        <div>
                            <p className="text-sm font-medium">Connected!</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Return to your terminal — the installer will continue automatically.
                            </p>
                        </div>
                        <p className="text-[10px] text-muted-foreground">You can close this tab.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

// SHA-256 hash helper (browser-compatible)
async function hashKey(key: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}
