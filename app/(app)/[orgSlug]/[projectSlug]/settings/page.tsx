"use client";

import React, { useState, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Copy, Check, Trash2, Globe, Clock, Webhook, Server, AlertTriangle, Plus, MoreHorizontal, RefreshCw, DollarSign, Bell, Loader2 } from "lucide-react";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { RagMetricsLogo } from "@/components/icons/BrandIcons";
import { toast } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { MinimalScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useOrganizationProject } from "@/lib/contexts/OrganizationProjectContext";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { GeoAnalyticsSection } from "@/components/dashboard/GeoAnalyticsSection";
import { GenerateKeyDialog } from "@/components/api-keys/GenerateKeyDialog";
import { SUPPORTED_PROVIDERS, getModelsForProvider } from "@/lib/providers/config";
import { cn } from "@/lib/utils";
import { normalizeWebhookResponse } from "@/lib/webhook-response";

interface ProjectData {
  id: string;
  name: string;
  slug: string;
  organization_id: string;
  region?: string;
  request_timeout_seconds?: number;
  max_retries?: number;
  fallback_provider?: string | null;
}

interface WebhookData {
  id: string;
  name: string;
  url: string;
  events: string[];
  is_active: boolean;
  created_at: string;
  last_triggered_at?: string;
  failure_count: number;
}

interface ProviderHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  latency: number | null;
  error?: string;
  circuit?: {
    state: 'closed' | 'open' | 'half-open';
    failures: number;
  };
}

interface RateLimitsData {
  tier: string;
  customLimits?: boolean;
  usage: {
    requestsPerMinute: { used: number; limit: number; percentage: number };
    tokensPerDay: { used: number; limit: number; percentage: number };
    concurrentRequests: { used: number; limit: number; percentage: number };
  };
}

interface NetworkPolicyData {
  access_mode: 'public' | 'restricted';
  allowed_cidrs: string[];
  updated_at?: string;
}

interface PageProps {
  params: Promise<{ orgSlug: string; projectSlug: string }>;
}

const PROJECT_SETTINGS_TABS = [
  'general',
  'budget',
  'providers',
  'infrastructure',
  'networking',
  'integrations',
  'api',
] as const;

type ProjectSettingsTab = (typeof PROJECT_SETTINGS_TABS)[number];

function isProjectSettingsTab(value: string | null): value is ProjectSettingsTab {
  return PROJECT_SETTINGS_TABS.some((tab) => tab === value);
}

function SettingsPageLabel({ title, description }: { title: string; description: string }) {
  return (
    <header className="border-b border-border/35 pb-5">
      <h1 className="text-xl font-medium tracking-tight">{title}</h1>
      <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{description}</p>
    </header>
  );
}

const WEBHOOK_EVENTS = [
  { value: 'request.completed', label: 'Request Completed' },
  { value: 'request.failed', label: 'Request Failed' },
  { value: 'security.violation', label: 'Security Violation' },
  { value: 'rate_limit.exceeded', label: 'Rate Limit Exceeded' },
  { value: 'cost.threshold', label: 'Cost Threshold Reached' },
  { value: 'model.fallback', label: 'Model Fallback Triggered' },
];

const REGION_MAP: Record<string, { name: string; flag: string }> = {
  'americas': { name: 'Americas (Auto)', flag: '🌎' },
  'europe': { name: 'Europe (Auto)', flag: '🌍' },
  'asia-pacific': { name: 'Asia-Pacific (Auto)', flag: '🌏' },
  'us-east-1': { name: 'US East (N. Virginia)', flag: '🇺🇸' },
  'us-west-1': { name: 'US West (N. California)', flag: '🇺🇸' },
  'us-west-2': { name: 'US West (Oregon)', flag: '🇺🇸' },
  'ca-central-1': { name: 'Canada (Central)', flag: '🇨🇦' },
  'eu-west-1': { name: 'EU West (Ireland)', flag: '🇮🇪' },
  'eu-central-1': { name: 'EU Central (Frankfurt)', flag: '🇩🇪' },
  'ap-southeast-1': { name: 'Asia Pacific (Singapore)', flag: '🇸🇬' },
  'ap-northeast-1': { name: 'Asia Pacific (Tokyo)', flag: '🇯🇵' },
  'ap-south-1': { name: 'Asia Pacific (Mumbai)', flag: '🇮🇳' },
  'sa-east-1': { name: 'South America (São Paulo)', flag: '🇧🇷' },
  'me-south-1': { name: 'Middle East (Bahrain)', flag: '🇧🇭' },
  'af-south-1': { name: 'Africa (Cape Town)', flag: '🇿🇦' },
  'default': { name: 'Americas (Auto)', flag: '🌎' },
};

const GATEWAY_ENDPOINT = 'https://api.cencori.com/v1';

// Hook to fetch project details with caching
function useProjectDetails(orgSlug: string, projectSlug: string, initialData?: ProjectData) {
  return useQuery({
    queryKey: ["projectDetails", orgSlug, projectSlug],
    queryFn: async () => {
      const { data: organization } = await supabase
        .from("organizations")
        .select("id")
        .eq("slug", orgSlug)
        .single();

      if (!organization) throw new Error("Organization not found");

      const { data: projectData } = await supabase
        .from("projects")
        .select("id, name, slug, organization_id, region, request_timeout_seconds, max_retries, fallback_provider")
        .eq("slug", projectSlug)
        .eq("organization_id", organization.id)
        .single();

      if (!projectData) throw new Error("Project not found");
      return projectData as ProjectData;
    },
    initialData,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: 60 * 1000,
  });
}

export default function ProjectSettingsPage({ params }: PageProps) {
  const { orgSlug, projectSlug } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { organizations, projects, updateProject: updateProjectContext } = useOrganizationProject();
  const requestedTab = searchParams.get('tab');
  const activeSettingsTab: ProjectSettingsTab = isProjectSettingsTab(requestedTab) ? requestedTab : 'general';

  // Local form state
  const [projectName, setProjectName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [copiedSlug, setCopiedSlug] = useState(false);

  // Webhook dialog state
  const [showWebhookDialog, setShowWebhookDialog] = useState(false);
  const [webhookName, setWebhookName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEvents, setWebhookEvents] = useState<string[]>(['request.completed']);

  // API Keys state
  const [showCreateKeyDialog, setShowCreateKeyDialog] = useState(false);
  const [createKeyType, setCreateKeyType] = useState<'secret' | 'publishable'>('secret');
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string; prefix: string } | null>(null);
  const [revoking, setRevoking] = useState(false);

  // Provider Settings state
  const [defaultProvider, setDefaultProvider] = useState('groq');
  const [defaultModel, setDefaultModel] = useState('llama-3.1-8b-instant');
  const [requestsPerMinute, setRequestsPerMinute] = useState('60');
  const [tokensPerDay, setTokensPerDay] = useState('1000000');
  const [concurrentRequests, setConcurrentRequests] = useState('10');
  const [enableFallback, setEnableFallback] = useState(true);
  const [fallbackProvider, setFallbackProvider] = useState('anthropic');
  const [fallbackModel, setFallbackModel] = useState('');
  const [maxRetriesBeforeFallback, setMaxRetriesBeforeFallback] = useState('3');
  const [circuitBreakerEnabled, setCircuitBreakerEnabled] = useState(true);
  const [circuitBreakerFailureThreshold, setCircuitBreakerFailureThreshold] = useState('5');
  const [circuitBreakerTimeoutSeconds, setCircuitBreakerTimeoutSeconds] = useState('60');
  const [isSavingProviders, setIsSavingProviders] = useState(false);
  const [providerSettingsDirty, setProviderSettingsDirty] = useState(false);

  // Budget Settings state
  const [monthlyBudget, setMonthlyBudget] = useState('');
  const [spendCap, setSpendCap] = useState('');
  const [enforceSpendCap, setEnforceSpendCap] = useState(false);
  const [budgetAlertsEnabled, setBudgetAlertsEnabled] = useState(true);
  const [isSavingBudget, setIsSavingBudget] = useState(false);

  // Network policy state
  const [networkAccessMode, setNetworkAccessMode] = useState<'public' | 'restricted'>('public');
  const [allowedCidrsText, setAllowedCidrsText] = useState('');
  const [networkPolicyDirty, setNetworkPolicyDirty] = useState(false);
  const [isSavingNetworkPolicy, setIsSavingNetworkPolicy] = useState(false);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);

  // RagMetrics state
  const [ragmetricsEnabled, setRagmetricsEnabled] = useState(false);
  const [ragmetricsApiKey, setRagmetricsApiKey] = useState('');
  const [isSavingIntegrations, setIsSavingIntegrations] = useState(false);
  const [showSuggestModal, setShowSuggestModal] = useState(false);
  const [suggestion, setSuggestion] = useState('');
  const [isSubmittingSuggestion, setIsSubmittingSuggestion] = useState(false);

  // API Key interface
  interface ApiKeyData {
    id: string;
    name: string;
    key_prefix: string;
    key_type?: 'secret' | 'publishable';
    allowed_domains?: string[] | null;
    created_at: string;
  }

  const cachedProject = React.useMemo<ProjectData | undefined>(() => {
    const organization = organizations.find((item) => item.slug === orgSlug);
    if (!organization) return undefined;
    const project = projects.find((item) => (
      item.slug === projectSlug && item.organization_id === organization.id
    ));
    if (!project) return undefined;
    return {
      id: project.id,
      name: project.name,
      slug: project.slug,
      organization_id: project.organization_id,
    };
  }, [organizations, projects, orgSlug, projectSlug]);

  // Fetch project with caching - INSTANT ON REVISIT!
  const { data: project, isLoading: projectLoading, error } = useProjectDetails(orgSlug, projectSlug, cachedProject);

  // Sync form state when project loads
  React.useEffect(() => {
    if (project) {
      setProjectName(project.name);
    }
  }, [project]);

  // Fetch webhooks with caching
  const { data: webhooksData } = useQuery<unknown, Error, WebhookData[]>({
    queryKey: ["webhooks", project?.id],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${project!.id}/webhooks`);
      if (!response.ok) throw new Error("Failed to fetch webhooks");
      return response.json();
    },
    select: normalizeWebhookResponse<WebhookData>,
    enabled: !!project?.id,
    staleTime: 5 * 60 * 1000,
  });
  const webhooks: WebhookData[] = webhooksData ?? [];

  // Fetch provider health with caching
  const { data: providers = [], isLoading: providersLoading, refetch: refetchProviders } = useQuery<ProviderHealth[]>({
    queryKey: ["providerHealth"],
    queryFn: async () => {
      const response = await fetch('/api/providers/health');
      if (!response.ok) throw new Error("Failed to fetch providers");
      const data = await response.json();
      return data.providers || [];
    },
    staleTime: 60 * 1000,
  });

  // Fetch API keys with caching
  const { data: apiKeys = [], refetch: refetchApiKeys } = useQuery<ApiKeyData[]>({
    queryKey: ["apiKeys", project?.id],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${project!.id}/api-keys`);
      if (!response.ok) throw new Error("Failed to fetch API keys");
      const data = await response.json();
      return data.apiKeys || [];
    },
    enabled: !!project?.id,
    staleTime: 30 * 1000,
  });

  // Fetch provider settings
  interface ProviderSettingsData {
    default_provider: string;
    default_model: string;
    requests_per_minute: number;
    tokens_per_day: number;
    concurrent_requests: number;
    enable_fallback: boolean;
    fallback_provider: string;
    max_retries_before_fallback: number;
    circuit_breaker_enabled: boolean;
    circuit_breaker_failure_threshold: number;
    circuit_breaker_timeout_seconds: number;
    fallback_model: string | null;
    ragmetrics_enabled: boolean;
    ragmetrics_api_key: string;
  }

  const { data: providerSettings } = useQuery<{ settings: ProviderSettingsData }>({
    queryKey: ["providerSettings", project?.id],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${project!.id}/settings`);
      if (!response.ok) throw new Error("Failed to fetch settings");
      return response.json();
    },
    enabled: !!project?.id,
    staleTime: 60 * 1000,
  });

  // Sync provider settings to state when loaded
  React.useEffect(() => {
    if (providerSettings?.settings) {
      const s = providerSettings.settings;
      setDefaultProvider(s.default_provider || 'groq');
      setDefaultModel(s.default_model || 'llama-3.1-8b-instant');
      setRequestsPerMinute(String(s.requests_per_minute || 60));
      setTokensPerDay(String(s.tokens_per_day || 1000000));
      setConcurrentRequests(String(s.concurrent_requests || 10));
      setEnableFallback(s.enable_fallback ?? true);
      setFallbackProvider(s.fallback_provider || 'anthropic');
      setFallbackModel(s.fallback_model || '');
      setMaxRetriesBeforeFallback(String(s.max_retries_before_fallback || 3));
      setCircuitBreakerEnabled(s.circuit_breaker_enabled ?? true);
      setCircuitBreakerFailureThreshold(String(s.circuit_breaker_failure_threshold || 5));
      setCircuitBreakerTimeoutSeconds(String(s.circuit_breaker_timeout_seconds || 60));
      setRagmetricsEnabled(s.ragmetrics_enabled ?? false);
      setRagmetricsApiKey(s.ragmetrics_api_key || '');
      setProviderSettingsDirty(false);
    }
  }, [providerSettings]);

  // Computed: split keys by type
  const secretKeys = apiKeys.filter((k: ApiKeyData) => !k.key_type || k.key_type === 'secret');
  const publishableKeys = apiKeys.filter((k: ApiKeyData) => k.key_type === 'publishable');

  // Format relative date helper
  const formatRelativeDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  // Copy API key handler
  const handleCopyKey = async (keyPrefix: string) => {
    await navigator.clipboard.writeText(keyPrefix);
    toast.success("Key prefix copied to clipboard");
  };

  // Revoke API key handler
  const confirmRevokeKey = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const response = await fetch(`/api/projects/${project!.id}/api-keys/${revokeTarget.id}`, {
        method: "PATCH",
      });
      if (!response.ok) throw new Error("Failed to revoke key");
      toast.success("API key revoked");
      refetchApiKeys();
    } catch {
      toast.error("Failed to revoke API key");
    } finally {
      setRevoking(false);
      setRevokeTarget(null);
    }
  };

  // Fetch service versions with caching
  const { data: versions } = useQuery<{ sdk: string; api: string; proxy: string }>({
    queryKey: ["serviceVersions"],
    queryFn: async () => {
      const response = await fetch('/api/versions');
      if (!response.ok) throw new Error("Failed to fetch versions");
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // versions change rarely
  });

  // Fetch rate limits with caching
  const { data: rateLimits } = useQuery<RateLimitsData>({
    queryKey: ["rateLimits", project?.id],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${project!.id}/rate-limits`);
      if (!response.ok) throw new Error("Failed to fetch rate limits");
      return response.json();
    },
    enabled: !!project?.id,
    staleTime: 30 * 1000,
  });

  // Fetch budget settings
  interface BudgetSettingsData {
    monthly_budget: number | null;
    spend_cap: number | null;
    enforce_spend_cap: boolean;
    budget_alerts_enabled: boolean;
    current_spend: number;
    percent_used: number | null;
    is_cap_reached: boolean;
  }

  const { data: budgetSettings, refetch: refetchBudget } = useQuery<BudgetSettingsData>({
    queryKey: ["budgetSettings", project?.id],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${project!.id}/budget`);
      if (!response.ok) throw new Error("Failed to fetch budget settings");
      return response.json();
    },
    enabled: !!project?.id,
    staleTime: 30 * 1000,
  });

  // Sync budget settings to state
  React.useEffect(() => {
    if (budgetSettings) {
      setMonthlyBudget(budgetSettings.monthly_budget?.toString() || '');
      setSpendCap(budgetSettings.spend_cap?.toString() || '');
      setEnforceSpendCap(budgetSettings.enforce_spend_cap || false);
      setBudgetAlertsEnabled(budgetSettings.budget_alerts_enabled ?? true);
    }
  }, [budgetSettings]);

  const { data: networkPolicy, isLoading: networkPolicyLoading } = useQuery<NetworkPolicyData>({
    queryKey: ["networkPolicy", project?.id],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${project!.id}/networking`);
      if (!response.ok) throw new Error("Failed to fetch network policy");
      return response.json();
    },
    enabled: !!project?.id,
    staleTime: 30 * 1000,
  });

  React.useEffect(() => {
    if (!networkPolicy) return;
    setNetworkAccessMode(networkPolicy.access_mode);
    setAllowedCidrsText(networkPolicy.allowed_cidrs.join('\n'));
    setNetworkPolicyDirty(false);
  }, [networkPolicy]);

  // Create webhook mutation
  const createWebhookMutation = useMutation({
    mutationFn: async (data: { name: string; url: string; events: string[] }) => {
      const response = await fetch(`/api/projects/${project!.id}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create webhook');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks", project?.id] });
      setShowWebhookDialog(false);
      setWebhookName('');
      setWebhookUrl('');
      setWebhookEvents(['request.completed']);
      toast.success('Webhook created!');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Delete webhook mutation
  const deleteWebhookMutation = useMutation({
    mutationFn: async (webhookId: string) => {
      const response = await fetch(`/api/projects/${project!.id}/webhooks/${webhookId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete webhook');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks", project?.id] });
      toast.success('Webhook deleted!');
    },
    onError: () => toast.error('Failed to delete webhook'),
  });

  const toggleWebhookEvent = (event: string) => {
    setWebhookEvents(prev =>
      prev.includes(event)
        ? prev.filter(e => e !== event)
        : [...prev, event]
    );
  };

  const handleCopy = () => {
    if (project?.slug) {
      navigator.clipboard.writeText(project.slug);
      setCopiedSlug(true);
      setTimeout(() => setCopiedSlug(false), 2000);
      toast.success("Copied!");
    }
  };

  const handleSave = async () => {
    if (!project) return;
    const nextName = projectName.trim();
    if (!nextName) return;

    setIsSaving(true);
    try {
      const { error: updateError } = await supabase
        .from("projects")
        .update({ name: nextName })
        .eq("id", project.id);

      if (updateError) {
        toast.error("Could not update project name.");
      } else {
        setProjectName(nextName);
        await queryClient.invalidateQueries({ queryKey: ["projectDetails", orgSlug, projectSlug] });
        toast.success("Project name updated.");
        updateProjectContext(project.id, { name: nextName });
      }
    } catch {
      toast.error("Could not update project name.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveNetworkPolicy = async () => {
    if (!project) return;

    const allowedCidrs = allowedCidrsText
      .split(/[\n,]/)
      .map((value) => value.trim())
      .filter(Boolean);

    if (networkAccessMode === 'restricted' && allowedCidrs.length === 0) {
      toast.error('Add at least one source range before restricting access.');
      return;
    }

    setIsSavingNetworkPolicy(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/networking`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_mode: networkAccessMode,
          allowed_cidrs: allowedCidrs,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to update network policy');

      setAllowedCidrsText(result.allowed_cidrs.join('\n'));
      setNetworkPolicyDirty(false);
      queryClient.setQueryData(["networkPolicy", project.id], result);
      toast.success('Ingress policy updated.');
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : 'Failed to update network policy');
    } finally {
      setIsSavingNetworkPolicy(false);
    }
  };

  const handleCopyEndpoint = async () => {
    await navigator.clipboard.writeText(GATEWAY_ENDPOINT);
    setCopiedEndpoint(true);
    setTimeout(() => setCopiedEndpoint(false), 2000);
    toast.success('Gateway endpoint copied.');
  };

  const handleDeleteProject = async () => {
    if (!project || deleteConfirmName !== project.name) {
      toast.error("Name doesn't match.");
      return;
    }

    try {
      const { error: deleteError } = await supabase
        .from("projects")
        .delete()
        .eq("id", project.id);

      if (deleteError) {
        toast.error("Failed to delete.");
      } else {
        toast.success("Project deleted!");
        router.push(`/${orgSlug}/~/projects`);
      }
    } catch {
      toast.error("An error occurred.");
    } finally {
      setShowDeleteDialog(false);
      setDeleteConfirmName("");
    }
  };

  const hasNameChanges = Boolean(project && projectName.trim() && projectName.trim() !== project.name);

  const settingsTabClass = cn(
    "mt-0 space-y-0",
    "[&>section]:grid [&>section]:gap-4 [&>section]:border-t [&>section]:border-border/35 [&>section]:py-7",
    "lg:[&>section]:grid-cols-[200px_minmax(0,1fr)] lg:[&>section]:gap-9 lg:[&>section]:items-start",
    "[&>section:first-of-type]:border-t-0"
  );

  if (projectLoading) {
    return (
      <div className="w-full max-w-[1180px] mx-auto px-6 lg:px-10 py-10">
        <div className="space-y-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-[200px]" />
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-sm text-red-500">{error?.message || "Project not found."}</p>
      </div>
    );
  }

  return (
    <main className="w-full max-w-[1180px] mx-auto px-6 lg:px-10 py-12">
      <Tabs value={activeSettingsTab} className="space-y-0">
        {/* GENERAL TAB */}
        <TabsContent value="general" className={settingsTabClass}>
          <SettingsPageLabel
            title="General"
            description="Manage this project's name and stable identifier."
          />

          {/* General Settings */}
          <section>
            <div className="space-y-0.5">
              <h2 className="text-sm font-medium">Project identity</h2>
              <p className="text-xs text-muted-foreground md:text-[10px]">The name and stable identifier used across Cencori.</p>
            </div>
            <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/30">
              {/* Project Name */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between px-4 py-3 border-b border-border/30 gap-2 md:gap-0">
                <div className="space-y-0.5">
                  <p className="text-sm md:text-xs font-medium">Project name</p>
                  <p className="text-xs md:text-[10px] text-muted-foreground">Displayed throughout the dashboard.</p>
                </div>
                <Input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full md:w-64 h-10 md:h-8 text-sm"
                  maxLength={48}
                  disabled={isSaving}
                />
              </div>
              <div className="flex flex-col gap-3 border-b border-border/30 bg-background/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[11px] text-muted-foreground">Maximum 48 characters.</p>
                <Button size="sm" className="h-7 px-3 text-xs" onClick={handleSave} disabled={isSaving || !hasNameChanges}>
                  {isSaving ? "Saving…" : "Save"}
                </Button>
              </div>
              {/* Project ID */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between px-4 py-3 gap-2 md:gap-0">
                <div className="space-y-0.5">
                  <p className="text-sm md:text-xs font-medium">Project ID</p>
                  <p className="text-xs md:text-[10px] text-muted-foreground">Reference used in APIs and URLs.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1.5 md:py-1 bg-muted/50 rounded-md font-mono text-sm md:text-xs text-muted-foreground">
                    {project.slug}
                  </span>
                  <Button variant="outline" size="sm" className="h-8 md:h-7 text-xs gap-1.5" onClick={handleCopy}>
                    {copiedSlug ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    Copy
                  </Button>
                </div>
              </div>
            </div>
          </section>

          {/* Project Observability */}
          <section>
            <div className="space-y-0.5">
              <h2 className="text-sm font-medium">Project observability</h2>
              <p className="text-xs md:text-[10px] text-muted-foreground">View usage and request statistics.</p>
            </div>
            <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/30">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between px-4 py-3 gap-2 md:gap-0">
                <div className="space-y-0.5">
                  <p className="text-sm md:text-xs font-medium">Observability</p>
                  <p className="text-xs md:text-[10px] text-muted-foreground">See requests, costs, and latency metrics.</p>
                </div>
                <Button variant="outline" size="sm" className="w-full md:w-auto h-10 md:h-7 text-sm md:text-xs" asChild>
                  <Link href={`/${orgSlug}/${projectSlug}/observability`}>
                    View
                  </Link>
                </Button>
              </div>
            </div>
          </section>

          {/* Delete Project */}
          <section>
            <div className="space-y-0.5">
              <h2 className="text-sm font-medium">Delete project</h2>
              <p className="text-xs md:text-[10px] text-muted-foreground">Permanently remove your project and its data.</p>
            </div>
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 overflow-hidden">
              <div className="px-4 py-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="h-5 w-5 md:h-4 md:w-4 text-red-500 mt-0.5 shrink-0" />
                  <div className="space-y-2.5 md:space-y-2 flex-1">
                    <div className="space-y-0.5">
                      <p className="text-sm md:text-xs font-medium">Deleting this project will remove all data.</p>
                      <p className="text-xs md:text-[10px] text-muted-foreground">
                        This includes API keys, logs, and observability data. This action cannot be undone.
                      </p>
                    </div>
                    <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                      <DialogTrigger asChild>
                        <Button variant="destructive" size="sm" className="w-full md:w-auto h-10 md:h-7 text-sm md:text-xs gap-1.5">
                          <Trash2 className="h-4 w-4 md:h-3 md:w-3" />
                          Delete project
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-sm">
                        <DialogHeader>
                          <DialogTitle>Delete project</DialogTitle>
                          <DialogDescription className="text-xs">
                            Type <span className="font-mono font-medium text-foreground">{project.name}</span> to confirm.
                          </DialogDescription>
                        </DialogHeader>
                        <Input
                          placeholder={project.name}
                          value={deleteConfirmName}
                          onChange={(e) => setDeleteConfirmName(e.target.value)}
                          className="h-9"
                        />
                        <DialogFooter>
                          <Button variant="ghost" size="sm" onClick={() => setShowDeleteDialog(false)}>
                            Cancel
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleDeleteProject}
                            disabled={deleteConfirmName !== project.name}
                          >
                            Delete
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </TabsContent>

        {/* BUDGET TAB */}
        <TabsContent value="budget" className={settingsTabClass}>
          <SettingsPageLabel
            title="Budget"
            description="Set spending limits and monitor project costs."
          />

          {/* Current Spend */}
          <section>
            <div className="space-y-0.5">
              <h2 className="text-sm font-medium">Current month spend</h2>
              <p className="text-xs md:text-[10px] text-muted-foreground">Your AI usage cost this billing period.</p>
            </div>
            <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/30">
              <div className="px-4 py-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <DollarSign className="h-5 w-5 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">${budgetSettings?.current_spend?.toFixed(2) || '0.00'}</p>
                      <p className="text-xs text-muted-foreground">spent this month</p>
                    </div>
                  </div>
                  {budgetSettings?.monthly_budget && (
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {budgetSettings.percent_used?.toFixed(0) || 0}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        of ${budgetSettings.monthly_budget.toFixed(2)} budget
                      </p>
                    </div>
                  )}
                </div>
                {budgetSettings?.monthly_budget && (
                  <div className="w-full bg-muted/50 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${(budgetSettings.percent_used || 0) >= 100
                        ? 'bg-red-500'
                        : (budgetSettings.percent_used || 0) >= 80
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                        }`}
                      style={{ width: `${Math.min(budgetSettings.percent_used || 0, 100)}%` }}
                    />
                  </div>
                )}
                {budgetSettings?.is_cap_reached && (
                  <div className="mt-3 flex items-center gap-2 text-red-500 text-xs">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>Spend cap reached — requests are being blocked</span>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Budget Configuration */}
          <section>
            <div className="space-y-0.5">
              <h2 className="text-sm font-medium">Budget configuration</h2>
              <p className="text-xs md:text-[10px] text-muted-foreground">Set spending limits and alerts.</p>
            </div>
            <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/30">
              {/* Monthly Budget */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between px-4 py-3 border-b border-border/30 gap-2 md:gap-0">
                <div className="space-y-0.5">
                  <p className="text-sm md:text-xs font-medium">Monthly budget</p>
                  <p className="text-xs md:text-[10px] text-muted-foreground">Get alerts when you approach this amount.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">$</span>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="100"
                    value={monthlyBudget}
                    onChange={(e) => setMonthlyBudget(e.target.value)}
                    className="w-full md:w-28 h-10 md:h-8 text-sm"
                  />
                </div>
              </div>

              {/* Spend Cap */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between px-4 py-3 border-b border-border/30 gap-2 md:gap-0">
                <div className="space-y-0.5">
                  <p className="text-sm md:text-xs font-medium">Spend cap (hard limit)</p>
                  <p className="text-xs md:text-[10px] text-muted-foreground">Block requests when this limit is reached.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">$</span>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="150"
                    value={spendCap}
                    onChange={(e) => setSpendCap(e.target.value)}
                    className="w-full md:w-28 h-10 md:h-8 text-sm"
                  />
                </div>
              </div>

              {/* Enforce Spend Cap */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
                <div className="space-y-0.5">
                  <p className="text-sm md:text-xs font-medium">Enforce spend cap</p>
                  <p className="text-xs md:text-[10px] text-muted-foreground">When enabled, requests will be blocked at the cap.</p>
                </div>
                <Checkbox
                  checked={enforceSpendCap}
                  onCheckedChange={(checked) => setEnforceSpendCap(checked === true)}
                />
              </div>

              {/* Budget Alerts */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
                <div className="flex items-center gap-3">
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  <div className="space-y-0.5">
                    <p className="text-sm md:text-xs font-medium">Budget alerts</p>
                    <p className="text-xs md:text-[10px] text-muted-foreground">Email alerts at 50%, 80%, and 100% of budget.</p>
                  </div>
                </div>
                <Checkbox
                  checked={budgetAlertsEnabled}
                  onCheckedChange={(checked) => setBudgetAlertsEnabled(checked === true)}
                />
              </div>

              {/* Save Button */}
              <div className="flex justify-end px-4 py-2.5 md:py-2 bg-muted/20">
                <Button
                  size="sm"
                  className="h-9 md:h-7 px-4 md:px-3 text-sm md:text-xs"
                  disabled={isSavingBudget}
                  onClick={async () => {
                    if (!project) return;
                    setIsSavingBudget(true);
                    try {
                      const response = await fetch(`/api/projects/${project.id}/budget`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          monthly_budget: monthlyBudget ? parseFloat(monthlyBudget) : null,
                          spend_cap: spendCap ? parseFloat(spendCap) : null,
                          enforce_spend_cap: enforceSpendCap,
                          budget_alerts_enabled: budgetAlertsEnabled,
                        }),
                      });
                      if (!response.ok) throw new Error('Failed to save');
                      toast.success('Budget settings saved!');
                      refetchBudget();
                    } catch {
                      toast.error('Failed to save budget settings');
                    } finally {
                      setIsSavingBudget(false);
                    }
                  }}
                >
                  {isSavingBudget ? 'Saving...' : 'Save changes'}
                </Button>
              </div>
            </div>
          </section>

          {/* Alert History */}
          <section>
            <div className="space-y-0.5">
              <h2 className="text-sm font-medium">Alert thresholds</h2>
              <p className="text-xs md:text-[10px] text-muted-foreground">Alerts are sent when budget reaches these levels.</p>
            </div>
            <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/30">
              <div className="divide-y divide-border/30">
                {[50, 80, 100].map((threshold) => (
                  <div key={threshold} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${threshold >= 100 ? 'bg-red-500' :
                        threshold >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`} />
                      <span className="text-xs">{threshold}% of budget</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {budgetSettings?.monthly_budget
                        ? `$${(budgetSettings.monthly_budget * threshold / 100).toFixed(2)}`
                        : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </TabsContent>

        {/* PROVIDERS TAB */}
        <TabsContent value="providers" className={settingsTabClass}>
          <SettingsPageLabel
            title="Providers"
            description="Configure model access, routing defaults, and failover behavior."
          />

          {/* Default Provider & Model */}
          <section>
            <div>
              <h2 className="text-sm font-medium">Default provider</h2>
              <p className="text-xs md:text-[10px] text-muted-foreground">Select the default provider and model for requests without explicit model specification.</p>
            </div>
            <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/30">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between px-4 py-3 border-b border-border/30 gap-2 md:gap-0">
                <div className="space-y-0.5">
                  <p className="text-sm md:text-xs font-medium">Default provider</p>
                  <p className="text-xs md:text-[10px] text-muted-foreground">Used when no provider is specified in API requests.</p>
                </div>
                <Select value={defaultProvider} onValueChange={(v) => { setDefaultProvider(v); setProviderSettingsDirty(true); }}>
                  <SelectTrigger className="w-full md:w-48 h-10 md:h-8 text-sm md:text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {SUPPORTED_PROVIDERS.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id} className="text-xs">
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between px-4 py-3 gap-2 md:gap-0">
                <div className="space-y-0.5">
                  <p className="text-sm md:text-xs font-medium">Default model</p>
                  <p className="text-xs md:text-[10px] text-muted-foreground">Fallback model when not specified.</p>
                </div>
                <Select value={defaultModel} onValueChange={(v) => { setDefaultModel(v); setProviderSettingsDirty(true); }}>
                  <SelectTrigger className="w-full md:w-56 h-10 md:h-8 text-sm md:text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {getModelsForProvider(defaultProvider).map((model) => (
                      <SelectItem key={model.id} value={model.id} className="text-xs">
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Rate Limiting */}
          <section>
            <div>
              <h2 className="text-sm font-medium">Rate limiting</h2>
              <p className="text-xs md:text-[10px] text-muted-foreground">Configure request limits enforced via your Cencori API key.</p>
            </div>
            <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/30">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between px-4 py-3 border-b border-border/30 gap-2 md:gap-0">
                <div className="space-y-0.5">
                  <p className="text-sm md:text-xs font-medium">Requests per minute</p>
                  <p className="text-xs md:text-[10px] text-muted-foreground">Maximum API requests allowed per minute.</p>
                </div>
                <Input
                  value={requestsPerMinute}
                  onChange={(e) => { setRequestsPerMinute(e.target.value); setProviderSettingsDirty(true); }}
                  className="w-full md:w-24 h-10 md:h-8 text-sm md:text-xs text-right"
                />
              </div>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between px-4 py-3 border-b border-border/30 gap-2 md:gap-0">
                <div className="space-y-0.5">
                  <p className="text-sm md:text-xs font-medium">Tokens per day</p>
                  <p className="text-xs md:text-[10px] text-muted-foreground">Daily token usage limit across all requests.</p>
                </div>
                <Input
                  value={tokensPerDay}
                  onChange={(e) => { setTokensPerDay(e.target.value); setProviderSettingsDirty(true); }}
                  className="w-full md:w-24 h-10 md:h-8 text-sm md:text-xs text-right"
                />
              </div>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between px-4 py-3 gap-2 md:gap-0">
                <div className="space-y-0.5">
                  <p className="text-sm md:text-xs font-medium">Concurrent requests</p>
                  <p className="text-xs md:text-[10px] text-muted-foreground">Max simultaneous requests allowed.</p>
                </div>
                <Input
                  value={concurrentRequests}
                  onChange={(e) => { setConcurrentRequests(e.target.value); setProviderSettingsDirty(true); }}
                  className="w-full md:w-24 h-10 md:h-8 text-sm md:text-xs text-right"
                />
              </div>
            </div>
          </section>

          {/* Fallback Configuration */}
          <section>
            <div>
              <h2 className="text-sm font-medium">Fallback configuration</h2>
              <p className="text-xs md:text-[10px] text-muted-foreground">Configure automatic failover when primary provider is unavailable.</p>
            </div>
            <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/30">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between px-4 py-3 border-b border-border/30 gap-2 md:gap-0">
                <div className="space-y-0.5">
                  <p className="text-sm md:text-xs font-medium">Enable automatic fallback</p>
                  <p className="text-xs md:text-[10px] text-muted-foreground">Route to backup provider on failure.</p>
                </div>
                <Checkbox
                  checked={enableFallback}
                  onCheckedChange={(checked) => { setEnableFallback(!!checked); setProviderSettingsDirty(true); }}
                  className="h-5 w-5 md:h-4 md:w-4"
                />
              </div>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between px-4 py-3 border-b border-border/30 gap-2 md:gap-0">
                <div className="space-y-0.5">
                  <p className="text-sm md:text-xs font-medium">Fallback provider</p>
                  <p className="text-xs md:text-[10px] text-muted-foreground">Used when primary fails.</p>
                </div>
                <Select value={fallbackProvider} onValueChange={(v) => { setFallbackProvider(v); setProviderSettingsDirty(true); }} disabled={!enableFallback}>
                  <SelectTrigger className="w-full md:w-48 h-10 md:h-8 text-sm md:text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {SUPPORTED_PROVIDERS.filter(p => p.id !== defaultProvider).map((provider) => (
                      <SelectItem key={provider.id} value={provider.id} className="text-xs">
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between px-4 py-3 border-b border-border/30 gap-2 md:gap-0">
                <div className="space-y-0.5">
                  <p className="text-sm md:text-xs font-medium">Fallback model</p>
                  <p className="text-xs md:text-[10px] text-muted-foreground">Leave empty to auto-map from the primary model.</p>
                </div>
                <Select value={fallbackModel || '__auto__'} onValueChange={(v) => { setFallbackModel(v === '__auto__' ? '' : v); setProviderSettingsDirty(true); }} disabled={!enableFallback}>
                  <SelectTrigger className="w-full md:w-56 h-10 md:h-8 text-sm md:text-xs">
                    <SelectValue placeholder="Auto (default)" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="__auto__" className="text-xs">Auto (default)</SelectItem>
                    {getModelsForProvider(fallbackProvider).map((model) => (
                      <SelectItem key={model.id} value={model.id} className="text-xs">
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between px-4 py-3 gap-2 md:gap-0">
                <div className="space-y-0.5">
                  <p className="text-sm md:text-xs font-medium">Max retries before fallback</p>
                  <p className="text-xs md:text-[10px] text-muted-foreground">Attempts before switching provider.</p>
                </div>
                <Input
                  value={maxRetriesBeforeFallback}
                  onChange={(e) => { setMaxRetriesBeforeFallback(e.target.value); setProviderSettingsDirty(true); }}
                  className="w-full md:w-24 h-10 md:h-8 text-sm md:text-xs text-right"
                  disabled={!enableFallback}
                />
              </div>
            </div>
          </section>

          {/* Circuit Breaker Configuration */}
          <section>
            <div>
              <h2 className="text-sm font-medium">Circuit breaker</h2>
              <p className="text-xs md:text-[10px] text-muted-foreground">Configure automatic provider isolation when failures are detected.</p>
            </div>
            <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/30">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between px-4 py-3 border-b border-border/30 gap-2 md:gap-0">
                <div className="space-y-0.5">
                  <p className="text-sm md:text-xs font-medium">Enable circuit breaker</p>
                  <p className="text-xs md:text-[10px] text-muted-foreground">Automatically isolate failing providers to prevent cascading failures.</p>
                </div>
                <Checkbox
                  checked={circuitBreakerEnabled}
                  onCheckedChange={(checked) => { setCircuitBreakerEnabled(!!checked); setProviderSettingsDirty(true); }}
                  className="h-5 w-5 md:h-4 md:w-4"
                />
              </div>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between px-4 py-3 border-b border-border/30 gap-2 md:gap-0">
                <div className="space-y-0.5">
                  <p className="text-sm md:text-xs font-medium">Failure threshold</p>
                  <p className="text-xs md:text-[10px] text-muted-foreground">Consecutive failures before circuit opens.</p>
                </div>
                <Input
                  type="number"
                  min="1"
                  max="50"
                  value={circuitBreakerFailureThreshold}
                  onChange={(e) => { setCircuitBreakerFailureThreshold(e.target.value); setProviderSettingsDirty(true); }}
                  className="w-full md:w-24 h-10 md:h-8 text-sm md:text-xs text-right"
                  disabled={!circuitBreakerEnabled}
                />
              </div>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between px-4 py-3 gap-2 md:gap-0">
                <div className="space-y-0.5">
                  <p className="text-sm md:text-xs font-medium">Recovery timeout</p>
                  <p className="text-xs md:text-[10px] text-muted-foreground">Seconds before retrying a failed provider.</p>
                </div>
                <Input
                  type="number"
                  min="10"
                  max="600"
                  value={circuitBreakerTimeoutSeconds}
                  onChange={(e) => { setCircuitBreakerTimeoutSeconds(e.target.value); setProviderSettingsDirty(true); }}
                  className="w-full md:w-24 h-10 md:h-8 text-sm md:text-xs text-right"
                  disabled={!circuitBreakerEnabled}
                />
              </div>
            </div>
          </section>

          {/* Save Button */}
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted-foreground">
              {providerSettingsDirty ? "You have unsaved changes" : "All changes saved"}
            </p>
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={!providerSettingsDirty || isSavingProviders}
              onClick={async () => {
                setIsSavingProviders(true);
                try {
                  const response = await fetch(`/api/projects/${project.id}/settings`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      default_provider: defaultProvider,
                      default_model: defaultModel,
                      requests_per_minute: parseInt(requestsPerMinute),
                      tokens_per_day: parseInt(tokensPerDay),
                      concurrent_requests: parseInt(concurrentRequests),
                      enable_fallback: enableFallback,
                      fallback_provider: fallbackProvider,
                      fallback_model: fallbackModel || null,
                      max_retries_before_fallback: parseInt(maxRetriesBeforeFallback),
                      circuit_breaker_enabled: circuitBreakerEnabled,
                      circuit_breaker_failure_threshold: parseInt(circuitBreakerFailureThreshold),
                      circuit_breaker_timeout_seconds: parseInt(circuitBreakerTimeoutSeconds),
                    }),
                  });
                  if (!response.ok) throw new Error('Failed to save settings');
                  toast.success('Provider settings saved');
                  setProviderSettingsDirty(false);
                  // Refresh rate limits in Infrastructure tab to reflect new settings
                  queryClient.invalidateQueries({ queryKey: ["rateLimits", project.id] });
                  queryClient.invalidateQueries({ queryKey: ["providerSettings", project.id] });
                } catch {
                  toast.error('Failed to save settings');
                } finally {
                  setIsSavingProviders(false);
                }
              }}
            >
              {isSavingProviders ? (
                <>
                  <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save changes'
              )}
            </Button>
          </div>

          {/* Geographic Usage */}
          <section>
            <div>
              <h2 className="text-sm font-medium">Requests by Geography</h2>
              <p className="text-xs text-muted-foreground">Monitor API request distribution by country.</p>
            </div>
            <GeoAnalyticsSection projectId={project.id} />
          </section>
        </TabsContent>

        {/* INFRASTRUCTURE TAB */}
        <TabsContent value="infrastructure" className={settingsTabClass}>
          <SettingsPageLabel
            title="Infrastructure"
            description="Inspect the proxy runtime, service health, and request limits."
          />

          {/* Proxy Instance */}
          <section>
            <div className="space-y-0.5">
              <h2 className="text-sm font-medium">Proxy instance</h2>
              <p className="text-[10px] text-muted-foreground">Your primary proxy endpoint and region.</p>
            </div>
            <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/30">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <Globe className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium">Primary Proxy</p>
                    <p className="text-[10px] text-muted-foreground">
                      {REGION_MAP[project.region || 'default']?.name || 'US East (Virginia)'} • Edge
                    </p>
                  </div>
                </div>
                <span className="text-lg">{REGION_MAP[project.region || 'default']?.flag || '🇺🇸'}</span>
              </div>
            </div>
          </section>

          {/* Default AI Configuration */}
          <section>
            <div className="space-y-0.5">
              <h2 className="text-sm font-medium">Default AI configuration</h2>
              <p className="text-[10px] text-muted-foreground">Configure in Providers tab.</p>
            </div>
            <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/30">
              <div className="divide-y divide-border/30">
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-[10px] text-muted-foreground">Default provider</span>
                  <span className="text-[10px] font-medium">
                    {SUPPORTED_PROVIDERS.find(p => p.id === providerSettings?.settings?.default_provider)?.name || 'OpenAI'}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-[10px] text-muted-foreground">Default Model</span>
                  <span className="text-[10px] font-mono">
                    {providerSettings?.settings?.default_model || 'llama-3.1-8b-instant'}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Service Versions */}
          <section>
            <div>
              <h2 className="text-sm font-medium">Service versions</h2>
              <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Runtime versions currently serving this project.</p>
            </div>
            <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/30">
              <div className="divide-y divide-border/30">
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-[10px] text-muted-foreground">SDK version</span>
                  <span className="font-mono text-[10px]">{versions?.sdk || '—'}</span>
                </div>
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-[10px] text-muted-foreground">API version</span>
                  <span className="font-mono text-[10px]">{versions?.api || '—'}</span>
                </div>
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-[10px] text-muted-foreground">Proxy version</span>
                  <span className="font-mono text-[10px]">{versions?.proxy || '—'}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Provider Connections */}
          <section>
            <div>
              <h2 className="text-sm font-medium">Provider connections</h2>
              <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Live availability and latency across configured providers.</p>
            </div>
            <div className="min-w-0 space-y-3">
              <div className="flex justify-end">
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => refetchProviders()}
                  disabled={providersLoading}
                >
                  {providersLoading ? 'Refreshing...' : 'Refresh'}
                </Button>
              </div>
              <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/30">
                <MinimalScrollArea className="max-h-[104px]">
                  <div className="divide-y divide-border/30">
                    {providersLoading && providers.length === 0 ? (
                      <>
                        <div className="flex items-center justify-between px-4 py-2">
                          <Skeleton className="h-3 w-16" />
                          <Skeleton className="h-3 w-10" />
                        </div>
                        <div className="flex items-center justify-between px-4 py-2">
                          <Skeleton className="h-3 w-20" />
                          <Skeleton className="h-3 w-10" />
                        </div>
                      </>
                    ) : providers.length > 0 ? (
                      providers.map((provider) => (
                        <div key={provider.name} className="flex items-center justify-between px-4 py-2">
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${provider.status === 'healthy' ? 'bg-emerald-500' :
                              provider.status === 'degraded' ? 'bg-amber-500' : 'bg-red-500'
                              }`} />
                            <span className="text-[10px]">{provider.name}</span>
                            {provider.circuit?.state === 'open' && (
                              <span className="text-[8px] px-1 py-0.5 rounded bg-red-500/10 text-red-500 font-medium">
                                CIRCUIT OPEN
                              </span>
                            )}
                            {provider.circuit?.state === 'half-open' && (
                              <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-500 font-medium">
                                TESTING
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {provider.circuit && provider.circuit.failures > 0 && (
                              <span className="text-[9px] text-muted-foreground">
                                {provider.circuit.failures} failures
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground">
                              {provider.latency ? `${provider.latency}ms` : provider.error || 'N/A'}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-3 text-center">
                        <p className="text-[10px] text-muted-foreground">Click refresh to check providers</p>
                      </div>
                    )}
                  </div>
                </MinimalScrollArea>
              </div>
            </div>
          </section>

          {/* Rate Limits */}
          <section>
            <div className="space-y-0.5">
              <h2 className="text-sm font-medium">Rate limits</h2>
              <p className="text-[10px] text-muted-foreground">
                Current usage against your {rateLimits?.customLimits ? 'custom limits' : `plan limits (${rateLimits?.tier || 'free'} tier)`}.
                {!rateLimits?.customLimits && ' Configure in Providers tab.'}
              </p>
            </div>
            <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/30">
              <div className="divide-y divide-border/30">
                <div className="px-4 py-3">
                  <div className="flex justify-between text-[10px] mb-1.5">
                    <span className="text-muted-foreground">Requests / min</span>
                    <span>{rateLimits?.usage.requestsPerMinute.used.toLocaleString() || '—'} / {rateLimits?.usage.requestsPerMinute.limit.toLocaleString() || '—'}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${(rateLimits?.usage.requestsPerMinute.percentage || 0) > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${rateLimits?.usage.requestsPerMinute.percentage || 0}%` }}
                    />
                  </div>
                </div>
                <div className="px-4 py-3">
                  <div className="flex justify-between text-[10px] mb-1.5">
                    <span className="text-muted-foreground">Tokens / day</span>
                    <span>{rateLimits?.usage.tokensPerDay.used.toLocaleString() || '—'} / {rateLimits?.usage.tokensPerDay.limit.toLocaleString() || '—'}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${(rateLimits?.usage.tokensPerDay.percentage || 0) > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${rateLimits?.usage.tokensPerDay.percentage || 0}%` }}
                    />
                  </div>
                </div>
                <div className="px-4 py-3">
                  <div className="flex justify-between text-[10px] mb-1.5">
                    <span className="text-muted-foreground">Concurrent requests</span>
                    <span>{rateLimits?.usage.concurrentRequests.used || '—'} / {rateLimits?.usage.concurrentRequests.limit || '—'}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${(rateLimits?.usage.concurrentRequests.percentage || 0) > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${rateLimits?.usage.concurrentRequests.percentage || 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Request Configuration */}
          <section>
            <div className="space-y-0.5">
              <h2 className="text-sm font-medium">Request configuration</h2>
              <p className="text-[10px] text-muted-foreground">Default settings for request handling. Configure in Providers tab.</p>
            </div>
            <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/30">
              <div className="divide-y divide-border/30">
                <div className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px]">Request timeout</span>
                  </div>
                  <span className="text-[10px] font-mono">{project?.request_timeout_seconds || 30}s</span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <ArrowPathIcon className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px]">Max retries before fallback</span>
                  </div>
                  <span className="text-[10px] font-mono">{providerSettings?.settings?.max_retries_before_fallback ?? 3}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Server className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px]">Automatic fallback</span>
                  </div>
                  <span className={`text-[10px] font-mono ${providerSettings?.settings?.enable_fallback ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                    {providerSettings?.settings?.enable_fallback ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                {providerSettings?.settings?.enable_fallback && (
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Server className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[10px]">Fallback provider</span>
                    </div>
                    <span className="text-[10px] font-mono capitalize">
                      {SUPPORTED_PROVIDERS.find(p => p.id === providerSettings?.settings?.fallback_provider)?.name || providerSettings?.settings?.fallback_provider || 'None'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Webhooks */}
          <section>
            <div className="space-y-0.5">
              <h2 className="text-sm font-medium">Webhooks</h2>
              <p className="text-[10px] text-muted-foreground">HTTP callbacks for request events.</p>
            </div>
            <div className="min-w-0 space-y-3">
              <div className="flex justify-end">
                <Dialog open={showWebhookDialog} onOpenChange={setShowWebhookDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="h-7 text-xs">
                      Add webhook
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Create Webhook</DialogTitle>
                      <DialogDescription className="text-xs">
                        Add a webhook to receive real-time event notifications.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label htmlFor="webhook-name" className="text-xs">Name</Label>
                        <Input
                          id="webhook-name"
                          placeholder="My Webhook"
                          value={webhookName}
                          onChange={(e) => setWebhookName(e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="webhook-url" className="text-xs">Endpoint URL</Label>
                        <Input
                          id="webhook-url"
                          placeholder="https://your-server.com/webhook"
                          value={webhookUrl}
                          onChange={(e) => setWebhookUrl(e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Events</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {WEBHOOK_EVENTS.map((event) => (
                            <div key={event.value} className="flex items-center gap-2">
                              <Checkbox
                                id={event.value}
                                checked={webhookEvents.includes(event.value)}
                                onCheckedChange={() => toggleWebhookEvent(event.value)}
                              />
                              <label htmlFor={event.value} className="text-[10px] cursor-pointer">
                                {event.label}
                              </label>
                            </div>
                          ))}
                          </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="ghost" size="sm" onClick={() => setShowWebhookDialog(false)}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => createWebhookMutation.mutate({ name: webhookName, url: webhookUrl, events: webhookEvents })}
                        disabled={createWebhookMutation.isPending || !webhookName || !webhookUrl}
                      >
                        {createWebhookMutation.isPending ? 'Creating...' : 'Create'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/30">
                {webhooks.length === 0 ? (
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Webhook className="h-4 w-4 text-muted-foreground" />
                      <div className="space-y-0.5">
                        <p className="text-xs font-medium">No webhooks configured</p>
                        <p className="text-[10px] text-muted-foreground">Add webhooks to receive real-time events.</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-border/30">
                    {webhooks.map((webhook) => (
                      <div key={webhook.id} className="flex items-center justify-between px-4 py-2.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${webhook.is_active ? 'bg-emerald-500' : 'bg-muted-foreground'
                            }`} />
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{webhook.name}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{webhook.url}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">
                            {webhook.events.length} event{webhook.events.length !== 1 ? 's' : ''}
                          </span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6">
                                <MoreHorizontal className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-red-500 text-xs"
                                onClick={() => deleteWebhookMutation.mutate(webhook.id)}
                              >
                                <Trash2 className="h-3 w-3 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </TabsContent>

        {/* NETWORKING TAB */}
        <TabsContent value="networking" className={settingsTabClass}>
          <SettingsPageLabel
            title="Networking"
            description="Control how traffic reaches this project and where its data plane runs."
          />

          <section>
            <div className="space-y-0.5">
              <h2 className="text-sm font-medium">Gateway ingress</h2>
              <p className="text-[10px] leading-4 text-muted-foreground">
                The public endpoint used by every environment in this project.
              </p>
            </div>
            <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/30">
              <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-xs font-medium">API base URL</p>
                  <p className="truncate font-mono text-[10px] text-muted-foreground">{GATEWAY_ENDPOINT}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 px-3 text-xs dark:bg-white dark:text-black dark:hover:bg-white/90"
                  onClick={handleCopyEndpoint}
                >
                  {copiedEndpoint ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <div className="grid border-t border-border/30 sm:grid-cols-3 sm:divide-x sm:divide-border/30">
                <div className="px-4 py-3">
                  <p className="text-[10px] text-muted-foreground">Data-plane region</p>
                  <p className="mt-1 font-mono text-xs">{project.region || 'us-east-1'}</p>
                </div>
                <div className="border-t border-border/30 px-4 py-3 sm:border-t-0">
                  <p className="text-[10px] text-muted-foreground">Transport</p>
                  <p className="mt-1 text-xs">HTTPS · TLS 1.2+</p>
                </div>
                <div className="border-t border-border/30 px-4 py-3 sm:border-t-0">
                  <p className="text-[10px] text-muted-foreground">Edge routing</p>
                  <p className="mt-1 text-xs">Anycast ingress</p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <div className="space-y-0.5">
              <h2 className="text-sm font-medium">Source policy</h2>
              <p className="text-[10px] leading-4 text-muted-foreground">
                Restrict gateway traffic to trusted IPv4 and IPv6 networks.
              </p>
            </div>
            <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/30">
              {networkPolicyLoading ? (
                <div className="space-y-3 px-4 py-4">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-0.5">
                      <p className="text-xs font-medium">Access mode</p>
                      <p className="text-[10px] text-muted-foreground">
                        Restricted mode is enforced before rate limits or model routing.
                      </p>
                    </div>
                    <Select
                      value={networkAccessMode}
                      onValueChange={(value: 'public' | 'restricted') => {
                        setNetworkAccessMode(value);
                        setNetworkPolicyDirty(true);
                      }}
                    >
                      <SelectTrigger className="h-8 w-full text-xs sm:w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="public">Public ingress</SelectItem>
                        <SelectItem value="restricted">Restricted ingress</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {networkAccessMode === 'restricted' && (
                    <div className="border-t border-border/30 px-4 py-4">
                      <Label htmlFor="network-cidrs" className="text-xs font-medium">Allowed source ranges</Label>
                      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                        Add one address or CIDR per line. Exact addresses are stored as /32 or /128 ranges.
                      </p>
                      <Textarea
                        id="network-cidrs"
                        value={allowedCidrsText}
                        onChange={(event) => {
                          setAllowedCidrsText(event.target.value);
                          setNetworkPolicyDirty(true);
                        }}
                        placeholder={'203.0.113.0/24\n2001:db8:1234::/48'}
                        spellCheck={false}
                        className="mt-3 min-h-28 resize-y bg-background/40 font-mono text-xs leading-6"
                      />
                    </div>
                  )}

                  <div className="flex flex-col gap-3 border-t border-border/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="max-w-2xl text-[10px] leading-4 text-muted-foreground">
                      Cencori evaluates the connection source at the edge. End-user IP metadata cannot bypass this policy.
                    </p>
                    <Button
                      size="sm"
                      className="h-7 shrink-0 px-3 text-xs"
                      disabled={!networkPolicyDirty || isSavingNetworkPolicy}
                      onClick={handleSaveNetworkPolicy}
                    >
                      {isSavingNetworkPolicy ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </section>

          <section>
            <div className="space-y-0.5">
              <h2 className="text-sm font-medium">Enforcement path</h2>
              <p className="text-[10px] leading-4 text-muted-foreground">
                Where the policy runs in the request lifecycle.
              </p>
            </div>
            <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/30">
              <div className="grid sm:grid-cols-3 sm:divide-x sm:divide-border/30">
                <div className="px-4 py-3">
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">01 · Edge</p>
                  <p className="mt-1.5 text-xs font-medium">Resolve source</p>
                  <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Read the trusted connection IP.</p>
                </div>
                <div className="border-t border-border/30 px-4 py-3 sm:border-t-0">
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">02 · Policy</p>
                  <p className="mt-1.5 text-xs font-medium">Match network</p>
                  <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Evaluate all configured CIDR ranges.</p>
                </div>
                <div className="border-t border-border/30 px-4 py-3 sm:border-t-0">
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">03 · Gateway</p>
                  <p className="mt-1.5 text-xs font-medium">Route or reject</p>
                  <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Block before spend or provider execution.</p>
                </div>
              </div>
            </div>
          </section>
        </TabsContent>

        {/* INTEGRATIONS TAB */}
        <TabsContent value="integrations" className={settingsTabClass}>
          <SettingsPageLabel
            title="Integrations"
            description="Connect external services to this project's workflows."
          />

          <section>
            <div className="space-y-0.5">
              <h2 className="text-sm font-medium">External Integrations</h2>
              <p className="text-[10px] text-muted-foreground">Connect Cencori to third-party tools for evaluation, monitoring, and deployments.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-border/35 bg-muted/30 p-5 flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center">
                      <RagMetricsLogo className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">RagMetrics Evaluation</h3>
                      <p className="text-[10px] text-muted-foreground">Governance Engine</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <span className={cn(
                      "text-[9px] font-bold uppercase tracking-[0.14em]",
                      ragmetricsEnabled ? "text-emerald-500" : "text-muted-foreground/50"
                    )}>
                      {ragmetricsEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <Switch
                      id="ragmetrics-enabled"
                      checked={ragmetricsEnabled}
                      onCheckedChange={async (checked) => {
                        setRagmetricsEnabled(checked);
                        try {
                          const response = await fetch(`/api/projects/${project.id}/settings`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ragmetrics_enabled: checked })
                          });
                          if (!response.ok) throw new Error();
                          queryClient.invalidateQueries({ queryKey: ["providerSettings", project.id] });
                        } catch {
                          setRagmetricsEnabled(!checked);
                          toast.error('Failed to update integration');
                        }
                      }}
                      className="scale-75 origin-right"
                    />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground mb-4 flex-1">
                  Live AI output evaluation and hallucination detection.
                </p>

                <ul className="space-y-1.5 mb-6">
                  <li className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Check className="w-3 h-3 text-emerald-500" />
                    Automated faithfulness scoring
                  </li>
                  <li className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Check className="w-3 h-3 text-emerald-500" />
                    Real-time hallucination alerts
                  </li>
                  <li className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Check className="w-3 h-3 text-emerald-500" />
                    Context-aware verification
                  </li>
                </ul>

                <div className="pt-4 border-t border-border/30">
                  {ragmetricsApiKey ? (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        className="flex-1 h-8 rounded-full text-xs border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/5"
                        disabled
                      >
                        Connected
                      </Button>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[400px]">
                          <DialogHeader>
                            <DialogTitle className="text-sm">Update RagMetrics API Key</DialogTitle>
                            <DialogDescription className="text-xs">
                              Enter a new API key to replace the existing one.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-3 py-3">
                            <div className="space-y-1.5">
                              <Label htmlFor="ragmetrics-key-update" className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                                API Key
                              </Label>
                              <Input
                                id="ragmetrics-key-update"
                                type="password"
                                placeholder="rm_live_..."
                                defaultValue={ragmetricsApiKey}
                                onChange={(e) => setRagmetricsApiKey(e.target.value)}
                                className="h-8 text-[11px] font-mono bg-secondary/30 border-border/30"
                              />
                            </div>
                          </div>
                          <DialogFooter className="gap-2">
                            <Button
                              variant="destructive"
                              size="sm"
                              className="text-xs h-8"
                              onClick={async () => {
                                setRagmetricsApiKey('');
                                setRagmetricsEnabled(false);
                                try {
                                  await fetch(`/api/projects/${project.id}/settings`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ ragmetrics_enabled: false, ragmetrics_api_key: '' })
                                  });
                                  toast.success('RagMetrics disconnected');
                                  queryClient.invalidateQueries({ queryKey: ["providerSettings", project.id] });
                                } catch {
                                  toast.error('Failed to disconnect');
                                }
                              }}
                            >
                              Disconnect
                            </Button>
                            <Button
                              size="sm"
                              className="text-xs h-8"
                              onClick={async () => {
                                setIsSavingIntegrations(true);
                                try {
                                  const response = await fetch(`/api/projects/${project.id}/settings`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ ragmetrics_api_key: ragmetricsApiKey, ragmetrics_enabled: true })
                                  });
                                  if (!response.ok) throw new Error();
                                  toast.success('API key updated');
                                  queryClient.invalidateQueries({ queryKey: ["providerSettings", project.id] });
                                } catch {
                                  toast.error('Failed to update API key');
                                } finally {
                                  setIsSavingIntegrations(false);
                                }
                              }}
                              disabled={isSavingIntegrations}
                            >
                              {isSavingIntegrations ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
                              Save
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  ) : (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button className="w-full h-8 rounded-full text-xs">
                          Connect
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[400px]">
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2 text-sm">
                            <div className="w-6 h-6 rounded overflow-hidden">
                              <RagMetricsLogo className="w-full h-full object-cover" />
                            </div>
                            Connect RagMetrics
                          </DialogTitle>
                          <DialogDescription className="text-xs">
                            Paste your RagMetrics API key to enable live AI evaluation on every request.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3 py-3">
                          <div className="space-y-1.5">
                            <Label htmlFor="ragmetrics-key-connect" className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                              API Key
                            </Label>
                            <Input
                              id="ragmetrics-key-connect"
                              type="password"
                              placeholder="rm_live_..."
                              value={ragmetricsApiKey}
                              onChange={(e) => setRagmetricsApiKey(e.target.value)}
                              className="h-8 text-[11px] font-mono bg-secondary/30 border-border/30"
                            />
                            <p className="text-[10px] text-muted-foreground/60">
                              Find your key at{' '}
                              <a href="https://app.ragmetrics.ai/dashboard/keys" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">
                                app.ragmetrics.ai → Keys
                              </a>
                            </p>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            className="w-full text-xs h-8"
                            disabled={!ragmetricsApiKey || isSavingIntegrations}
                            onClick={async () => {
                              setIsSavingIntegrations(true);
                              try {
                                const response = await fetch(`/api/projects/${project.id}/settings`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ ragmetrics_enabled: true, ragmetrics_api_key: ragmetricsApiKey })
                                });
                                if (!response.ok) throw new Error();
                                setRagmetricsEnabled(true);
                                toast.success('RagMetrics connected successfully');
                                queryClient.invalidateQueries({ queryKey: ["providerSettings", project.id] });
                              } catch {
                                toast.error('Failed to connect RagMetrics');
                              } finally {
                                setIsSavingIntegrations(false);
                              }
                            }}
                          >
                            {isSavingIntegrations ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
                            {isSavingIntegrations ? 'Connecting...' : 'Save & Connect'}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>


              {/* Placeholder for future integrations */}
              <button
                onClick={() => setShowSuggestModal(true)}
                className="rounded-lg border border-dashed border-border/35 bg-muted/20 p-5 flex flex-col items-center justify-center text-center space-y-2 min-h-[240px] hover:bg-muted/40 hover:border-border/45 transition-all cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-lg bg-secondary/50 flex items-center justify-center group-hover:bg-secondary transition-colors">
                  <Plus className="w-5 h-5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">More integrations</p>
                  <p className="text-[9px] text-muted-foreground/60">Suggest a tool for the ecosystem</p>
                </div>
              </button>
            </div>
          </section>
        </TabsContent>

        {/* API TAB */}
        <TabsContent value="api" className={settingsTabClass}>
          <SettingsPageLabel
            title="API"
            description="Create and manage credentials used to access this project."
          />

          {/* Publishable Keys Section */}
          <section>
            <div>
              <h2 className="text-sm font-medium">Publishable keys</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Safe for browser use. Requires domain whitelisting for security.</p>
            </div>
            <div className="min-w-0 space-y-3">
              <div className="flex justify-end">
                <Button
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => {
                    setCreateKeyType('publishable');
                    setShowCreateKeyDialog(true);
                  }}
                >
                  New publishable key
                </Button>
              </div>
              <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/30">
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(160px,2fr)_auto] gap-4 border-b border-border/30 bg-muted/30 px-4 py-2">
                  <span className="text-[10px] font-medium uppercase text-muted-foreground">Name</span>
                  <span className="text-[10px] font-medium uppercase text-muted-foreground">API key</span>
                  <span className="sr-only text-[10px] font-medium uppercase text-muted-foreground">Actions</span>
                </div>
                {publishableKeys.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                    No publishable keys created yet.
                  </div>
                ) : (
                  <div className="divide-y divide-border/30">
                    {publishableKeys.map((k: ApiKeyData) => (
                      <div key={k.id} className="group grid grid-cols-[minmax(0,1fr)_minmax(160px,2fr)_auto] items-center gap-4 px-4 py-3">
                        <span className="truncate text-xs font-medium">{k.name}</span>
                        <div className="flex min-w-0 items-center gap-2">
                          <code className="truncate rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                            {k.key_prefix}••••••••
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                            onClick={() => handleCopyKey(k.key_prefix)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-32">
                            <DropdownMenuItem
                              className="cursor-pointer text-red-500 focus:bg-red-50 focus:text-red-500"
                              onSelect={() => setRevokeTarget({ id: k.id, name: k.name, prefix: k.key_prefix })}
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" />
                              Revoke key
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Secret Keys Section */}
          <section>
            <div>
              <h2 className="text-sm font-medium">Secret keys</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Server-side keys. Keep them private and never share with models.</p>
            </div>
            <div className="min-w-0 space-y-3">
              <div className="flex justify-end">
                <Button
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => {
                    setCreateKeyType('secret');
                    setShowCreateKeyDialog(true);
                  }}
                >
                  New secret key
                </Button>
              </div>
              <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/30">
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(160px,2fr)_auto] gap-4 border-b border-border/30 bg-muted/30 px-4 py-2">
                  <span className="text-[10px] font-medium uppercase text-muted-foreground">Name</span>
                  <span className="text-[10px] font-medium uppercase text-muted-foreground">API key</span>
                  <span className="sr-only text-[10px] font-medium uppercase text-muted-foreground">Actions</span>
                </div>
                {secretKeys.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                    No secret keys created yet.
                  </div>
                ) : (
                  <div className="divide-y divide-border/30">
                    {secretKeys.map((k: ApiKeyData) => (
                      <div key={k.id} className="group grid grid-cols-[minmax(0,1fr)_minmax(160px,2fr)_auto] items-center gap-4 px-4 py-3">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate text-xs font-medium">{k.name}</span>
                          <span className="text-[10px] text-muted-foreground">Created {formatRelativeDate(k.created_at)}</span>
                        </div>
                        <div className="flex min-w-0 items-center gap-2">
                          <code className="truncate rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                            {k.key_prefix}••••••••
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                            onClick={() => handleCopyKey(k.key_prefix)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-32">
                            <DropdownMenuItem
                              className="cursor-pointer text-red-500 focus:bg-red-50 focus:text-red-500"
                              onSelect={() => setRevokeTarget({ id: k.id, name: k.name, prefix: k.key_prefix })}
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" />
                              Revoke key
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </TabsContent>
      </Tabs>

      {/* Revoke Key Confirmation */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API key</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Are you sure you want to revoke <span className="font-medium text-foreground">{revokeTarget?.name}</span>?
              Applications using this key will immediately fail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600 focus:ring-red-500"
              onClick={(e) => { e.preventDefault(); confirmRevokeKey(); }}
              disabled={revoking}
            >
              {revoking ? "Revoking..." : "Revoke Key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Generate Key Dialog */}
      <GenerateKeyDialog
        open={showCreateKeyDialog}
        onOpenChange={setShowCreateKeyDialog}
        projectId={project.id}
        defaultKeyType={createKeyType}
        onKeyGenerated={() => refetchApiKeys()}
      />

      {/* Suggest Integration Dialog */}
      <Dialog open={showSuggestModal} onOpenChange={setShowSuggestModal}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-sm">Suggest an integration</DialogTitle>
            <DialogDescription className="text-xs">
              Tell us which tool you&apos;d like to see integrated with Cencori.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Tool name</Label>
              <Input
                placeholder="e.g. LangSmith, Weights & Biases"
                value={suggestion}
                onChange={(e) => setSuggestion(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              size="sm"
              className="w-full text-xs h-8"
              disabled={!suggestion.trim() || isSubmittingSuggestion}
              onClick={async () => {
                setIsSubmittingSuggestion(true);
                try {
                  // Send to feedback API if exists, or just log for now
                  await fetch('/api/feedback', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      type: 'integration_suggestion',
                      content: suggestion,
                      project_id: project?.id
                    })
                  }).catch(() => { /* fallback to success toast anyway */ });

                  toast.success("Thanks! We've received your suggestion.");
                  setSuggestion("");
                  setShowSuggestModal(false);
                } finally {
                  setIsSubmittingSuggestion(false);
                }
              }}
            >
              {isSubmittingSuggestion ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
              {isSubmittingSuggestion ? "Submitting..." : "Submit Suggestion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
