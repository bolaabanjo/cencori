"use client";

import React, { useState, use } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2, Users, Key, AlertTriangle, Copy, Check, Settings, Shield, Loader2, ExternalLink, Download, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useOrganizationProject } from "@/lib/contexts/OrganizationProjectContext";
import { Skeleton } from "@/components/ui/skeleton";

interface OrganizationData {
  id: string;
  name: string;
  slug: string;
  description?: string;
  plan_id: string;
  organization_plans: { name: string }[];
}

interface ProjectData {
  id: string;
  name: string;
  slug: string;
  status: "active" | "inactive";
  created_at: string;
}

// Hook to fetch org and projects with caching
function useOrgSettings(orgSlug: string) {
  return useQuery({
    queryKey: ["orgSettings", orgSlug],
    queryFn: async () => {
      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .select("id, name, slug, description, plan_id, organization_plans(name)")
        .eq("slug", orgSlug)
        .single();

      if (orgError || !orgData) throw new Error("Organization not found");

      const { data: projectsData } = await supabase
        .from("projects")
        .select("id, name, slug, status, created_at")
        .eq("organization_id", orgData.id);

      return {
        organization: orgData as OrganizationData,
        projects: (projectsData || []) as ProjectData[],
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

const AUDIT_EVENT_LABELS: Record<string, string> = {
  settings_updated: "Settings Updated",
  api_key_created: "API Key Created",
  api_key_deleted: "API Key Deleted",
  api_key_rotated: "API Key Rotated",
  webhook_created: "Webhook Created",
  webhook_deleted: "Webhook Deleted",
  incident_reviewed: "Incident Reviewed",
  ip_blocked: "IP Blocked",
  rate_limit_exceeded: "Rate Limit Exceeded",
  auth_failed: "Auth Failed",
  content_filter: "Content Blocked",
  intent_analysis: "Intent Blocked",
  jailbreak: "Jailbreak Attempt",
  prompt_injection: "Prompt Injection",
  output_leakage: "Output Leakage",
  pii_input: "PII Detected (Input)",
  pii_output: "PII Detected (Output)",
  data_rule_block: "Data Rule Blocked",
  data_rule_mask: "Data Masked",
  data_rule_redact: "Data Redacted",
  data_rule_tokenize: "Data Tokenized",
};

function AuditLogsTab({ orgSlug }: { orgSlug: string }) {
  const [timeRange, setTimeRange] = useState("7d");
  const [eventType, setEventType] = useState("all");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", orgSlug, timeRange, eventType, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        time_range: timeRange,
        event_type: eventType,
        page: String(page),
        per_page: "50",
      });
      const res = await fetch(`/api/organizations/${orgSlug}/audit-logs?${params}`);
      if (!res.ok) throw new Error("Failed to fetch audit logs");
      return res.json();
    },
  });

  const handleExport = async (format: "csv" | "json") => {
    setExporting(true);
    try {
      const params = new URLSearchParams({
        format,
        time_range: timeRange,
        event_type: eventType,
      });
      const res = await fetch(`/api/organizations/${orgSlug}/audit-logs?${params}`);
      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${orgSlug}-${timeRange}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Audit log exported as ${format.toUpperCase()}`);
    } catch {
      toast.error("Export failed");
    }
    setExporting(false);
  };

  const logs = data?.logs || [];
  const pagination = data?.pagination;

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between">
        <div className="space-y-0.5">
          <h2 className="text-sm font-medium">Audit Logs</h2>
          <p className="text-xs text-muted-foreground">
            Security events, admin actions, and incidents across all projects.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => handleExport("csv")}
            disabled={exporting}
          >
            {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => handleExport("json")}
            disabled={exporting}
          >
            {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            JSON
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <Select value={timeRange} onValueChange={(v) => { setTimeRange(v); setPage(1); }}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1h" className="text-xs">Last hour</SelectItem>
            <SelectItem value="24h" className="text-xs">Last 24h</SelectItem>
            <SelectItem value="7d" className="text-xs">Last 7 days</SelectItem>
            <SelectItem value="30d" className="text-xs">Last 30 days</SelectItem>
            <SelectItem value="90d" className="text-xs">Last 90 days</SelectItem>
            <SelectItem value="all" className="text-xs">All time</SelectItem>
          </SelectContent>
        </Select>

        <Select value={eventType} onValueChange={(v) => { setEventType(v); setPage(1); }}>
          <SelectTrigger className="w-48 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All events</SelectItem>
            <SelectItem value="settings_updated" className="text-xs">Settings Updated</SelectItem>
            <SelectItem value="api_key_created" className="text-xs">API Key Created</SelectItem>
            <SelectItem value="api_key_deleted" className="text-xs">API Key Deleted</SelectItem>
            <SelectItem value="api_key_rotated" className="text-xs">API Key Rotated</SelectItem>
            <SelectItem value="auth_failed" className="text-xs">Auth Failed</SelectItem>
            <SelectItem value="ip_blocked" className="text-xs">IP Blocked</SelectItem>
            <SelectItem value="rate_limit_exceeded" className="text-xs">Rate Limit Exceeded</SelectItem>
            <SelectItem value="jailbreak" className="text-xs">Jailbreak Attempt</SelectItem>
            <SelectItem value="prompt_injection" className="text-xs">Prompt Injection</SelectItem>
            <SelectItem value="pii_input" className="text-xs">PII Detected (Input)</SelectItem>
            <SelectItem value="pii_output" className="text-xs">PII Detected (Output)</SelectItem>
            <SelectItem value="content_filter" className="text-xs">Content Blocked</SelectItem>
          </SelectContent>
        </Select>

        {pagination && (
          <span className="text-[10px] text-muted-foreground ml-auto">
            {pagination.total} events
          </span>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center">
            <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 flex flex-col items-center">
            <div className="w-10 h-10 rounded-md bg-secondary flex items-center justify-center mb-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No audit events found</p>
            <p className="text-xs text-muted-foreground mt-0.5">Try adjusting your filters or time range.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b border-border/40">
                <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider h-8 px-4">Time</TableHead>
                <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider h-8">Event</TableHead>
                <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider h-8">Project</TableHead>
                <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider h-8">Actor</TableHead>
                <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider h-8">IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log: any) => (
                <TableRow key={log.id} className="border-b border-border/40 last:border-0 hover:bg-secondary/30">
                  <TableCell className="py-2 px-4 text-xs text-muted-foreground tabular-nums">
                    {new Date(log.created_at).toLocaleString(undefined, {
                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell className="py-2">
                    <Badge variant="outline" className="text-[10px] h-5">
                      {AUDIT_EVENT_LABELS[log.event_type] || log.event_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">
                    {log.project_name || "—"}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">
                    {log.actor_email || "System"}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground font-mono">
                    {log.actor_ip || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.total_pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">
            Page {pagination.page} of {pagination.total_pages}
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page >= pagination.total_pages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function SSOSettings({ orgSlug }: { orgSlug: string }) {
  const queryClient = useQueryClient();
  const [domain, setDomain] = useState("");
  const [metadataType, setMetadataType] = useState<"url" | "xml">("url");
  const [metadataUrl, setMetadataUrl] = useState("");
  const [metadataXml, setMetadataXml] = useState("");

  const { data: ssoConfig, isLoading } = useQuery({
    queryKey: ["sso", orgSlug],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${orgSlug}/sso`);
      if (!res.ok) throw new Error("Failed to fetch SSO config");
      return res.json();
    },
  });

  const configureMutation = useMutation({
    mutationFn: async () => {
      const body: any = { domain };
      if (metadataType === "url") body.metadata_url = metadataUrl;
      else body.metadata_xml = metadataXml;

      const res = await fetch(`/api/organizations/${orgSlug}/sso`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to configure SSO");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso", orgSlug] });
      toast.success("SSO configured successfully");
      setDomain("");
      setMetadataUrl("");
      setMetadataXml("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const enforceMutation = useMutation({
    mutationFn: async (enforce: boolean) => {
      const res = await fetch(`/api/organizations/${orgSlug}/sso`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sso_enforce: enforce }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso", orgSlug] });
      toast.success("SSO enforcement updated");
    },
    onError: () => toast.error("Failed to update enforcement"),
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/organizations/${orgSlug}/sso`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove SSO");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso", orgSlug] });
      toast.success("SSO removed");
    },
    onError: () => toast.error("Failed to remove SSO"),
  });

  if (isLoading) {
    return (
      <section className="space-y-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-[200px]" />
      </section>
    );
  }

  const isEnterprise = ["enterprise", "team"].includes(ssoConfig?.subscription_tier || "");
  const isConfigured = ssoConfig?.sso_enabled;

  // Not on a qualifying plan
  if (!isEnterprise) {
    return (
      <section className="space-y-3">
        <div className="space-y-0.5">
          <h2 className="text-sm font-medium">Single Sign-On (SSO)</h2>
          <p className="text-xs text-muted-foreground">Configure SAML SSO for your organization.</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
          <div className="text-center py-12 flex flex-col items-center px-4">
            <div className="w-10 h-10 rounded-md bg-secondary flex items-center justify-center mb-3">
              <Shield className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium mb-1">SSO requires Team or Enterprise plan</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Upgrade your organization to a Team or Enterprise plan to configure SAML-based single sign-on for your team.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // SSO is already configured
  if (isConfigured) {
    return (
      <section className="space-y-3">
        <div className="space-y-0.5">
          <h2 className="text-sm font-medium">Single Sign-On (SSO)</h2>
          <p className="text-xs text-muted-foreground">SAML SSO is active for your organization.</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
          {/* Status */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
            <div className="space-y-0.5">
              <p className="text-xs font-medium">Status</p>
              <p className="text-[10px] text-muted-foreground">SSO is active and accepting logins.</p>
            </div>
            <Badge variant="outline" className="text-[10px] h-5 gap-1 text-emerald-600 border-emerald-500/30">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Active
            </Badge>
          </div>
          {/* Domain */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
            <div className="space-y-0.5">
              <p className="text-xs font-medium">Domain</p>
              <p className="text-[10px] text-muted-foreground">Users with this email domain will be redirected to SSO.</p>
            </div>
            <span className="text-xs font-mono text-muted-foreground">{ssoConfig.sso_domain}</span>
          </div>
          {/* Configured */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
            <div className="space-y-0.5">
              <p className="text-xs font-medium">Configured</p>
              <p className="text-[10px] text-muted-foreground">When SSO was set up.</p>
            </div>
            <span className="text-xs text-muted-foreground">
              {ssoConfig.sso_configured_at ? new Date(ssoConfig.sso_configured_at).toLocaleDateString() : "—"}
            </span>
          </div>
          {/* Enforce SSO */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
            <div className="space-y-0.5">
              <p className="text-xs font-medium">Enforce SSO</p>
              <p className="text-[10px] text-muted-foreground">Require all members to log in via SSO. Disables password login.</p>
            </div>
            <Switch
              checked={ssoConfig.sso_enforce}
              onCheckedChange={(checked) => enforceMutation.mutate(checked)}
              disabled={enforceMutation.isPending}
            />
          </div>
          {/* Remove */}
          <div className="flex justify-between items-center px-4 py-2.5 bg-muted/20">
            <p className="text-[10px] text-muted-foreground">Remove SSO to allow password-based login again.</p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs text-red-500 hover:text-red-600 border-red-500/30 hover:border-red-500/50"
              onClick={() => removeMutation.mutate()}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending ? "Removing..." : "Remove SSO"}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  // SSO not configured — show setup form
  return (
    <section className="space-y-3">
      <div className="space-y-0.5">
        <h2 className="text-sm font-medium">Single Sign-On (SSO)</h2>
        <p className="text-xs text-muted-foreground">Configure SAML SSO to let your team log in with your identity provider.</p>
      </div>
      <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
        {/* Domain */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between px-4 py-3 border-b border-border/40 gap-2">
          <div className="space-y-0.5">
            <p className="text-xs font-medium">Email Domain</p>
            <p className="text-[10px] text-muted-foreground">Users with this domain will be redirected to your IdP.</p>
          </div>
          <Input
            value={domain}
            onChange={(e) => setDomain(e.target.value.toLowerCase())}
            placeholder="acme.com"
            className="w-full md:w-64 h-8 text-xs"
          />
        </div>
        {/* Metadata type */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between px-4 py-3 border-b border-border/40 gap-2">
          <div className="space-y-0.5">
            <p className="text-xs font-medium">SAML Metadata</p>
            <p className="text-[10px] text-muted-foreground">Provide your IdP metadata via URL or XML.</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={metadataType === "url" ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setMetadataType("url")}
            >
              URL
            </Button>
            <Button
              variant={metadataType === "xml" ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setMetadataType("xml")}
            >
              XML
            </Button>
          </div>
        </div>
        {/* Metadata input */}
        <div className="px-4 py-3 border-b border-border/40">
          {metadataType === "url" ? (
            <div className="space-y-1">
              <Label htmlFor="metadata-url" className="text-xs">Metadata URL</Label>
              <Input
                id="metadata-url"
                value={metadataUrl}
                onChange={(e) => setMetadataUrl(e.target.value)}
                placeholder="https://idp.acme.com/saml/metadata"
                className="h-8 text-xs font-mono"
              />
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="metadata-xml" className="text-xs">Metadata XML</Label>
              <Textarea
                id="metadata-xml"
                value={metadataXml}
                onChange={(e) => setMetadataXml(e.target.value)}
                placeholder="Paste your SAML metadata XML here..."
                className="text-xs font-mono min-h-[120px]"
              />
            </div>
          )}
        </div>
        {/* Submit */}
        <div className="flex justify-end px-4 py-2.5 bg-muted/20">
          <Button
            size="sm"
            className="h-7 text-xs gap-1.5"
            disabled={!domain || (!metadataUrl && !metadataXml) || configureMutation.isPending}
            onClick={() => configureMutation.mutate()}
          >
            {configureMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            {configureMutation.isPending ? "Configuring..." : "Configure SSO"}
          </Button>
        </div>
      </div>

      {/* Help text */}
      <div className="rounded-lg border border-border/40 bg-muted/20 px-4 py-3">
        <p className="text-xs font-medium mb-1.5">Setting up SAML SSO</p>
        <ol className="text-[10px] text-muted-foreground space-y-1 list-decimal list-inside">
          <li>In your identity provider (Okta, Azure AD, Google Workspace, etc.), create a new SAML application.</li>
          <li>Set the ACS URL to: <code className="font-mono bg-muted px-1 py-0.5 rounded">https://hxkbdauihjhgccfvwyvz.supabase.co/auth/v1/sso/saml/acs</code></li>
          <li>Set the Entity ID to: <code className="font-mono bg-muted px-1 py-0.5 rounded">https://hxkbdauihjhgccfvwyvz.supabase.co/auth/v1/sso/saml/metadata</code></li>
          <li>Copy the metadata URL or download the metadata XML from your IdP.</li>
          <li>Enter your email domain and metadata above, then click Configure SSO.</li>
        </ol>
      </div>
    </section>
  );
}

export default function OrganizationSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { updateOrganization: updateOrgContext, refetchData } = useOrganizationProject();

  // Local state
  const [isDeleteProjectDialogOpen, setIsDeleteProjectDialogOpen] = useState(false);
  const [isDeleteOrgDialogOpen, setIsDeleteOrgDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<ProjectData | null>(null);
  const [confirmDeleteText, setConfirmDeleteText] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgDescription, setOrgDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [slugCopied, setSlugCopied] = useState(false);

  // Fetch org with caching - INSTANT ON REVISIT!
  const { data, isLoading, error } = useOrgSettings(orgSlug);
  const organization = data?.organization;
  const projects = data?.projects || [];

  // Sync form state when org loads
  React.useEffect(() => {
    if (organization) {
      setOrgName(organization.name);
      setOrgDescription(organization.description || "");
    }
  }, [organization]);

  // Delete project mutation
  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await supabase.from("projects").delete().eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orgSettings", orgSlug] });
      toast.success("Project deleted");
      setIsDeleteProjectDialogOpen(false);
      setProjectToDelete(null);
    },
    onError: () => toast.error("Failed to delete project"),
  });

  // Delete org mutation
  const deleteOrgMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("organizations").delete().eq("id", organization!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate the organizations list cache
      refetchData();
      toast.success("Organization deleted");
      setIsDeleteOrgDialogOpen(false);
      setConfirmDeleteText("");
      router.push("/dashboard/organizations");
    },
    onError: () => toast.error("Failed to delete organization"),
  });

  const handleSaveOrganization = async () => {
    if (!organization) return;

    setIsSaving(true);
    const { error } = await supabase
      .from("organizations")
      .update({ name: orgName, description: orgDescription })
      .eq("id", organization.id);

    if (error) {
      toast.error("Failed to update organization");
    } else {
      toast.success("Organization updated");
      queryClient.invalidateQueries({ queryKey: ["orgSettings", orgSlug] });
      updateOrgContext(organization.id, { name: orgName, description: orgDescription });
    }
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <div className="w-full max-w-5xl mx-auto px-6 py-8">
        <Skeleton className="h-5 w-40 mb-6" />
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className="w-full max-w-5xl mx-auto px-6 py-8">
        <div className="text-center py-16 flex flex-col items-center">
          <div className="w-10 h-10 rounded-md bg-secondary flex items-center justify-center mb-3">
            <Settings className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Organization not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-base font-medium">Organization Settings</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Manage your organization</p>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          <TabsTrigger value="audit-logs">Audit Logs</TabsTrigger>
          <TabsTrigger value="sso">SSO</TabsTrigger>
          <TabsTrigger value="danger" className="text-red-500 data-[state=active]:text-red-500">Danger</TabsTrigger>
        </TabsList>

        {/* GENERAL TAB */}
        <TabsContent value="general" className="space-y-6">
          {/* Organization Information */}
          <section className="space-y-3">
            <div className="space-y-0.5">
              <h2 className="text-sm font-medium">Organization Information</h2>
              <p className="text-xs md:text-[10px] text-muted-foreground">Update your organization&apos;s name and description</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
              {/* Name */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between px-4 py-3 border-b border-border/40 gap-2 md:gap-0">
                <div className="space-y-0.5">
                  <p className="text-sm md:text-xs font-medium">Name</p>
                  <p className="text-xs md:text-[10px] text-muted-foreground">Displayed throughout the dashboard.</p>
                </div>
                <Input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Organization name"
                  className="w-full md:w-64 h-10 md:h-8 text-sm md:text-xs"
                />
              </div>
              {/* Slug */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between px-4 py-3 border-b border-border/40 gap-2 md:gap-0">
                <div className="space-y-0.5">
                  <p className="text-sm md:text-xs font-medium">Slug</p>
                  <p className="text-xs md:text-[10px] text-muted-foreground">Cannot be changed after creation.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1.5 md:py-1 bg-muted/50 rounded-md font-mono text-sm md:text-xs text-muted-foreground">
                    {organization.slug}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 md:h-7 text-xs gap-1.5"
                    onClick={() => {
                      navigator.clipboard.writeText(organization.slug);
                      setSlugCopied(true);
                      toast.success("Slug copied");
                      setTimeout(() => setSlugCopied(false), 2000);
                    }}
                  >
                    {slugCopied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    Copy
                  </Button>
                </div>
              </div>
              {/* Description */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between px-4 py-3 border-b border-border/40 gap-2 md:gap-0">
                <div className="space-y-0.5">
                  <p className="text-sm md:text-xs font-medium">Description</p>
                  <p className="text-xs md:text-[10px] text-muted-foreground">A brief description of your organization.</p>
                </div>
                <Input
                  value={orgDescription}
                  onChange={(e) => setOrgDescription(e.target.value)}
                  placeholder="Organization description"
                  className="w-full md:w-64 h-10 md:h-8 text-sm md:text-xs"
                />
              </div>
              {/* Plan */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between px-4 py-3 border-b border-border/40 gap-2 md:gap-0">
                <div className="space-y-0.5">
                  <p className="text-sm md:text-xs font-medium">Plan</p>
                  <p className="text-xs md:text-[10px] text-muted-foreground">Your current subscription tier.</p>
                </div>
                <Badge variant="outline" className="text-xs md:text-[10px] h-7 md:h-5 w-fit">
                  {organization.organization_plans?.[0]?.name
                    ? organization.organization_plans[0].name.charAt(0).toUpperCase() +
                    organization.organization_plans[0].name.slice(1)
                    : "Free"}
                </Badge>
              </div>
              {/* Save Button Row */}
              <div className="flex justify-end px-4 py-2.5 md:py-2 bg-muted/20">
                <Button size="sm" className="h-9 md:h-7 px-4 md:px-3 text-sm md:text-xs" onClick={handleSaveOrganization} disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </div>
          </section>
        </TabsContent>

        {/* PROJECTS TAB */}
        <TabsContent value="projects">
          <div className="rounded-md border border-border/40 bg-card overflow-hidden">
            <div className="p-4 border-b border-border/40">
              <h3 className="text-xs font-medium mb-0.5">Projects</h3>
              <p className="text-[10px] text-muted-foreground">Manage projects in this organization</p>
            </div>
            {projects.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b border-border/40">
                    <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider h-8 px-4">Name</TableHead>
                    <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider h-8">Slug</TableHead>
                    <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider h-8">Status</TableHead>
                    <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider h-8">Created</TableHead>
                    <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider h-8 text-right pr-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((project) => (
                    <TableRow key={project.id} className="border-b border-border/40 last:border-0 hover:bg-secondary/30">
                      <TableCell className="py-2.5 px-4 text-xs font-medium">{project.name}</TableCell>
                      <TableCell className="py-2.5 text-xs text-muted-foreground font-mono">{project.slug}</TableCell>
                      <TableCell className="py-2.5">
                        <Badge variant="outline" className="text-[10px] h-5 gap-1">
                          <span className={`size-1.5 rounded-full ${project.status === "active" ? "bg-emerald-500" : "bg-red-500"}`} />
                          {project.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2.5 text-xs text-muted-foreground">
                        {new Date(project.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="py-2.5 text-right pr-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                          onClick={() => {
                            setProjectToDelete(project);
                            setIsDeleteProjectDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-xs">No projects found</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* MEMBERS TAB */}
        <TabsContent value="members" className="space-y-6">
          <section className="space-y-3">
            <div className="space-y-0.5">
              <h2 className="text-sm font-medium">Team Members</h2>
              <p className="text-xs md:text-[10px] text-muted-foreground">Invite and manage team members.</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
              <div className="text-center py-12 md:py-10 flex flex-col items-center px-4">
                <div className="w-12 h-12 md:w-10 md:h-10 rounded-md bg-secondary flex items-center justify-center mb-3">
                  <Users className="h-6 w-6 md:h-5 md:w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium mb-1">Team Management Coming Soon</p>
                <p className="text-xs text-muted-foreground">
                  Invite team members and assign roles
                </p>
              </div>
            </div>
          </section>
        </TabsContent>

        {/* API KEYS TAB */}
        <TabsContent value="api-keys" className="space-y-6">
          <section className="space-y-3">
            <div className="space-y-0.5">
              <h2 className="text-sm font-medium">API Keys</h2>
              <p className="text-xs md:text-[10px] text-muted-foreground">Generate and manage organization-level API keys.</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
              <div className="text-center py-12 md:py-10 flex flex-col items-center px-4">
                <div className="w-12 h-12 md:w-10 md:h-10 rounded-md bg-secondary flex items-center justify-center mb-3">
                  <Key className="h-6 w-6 md:h-5 md:w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium mb-1">API Key Management Coming Soon</p>
                <p className="text-xs text-muted-foreground">
                  Generate and manage API keys
                </p>
              </div>
            </div>
          </section>
        </TabsContent>

        {/* AUDIT LOGS TAB */}
        <TabsContent value="audit-logs" className="space-y-6">
          <AuditLogsTab orgSlug={orgSlug} />
        </TabsContent>

        {/* SSO TAB */}
        <TabsContent value="sso" className="space-y-6">
          <SSOSettings orgSlug={orgSlug} />
        </TabsContent>

        {/* DANGER ZONE TAB */}
        <TabsContent value="danger" className="space-y-6">
          <section className="space-y-3">
            <div className="space-y-0.5">
              <h2 className="text-sm font-medium">Delete Organization</h2>
              <p className="text-xs md:text-[10px] text-muted-foreground">Permanently remove your organization and its data.</p>
            </div>
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 overflow-hidden">
              <div className="px-4 py-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="h-5 w-5 md:h-4 md:w-4 text-red-500 mt-0.5 shrink-0" />
                  <div className="space-y-2.5 md:space-y-2 flex-1">
                    <div className="space-y-0.5">
                      <p className="text-sm md:text-xs font-medium">Deleting this organization will remove all data.</p>
                      <p className="text-xs md:text-[10px] text-muted-foreground">
                        This includes all projects, API keys, logs, and analytics. This action cannot be undone.
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full md:w-auto h-10 md:h-7 text-sm md:text-xs gap-1.5"
                      onClick={() => {
                        setConfirmDeleteText("");
                        setIsDeleteOrgDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4 md:h-3 md:w-3" />
                      Delete Organization
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </TabsContent>
      </Tabs>

      {/* Delete Project Dialog */}
      <Dialog open={isDeleteProjectDialogOpen} onOpenChange={setIsDeleteProjectDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-sm">Delete Project</DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to delete &quot;{projectToDelete?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              className="h-7 text-xs"
              onClick={() => projectToDelete && deleteProjectMutation.mutate(projectToDelete.id)}
              disabled={deleteProjectMutation.isPending}
            >
              {deleteProjectMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Organization Dialog */}
      <AlertDialog open={isDeleteOrgDialogOpen} onOpenChange={(open) => {
        setIsDeleteOrgDialogOpen(open);
        if (!open) setConfirmDeleteText("");
      }}>
        <AlertDialogContent className="sm:max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Delete Organization</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              This will permanently delete the organization and all projects.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-3">
            <Label htmlFor="confirm-delete" className="text-xs">
              Type <span className="font-mono font-medium">{organization.name}</span> to confirm
            </Label>
            <Input
              id="confirm-delete"
              value={confirmDeleteText}
              onChange={(e) => setConfirmDeleteText(e.target.value)}
              placeholder="Organization name"
              disabled={deleteOrgMutation.isPending}
              className="h-8 text-xs"
            />
          </div>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={deleteOrgMutation.isPending} className="h-7 text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteOrgMutation.mutate()}
              disabled={confirmDeleteText !== organization.name || deleteOrgMutation.isPending}
              className="h-7 text-xs bg-red-600 hover:bg-red-700"
            >
              {deleteOrgMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
