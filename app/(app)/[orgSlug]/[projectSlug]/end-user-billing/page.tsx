"use client";

import { use, useState, useEffect, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
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
import {
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  ShieldBan,
  ShieldCheck,
  MoreHorizontal,
  Loader2,
  Layers,
  Pencil,
  Trash2,
  Users,
  Shield,
  Zap,
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Banknote,
  ExternalLink,
} from "lucide-react";
import { Bar, BarChart, XAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { formatCurrency as globalFormatCurrency } from "@/lib/currency";

// ─── Types ───────────────────────────────────────────────────────────

interface BillingConfig {
  end_user_billing_enabled: boolean;
  customer_markup_percentage: number;
  billing_cycle: "daily" | "weekly" | "monthly";
  default_rate_plan_id: string | null;
}

interface DailyBreakdown {
  date: string;
  requests: number;
  tokens: number;
  cost: number;
  revenue: number;
}

interface TopUser {
  end_user_id: string;
  requests: number;
  tokens: number;
  provider_cost_usd: number;
  customer_revenue_usd: number;
}

interface BillingStats {
  period: string;
  total_end_users: number;
  active_end_users: number;
  total_requests: number;
  total_tokens: number;
  provider_cost_usd: number;
  customer_revenue_usd: number;
  margin_usd: number;
  margin_percentage: number;
  top_users: TopUser[];
  daily_breakdown: DailyBreakdown[];
}

interface EndUser {
  id: string;
  external_id: string;
  display_name: string | null;
  rate_plan_id: string | null;
  rate_plan_name: string | null;
  status: "active" | "blocked";
  metadata: Record<string, unknown> | null;
  requests_30d: number;
  tokens_30d: number;
  cost_30d: number;
  last_seen_at: string | null;
  created_at: string;
}

interface EndUserStats {
  total_end_users: number;
  active_end_users: number;
  total_tokens: number;
  customer_revenue_usd: number;
}

interface Pagination {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

interface DailyUsage {
  date: string;
  requests: number;
  tokens: number;
  cost: number;
}

interface RatePlan {
  id: string;
  name: string;
  slug: string;
  is_default: boolean;
  daily_token_limit: number | null;
  monthly_token_limit: number | null;
  daily_request_limit: number | null;
  monthly_request_limit: number | null;
  requests_per_minute: number | null;
  daily_cost_limit_usd: number | null;
  monthly_cost_limit_usd: number | null;
  markup_percentage: number | null;
  platform_commission_percentage: number | null;
  flat_rate_per_request: number | null;
  currency: string;
  allowed_models: string[] | null;
  overage_action: "block" | "alert_only";
  end_user_count: number;
  created_at: string;
}

interface RatePlanForm {
  name: string;
  slug: string;
  is_default: boolean;
  daily_token_limit: string;
  monthly_token_limit: string;
  daily_request_limit: string;
  monthly_request_limit: string;
  requests_per_minute: string;
  daily_cost_limit_usd: string;
  monthly_cost_limit_usd: string;
  markup_percentage: string;
  platform_commission_percentage: string;
  flat_rate_per_request: string;
  currency: string;
  allowed_models: string;
  overage_action: "block" | "alert_only";
}

interface Invoice {
  id: string;
  end_user_id: string;
  end_user_external_id: string | null;
  end_user_name: string | null;
  end_user_email: string | null;
  stripe_invoice_id: string | null;
  period_start: string;
  period_end: string;
  total_requests: number;
  total_tokens: number;
  subtotal_usd: number;
  markup_usd: number;
  total_usd: number;
  status: "draft" | "sent" | "paid" | "void" | "overdue";
  sent_at: string | null;
  paid_at: string | null;
  created_at: string;
}

interface PageProps {
  params: Promise<{ orgSlug: string; projectSlug: string }>;
}

type Tab = "configuration" | "end_users" | "rate_plans" | "revenue";

// ─── Helpers ─────────────────────────────────────────────────────────

function fmt(n: number): string {
  return (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function fmtNum(n: number | undefined | null): string {
  return (n ?? 0).toLocaleString("en-US");
}

function fmtPct(n: number): string {
  return `${(n ?? 0).toFixed(1)}%`;
}

function formatTokens(n: number | undefined | null): string {
  const v = n ?? 0;
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

function formatCurrency(n: number | undefined | null): string {
  return `$${(n ?? 0).toFixed(2)}`;
}

function formatRelativeTime(date: string | null): string {
  if (!date) return "Never";
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatRatePlanNum(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return n.toLocaleString();
}

function formatUSD(n: number | null | undefined, currency: string = 'USD'): string {
  if (n == null) return "—";
  return globalFormatCurrency(n, currency);
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const emptyForm: RatePlanForm = {
  name: "", slug: "", is_default: false,
  daily_token_limit: "", monthly_token_limit: "",
  daily_request_limit: "", monthly_request_limit: "", requests_per_minute: "",
  daily_cost_limit_usd: "", monthly_cost_limit_usd: "",
  markup_percentage: "", 
  platform_commission_percentage: "20",
  flat_rate_per_request: "",
  currency: "USD",
  allowed_models: "", overage_action: "block",
};

function planToForm(plan: RatePlan): RatePlanForm {
  return {
    name: plan.name, slug: plan.slug, is_default: plan.is_default,
    daily_token_limit: plan.daily_token_limit?.toString() ?? "",
    monthly_token_limit: plan.monthly_token_limit?.toString() ?? "",
    daily_request_limit: plan.daily_request_limit?.toString() ?? "",
    monthly_request_limit: plan.monthly_request_limit?.toString() ?? "",
    requests_per_minute: plan.requests_per_minute?.toString() ?? "",
    daily_cost_limit_usd: plan.daily_cost_limit_usd?.toString() ?? "",
    monthly_cost_limit_usd: plan.monthly_cost_limit_usd?.toString() ?? "",
    markup_percentage: plan.markup_percentage?.toString() ?? "",
    platform_commission_percentage: plan.platform_commission_percentage?.toString() ?? "20",
    flat_rate_per_request: plan.flat_rate_per_request?.toString() ?? "",
    currency: plan.currency || "USD",
    allowed_models: plan.allowed_models?.join(", ") ?? "",
    overage_action: plan.overage_action,
  };
}

function formToPayload(form: RatePlanForm) {
  const parseNum = (v: string) => (v.trim() === "" ? null : Number(v));
  return {
    name: form.name, slug: form.slug, is_default: form.is_default,
    daily_token_limit: parseNum(form.daily_token_limit),
    monthly_token_limit: parseNum(form.monthly_token_limit),
    daily_request_limit: parseNum(form.daily_request_limit),
    monthly_request_limit: parseNum(form.monthly_request_limit),
    requests_per_minute: parseNum(form.requests_per_minute),
    daily_cost_limit_usd: parseNum(form.daily_cost_limit_usd),
    monthly_cost_limit_usd: parseNum(form.monthly_cost_limit_usd),
    markup_percentage: parseNum(form.markup_percentage),
    platform_commission_percentage: parseNum(form.platform_commission_percentage),
    flat_rate_per_request: parseNum(form.flat_rate_per_request),
    currency: form.currency,
    allowed_models: form.allowed_models.trim()
      ? form.allowed_models.split(",").map(s => s.trim()).filter(Boolean)
      : null,
    overage_action: form.overage_action,
  };
}

const OVERAGE_LABELS: Record<string, string> = { block: "Block", alert_only: "Alert Only" };
const OVERAGE_COLORS: Record<string, string> = {
  block: "bg-red-500/10 text-red-500",
  alert_only: "bg-blue-500/10 text-blue-500",
};

// ─── Hook: resolve projectId from slugs ──────────────────────────────

function useProjectId(orgSlug: string, projectSlug: string) {
  return useQuery({
    queryKey: ["projectId", orgSlug, projectSlug],
    queryFn: async () => {
      const { data: org } = await supabase.from("organizations").select("id").eq("slug", orgSlug).single();
      if (!org) throw new Error("Organization not found");
      const { data: project } = await supabase.from("projects").select("id").eq("slug", projectSlug).eq("organization_id", org.id).single();
      if (!project) throw new Error("Project not found");
      return project.id as string;
    },
    staleTime: 60 * 1000,
  });
}

// ─── Main Page ───────────────────────────────────────────────────────

export default function UsageBillingPage({ params }: PageProps) {
  const { orgSlug, projectSlug } = use(params);
  const queryClient = useQueryClient();
  const { data: projectId, isLoading: projectLoading } = useProjectId(orgSlug, projectSlug);

  const [tab, setTab] = useState<Tab>("configuration");

  // ── Configuration state ──
  const [enabled, setEnabled] = useState(false);
  const [markupPct, setMarkupPct] = useState("20");
  const [billingCycle, setBillingCycle] = useState<"daily" | "weekly" | "monthly">("monthly");
  const [ratePlan, setRatePlan] = useState("");
  const [configDirty, setConfigDirty] = useState(false);

  // ── Revenue state ──
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");

  // ── End Users state ──
  const [euSearch, setEuSearch] = useState("");
  const [euSearchInput, setEuSearchInput] = useState("");
  const [euRatePlanFilter, setEuRatePlanFilter] = useState("all");
  const [euStatusFilter, setEuStatusFilter] = useState("all");
  const [euPage, setEuPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // ── Rate Plans state ──
  const [rpDialogOpen, setRpDialogOpen] = useState(false);
  const [rpEditingPlan, setRpEditingPlan] = useState<RatePlan | null>(null);
  const [rpForm, setRpForm] = useState<RatePlanForm>(emptyForm);
  const [rpNameManual, setRpNameManual] = useState(false);
  const [rpDeleteTarget, setRpDeleteTarget] = useState<RatePlan | null>(null);

  // ── Invoices state ──
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [invoiceSendStripe, setInvoiceSendStripe] = useState(false);

  // ─── Queries ───

  const { data: config, isLoading: configLoading } = useQuery<BillingConfig>({
    queryKey: ["endUserBillingConfig", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/end-user-billing`);
      if (!res.ok) throw new Error("Failed to fetch billing config");
      return res.json();
    },
    enabled: !!projectId,
    staleTime: 30 * 1000,
  });

  // Stripe Connect status
  const { data: stripeConnect, isLoading: stripeLoading } = useQuery<{
    connected: boolean;
    status?: "pending" | "active" | "restricted" | "disabled";
    charges_enabled?: boolean;
    payouts_enabled?: boolean;
    onboarding_completed?: boolean;
    stripe_account_id?: string;
  }>({
    queryKey: ["stripeConnect", orgSlug],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${orgSlug}/stripe-connect`);
      if (!res.ok) throw new Error("Failed to fetch Stripe status");
      return res.json();
    },
    enabled: tab === "configuration",
    staleTime: 60 * 1000,
  });

  const { data: ratePlansData } = useQuery({
    queryKey: ["rate-plans", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/rate-plans`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!projectId,
    staleTime: 60 * 1000,
  });

  const ratePlans: RatePlan[] = ratePlansData?.rate_plans ?? ratePlansData?.ratePlans ?? (Array.isArray(ratePlansData) ? ratePlansData : []);
  const ratePlansList: { id: string; name: string }[] = ratePlans;

  const { data: stats, isLoading: statsLoading } = useQuery<BillingStats>({
    queryKey: ["endUserBillingStats", projectId, period],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/end-user-billing/stats?period=${period}`);
      if (!res.ok) throw new Error("Failed to fetch billing stats");
      return res.json();
    },
    enabled: !!projectId && enabled && tab === "revenue",
    staleTime: 30 * 1000,
  });

  const { data: euStats } = useQuery<EndUserStats>({
    queryKey: ["endUserStats", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/end-user-billing/stats?period=30d`);
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    enabled: !!projectId && tab === "end_users",
  });

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ["endUsers", projectId, euSearch, euRatePlanFilter, euStatusFilter, euPage],
    queryFn: async () => {
      const p = new URLSearchParams({ page: String(euPage), per_page: "50" });
      if (euSearch) p.set("search", euSearch);
      if (euRatePlanFilter !== "all") p.set("rate_plan_id", euRatePlanFilter);
      if (euStatusFilter !== "all") p.set("status", euStatusFilter);
      const res = await fetch(`/api/projects/${projectId}/end-users?${p}`);
      if (!res.ok) throw new Error("Failed to fetch end users");
      return res.json() as Promise<{ users: EndUser[]; pagination: Pagination }>;
    },
    enabled: !!projectId && tab === "end_users",
  });

  const { data: dailyUsage } = useQuery<DailyUsage[]>({
    queryKey: ["endUserDailyUsage", projectId, expandedRow],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/end-users/${expandedRow}/usage?period=7d`);
      if (!res.ok) throw new Error("Failed to fetch usage");
      return res.json();
    },
    enabled: !!projectId && !!expandedRow && tab === "end_users",
  });

  // ─── Sync config to form ───

  useEffect(() => {
    if (config) {
      setEnabled(config.end_user_billing_enabled ?? false);
      setMarkupPct(String(config.customer_markup_percentage ?? 20));
      setBillingCycle(config.billing_cycle || "monthly");
      setRatePlan(config.default_rate_plan_id || "");
      setConfigDirty(false);
    }
  }, [config]);

  // ─── Mutations ───

  const stripeConnectMutation = useMutation({
    mutationFn: async () => {
      const returnUrl = `${window.location.origin}/${orgSlug}/${projectSlug}/end-user-billing`;
      const res = await fetch(`/api/organizations/${orgSlug}/stripe-connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ return_url: returnUrl, refresh_url: returnUrl }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to connect Stripe"); }
      return res.json() as Promise<{ stripe_account_id: string; onboarding_url: string }>;
    },
    onSuccess: (data) => {
      window.location.href = data.onboarding_url;
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/end-user-billing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          end_user_billing_enabled: enabled,
          customer_markup_percentage: parseFloat(markupPct) || 20,
          billing_cycle: billingCycle,
          default_rate_plan_id: ratePlan || null,
        }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to save"); }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Billing configuration saved");
      setConfigDirty(false);
      queryClient.invalidateQueries({ queryKey: ["endUserBillingConfig", projectId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ userId, newStatus }: { userId: string; newStatus: "active" | "blocked" }) => {
      const res = await fetch(`/api/projects/${projectId}/end-users/${userId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["endUsers", projectId] });
      queryClient.invalidateQueries({ queryKey: ["endUserStats", projectId] });
      toast.success("User status updated");
    },
    onError: () => toast.error("Failed to update user status"),
  });

  const assignPlanMutation = useMutation({
    mutationFn: async ({ userId, ratePlanId }: { userId: string; ratePlanId: string | null }) => {
      const res = await fetch(`/api/projects/${projectId}/end-users/${userId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate_plan_id: ratePlanId }),
      });
      if (!res.ok) throw new Error("Failed to assign plan");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["endUsers", projectId] });
      toast.success("Rate plan updated");
    },
    onError: () => toast.error("Failed to assign rate plan"),
  });

  const rpCreateMutation = useMutation({
    mutationFn: async (data: ReturnType<typeof formToPayload>) => {
      const res = await fetch(`/api/projects/${projectId}/rate-plans`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to create"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate-plans", projectId] });
      closeRpDialog();
      toast.success("Rate plan created");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rpUpdateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ReturnType<typeof formToPayload> }) => {
      const res = await fetch(`/api/projects/${projectId}/rate-plans/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to update"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate-plans", projectId] });
      closeRpDialog();
      toast.success("Rate plan updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rpDeleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/projects/${projectId}/rate-plans/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate-plans", projectId] });
      setRpDeleteTarget(null);
      toast.success("Rate plan deleted");
    },
    onError: () => toast.error("Failed to delete rate plan"),
  });

  // ─── Rate Plan dialog helpers ───

  function closeRpDialog() {
    setRpDialogOpen(false);
    setRpEditingPlan(null);
    setRpForm(emptyForm);
    setRpNameManual(false);
  }

  function openRpCreate() {
    setRpEditingPlan(null);
    setRpForm(emptyForm);
    setRpNameManual(false);
    setRpDialogOpen(true);
  }

  function openRpEdit(plan: RatePlan) {
    setRpEditingPlan(plan);
    setRpForm(planToForm(plan));
    setRpNameManual(true);
    setRpDialogOpen(true);
  }

  function handleRpNameChange(name: string) {
    setRpForm(prev => ({ ...prev, name, slug: rpNameManual ? prev.slug : slugify(name) }));
  }

  function handleRpSubmit() {
    const payload = formToPayload(rpForm);
    if (rpEditingPlan) rpUpdateMutation.mutate({ id: rpEditingPlan.id, data: payload });
    else rpCreateMutation.mutate(payload);
  }

  // ─── Invoices ───

  const { data: invoicesData, isLoading: invoicesLoading } = useQuery<{
    invoices: Invoice[];
    pagination: Pagination;
  }>({
    queryKey: ["invoices", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/end-user-billing/invoices?per_page=50`);
      if (!res.ok) throw new Error("Failed to fetch invoices");
      return res.json();
    },
    enabled: !!projectId && enabled && tab === "revenue",
    staleTime: 30 * 1000,
  });

  const generateInvoicesMutation = useMutation({
    mutationFn: async (params: { period_start: string; period_end: string; send_via_stripe: boolean }) => {
      const res = await fetch(`/api/projects/${projectId}/end-user-billing/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to generate invoices" }));
        throw new Error(err.error);
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(`Generated ${data.generated} invoice(s)${data.skipped > 0 ? `, ${data.skipped} skipped` : ""}${data.errors > 0 ? `, ${data.errors} failed` : ""}`);
      queryClient.invalidateQueries({ queryKey: ["invoices", projectId] });
      setInvoiceDialogOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleGenerateInvoices() {
    // Calculate period based on current billing cycle
    const now = new Date();
    const periodEnd = now.toISOString().split("T")[0];
    let periodStart: string;
    if (billingCycle === "daily") {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      periodStart = d.toISOString().split("T")[0];
    } else if (billingCycle === "weekly") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      periodStart = d.toISOString().split("T")[0];
    } else {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      periodStart = d.toISOString().split("T")[0];
    }
    generateInvoicesMutation.mutate({
      period_start: periodStart,
      period_end: periodEnd,
      send_via_stripe: invoiceSendStripe,
    });
  }

  // ─── End Users helpers ───

  const users = usersData?.users || [];
  const pagination = usersData?.pagination;
  const euIsLoading = projectLoading || usersLoading;

  const handleEuSearch = () => { setEuSearch(euSearchInput); setEuPage(1); };

  const rpIsSaving = rpCreateMutation.isPending || rpUpdateMutation.isPending;

  // ─── Loading skeleton ───

  if (projectLoading || configLoading) {
    return (
      <div className="w-full max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-64 mt-1.5" />
        </div>
        <div className="flex items-center gap-1 mb-6 border-b border-border/30">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-20" />
        </div>
        <div className="rounded-xl border border-border/40 bg-card pt-5 px-5 pb-5">
          <Skeleton className="h-8 w-full mb-4" />
          <Skeleton className="h-8 w-full mb-4" />
          <Skeleton className="h-8 w-1/3" />
        </div>
      </div>
    );
  }

  // ─── Tab labels ───

  const tabs: { key: Tab; label: string }[] = [
    { key: "configuration", label: "Configuration" },
    { key: "end_users", label: "End Users" },
    { key: "rate_plans", label: "Rate Plans" },
    { key: "revenue", label: "Revenue" },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-base font-medium">End-User Billing</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Meter, limit, and bill your end-users for AI consumption.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab === "revenue" && enabled && (
            <Select value={period} onValueChange={(v: "7d" | "30d" | "90d") => setPeriod(v)}>
              <SelectTrigger className="w-[100px] h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d" className="text-xs">7 Days</SelectItem>
                <SelectItem value="30d" className="text-xs">30 Days</SelectItem>
                <SelectItem value="90d" className="text-xs">90 Days</SelectItem>
              </SelectContent>
            </Select>
          )}
          {tab === "end_users" && (
            <div className="flex gap-1">
              <Input
                placeholder="Search by ID or name..."
                value={euSearchInput}
                onChange={(e) => setEuSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleEuSearch()}
                className="w-[200px] h-7 text-xs"
              />
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={handleEuSearch}>
                <Search className="h-3 w-3" />
              </Button>
            </div>
          )}
          {tab === "rate_plans" && (
            <Button size="sm" className="h-7 text-xs" onClick={openRpCreate}>
              Create Plan
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-border/30">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px",
              tab === t.key
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════ Configuration Tab ═══════════════════════ */}
      {tab === "configuration" && (
        <>
        <div className="rounded-xl border border-border/40 bg-card pt-5 px-5 pb-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <Label htmlFor="billing-enabled" className="text-xs font-medium">Enable End-User Billing</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">Track costs per end-user and apply markup for revenue.</p>
            </div>
            <Switch id="billing-enabled" checked={enabled} onCheckedChange={(v) => { setEnabled(v); setConfigDirty(true); }} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <div className="space-y-1.5">
              <Label htmlFor="markup-pct" className="text-xs">Default Markup %</Label>
              <Input id="markup-pct" type="number" min={0} max={500} step={1} value={markupPct}
                onChange={(e) => { setMarkupPct(e.target.value); setConfigDirty(true); }}
                placeholder="20" className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Billing Cycle</Label>
              <Select value={billingCycle} onValueChange={(v: "daily" | "weekly" | "monthly") => { setBillingCycle(v); setConfigDirty(true); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily" className="text-xs">Daily</SelectItem>
                  <SelectItem value="weekly" className="text-xs">Weekly</SelectItem>
                  <SelectItem value="monthly" className="text-xs">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Default Rate Plan</Label>
              <Select value={ratePlan} onValueChange={(v) => { setRatePlan(v); setConfigDirty(true); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select plan" /></SelectTrigger>
                <SelectContent>
                  {ratePlansList.length === 0 && (
                    <SelectItem value="none" disabled className="text-xs">No plans configured</SelectItem>
                  )}
                  {ratePlansList.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button size="sm" className="h-7 text-xs" disabled={!configDirty || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? "Saving..." : "Save Configuration"}
            </Button>
          </div>
        </div>

        {/* Stripe Connect */}
        <div className="rounded-xl border border-border/40 bg-card pt-5 px-5 pb-5 mt-4">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium">Stripe Connect</span>
          </div>
          <p className="text-[11px] text-muted-foreground mb-4">
            Connect your Stripe account to automatically invoice end-users for their AI usage.
          </p>

          {stripeLoading ? (
            <div className="h-16 bg-secondary rounded-lg animate-pulse" />
          ) : !stripeConnect?.connected ? (
            // Not connected
            <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-[#635bff]/10 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                    <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.918 3.757 7.11c0 4.46 2.72 5.592 5.514 6.759 2.828 1.18 3.28 1.584 3.28 2.544 0 .951-.747 1.49-2.142 1.49-1.852 0-4.741-.936-6.628-2.187l-.894 5.572C4.45 22.41 7.326 24 11.342 24c2.627 0 4.768-.693 6.223-1.948 1.612-1.38 2.435-3.35 2.435-5.847 0-4.544-2.785-5.673-6.024-7.055z" fill="#635bff"/>
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-medium">No Stripe account connected</p>
                  <p className="text-[11px] text-muted-foreground">Connect to start billing end-users directly</p>
                </div>
              </div>
              <Button size="sm" className="h-7 text-xs gap-1.5" onClick={() => stripeConnectMutation.mutate()}
                disabled={stripeConnectMutation.isPending}>
                {stripeConnectMutation.isPending ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Connecting...</>
                ) : (
                  <><ExternalLink className="h-3 w-3" /> Connect Stripe</>
                )}
              </Button>
            </div>
          ) : stripeConnect.status === "active" && stripeConnect.charges_enabled ? (
            // Fully active
            <div className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                </div>
                <div>
                  <p className="text-xs font-medium">Stripe Connected</p>
                  <p className="text-[11px] text-muted-foreground">
                    Charges {stripeConnect.charges_enabled ? "enabled" : "disabled"} · Payouts {stripeConnect.payouts_enabled ? "enabled" : "disabled"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="h-5 text-[10px] bg-emerald-500/10 text-emerald-500">Active</Badge>
                <span className="text-[10px] text-muted-foreground font-mono">{stripeConnect.stripe_account_id}</span>
              </div>
            </div>
          ) : (
            // Pending / restricted / needs attention
            <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-xs font-medium">
                    {stripeConnect.status === "pending" ? "Onboarding incomplete" :
                     stripeConnect.status === "restricted" ? "Account restricted" :
                     "Account needs attention"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {stripeConnect.onboarding_completed
                      ? "Your account has restrictions that need to be resolved"
                      : "Complete Stripe onboarding to start accepting payments"}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => stripeConnectMutation.mutate()}
                disabled={stripeConnectMutation.isPending}>
                {stripeConnectMutation.isPending ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Loading...</>
                ) : (
                  <><ExternalLink className="h-3 w-3" /> Complete Setup</>
                )}
              </Button>
            </div>
          )}
        </div>
        </>
      )}

      {/* ═══════════════════════ End Users Tab ═══════════════════════ */}
      {tab === "end_users" && (
        <>
          {/* Stats */}
          <div className="rounded-md border border-border/40 bg-card overflow-hidden mb-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-border/30">
              {[
                { label: "Total Users", value: euStats ? fmtNum(euStats.total_end_users) : "0" },
                { label: "Active Today", value: euStats ? fmtNum(euStats.active_end_users) : "0" },
                { label: "Total Tokens (30d)", value: euStats ? formatTokens(euStats.total_tokens) : "0" },
                { label: "Revenue (30d)", value: euStats ? formatCurrency(euStats.customer_revenue_usd) : "$0.00" },
              ].map((stat) => (
                <div key={stat.label} className="px-5 py-4">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{stat.label}</span>
                  {!euStats && !!projectId ? (
                    <div className="h-6 w-16 bg-secondary rounded animate-pulse mt-1" />
                  ) : (
                    <p className="text-xl font-semibold font-mono tracking-tight mt-1">{stat.value}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Filter Row */}
          <div className="flex items-center gap-2 mb-4">
            {ratePlansList.length > 0 && (
              <Select value={euRatePlanFilter} onValueChange={(v) => { setEuRatePlanFilter(v); setEuPage(1); }}>
                <SelectTrigger className="w-[140px] h-7 text-xs"><SelectValue placeholder="All plans" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All plans</SelectItem>
                  {ratePlansList.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={euStatusFilter} onValueChange={(v) => { setEuStatusFilter(v); setEuPage(1); }}>
              <SelectTrigger className="w-[110px] h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All status</SelectItem>
                <SelectItem value="active" className="text-xs">Active</SelectItem>
                <SelectItem value="blocked" className="text-xs">Blocked</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-border/40 bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] w-[140px]">External ID</TableHead>
                  <TableHead className="text-[11px] w-[130px]">Name</TableHead>
                  <TableHead className="text-[11px] w-[90px]">Plan</TableHead>
                  <TableHead className="text-[11px] w-[80px] text-right">Requests</TableHead>
                  <TableHead className="text-[11px] w-[80px] text-right">Tokens</TableHead>
                  <TableHead className="text-[11px] w-[70px] text-right">Cost</TableHead>
                  <TableHead className="text-[11px] w-[80px]">Last Seen</TableHead>
                  <TableHead className="text-[11px] w-[70px]">Status</TableHead>
                  <TableHead className="text-[11px] w-[36px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {euIsLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={9}><div className="h-4 bg-secondary animate-pulse rounded" /></TableCell>
                    </TableRow>
                  ))
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-16">
                      <p className="text-xs text-muted-foreground">No end users found</p>
                      <p className="text-[11px] text-muted-foreground mt-1">End users will appear here as they make requests through your API.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <Fragment key={user.id}>
                      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => setExpandedRow(expandedRow === user.id ? null : user.id)}>
                        <TableCell className="text-xs font-mono truncate max-w-[140px]">{user.external_id}</TableCell>
                        <TableCell className="text-xs truncate max-w-[130px]">
                          {user.display_name || <span className="text-muted-foreground">--</span>}
                        </TableCell>
                        <TableCell>
                          {user.rate_plan_name ? (
                            <Badge variant="secondary" className="h-5 text-[10px] font-medium bg-blue-500/10 text-blue-500">{user.rate_plan_name}</Badge>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">None</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{fmtNum(user.requests_30d)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{formatTokens(user.tokens_30d)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{formatCurrency(user.cost_30d)}</TableCell>
                        <TableCell className="text-[11px] text-muted-foreground">{formatRelativeTime(user.last_seen_at)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={`h-5 text-[10px] font-medium ${user.status === "active" ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
                            {user.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {user.status === "active" ? (
                                <DropdownMenuItem className="text-xs text-red-500" onClick={(e) => { e.stopPropagation(); toggleStatusMutation.mutate({ userId: user.id, newStatus: "blocked" }); }}>
                                  <ShieldBan className="h-3.5 w-3.5 mr-2" /> Block user
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem className="text-xs text-emerald-500" onClick={(e) => { e.stopPropagation(); toggleStatusMutation.mutate({ userId: user.id, newStatus: "active" }); }}>
                                  <ShieldCheck className="h-3.5 w-3.5 mr-2" /> Unblock user
                                </DropdownMenuItem>
                              )}
                              {ratePlansList.length > 0 && (
                                <>
                                  <DropdownMenuItem className="text-xs" onClick={(e) => { e.stopPropagation(); assignPlanMutation.mutate({ userId: user.id, ratePlanId: null }); }}>
                                    Remove plan
                                  </DropdownMenuItem>
                                  {ratePlansList.map((plan) => (
                                    <DropdownMenuItem key={plan.id} className="text-xs" onClick={(e) => { e.stopPropagation(); assignPlanMutation.mutate({ userId: user.id, ratePlanId: plan.id }); }}>
                                      Assign: {plan.name}
                                    </DropdownMenuItem>
                                  ))}
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>

                      {expandedRow === user.id && (
                        <TableRow key={`${user.id}-detail`}>
                          <TableCell colSpan={9} className="bg-muted/20 p-0">
                            <div className="px-5 py-4 space-y-4">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-medium">Quick actions:</span>
                                {user.status === "active" ? (
                                  <Button variant="outline" className="h-7 text-xs text-red-500 border-red-500/20"
                                    onClick={() => toggleStatusMutation.mutate({ userId: user.id, newStatus: "blocked" })}>
                                    <ShieldBan className="h-3 w-3 mr-1" /> Block
                                  </Button>
                                ) : (
                                  <Button variant="outline" className="h-7 text-xs text-emerald-500 border-emerald-500/20"
                                    onClick={() => toggleStatusMutation.mutate({ userId: user.id, newStatus: "active" })}>
                                    <ShieldCheck className="h-3 w-3 mr-1" /> Unblock
                                  </Button>
                                )}
                                {ratePlansList.length > 0 && (
                                  <Select value={user.rate_plan_id || "none"}
                                    onValueChange={(v) => assignPlanMutation.mutate({ userId: user.id, ratePlanId: v === "none" ? null : v })}>
                                    <SelectTrigger className="w-[130px] h-7 text-xs"><SelectValue placeholder="Assign plan" /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none" className="text-xs">No plan</SelectItem>
                                      {ratePlansList.map((plan) => (
                                        <SelectItem key={plan.id} value={plan.id} className="text-xs">{plan.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              </div>
                              <div>
                                <span className="text-[11px] text-muted-foreground">Daily usage (last 7 days)</span>
                                {dailyUsage ? (
                                  <div className="mt-1.5 rounded-lg border border-border/40 overflow-hidden">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead className="text-[10px] h-7">Date</TableHead>
                                          <TableHead className="text-[10px] h-7 text-right">Requests</TableHead>
                                          <TableHead className="text-[10px] h-7 text-right">Tokens</TableHead>
                                          <TableHead className="text-[10px] h-7 text-right">Cost</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {dailyUsage.map((day) => (
                                          <TableRow key={day.date}>
                                            <TableCell className="text-[11px] font-mono py-1.5">{day.date}</TableCell>
                                            <TableCell className="text-[11px] text-right tabular-nums py-1.5">{fmtNum(day.requests)}</TableCell>
                                            <TableCell className="text-[11px] text-right tabular-nums py-1.5">{formatTokens(day.tokens)}</TableCell>
                                            <TableCell className="text-[11px] text-right tabular-nums py-1.5">{formatCurrency(day.cost)}</TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                ) : (
                                  <div className="mt-1.5 h-16 bg-secondary animate-pulse rounded-lg" />
                                )}
                              </div>
                              {user.metadata && Object.keys(user.metadata).length > 0 && (
                                <div>
                                  <span className="text-[11px] text-muted-foreground">Metadata</span>
                                  <pre className="mt-1.5 text-[11px] font-mono bg-background border border-border/40 rounded-lg p-3 overflow-x-auto max-h-[200px]">
                                    {JSON.stringify(user.metadata, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {pagination && pagination.total_pages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-[11px] text-muted-foreground">{fmtNum(pagination.total)} end users</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="h-7 w-7 p-0" disabled={euPage <= 1} onClick={() => setEuPage(euPage - 1)}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="text-[11px] text-muted-foreground tabular-nums">Page {euPage} of {pagination.total_pages}</span>
                <Button variant="outline" className="h-7 w-7 p-0" disabled={euPage >= pagination.total_pages} onClick={() => setEuPage(euPage + 1)}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════ Rate Plans Tab ═══════════════════════ */}
      {tab === "rate_plans" && (
        <>
          {Array.isArray(ratePlans) && ratePlans.length === 0 ? (
            <div className="text-center py-16 rounded-xl border border-border/40 bg-card">
              <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center mx-auto mb-4">
                <Layers className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium mb-1">No rate plans yet</p>
              <p className="text-xs text-muted-foreground max-w-[300px] mx-auto">Create a rate plan to define usage limits and pricing tiers for your end-users</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(Array.isArray(ratePlans) ? ratePlans : []).map((plan) => (
                <div key={plan.id} className="rounded-xl border border-border/40 bg-card p-6 flex flex-col transition-all hover:border-border/80 group">
                  <div className="flex items-start justify-between mb-6">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold tracking-tight">{plan.name}</p>
                      <p className="text-[11px] text-muted-foreground font-mono mt-1 opacity-60 uppercase tracking-widest leading-none">{plan.slug}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {plan.is_default && (
                        <Badge variant="secondary" className="h-5 text-[9px] px-2 font-black uppercase tracking-tighter bg-emerald-500/10 text-emerald-500 border-emerald-500/20 rounded-full">
                          Default
                        </Badge>
                      )}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-secondary rounded-full" onClick={() => openRpEdit(plan)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500/70 hover:text-red-500 hover:bg-red-500/10 rounded-full" onClick={() => setRpDeleteTarget(plan)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6 flex-1">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                      {/* Tokens */}
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em]">Tokens</p>
                        <div className="text-xs font-medium space-y-0.5">
                          <p>{plan.daily_token_limit ? `${formatRatePlanNum(plan.daily_token_limit)}/day` : "Unlimited"}</p>
                          {plan.monthly_token_limit && <p className="text-[10px] text-muted-foreground font-normal">{formatRatePlanNum(plan.monthly_token_limit)}/mo</p>}
                        </div>
                      </div>

                      {/* Requests */}
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em]">Requests</p>
                        <div className="text-xs font-medium space-y-0.5">
                          <p>{plan.daily_request_limit ? `${formatRatePlanNum(plan.daily_request_limit)}/day` : "Unlimited"}</p>
                          {plan.requests_per_minute && <p className="text-[10px] text-muted-foreground font-normal">{plan.requests_per_minute} req/min</p>}
                        </div>
                      </div>

                      {/* Cost Limits */}
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em]">Spend Limit</p>
                        <div className="text-xs font-medium space-y-0.5">
                          <p>{plan.daily_cost_limit_usd ? `${formatUSD(plan.daily_cost_limit_usd, plan.currency)}/day` : "None"}</p>
                          {plan.monthly_cost_limit_usd && <p className="text-[10px] text-muted-foreground font-normal">{formatUSD(plan.monthly_cost_limit_usd, plan.currency)}/mo</p>}
                        </div>
                      </div>

                      {/* Pricing/Markup */}
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em]">Profit Share</p>
                        <div className="text-xs font-medium space-y-0.5">
                          <p>{plan.markup_percentage ? `${plan.markup_percentage}% Markup` : "At cost"}</p>
                          <p className="text-[10px] text-muted-foreground font-normal">{plan.platform_commission_percentage}% Cencori Commission</p>
                          {plan.flat_rate_per_request && <p className="text-[10px] text-muted-foreground font-normal">+{formatUSD(plan.flat_rate_per_request, plan.currency)}/req</p>}
                        </div>
                      </div>
                    </div>

                    {plan.allowed_models && plan.allowed_models.length > 0 && (
                      <div className="pt-5 border-t border-border/10">
                        <p className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-[0.15em] mb-2.5">Restricted Models</p>
                        <div className="flex flex-wrap gap-1.5">
                          {plan.allowed_models.map((model) => (
                            <span key={model} className="px-2 py-0.5 text-[9px] font-mono border border-border/20 rounded-md bg-muted/30 text-muted-foreground">{model}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-6 pt-5 border-t border-border/10">
                    <div className="text-[10px] font-medium text-muted-foreground">
                      <span className="text-foreground font-semibold">{plan.end_user_count ?? 0}</span> assigned users
                    </div>
                    <Badge variant="outline" className={cn(
                      "text-[9px] px-2 py-0 font-black uppercase tracking-tighter border-0 rounded-full",
                      OVERAGE_COLORS[plan.overage_action] || "bg-secondary text-secondary-foreground"
                    )}>
                      {OVERAGE_LABELS[plan.overage_action] || plan.overage_action}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Create / Edit Dialog */}
          <Dialog open={rpDialogOpen} onOpenChange={(open) => { if (!open) closeRpDialog(); else setRpDialogOpen(true); }}>
            <DialogContent className="sm:max-w-[540px] max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-base">{rpEditingPlan ? "Edit Rate Plan" : "Create Rate Plan"}</DialogTitle>
                <DialogDescription className="text-xs">
                  {rpEditingPlan ? "Update the limits and pricing for this rate plan" : "Define usage limits and pricing for a new tier"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="plan-name" className="text-xs">Name</Label>
                    <Input id="plan-name" placeholder="Free Tier" className="h-8 text-xs" value={rpForm.name}
                      onChange={(e) => handleRpNameChange(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="plan-slug" className="text-xs">Slug</Label>
                    <Input id="plan-slug" placeholder="free-tier" className="h-8 text-xs font-mono" value={rpForm.slug}
                      onChange={(e) => { setRpNameManual(true); setRpForm(prev => ({ ...prev, slug: e.target.value })); }} />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs">Default Plan</Label>
                    <p className="text-[10px] text-muted-foreground">Assign to new end-users automatically</p>
                  </div>
                  <Switch checked={rpForm.is_default} onCheckedChange={(checked) => setRpForm(prev => ({ ...prev, is_default: checked }))} />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Currency</Label>
                  <Select value={rpForm.currency} onValueChange={(v) => setRpForm(prev => ({ ...prev, currency: v }))}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD" className="text-xs">USD ($)</SelectItem>
                      <SelectItem value="EUR" className="text-xs">EUR (€)</SelectItem>
                      <SelectItem value="GBP" className="text-xs">GBP (£)</SelectItem>
                      <SelectItem value="NGN" className="text-xs">NGN (₦)</SelectItem>
                      <SelectItem value="KES" className="text-xs">KES (KSh)</SelectItem>
                      <SelectItem value="ZAR" className="text-xs">ZAR (R)</SelectItem>
                      <SelectItem value="GHS" className="text-xs">GHS (₵)</SelectItem>
                      <SelectItem value="BRL" className="text-xs">BRL (R$)</SelectItem>
                      <SelectItem value="INR" className="text-xs">INR (₹)</SelectItem>
                      <SelectItem value="SGD" className="text-xs">SGD (S$)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Token Limits</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="daily-tokens" className="text-[10px] text-muted-foreground">Daily</Label>
                      <Input id="daily-tokens" type="number" placeholder="e.g. 100000" className="h-8 text-xs" value={rpForm.daily_token_limit}
                        onChange={(e) => setRpForm(prev => ({ ...prev, daily_token_limit: e.target.value }))} />
                      {rpForm.daily_token_limit && <p className="text-[10px] text-muted-foreground">{formatRatePlanNum(Number(rpForm.daily_token_limit))} tokens</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="monthly-tokens" className="text-[10px] text-muted-foreground">Monthly</Label>
                      <Input id="monthly-tokens" type="number" placeholder="e.g. 1000000" className="h-8 text-xs" value={rpForm.monthly_token_limit}
                        onChange={(e) => setRpForm(prev => ({ ...prev, monthly_token_limit: e.target.value }))} />
                      {rpForm.monthly_token_limit && <p className="text-[10px] text-muted-foreground">{formatRatePlanNum(Number(rpForm.monthly_token_limit))} tokens</p>}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Request Limits</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="daily-requests" className="text-[10px] text-muted-foreground">Daily</Label>
                      <Input id="daily-requests" type="number" placeholder="e.g. 1000" className="h-8 text-xs" value={rpForm.daily_request_limit}
                        onChange={(e) => setRpForm(prev => ({ ...prev, daily_request_limit: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="monthly-requests" className="text-[10px] text-muted-foreground">Monthly</Label>
                      <Input id="monthly-requests" type="number" placeholder="e.g. 10000" className="h-8 text-xs" value={rpForm.monthly_request_limit}
                        onChange={(e) => setRpForm(prev => ({ ...prev, monthly_request_limit: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="rpm" className="text-[10px] text-muted-foreground">Per Minute</Label>
                      <Input id="rpm" type="number" placeholder="e.g. 60" className="h-8 text-xs" value={rpForm.requests_per_minute}
                        onChange={(e) => setRpForm(prev => ({ ...prev, requests_per_minute: e.target.value }))} />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Cost Limits ({rpForm.currency})</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="daily-cost" className="text-[10px] text-muted-foreground">Daily</Label>
                      <Input id="daily-cost" type="number" step="0.01" placeholder="e.g. 5.00" className="h-8 text-xs" value={rpForm.daily_cost_limit_usd}
                        onChange={(e) => setRpForm(prev => ({ ...prev, daily_cost_limit_usd: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="monthly-cost" className="text-[10px] text-muted-foreground">Monthly</Label>
                      <Input id="monthly-cost" type="number" step="0.01" placeholder="e.g. 50.00" className="h-8 text-xs" value={rpForm.monthly_cost_limit_usd}
                        onChange={(e) => setRpForm(prev => ({ ...prev, monthly_cost_limit_usd: e.target.value }))} />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Pricing & Commission</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="rp-markup-pct" className="text-[10px] text-muted-foreground">Markup %</Label>
                      <Input id="rp-markup-pct" type="number" step="0.1" placeholder="e.g. 20" className="h-8 text-xs" value={rpForm.markup_percentage}
                        onChange={(e) => setRpForm(prev => ({ ...prev, markup_percentage: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="rp-commission-pct" className="text-[10px] text-muted-foreground">Commission %</Label>
                      <Input id="rp-commission-pct" type="number" step="0.1" placeholder="e.g. 20" className="h-8 text-xs" value={rpForm.platform_commission_percentage}
                        onChange={(e) => setRpForm(prev => ({ ...prev, platform_commission_percentage: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="flat-rate" className="text-[10px] text-muted-foreground">Flat Rate / Request ({rpForm.currency})</Label>
                      <Input id="flat-rate" type="number" step="0.001" placeholder="e.g. 0.002" className="h-8 text-xs" value={rpForm.flat_rate_per_request}
                        onChange={(e) => setRpForm(prev => ({ ...prev, flat_rate_per_request: e.target.value }))} />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="allowed-models" className="text-xs">Allowed Models</Label>
                  <Input id="allowed-models" placeholder="gpt-4o, claude-3-opus, gemini-pro" className="h-8 text-xs font-mono" value={rpForm.allowed_models}
                    onChange={(e) => setRpForm(prev => ({ ...prev, allowed_models: e.target.value }))} />
                  <p className="text-[10px] text-muted-foreground">Comma-separated. Leave empty to allow all models.</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Overage Action</Label>
                  <Select value={rpForm.overage_action} onValueChange={(v) => setRpForm(prev => ({ ...prev, overage_action: v as RatePlanForm["overage_action"] }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="block" className="text-xs">Block — reject requests over limit</SelectItem>
                      <SelectItem value="alert_only" className="text-xs">Alert Only — allow but notify</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={closeRpDialog}>Cancel</Button>
                <Button size="sm" className="h-7 text-xs" onClick={handleRpSubmit} disabled={rpIsSaving || !rpForm.name.trim() || !rpForm.slug.trim()}>
                  {rpIsSaving ? (
                    <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />{rpEditingPlan ? "Saving..." : "Creating..."}</>
                  ) : (
                    rpEditingPlan ? "Save changes" : "Create plan"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete Confirmation */}
          <AlertDialog open={!!rpDeleteTarget} onOpenChange={(open) => { if (!open) setRpDeleteTarget(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-base">Delete rate plan</AlertDialogTitle>
                <AlertDialogDescription className="text-xs">
                  Are you sure you want to delete <span className="font-medium text-foreground">{rpDeleteTarget?.name}</span>?
                  {(rpDeleteTarget?.end_user_count ?? 0) > 0 && (
                    <span className="block mt-1 text-amber-500">
                      This plan has {rpDeleteTarget?.end_user_count} end-user{(rpDeleteTarget?.end_user_count ?? 0) !== 1 ? "s" : ""} assigned.
                    </span>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="h-7 text-xs">Cancel</AlertDialogCancel>
                <AlertDialogAction className="h-7 text-xs bg-red-500 hover:bg-red-600"
                  onClick={() => rpDeleteTarget && rpDeleteMutation.mutate(rpDeleteTarget.id)} disabled={rpDeleteMutation.isPending}>
                  {rpDeleteMutation.isPending ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />Deleting...</> : "Delete plan"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}

      {/* ═══════════════════════ Revenue Tab ═══════════════════════ */}
      {tab === "revenue" && (
        <>
          {!enabled ? (
            <div className="rounded-xl border border-border/40 bg-card pt-5 px-5 pb-5">
              <p className="text-xs text-muted-foreground text-center py-8">Enable billing in the Configuration tab to view revenue data.</p>
            </div>
          ) : (
            <>
              {/* Summary Stats */}
              {statsLoading ? (
                <div className="rounded-md border border-border/40 bg-card overflow-hidden mb-6">
                  <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-border/30">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="px-5 py-4">
                        <Skeleton className="h-3 w-20 mb-2.5" />
                        <Skeleton className="h-6 w-16" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-border/40 bg-card overflow-hidden mb-6">
                  <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-border/30">
                    {[
                      { label: "Provider Cost", value: fmt(stats?.provider_cost_usd ?? 0) },
                      { label: "Revenue", value: fmt(stats?.customer_revenue_usd ?? 0) },
                      { label: "Margin", value: fmt(stats?.margin_usd ?? 0) },
                      { label: "Margin %", value: fmtPct(stats?.margin_percentage ?? 0) },
                    ].map((stat) => (
                      <div key={stat.label} className="px-5 py-4">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{stat.label}</span>
                        <p className="text-xl font-semibold font-mono tracking-tight mt-1">{stat.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Daily Revenue Chart */}
              <div className="rounded-xl border border-border/40 bg-card pt-5 px-5 pb-2 mb-6">
                <div className="mb-2"><span className="text-sm font-medium">Daily Revenue</span></div>
                <p className="text-xs text-muted-foreground mb-3">Revenue vs cost breakdown</p>
                {statsLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : !stats?.daily_breakdown?.length ? (
                  <p className="text-xs text-muted-foreground py-8 text-center">No billing data for this period.</p>
                ) : (
                  <div className="h-48">
                    <ChartContainer
                      config={{
                        revenue: { label: "Revenue", color: "hsl(142 76% 36%)" },
                        cost: { label: "Cost", color: "hsl(24 80% 50%)" },
                      }}
                      className="h-full w-full"
                    >
                      <BarChart data={stats.daily_breakdown} margin={{ left: 0, right: 0, top: 0, bottom: 20 }}>
                        <XAxis dataKey="date" tickLine={false} axisLine={false}
                          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickMargin={8} interval="preserveStartEnd" />
                        <ChartTooltip cursor={{ fill: "hsl(var(--muted)/0.3)" }}
                          content={<ChartTooltipContent formatter={(value) => fmt(Number(value))} />} />
                        <Bar dataKey="cost" stackId="billing" fill="var(--color-cost)" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="revenue" stackId="billing" fill="var(--color-revenue)" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ChartContainer>
                  </div>
                )}
              </div>

              {/* Top End Users */}
              <div className="rounded-xl border border-border/40 bg-card pt-5 px-5 pb-2 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-medium">Top End Users</h3>
                    <p className="text-xs text-muted-foreground">Highest revenue contributors</p>
                  </div>
                </div>
                {statsLoading ? (
                  <div className="space-y-2 pb-3">
                    {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                  </div>
                ) : !stats?.top_users?.length ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">No end-user activity for this period.</p>
                ) : (
                  <div className="overflow-auto -mx-5">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/40">
                          <th className="text-left font-medium text-muted-foreground px-5 pb-2">User ID</th>
                          <th className="text-right font-medium text-muted-foreground pb-2">Requests</th>
                          <th className="text-right font-medium text-muted-foreground pb-2">Tokens</th>
                          <th className="text-right font-medium text-muted-foreground pb-2">Cost</th>
                          <th className="text-right font-medium text-muted-foreground pb-2">Revenue</th>
                          <th className="text-right font-medium text-muted-foreground pb-2 pr-5">Margin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.top_users.map((u) => (
                          <tr key={u.end_user_id} className="border-b border-border/20 last:border-0">
                            <td className="px-5 py-2 font-mono text-[11px]">{u.end_user_id}</td>
                            <td className="text-right py-2">{fmtNum(u.requests)}</td>
                            <td className="text-right py-2">{fmtNum(u.tokens)}</td>
                            <td className="text-right py-2">{fmt(u.provider_cost_usd)}</td>
                            <td className="text-right py-2">{fmt(u.customer_revenue_usd)}</td>
                            <td className="text-right py-2 pr-5 font-medium">{fmt(u.customer_revenue_usd - u.provider_cost_usd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Invoices */}
              <div className="rounded-xl border border-border/40 bg-card pt-5 px-5 pb-4 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-medium">Invoices</h3>
                    <p className="text-xs text-muted-foreground">Generate and manage end-user invoices</p>
                  </div>
                  <Button size="sm" className="h-7 text-xs gap-1.5" onClick={() => setInvoiceDialogOpen(true)}>
                    Generate Invoices
                  </Button>
                </div>
                {invoicesLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
                  </div>
                ) : !invoicesData?.invoices?.length ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">No invoices yet. Generate invoices for a billing period to get started.</p>
                ) : (
                  <div className="overflow-auto -mx-5">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/40">
                          <th className="text-left font-medium text-muted-foreground px-5 pb-2">End User</th>
                          <th className="text-left font-medium text-muted-foreground pb-2">Period</th>
                          <th className="text-right font-medium text-muted-foreground pb-2">Requests</th>
                          <th className="text-right font-medium text-muted-foreground pb-2">Total</th>
                          <th className="text-center font-medium text-muted-foreground pb-2">Status</th>
                          <th className="text-right font-medium text-muted-foreground pb-2 pr-5">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoicesData.invoices.map((inv) => (
                          <tr key={inv.id} className="border-b border-border/20 last:border-0">
                            <td className="px-5 py-2">
                              <p className="font-medium">{inv.end_user_name || inv.end_user_external_id || "—"}</p>
                              {inv.end_user_email && <p className="text-muted-foreground">{inv.end_user_email}</p>}
                            </td>
                            <td className="py-2 text-muted-foreground">{inv.period_start} — {inv.period_end}</td>
                            <td className="text-right py-2">{fmtNum(inv.total_requests)}</td>
                            <td className="text-right py-2 font-medium">{fmt(parseFloat(String(inv.total_usd)))}</td>
                            <td className="text-center py-2">
                              <Badge variant="outline" className={cn("text-[10px]",
                                inv.status === "paid" && "bg-green-500/10 text-green-500 border-green-500/20",
                                inv.status === "sent" && "bg-blue-500/10 text-blue-500 border-blue-500/20",
                                inv.status === "draft" && "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
                                inv.status === "overdue" && "bg-red-500/10 text-red-500 border-red-500/20",
                                inv.status === "void" && "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
                              )}>
                                {inv.status}
                              </Badge>
                            </td>
                            <td className="text-right py-2 pr-5 text-muted-foreground">
                              {new Date(inv.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Generate Invoices Dialog */}
              <Dialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Generate Invoices</DialogTitle>
                    <DialogDescription>
                      Generate invoices for all end-users with usage in the current billing period.
                      Users with no usage or existing invoices for this period will be skipped.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="rounded-lg border border-border/40 p-3">
                      <p className="text-xs text-muted-foreground mb-1">Billing cycle</p>
                      <p className="text-sm font-medium capitalize">{billingCycle}</p>
                    </div>
                    {stripeConnect?.connected && stripeConnect.status === "active" && (
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm">Send via Stripe</Label>
                          <p className="text-xs text-muted-foreground">Create and finalize Stripe invoices for end-users with email addresses</p>
                        </div>
                        <Switch checked={invoiceSendStripe} onCheckedChange={setInvoiceSendStripe} />
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" size="sm" onClick={() => setInvoiceDialogOpen(false)}>Cancel</Button>
                    <Button size="sm" onClick={handleGenerateInvoices} disabled={generateInvoicesMutation.isPending}>
                      {generateInvoicesMutation.isPending ? (
                        <><Loader2 className="h-3 w-3 animate-spin mr-1.5" /> Generating...</>
                      ) : (
                        "Generate"
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Export */}
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" asChild>
                  <a href={`/api/projects/${projectId}/end-user-billing/export?format=csv&period=${period}`} download>
                    <Download className="h-3 w-3" /> Export CSV
                  </a>
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" asChild>
                  <a href={`/api/projects/${projectId}/end-user-billing/export?format=json&period=${period}`} download>
                    <Download className="h-3 w-3" /> Export JSON
                  </a>
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
