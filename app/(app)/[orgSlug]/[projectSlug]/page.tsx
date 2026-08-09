"use client";

import { supabase as browserSupabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Copy, Check, ExternalLink, Info, Terminal } from "lucide-react";
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { EXAMPLE_PROJECTS } from "@/config/examples";
import { useMemo, useState, use } from "react";
import { useQuery } from "@tanstack/react-query";
import { useEnvironment } from "@/lib/contexts/EnvironmentContext";
import {
  ProjectOverviewDashboard,
  type ProjectOverviewChartPoint,
  type ProjectOverviewDeployment,
  type ProjectOverviewModel,
  type ProjectOverviewMonetization,
  type ProjectOverviewStats,
} from "@/components/dashboard/project-overview/ProjectOverviewDashboard";
import { useOrganizationProject } from "@/lib/contexts/OrganizationProjectContext";

interface OrganizationData {
  id: string;
  name: string;
  slug: string;
}

interface ProjectData {
  id: string;
  name: string;
  slug: string;
  description?: string;
  visibility: "public" | "private";
  status: "active" | "inactive";
  created_at: string;
}

interface OverviewAgent {
  id: string;
  name: string;
  framework: string;
  repo_full_name: string | null;
  branch: string;
  status: string;
  hostname: string | null;
  current_deployment_id: string | null;
  updated_at: string | null;
}

interface OverviewDeployment {
  id: string;
  version: number;
  status: string;
  updated_at: string | null;
}

interface MonetizationConfig {
  end_user_billing_enabled: boolean;
}

interface MonetizationStats {
  total_end_users: number;
  active_end_users: number;
  provider_cost_usd: number;
  customer_revenue_usd: number;
  margin_usd: number;
  margin_percentage: number;
}

// Getting Started Section Component - Compact
function GettingStartedSection({
  orgSlug,
  projectSlug,
  hasData,
  loading
}: {
  orgSlug: string;
  projectSlug: string;
  hasData: boolean | null;
  loading: boolean;
}) {
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copyingPrompt, setCopyingPrompt] = useState(false);
  const [copiedInstall, setCopiedInstall] = useState(false);
  const [copiedEnv, setCopiedEnv] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const llmIntegrationPrompt = `Integrate Cencori into this project using the official \`cencori\` package.

Before coding, read:
- https://cencori.com/llm.txt
- https://cencori.com/docs

Requirements:
1. Install only what is needed:
   - \`cencori\`
   - If Vercel AI SDK is already used, ensure \`ai\` is installed.
   - Do not add unrelated packages.
   - Do not upgrade unrelated dependencies.

2. Reuse existing architecture:
   - Detect framework/runtime and follow existing project conventions.
   - Reuse existing API routes, auth, env patterns, and database setup.
   - Do not scaffold a new auth/database system.
   - Do not remove existing providers/integrations unless explicitly asked.

3. Create or update a shared Cencori client setup (e.g. \`lib/cencori.ts\`):
   - Use \`CENCORI_API_KEY\` from server env.
   - Never expose secrets to the client bundle.
   - For the official SDK, use Cencori's default base URL.
   - Use \`https://api.cencori.com/v1\` only for OpenAI-compatible clients.

4. Wire AI endpoint(s) with minimal diff:
   - Support both streaming and non-streaming flows where applicable.
   - Preserve existing response contracts used by the app (including OpenAI-compatible shape if already expected).
   - Do not run global search/replace across the repo unless explicitly requested.

5. Framework adapter imports:
   - Vercel AI SDK: \`import { cencori } from "cencori/vercel"\`
   - TanStack AI: \`import { cencori } from "cencori/tanstack"\`

6. Env setup:
   - Add \`CENCORI_API_KEY\` if missing.
   - Add optional vars only if required by this project (\`CENCORI_BASE_URL\`, \`X_AGENT_ID\`).
   - Do not overwrite existing secrets.
   - Never print or commit secrets.

7. Validation:
   - Run lint/typecheck/tests for changed files.
   - Add one smoke test via SDK usage and one via curl.
   - Verify both streaming and non-stream behavior if implemented.

8. Final output:
   - List files changed.
   - List commands run.
   - Summarize what was integrated and any assumptions.
   - Include one copy-paste runnable snippet for this project's framework.
   - If blocked, state exactly what is missing and the next action.`;

  if (loading || hasData === null || hasData === true) {
    return null;
  }

  const copyPrompt = async () => {
    try {
      setCopyingPrompt(true);
      await navigator.clipboard.writeText(llmIntegrationPrompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    } finally {
      setCopyingPrompt(false);
    }
  };

  const copyInstall = async () => {
    await navigator.clipboard.writeText("npm install cencori");
    setCopiedInstall(true);
    setTimeout(() => setCopiedInstall(false), 2000);
  };

  const copyEnv = async () => {
    await navigator.clipboard.writeText("CENCORI_API_KEY=csk_your_api_key_here");
    setCopiedEnv(true);
    setTimeout(() => setCopiedEnv(false), 2000);
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(`import { Cencori } from "cencori";
import { cencori } from "cencori";

export const cencoriClient = new Cencori({
  apiKey: process.env.CENCORI_API_KEY!,
});

export { cencori };`);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Waiting for first request</span>
        </div>
        <h2 className="text-base font-medium">Get started</h2>
        <p className="text-xs text-muted-foreground">
          Install the SDK, add your API key, and make a request.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 px-3 py-2 bg-emerald-500/5 border border-emerald-500/20 rounded-md">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="h-3 w-3 text-emerald-500" />
          <span>Copy as LLM prompt</span>
        </div>
        <Button variant="ghost" size="sm" onClick={copyPrompt} disabled={copyingPrompt} className="h-6 px-2 text-xs gap-1">
          {copiedPrompt ? <Check className="h-3 w-3" /> : copyingPrompt ? <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" /> : <Copy className="h-3 w-3" />}
          {copiedPrompt ? "Copied" : "Copy"}
        </Button>
      </div>

      <div className="grid gap-2">
        <div className="border border-border/40 rounded-md overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border/40">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[9px] font-medium">1</span>
              <span className="text-xs font-medium">Install SDK</span>
            </div>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={copyInstall}>
              {copiedInstall ? <Check className="h-2.5 w-2.5 text-emerald-500" /> : <Copy className="h-2.5 w-2.5 text-muted-foreground" />}
            </Button>
          </div>
          <div className="px-3 py-1.5 bg-zinc-950">
            <code className="text-[11px] text-emerald-400 font-mono">npm install cencori ai</code>
          </div>
        </div>

        <div className="border border-border/40 rounded-md overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border/40">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[9px] font-medium">2</span>
              <span className="text-xs font-medium">Add to .env</span>
              <Link href={`/${orgSlug}/${projectSlug}/api-keys`} className="text-[10px] text-primary hover:underline">
                Get key →
              </Link>
            </div>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={copyEnv}>
              {copiedEnv ? <Check className="h-2.5 w-2.5 text-emerald-500" /> : <Copy className="h-2.5 w-2.5 text-muted-foreground" />}
            </Button>
          </div>
          <div className="px-3 py-1.5 bg-zinc-950">
            <code className="text-[11px] font-mono"><span className="text-blue-400">CENCORI_API_KEY</span><span className="text-zinc-500">=csk_your_api_key_here</span></code>
          </div>
        </div>

        <div className="border border-border/40 rounded-md overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border/40">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full border border-muted-foreground/30 text-muted-foreground flex items-center justify-center text-[9px] font-medium">3</span>
              <span className="text-xs font-medium text-muted-foreground">Create shared client</span>
            </div>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={copyCode}>
              {copiedCode ? <Check className="h-2.5 w-2.5 text-emerald-500" /> : <Copy className="h-2.5 w-2.5 text-muted-foreground" />}
            </Button>
          </div>
          <div className="px-3 py-2 bg-zinc-950 space-y-0.5">
            <code className="text-[11px] font-mono block"><span className="text-purple-400">import</span> <span className="text-zinc-300">{"{"}</span> <span className="text-amber-300">Cencori</span> <span className="text-zinc-300">{"}"}</span> <span className="text-purple-400">from</span> <span className="text-emerald-400">&quot;cencori&quot;</span><span className="text-zinc-400">;</span></code>
            <code className="text-[11px] font-mono block"><span className="text-purple-400">import</span> <span className="text-zinc-300">{"{"}</span> <span className="text-blue-300">cencori</span> <span className="text-zinc-300">{"}"}</span> <span className="text-purple-400">from</span> <span className="text-emerald-400">&quot;cencori/vercel&quot;</span><span className="text-zinc-400">;</span></code>
            <code className="text-[11px] font-mono block text-zinc-600">&nbsp;</code>
            <code className="text-[11px] font-mono block"><span className="text-purple-400">export const</span> <span className="text-blue-400">cencoriClient</span> <span className="text-zinc-400">=</span> <span className="text-purple-400">new</span> <span className="text-amber-300">Cencori</span><span className="text-zinc-300">({"{"}</span></code>
            <code className="text-[11px] font-mono block">  <span className="text-zinc-300">apiKey:</span> <span className="text-blue-400">process.env</span><span className="text-zinc-400">.</span><span className="text-zinc-100">CENCORI_API_KEY</span><span className="text-zinc-400">!,</span></code>
            <code className="text-[11px] font-mono block"><span className="text-zinc-300">{"})"}</span><span className="text-zinc-400">;</span></code>
            <code className="text-[11px] font-mono block"><span className="text-purple-400">export</span> <span className="text-zinc-300">{"{"}</span> <span className="text-blue-300">cencori</span> <span className="text-zinc-300">{"}"}</span><span className="text-zinc-400">;</span></code>
          </div>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" asChild>
          <Link href={`/${orgSlug}/${projectSlug}/ai-gateway/playground`}>
            <Terminal className="h-3 w-3" />
            Playground
          </Link>
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" asChild>
          <Link href="https://cencori.com/docs" target="_blank">
            <ExternalLink className="h-3 w-3" />
            Docs
          </Link>
        </Button>
      </div>
      <div className="mt-8 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Example projects</h3>
          <Link href="/examples" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            View all →
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {EXAMPLE_PROJECTS.slice(0, 4).map((project) => (
            <a
              key={project.id}
              href={project.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between p-3 border border-border/40 rounded-lg hover:bg-muted/30 hover:border-border/60 transition-all"
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs font-medium truncate">{project.name}</span>
                <span className="text-[10px] text-muted-foreground truncate">{project.description}</span>
              </div>
              <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

// Hook to fetch project and organization details with caching
function useProjectAndOrg(
  orgSlug: string,
  projectSlug: string,
  initialData?: { organization: OrganizationData; project: ProjectData },
) {
  return useQuery({
    queryKey: ["projectOverview", orgSlug, projectSlug],
    queryFn: async () => {
      const { data: { user }, error: userError } = await browserSupabase.auth.getUser();
      if (userError || !user) throw new Error("Not authenticated");

      const { data: orgData, error: orgError } = await browserSupabase
        .from("organizations")
        .select("id, name, slug")
        .eq("slug", orgSlug)
        .eq("owner_id", user.id)
        .single();

      if (orgError || !orgData) throw new Error("Organization not found");

      const { data: projectData, error: projectError } = await browserSupabase
        .from("projects")
        .select("id, name, slug, description, visibility, status, created_at")
        .eq("organization_id", orgData.id)
        .eq("slug", projectSlug)
        .single();

      if (projectError || !projectData) throw new Error("Project not found");

      return {
        organization: orgData as OrganizationData,
        project: projectData as ProjectData,
      };
    },
    staleTime: 60 * 1000,
    initialData,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    placeholderData: (prev) => prev,
  });
}

export default function ProjectDetailsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; projectSlug: string }>;
}) {
  const { orgSlug, projectSlug } = use(params);
  const { environment } = useEnvironment();
  const { organizations, projects } = useOrganizationProject();
  const [period, setPeriod] = useState<string>('7d');

  const cachedProjectData = useMemo(() => {
    const organization = organizations.find((item) => item.slug === orgSlug);
    if (!organization) return undefined;

    const project = projects.find((item) => (
      item.slug === projectSlug && item.organization_id === organization.id
    ));
    if (!project) return undefined;

    return {
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        description: project.description,
        visibility: "private" as const,
        status: "active" as const,
        created_at: "",
      },
    };
  }, [organizations, projects, orgSlug, projectSlug]);

  // Fetch project and org with caching - INSTANT ON REVISIT!
  const { data: projectData, isLoading: projectLoading, error } = useProjectAndOrg(orgSlug, projectSlug, cachedProjectData);
  const organization = projectData?.organization;
  const project = projectData?.project;

  const { data: profile } = useQuery<{ first_name: string | null }>({
    queryKey: ["userProfile"],
    queryFn: async () => {
      const response = await fetch("/api/user/profile");
      if (!response.ok) return { first_name: null };
      const data = await response.json();
      return data.profile;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch AI stats with caching
  const {
    data: statsData,
    isLoading: statsLoading,
    isError: statsError,
    refetch: refetchStats,
  } = useQuery<{
    stats: ProjectOverviewStats;
    chartData: ProjectOverviewChartPoint[];
    modelBreakdown: ProjectOverviewModel[];
  }>({
    queryKey: ["aiStats", project?.id, period, environment],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${project!.id}/ai/stats?period=${period}&environment=${environment}`);
      if (!response.ok) throw new Error("Failed to fetch stats");
      return response.json();
    },
    enabled: !!project?.id,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    placeholderData: (prev) => prev,
  });

  const aiStats = statsData?.stats || null;
  const chartData = statsData?.chartData || [];
  const modelBreakdown = statsData?.modelBreakdown || [];

  const {
    data: agentsData,
    isLoading: agentsLoading,
    isError: agentsError,
  } = useQuery<{ agents: OverviewAgent[] }>({
    queryKey: ["agents", project?.id],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${project!.id}/agents`);
      if (!response.ok) throw new Error("Failed to load deployments");
      return response.json();
    },
    enabled: !!project?.id,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });
  const overviewAgent = agentsData?.agents?.[0];

  const {
    data: agentDetail,
    isLoading: agentDetailLoading,
    isError: agentDetailError,
  } = useQuery<{ agent: OverviewAgent; deployments: OverviewDeployment[] }>({
    queryKey: ["agent-detail", project?.id, overviewAgent?.id],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${project!.id}/agents/${overviewAgent!.id}`);
      if (!response.ok) throw new Error("Failed to load agent deployment");
      return response.json();
    },
    enabled: !!project?.id && !!overviewAgent,
    staleTime: 15 * 1000,
    refetchInterval: (query) => (
      query.state.data?.deployments?.some((deployment) =>
        deployment.status === "building" || deployment.status === "created"
      ) ? 4000 : false
    ),
  });
  const overviewDeployment = agentDetail?.deployments.find(
    (deployment) => deployment.id === overviewAgent?.current_deployment_id,
  ) ?? agentDetail?.deployments?.[0];
  const deploymentSummary: ProjectOverviewDeployment | null = overviewAgent
    ? {
        status: overviewDeployment?.status ?? overviewAgent.status,
        agentName: overviewAgent.name,
        endpoint: overviewAgent.hostname,
        framework: overviewAgent.framework,
        repoFullName: overviewAgent.repo_full_name,
        branch: overviewAgent.branch,
        version: overviewDeployment?.version ?? null,
        updatedAt: overviewDeployment?.updated_at ?? overviewAgent.updated_at,
      }
    : null;

  const {
    data: monetizationConfig,
    isLoading: monetizationConfigLoading,
    isError: monetizationConfigError,
  } = useQuery<MonetizationConfig>({
    queryKey: ["endUserBillingConfig", project?.id],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${project!.id}/end-user-billing`);
      if (!response.ok) throw new Error("Failed to load monetization configuration");
      return response.json();
    },
    enabled: !!project?.id,
    staleTime: 30 * 1000,
  });
  const monetizationEnabled = monetizationConfig?.end_user_billing_enabled ?? false;

  const {
    data: monetizationStats,
    isLoading: monetizationStatsLoading,
    isError: monetizationStatsError,
  } = useQuery<MonetizationStats>({
    queryKey: ["endUserBillingStats", project?.id, "30d"],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${project!.id}/end-user-billing/stats?period=30d`);
      if (!response.ok) throw new Error("Failed to load monetization stats");
      return response.json();
    },
    enabled: !!project?.id && monetizationEnabled,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
  const monetizationSummary: ProjectOverviewMonetization = {
    enabled: monetizationEnabled,
    customerRevenue: monetizationStats?.customer_revenue_usd ?? 0,
    providerCost: monetizationStats?.provider_cost_usd ?? 0,
    margin: monetizationStats?.margin_usd ?? 0,
    marginPercentage: monetizationStats?.margin_percentage ?? 0,
    activeCustomers: monetizationStats?.active_end_users ?? 0,
    totalCustomers: monetizationStats?.total_end_users ?? 0,
  };

  if (!projectLoading && (error || !organization || !project)) {
    return (
      <div className="min-h-[calc(100svh-5.5rem)] bg-background p-3 dark:bg-black lg:p-4">
        <div className="mx-auto flex min-h-[calc(100svh-7.5rem)] max-w-[90rem] items-center justify-center px-6">
          <div className="max-w-sm text-center">
            <p className="text-sm font-medium">This project could not be loaded</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{error?.message || "Project or organization not found."}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Getting Started Section */}
      <GettingStartedSection
        orgSlug={orgSlug}
        projectSlug={projectSlug}
        hasData={true}
        loading={projectLoading}
      />
      <ProjectOverviewDashboard
        projectName={project?.name || projectSlug}
        viewerName={profile?.first_name}
        orgSlug={orgSlug}
        projectSlug={projectSlug}
        period={period}
        onPeriodChange={setPeriod}
        stats={aiStats}
        chartData={chartData}
        modelBreakdown={modelBreakdown}
        deployment={deploymentSummary}
        deploymentLoading={agentsLoading || (!!overviewAgent && agentDetailLoading)}
        deploymentError={agentsError || agentDetailError}
        monetization={monetizationSummary}
        monetizationLoading={monetizationConfigLoading || (monetizationEnabled && monetizationStatsLoading)}
        monetizationError={monetizationConfigError || monetizationStatsError}
        loading={projectLoading || (statsLoading && !statsData)}
        error={statsError}
        onRetry={() => void refetchStats()}
      />
    </>
  );
}
