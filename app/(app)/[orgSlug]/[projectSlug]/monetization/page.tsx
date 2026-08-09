"use client";

import { use, useState, useEffect, Fragment } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";
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
  CheckCircle2,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { formatCurrency as globalFormatCurrency } from "@/lib/currency";
import { useProjectIdBySlug } from "@/lib/hooks/useQueries";

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
  total_customers: number;
  active_customers: number;
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
  total_requests: number;
  total_tokens: number;
  customer_revenue_usd: number;
  daily_breakdown: DailyBreakdown[];
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

// Demo fixtures stay entirely in the browser. They never pass through an API
// route and are only used when the page is opened with `?demo=1`.
const DEMO_BILLING_CONFIG: BillingConfig = {
  end_user_billing_enabled: true,
  customer_markup_percentage: 68,
  billing_cycle: "monthly",
  default_rate_plan_id: "demo-growth",
};

const DEMO_RATE_PLANS: RatePlan[] = [
  {
    id: "demo-starter", name: "Starter", slug: "starter", is_default: false,
    daily_token_limit: 250_000, monthly_token_limit: 5_000_000,
    daily_request_limit: 500, monthly_request_limit: 10_000, requests_per_minute: 30,
    daily_cost_limit_usd: 15, monthly_cost_limit_usd: 250,
    markup_percentage: 55, platform_commission_percentage: 20,
    flat_rate_per_request: 0.004, currency: "USD",
    allowed_models: ["gpt-5-mini", "claude-haiku-4-5"], overage_action: "block",
    end_user_count: 128, created_at: "2026-05-12T10:00:00.000Z",
  },
  {
    id: "demo-growth", name: "Growth", slug: "growth", is_default: true,
    daily_token_limit: 2_000_000, monthly_token_limit: 45_000_000,
    daily_request_limit: 3_000, monthly_request_limit: 75_000, requests_per_minute: 120,
    daily_cost_limit_usd: 90, monthly_cost_limit_usd: 1_800,
    markup_percentage: 68, platform_commission_percentage: 15,
    flat_rate_per_request: 0.002, currency: "USD",
    allowed_models: ["gpt-5", "claude-sonnet-4-5", "gemini-2.5-pro"], overage_action: "alert_only",
    end_user_count: 64, created_at: "2026-05-18T10:00:00.000Z",
  },
  {
    id: "demo-scale", name: "Scale", slug: "scale", is_default: false,
    daily_token_limit: null, monthly_token_limit: 300_000_000,
    daily_request_limit: null, monthly_request_limit: 500_000, requests_per_minute: 600,
    daily_cost_limit_usd: null, monthly_cost_limit_usd: 12_000,
    markup_percentage: 42, platform_commission_percentage: 10,
    flat_rate_per_request: null, currency: "USD",
    allowed_models: null, overage_action: "alert_only",
    end_user_count: 18, created_at: "2026-06-02T10:00:00.000Z",
  },
];

const DEMO_USERS: EndUser[] = [
  { id: "demo-user-1", external_id: "usr_northstar", display_name: "Northstar Labs", rate_plan_id: "demo-scale", rate_plan_name: "Scale", status: "active", metadata: { segment: "enterprise" }, requests_30d: 5_842, tokens_30d: 118_420_500, cost_30d: 858.55, last_seen_at: new Date(Date.now() - 8 * 60_000).toISOString(), created_at: "2026-05-08T09:15:00.000Z" },
  { id: "demo-user-2", external_id: "usr_kinetic", display_name: "Kinetic AI", rate_plan_id: "demo-growth", rate_plan_name: "Growth", status: "active", metadata: { segment: "startup" }, requests_30d: 4_291, tokens_30d: 82_930_100, cost_30d: 601.24, last_seen_at: new Date(Date.now() - 31 * 60_000).toISOString(), created_at: "2026-05-21T11:40:00.000Z" },
  { id: "demo-user-3", external_id: "usr_helio", display_name: "Helio Health", rate_plan_id: "demo-growth", rate_plan_name: "Growth", status: "active", metadata: { segment: "growth" }, requests_30d: 3_766, tokens_30d: 71_118_200, cost_30d: 515.61, last_seen_at: new Date(Date.now() - 2 * 3_600_000).toISOString(), created_at: "2026-06-03T16:20:00.000Z" },
  { id: "demo-user-4", external_id: "usr_papertrail", display_name: "Papertrail", rate_plan_id: "demo-starter", rate_plan_name: "Starter", status: "active", metadata: null, requests_30d: 2_884, tokens_30d: 48_664_000, cost_30d: 352.81, last_seen_at: new Date(Date.now() - 5 * 3_600_000).toISOString(), created_at: "2026-06-16T08:05:00.000Z" },
  { id: "demo-user-5", external_id: "usr_daybreak", display_name: "Daybreak Studio", rate_plan_id: "demo-growth", rate_plan_name: "Growth", status: "active", metadata: null, requests_30d: 2_112, tokens_30d: 39_504_800, cost_30d: 286.41, last_seen_at: new Date(Date.now() - 19 * 3_600_000).toISOString(), created_at: "2026-06-22T13:10:00.000Z" },
  { id: "demo-user-6", external_id: "usr_orbit", display_name: "Orbit Finance", rate_plan_id: "demo-scale", rate_plan_name: "Scale", status: "active", metadata: { segment: "enterprise" }, requests_30d: 1_978, tokens_30d: 36_110_400, cost_30d: 261.80, last_seen_at: new Date(Date.now() - 2 * 86_400_000).toISOString(), created_at: "2026-07-01T10:30:00.000Z" },
  { id: "demo-user-7", external_id: "usr_lumen", display_name: "Lumen Works", rate_plan_id: "demo-starter", rate_plan_name: "Starter", status: "active", metadata: null, requests_30d: 1_405, tokens_30d: 22_981_700, cost_30d: 166.62, last_seen_at: new Date(Date.now() - 4 * 86_400_000).toISOString(), created_at: "2026-07-07T15:45:00.000Z" },
  { id: "demo-user-8", external_id: "usr_ember", display_name: "Ember Support", rate_plan_id: "demo-starter", rate_plan_name: "Starter", status: "blocked", metadata: { reason: "limit_exceeded" }, requests_30d: 922, tokens_30d: 14_808_500, cost_30d: 107.36, last_seen_at: new Date(Date.now() - 7 * 86_400_000).toISOString(), created_at: "2026-07-11T12:00:00.000Z" },
];

function demoDate(daysAgo: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function createDemoBreakdown(days: number): DailyBreakdown[] {
  return Array.from({ length: days }, (_, index) => {
    const age = days - index - 1;
    const requests = Math.round(470 + index * 4.2 + Math.sin(index * 0.72) * 86 + (index % 7 === 5 ? 115 : 0));
    const tokens = Math.round(requests * (18_400 + (index % 5) * 1_350));
    const cost = Number(((tokens / 1_000_000) * 7.25).toFixed(2));
    const revenue = Number((cost * 1.68 + requests * 0.002).toFixed(2));
    return {
      date: demoDate(age), requests, tokens, cost, revenue,
      total_customers: 184 + Math.floor(index * 0.9),
      active_customers: 116 + (index % 8) * 4 + Math.floor(index * 0.35),
    };
  });
}

function createDemoBillingStats(period: "7d" | "30d" | "90d"): BillingStats {
  const days = Number(period.slice(0, -1));
  const daily_breakdown = createDemoBreakdown(days);
  const total_requests = daily_breakdown.reduce((sum, day) => sum + day.requests, 0);
  const total_tokens = daily_breakdown.reduce((sum, day) => sum + day.tokens, 0);
  const provider_cost_usd = Number(daily_breakdown.reduce((sum, day) => sum + day.cost, 0).toFixed(2));
  const customer_revenue_usd = Number(daily_breakdown.reduce((sum, day) => sum + day.revenue, 0).toFixed(2));
  const margin_usd = Number((customer_revenue_usd - provider_cost_usd).toFixed(2));
  return {
    period, total_end_users: 210, active_end_users: 167, total_requests, total_tokens,
    provider_cost_usd, customer_revenue_usd, margin_usd,
    margin_percentage: Number(((margin_usd / customer_revenue_usd) * 100).toFixed(1)),
    top_users: DEMO_USERS.slice(0, 6).map((user) => ({
      end_user_id: user.external_id,
      requests: Math.round(user.requests_30d * days / 30),
      tokens: Math.round(user.tokens_30d * days / 30),
      provider_cost_usd: Number((user.cost_30d * days / 30).toFixed(2)),
      customer_revenue_usd: Number((user.cost_30d * 1.68 * days / 30).toFixed(2)),
    })),
    daily_breakdown,
  };
}

function createDemoEndUserStats(): EndUserStats {
  const stats = createDemoBillingStats("30d");
  return {
    total_end_users: stats.total_end_users, active_end_users: stats.active_end_users,
    total_requests: stats.total_requests, total_tokens: stats.total_tokens,
    customer_revenue_usd: stats.customer_revenue_usd, daily_breakdown: stats.daily_breakdown,
  };
}

function createDemoDailyUsage(userId: string | null): DailyUsage[] {
  const userIndex = Math.max(0, DEMO_USERS.findIndex((user) => user.id === userId));
  return createDemoBreakdown(7).map((day, index) => ({
    date: day.date,
    requests: Math.round(day.requests * (0.09 + userIndex * 0.008) + index * 2),
    tokens: Math.round(day.tokens * (0.085 + userIndex * 0.006)),
    cost: Number((day.cost * (0.085 + userIndex * 0.006)).toFixed(2)),
  }));
}

function downloadRevenueExport(format: "csv" | "json", stats: BillingStats, period: string) {
  const content = format === "json"
    ? JSON.stringify(stats, null, 2)
    : [
        "date,requests,tokens,provider_cost_usd,customer_revenue_usd,total_customers,active_customers",
        ...stats.daily_breakdown.map((day) => [
          day.date, day.requests, day.tokens, day.cost, day.revenue,
          day.total_customers, day.active_customers,
        ].join(",")),
      ].join("\n");
  const url = URL.createObjectURL(new Blob([content], {
    type: format === "json" ? "application/json" : "text/csv;charset=utf-8",
  }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `monetization-${period}.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

const DEMO_INVOICES: Invoice[] = [
  { id: "demo-invoice-1", end_user_id: "demo-user-1", end_user_external_id: "usr_northstar", end_user_name: "Northstar Labs", end_user_email: "billing@northstarlabs.example", stripe_invoice_id: "in_demo_01", period_start: "2026-07-01", period_end: "2026-07-31", total_requests: 5_842, total_tokens: 118_420_500, subtotal_usd: 858.55, markup_usd: 583.81, total_usd: 1_442.36, status: "paid", sent_at: "2026-08-01T08:00:00.000Z", paid_at: "2026-08-01T09:12:00.000Z", created_at: "2026-08-01T08:00:00.000Z" },
  { id: "demo-invoice-2", end_user_id: "demo-user-2", end_user_external_id: "usr_kinetic", end_user_name: "Kinetic AI", end_user_email: "finance@kinetic.example", stripe_invoice_id: "in_demo_02", period_start: "2026-07-01", period_end: "2026-07-31", total_requests: 4_291, total_tokens: 82_930_100, subtotal_usd: 601.24, markup_usd: 408.84, total_usd: 1_010.08, status: "sent", sent_at: "2026-08-01T08:00:00.000Z", paid_at: null, created_at: "2026-08-01T08:00:00.000Z" },
  { id: "demo-invoice-3", end_user_id: "demo-user-3", end_user_external_id: "usr_helio", end_user_name: "Helio Health", end_user_email: "accounts@helio.example", stripe_invoice_id: null, period_start: "2026-07-01", period_end: "2026-07-31", total_requests: 3_766, total_tokens: 71_118_200, subtotal_usd: 515.61, markup_usd: 350.61, total_usd: 866.22, status: "draft", sent_at: null, paid_at: null, created_at: "2026-08-01T08:00:00.000Z" },
];

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

function formatChartDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
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

type PaymentProviderId = "stripe" | "paystack" | "flutterwave";
type RevenueSeriesKey = "revenue" | "cost";

const REVENUE_SERIES: Array<{ key: RevenueSeriesKey; label: string; color: string }> = [
  { key: "revenue", label: "Revenue", color: "hsl(145 50% 48%)" },
  { key: "cost", label: "Cost", color: "hsl(28 72% 55%)" },
];

const PAYMENT_PROVIDERS: Array<{
  id: PaymentProviderId;
  name: string;
  description: string;
}> = [
  { id: "stripe", name: "Stripe", description: "Cards, wallets, and bank payments." },
  { id: "paystack", name: "Paystack", description: "Local payment methods for African markets." },
  { id: "flutterwave", name: "Flutterwave", description: "Regional and international payment rails." },
];

function PaymentProviderMark({ provider }: { provider: PaymentProviderId }) {
  if (provider === "stripe") {
    return (
      <svg viewBox="0 0 24 24" className="size-4.5" fill="none" aria-hidden="true">
        <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.918 3.757 7.11c0 4.46 2.72 5.592 5.514 6.759 2.828 1.18 3.28 1.584 3.28 2.544 0 .951-.747 1.49-2.142 1.49-1.852 0-4.741-.936-6.628-2.187l-.894 5.572C4.45 22.41 7.326 24 11.342 24c2.627 0 4.768-.693 6.223-1.948 1.612-1.38 2.435-3.35 2.435-5.847 0-4.544-2.785-5.673-6.024-7.055z" fill="#635BFF" />
      </svg>
    );
  }

  if (provider === "paystack") {
    return (
      <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
        <path d="M4 5.5h16M4 9.5h16M4 13.5h11.5M4 17.5h8" stroke="#00C3F7" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    );
  }

  return <Image src="/logos/flutterwave.svg" alt="" width={22} height={18} className="h-5 w-auto" aria-hidden="true" />;
}

// ─── Hook: resolve projectId from slugs ──────────────────────────────

function useProjectId(orgSlug: string, projectSlug: string) {
  return useProjectIdBySlug(orgSlug, projectSlug);
}

// ─── Main Page ───────────────────────────────────────────────────────

export default function UsageBillingPage({ params }: PageProps) {
  const { orgSlug, projectSlug } = use(params);
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("demo") === "1";
  const queryClient = useQueryClient();
  const { data: projectId, isLoading: projectLoading } = useProjectId(orgSlug, projectSlug);

  const [demoRatePlans, setDemoRatePlans] = useState<RatePlan[]>(DEMO_RATE_PLANS);
  const [demoUsers, setDemoUsers] = useState<EndUser[]>(DEMO_USERS);
  const [demoInvoices, setDemoInvoices] = useState<Invoice[]>(DEMO_INVOICES);

  const [tab, setTab] = useState<Tab>("configuration");

  // ── Configuration state ──
  const [enabled, setEnabled] = useState(false);
  const [markupPct, setMarkupPct] = useState("20");
  const [billingCycle, setBillingCycle] = useState<"daily" | "weekly" | "monthly">("monthly");
  const [ratePlan, setRatePlan] = useState("");
  const [configDirty, setConfigDirty] = useState(false);

  // ── Revenue state ──
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const [hiddenRevenueSeries, setHiddenRevenueSeries] = useState<Set<RevenueSeriesKey>>(() => new Set());

  // ── Customers state ──
  const [euSearch, setEuSearch] = useState("");
  const [euSearchInput, setEuSearchInput] = useState("");
  const [euRatePlanFilter, setEuRatePlanFilter] = useState("all");
  const [euStatusFilter, setEuStatusFilter] = useState("all");
  const [euPage, setEuPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // ── Pricing plans state ──
  const [rpDialogOpen, setRpDialogOpen] = useState(false);
  const [rpEditingPlan, setRpEditingPlan] = useState<RatePlan | null>(null);
  const [rpForm, setRpForm] = useState<RatePlanForm>(emptyForm);
  const [rpNameManual, setRpNameManual] = useState(false);
  const [rpDeleteTarget, setRpDeleteTarget] = useState<RatePlan | null>(null);

  // ── Invoices state ──
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [invoiceSendStripe, setInvoiceSendStripe] = useState(false);

  // ─── Queries ───

  const { data: persistedConfig, isLoading: persistedConfigLoading } = useQuery<BillingConfig>({
    queryKey: ["endUserBillingConfig", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/end-user-billing`);
      if (!res.ok) throw new Error("Failed to fetch billing config");
      return res.json();
    },
    enabled: !!projectId && !isDemo,
    staleTime: 30 * 1000,
  });
  const config = isDemo ? DEMO_BILLING_CONFIG : persistedConfig;
  const configLoading = !isDemo && persistedConfigLoading;

  // Stripe Connect status
  const { data: persistedStripeConnect, isLoading: persistedStripeLoading } = useQuery<{
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
    enabled: tab === "configuration" && !isDemo,
    staleTime: 60 * 1000,
  });
  const stripeConnect = isDemo
    ? { connected: true, status: "active" as const, charges_enabled: true, payouts_enabled: true, onboarding_completed: true, stripe_account_id: "acct_demo" }
    : persistedStripeConnect;
  const stripeLoading = !isDemo && persistedStripeLoading;

  const { data: persistedRatePlansData } = useQuery({
    queryKey: ["rate-plans", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/rate-plans`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!projectId && !isDemo,
    staleTime: 60 * 1000,
  });

  const ratePlansData = isDemo ? demoRatePlans : persistedRatePlansData;
  const ratePlans: RatePlan[] = ratePlansData?.rate_plans ?? ratePlansData?.ratePlans ?? (Array.isArray(ratePlansData) ? ratePlansData : []);
  const ratePlansList: { id: string; name: string }[] = ratePlans;

  const { data: persistedStats, isLoading: persistedStatsLoading } = useQuery<BillingStats>({
    queryKey: ["endUserBillingStats", projectId, period],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/end-user-billing/stats?period=${period}`);
      if (!res.ok) throw new Error("Failed to fetch billing stats");
      return res.json();
    },
    enabled: !!projectId && enabled && tab === "revenue" && !isDemo,
    staleTime: 30 * 1000,
  });
  const stats = isDemo ? createDemoBillingStats(period) : persistedStats;
  const statsLoading = !isDemo && persistedStatsLoading;

  const { data: persistedEuStats, isLoading: persistedEuStatsLoading } = useQuery<EndUserStats>({
    queryKey: ["endUserStats", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/end-user-billing/stats?period=30d`);
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    enabled: !!projectId && !isDemo && (tab === "end_users" || (tab === "configuration" && enabled)),
  });
  const euStats = isDemo ? createDemoEndUserStats() : persistedEuStats;
  const euStatsLoading = !isDemo && persistedEuStatsLoading;

  const { data: persistedUsersData, isLoading: persistedUsersLoading } = useQuery({
    queryKey: ["endUsers", projectId, euSearch, euRatePlanFilter, euStatusFilter, euPage],
    queryFn: async () => {
      const p = new URLSearchParams({ page: String(euPage), per_page: "50" });
      if (euSearch) p.set("search", euSearch);
      if (euRatePlanFilter !== "all") p.set("rate_plan_id", euRatePlanFilter);
      if (euStatusFilter !== "all") p.set("status", euStatusFilter);
      const res = await fetch(`/api/projects/${projectId}/end-users?${p}`);
      if (!res.ok) throw new Error("Failed to fetch customers");
      return res.json() as Promise<{ users: EndUser[]; pagination: Pagination }>;
    },
    enabled: !!projectId && tab === "end_users" && !isDemo,
  });

  const normalizedSearch = euSearch.trim().toLowerCase();
  const filteredDemoUsers = demoUsers.filter((user) => {
    const matchesSearch = !normalizedSearch
      || user.external_id.toLowerCase().includes(normalizedSearch)
      || user.display_name?.toLowerCase().includes(normalizedSearch);
    const matchesPlan = euRatePlanFilter === "all" || user.rate_plan_id === euRatePlanFilter;
    const matchesStatus = euStatusFilter === "all" || user.status === euStatusFilter;
    return matchesSearch && matchesPlan && matchesStatus;
  });
  const usersData = isDemo ? {
    users: filteredDemoUsers,
    pagination: { page: 1, per_page: 50, total: filteredDemoUsers.length, total_pages: 1 },
  } : persistedUsersData;
  const usersLoading = !isDemo && persistedUsersLoading;

  const { data: persistedDailyUsage } = useQuery<DailyUsage[]>({
    queryKey: ["endUserDailyUsage", projectId, expandedRow],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/end-users/${expandedRow}/usage?period=7d`);
      if (!res.ok) throw new Error("Failed to fetch usage");
      return res.json();
    },
    enabled: !!projectId && !!expandedRow && tab === "end_users" && !isDemo,
  });
  const dailyUsage = isDemo && expandedRow ? createDemoDailyUsage(expandedRow) : persistedDailyUsage;

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
      if (isDemo) return { stripe_account_id: "acct_demo", onboarding_url: "" };
      const returnUrl = `${window.location.origin}/${orgSlug}/${projectSlug}/monetization`;
      const res = await fetch(`/api/organizations/${orgSlug}/stripe-connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ return_url: returnUrl, refresh_url: returnUrl }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to connect Stripe"); }
      return res.json() as Promise<{ stripe_account_id: string; onboarding_url: string }>;
    },
    onSuccess: (data) => {
      if (isDemo) {
        toast.success("Stripe is already connected");
        return;
      }
      window.location.href = data.onboarding_url;
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isDemo) return DEMO_BILLING_CONFIG;
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
      if (!isDemo) queryClient.invalidateQueries({ queryKey: ["endUserBillingConfig", projectId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ userId, newStatus }: { userId: string; newStatus: "active" | "blocked" }) => {
      if (isDemo) return { userId, newStatus };
      const res = await fetch(`/api/projects/${projectId}/end-users/${userId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      const result = await res.json();
      return { userId, newStatus, result };
    },
    onSuccess: ({ userId, newStatus }) => {
      if (isDemo) {
        setDemoUsers((current) => current.map((user) => user.id === userId ? { ...user, status: newStatus } : user));
      } else {
        queryClient.invalidateQueries({ queryKey: ["endUsers", projectId] });
        queryClient.invalidateQueries({ queryKey: ["endUserStats", projectId] });
      }
      toast.success("User status updated");
    },
    onError: () => toast.error("Failed to update user status"),
  });

  const assignPlanMutation = useMutation({
    mutationFn: async ({ userId, ratePlanId }: { userId: string; ratePlanId: string | null }) => {
      if (isDemo) return { userId, ratePlanId };
      const res = await fetch(`/api/projects/${projectId}/end-users/${userId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate_plan_id: ratePlanId }),
      });
      if (!res.ok) throw new Error("Failed to assign plan");
      const result = await res.json();
      return { userId, ratePlanId, result };
    },
    onSuccess: ({ userId, ratePlanId }) => {
      if (isDemo) {
        const selectedPlan = demoRatePlans.find((plan) => plan.id === ratePlanId);
        setDemoUsers((current) => current.map((user) => user.id === userId ? {
          ...user,
          rate_plan_id: ratePlanId,
          rate_plan_name: selectedPlan?.name ?? null,
        } : user));
      } else {
        queryClient.invalidateQueries({ queryKey: ["endUsers", projectId] });
      }
      toast.success("Rate plan updated");
    },
    onError: () => toast.error("Failed to assign pricing plan"),
  });

  const rpCreateMutation = useMutation({
    mutationFn: async (data: ReturnType<typeof formToPayload>) => {
      if (isDemo) return { id: `demo-plan-${Date.now()}`, ...data };
      const res = await fetch(`/api/projects/${projectId}/rate-plans`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to create"); }
      return res.json();
    },
    onSuccess: (created) => {
      if (isDemo) {
        setDemoRatePlans((current) => [...current, {
          ...created,
          end_user_count: 0,
          created_at: new Date().toISOString(),
        } as RatePlan]);
      } else {
        queryClient.invalidateQueries({ queryKey: ["rate-plans", projectId] });
      }
      closeRpDialog();
      toast.success("Rate plan created");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rpUpdateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ReturnType<typeof formToPayload> }) => {
      if (isDemo) return { id, data, result: null };
      const res = await fetch(`/api/projects/${projectId}/rate-plans/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to update"); }
      const result = await res.json();
      return { id, data, result };
    },
    onSuccess: ({ id, data }) => {
      if (isDemo) {
        setDemoRatePlans((current) => current.map((plan) => plan.id === id ? { ...plan, ...data } : plan));
      } else {
        queryClient.invalidateQueries({ queryKey: ["rate-plans", projectId] });
      }
      closeRpDialog();
      toast.success("Rate plan updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rpDeleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (isDemo) return { id };
      const res = await fetch(`/api/projects/${projectId}/rate-plans/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      await res.json();
      return { id };
    },
    onSuccess: ({ id }) => {
      if (isDemo) {
        setDemoRatePlans((current) => current.filter((plan) => plan.id !== id));
        setDemoUsers((current) => current.map((user) => user.rate_plan_id === id ? { ...user, rate_plan_id: null, rate_plan_name: null } : user));
      } else {
        queryClient.invalidateQueries({ queryKey: ["rate-plans", projectId] });
      }
      setRpDeleteTarget(null);
      toast.success("Rate plan deleted");
    },
    onError: () => toast.error("Failed to delete pricing plan"),
  });

  // ─── Pricing plan dialog helpers ───

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

  const { data: persistedInvoicesData, isLoading: persistedInvoicesLoading } = useQuery<{
    invoices: Invoice[];
    pagination: Pagination;
  }>({
    queryKey: ["invoices", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/end-user-billing/invoices?per_page=50`);
      if (!res.ok) throw new Error("Failed to fetch invoices");
      return res.json();
    },
    enabled: !!projectId && enabled && tab === "revenue" && !isDemo,
    staleTime: 30 * 1000,
  });
  const invoicesData = isDemo ? {
    invoices: demoInvoices,
    pagination: { page: 1, per_page: 50, total: demoInvoices.length, total_pages: 1 },
  } : persistedInvoicesData;
  const invoicesLoading = !isDemo && persistedInvoicesLoading;

  const generateInvoicesMutation = useMutation({
    mutationFn: async (params: { period_start: string; period_end: string; send_via_stripe: boolean }) => {
      if (isDemo) return { generated: 1, skipped: 0, errors: 0, params };
      const res = await fetch(`/api/projects/${projectId}/end-user-billing/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to generate invoices" }));
        throw new Error(err.error);
      }
      const result = await res.json();
      return { ...result, params };
    },
    onSuccess: (data) => {
      if (isDemo) {
        const now = new Date().toISOString();
        setDemoInvoices((current) => [{
          id: `demo-invoice-${Date.now()}`,
          end_user_id: "demo-user-4",
          end_user_external_id: "usr_papertrail",
          end_user_name: "Papertrail",
          end_user_email: "billing@papertrail.example",
          stripe_invoice_id: invoiceSendStripe ? `in_demo_${Date.now()}` : null,
          period_start: data.params.period_start,
          period_end: data.params.period_end,
          total_requests: 2_884,
          total_tokens: 48_664_000,
          subtotal_usd: 352.81,
          markup_usd: 239.91,
          total_usd: 592.72,
          status: invoiceSendStripe ? "sent" : "draft",
          sent_at: invoiceSendStripe ? now : null,
          paid_at: null,
          created_at: now,
        }, ...current]);
      } else {
        queryClient.invalidateQueries({ queryKey: ["invoices", projectId] });
      }
      toast.success(`Generated ${data.generated} invoice(s)${data.skipped > 0 ? `, ${data.skipped} skipped` : ""}${data.errors > 0 ? `, ${data.errors} failed` : ""}`);
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

  // ─── Customer helpers ───

  const users = usersData?.users || [];
  const pagination = usersData?.pagination;
  const euIsLoading = projectLoading || usersLoading;
  const monetizationChartData = euStats?.daily_breakdown ?? [];
  const monetizationDateTicks = monetizationChartData.length > 0
    ? [monetizationChartData[0].date, monetizationChartData[monetizationChartData.length - 1].date]
    : [];
  const revenueChartData = (stats?.daily_breakdown ?? []).map((entry) => {
    const margin = entry.revenue - entry.cost;
    return {
      ...entry,
      margin,
      margin_rate: entry.revenue > 0 ? (margin / entry.revenue) * 100 : 0,
    };
  });
  const revenueDateTicks = revenueChartData.length > 0
    ? [revenueChartData[0].date, revenueChartData[revenueChartData.length - 1].date]
    : [];
  const hasRevenueChartData = revenueChartData.some((entry) => entry.revenue > 0 || entry.cost > 0);

  const handleEuSearch = () => { setEuSearch(euSearchInput); setEuPage(1); };

  const toggleRevenueSeries = (key: RevenueSeriesKey) => {
    setHiddenRevenueSeries((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else if (next.size < REVENUE_SERIES.length - 1) {
        next.add(key);
      }
      return next;
    });
  };

  const rpIsSaving = rpCreateMutation.isPending || rpUpdateMutation.isPending;

  // ─── Loading skeleton ───

  if (projectLoading || configLoading) {
    return (
      <main className="mx-auto w-full max-w-[980px] px-4 py-8 pb-24 sm:px-6 sm:py-10 lg:px-8">
        <header className="mb-8">
          <Skeleton className="h-2.5 w-28" />
          <Skeleton className="mt-3 h-8 w-56" />
          <Skeleton className="mt-3 h-3 w-80 max-w-full" />
        </header>
        <div className="mb-7 flex h-10 items-end gap-6 border-b border-border/30">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="mb-3 h-3 w-16" />
          ))}
        </div>
        <div className="space-y-8">
          <Skeleton className="h-[276px] rounded-xl" />
          <section aria-label="Loading payment providers">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-2 h-3 w-72 max-w-full" />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: PAYMENT_PROVIDERS.length }).map((_, index) => (
                <Skeleton key={index} className="h-[154px] rounded-xl" />
              ))}
            </div>
          </section>
        </div>
      </main>
    );
  }

  // ─── Tab labels ───

  const tabs: { key: Tab; label: string }[] = [
    { key: "configuration", label: "Overview" },
    { key: "end_users", label: "Customers" },
    { key: "rate_plans", label: "Pricing" },
    { key: "revenue", label: "Revenue" },
  ];

  return (
    <main className="mx-auto w-full max-w-[980px] px-4 py-8 pb-24 sm:px-6 sm:py-10 lg:px-8">
      <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[9px] font-medium tracking-[0.18em] text-muted-foreground">PRODUCT REVENUE</p>
          <h1 className="mt-3 text-[2rem] font-medium leading-none tracking-[-0.055em]">AI monetization</h1>
          <p className="mt-3 max-w-[60ch] text-xs leading-5 text-muted-foreground">
            Meter AI usage, set pricing, and bill your customers.
          </p>
        </div>
        <div className="flex min-h-8 items-center gap-2">
          {tab === "configuration" && (
            <span className={cn(
              "rounded-md border px-2 py-1 font-mono text-[9px] font-medium uppercase tracking-[0.08em]",
              enabled
                ? "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-500"
                : "border-border/40 bg-secondary/60 text-muted-foreground"
            )}>
              {enabled ? "Active" : "Not enabled"}
            </span>
          )}
        </div>
      </header>

      {/* Tabs */}
      <nav className="mb-7 flex items-center gap-6 overflow-x-auto border-b border-border/30" aria-label="Monetization sections">
        {tabs.map((t) => (
          <button
            type="button"
            key={t.key}
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "relative h-10 shrink-0 text-[11px] font-medium transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-px after:transition-colors",
              tab === t.key
                ? "text-foreground after:bg-foreground"
                : "text-muted-foreground after:bg-transparent hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* ═══════════════════════ Configuration Tab ═══════════════════════ */}
      {tab === "configuration" && (
        <div className="space-y-8">
          <section aria-labelledby="monetization-activity-heading">
            <header className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 id="monetization-activity-heading" className="text-sm font-medium tracking-[-0.015em]">Monetization activity</h2>
                <p className="mt-1 text-[10px] text-muted-foreground">A 30-day view of billable usage and customer activity.</p>
              </div>
              <span className="rounded-md bg-muted/55 px-2 py-1 font-mono text-[9px] text-muted-foreground ring-1 ring-inset ring-border/35">
                Last 30 days
              </span>
            </header>

            <div className="grid overflow-hidden rounded-xl bg-[#f3f3f1] ring-1 ring-inset ring-black/[0.05] dark:bg-[#111111] dark:ring-white/[0.045] md:grid-cols-2">
              {[
                {
                  label: "AI requests",
                  description: "Metered requests",
                  value: euStats ? fmtNum(euStats.total_requests) : "0",
                  dataKey: "requests",
                  formatChartValue: fmtNum,
                  hasData: (euStats?.total_requests ?? 0) > 0,
                },
                {
                  label: "Tokens",
                  description: "Metered AI usage",
                  value: euStats ? formatTokens(euStats.total_tokens) : "0",
                  dataKey: "tokens",
                  formatChartValue: formatTokens,
                  hasData: (euStats?.total_tokens ?? 0) > 0,
                },
                {
                  label: "Active customers",
                  description: "Unique customers",
                  value: euStats ? fmtNum(euStats.active_end_users) : "0",
                  dataKey: "active_customers",
                  formatChartValue: fmtNum,
                  hasData: (euStats?.active_end_users ?? 0) > 0,
                },
                {
                  label: "Customer revenue",
                  description: "Gross usage revenue",
                  value: euStats ? formatCurrency(euStats.customer_revenue_usd) : "$0.00",
                  dataKey: "revenue",
                  formatChartValue: formatCurrency,
                  hasData: (euStats?.customer_revenue_usd ?? 0) > 0,
                },
              ].map((stat) => (
                <article
                  key={stat.label}
                  className="overflow-hidden border-b border-black/[0.055] last:border-b-0 dark:border-white/[0.055] md:[&:nth-child(odd)]:border-r md:[&:nth-last-child(-n+2)]:border-b-0"
                >
                  <div className="flex items-start justify-between gap-4 px-5 pt-5">
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground">{stat.label}</p>
                      {euStatsLoading ? (
                        <Skeleton className="mt-3 h-8 w-20" />
                      ) : (
                        <p className="mt-2 font-mono text-2xl font-medium tracking-[-0.04em] tabular-nums">{stat.value}</p>
                      )}
                    </div>
                    <p className="pt-0.5 text-right text-[9px] text-muted-foreground">{stat.description}</p>
                  </div>

                  <div className="relative mt-5 h-[190px] w-full px-4 pb-4">
                    {euStatsLoading ? (
                      <Skeleton className="h-full w-full rounded-md" />
                    ) : (
                      <>
                        <ChartContainer
                          config={{
                            [stat.dataKey]: { label: stat.label, color: "var(--foreground)" },
                          }}
                          className="h-full w-full"
                        >
                          <LineChart data={monetizationChartData} margin={{ top: 8, right: 24, bottom: 0, left: 24 }}>
                            <CartesianGrid
                              vertical={false}
                              stroke="hsl(var(--border))"
                              strokeDasharray="3 3"
                              strokeOpacity={0.38}
                            />
                            <XAxis
                              dataKey="date"
                              ticks={monetizationDateTicks}
                              axisLine={false}
                              tickLine={false}
                              tickMargin={9}
                              interval={0}
                              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                              tickFormatter={formatChartDate}
                            />
                            <ChartTooltip
                              cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: "3 3", strokeOpacity: 0.3 }}
                              content={(
                                <ChartTooltipContent
                                  indicator="line"
                                  labelFormatter={(label) => formatChartDate(String(label))}
                                  formatter={(value) => stat.formatChartValue(Number(value))}
                                />
                              )}
                            />
                            <Line
                              type="monotone"
                              dataKey={stat.dataKey}
                              stroke={`var(--color-${stat.dataKey})`}
                              strokeOpacity={0.72}
                              strokeWidth={1.6}
                              dot={false}
                              activeDot={{ r: 3, strokeWidth: 0 }}
                              isAnimationActive={false}
                            />
                          </LineChart>
                        </ChartContainer>
                        {!stat.hasData && (
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-5" aria-label={`No ${stat.label.toLowerCase()} data for this period`}>
                            <span className="rounded-md bg-primary/50 px-2.5 py-1 text-[10px] text-primary-foreground/80">
                              No data for this period
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl bg-[#f3f3f1] ring-1 ring-inset ring-black/[0.05] dark:bg-[#111111] dark:ring-white/[0.045]" aria-labelledby="usage-billing-heading">
            <header className="flex items-start justify-between gap-5 border-b border-black/[0.055] px-5 py-5 dark:border-white/[0.055] sm:px-6">
              <div>
                <h2 id="usage-billing-heading" className="text-sm font-medium tracking-[-0.015em]">Usage billing</h2>
                <p className="mt-1 max-w-[52ch] text-[11px] leading-4 text-muted-foreground">
                  Apply pricing to every metered AI request in this project.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <Label htmlFor="billing-enabled" className="text-[10px] text-muted-foreground">
                  {enabled ? "Enabled" : "Disabled"}
                </Label>
                <Switch
                  id="billing-enabled"
                  checked={enabled}
                  onCheckedChange={(value) => { setEnabled(value); setConfigDirty(true); }}
                />
              </div>
            </header>

            <div className="grid gap-5 px-5 py-5 sm:grid-cols-2 sm:px-6 sm:py-6 lg:grid-cols-3">
              <div className="space-y-2">
                <div>
                  <Label htmlFor="markup-pct" className="text-[11px] font-medium">Default markup</Label>
                  <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">Added to the underlying AI provider cost.</p>
                </div>
                <div className="relative">
                  <Input
                    id="markup-pct"
                    type="number"
                    min={0}
                    max={500}
                    step={1}
                    value={markupPct}
                    onChange={(event) => { setMarkupPct(event.target.value); setConfigDirty(true); }}
                    placeholder="20"
                    className="h-9 bg-background/55 pr-9 font-mono text-xs shadow-none"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-mono text-[10px] text-muted-foreground">%</span>
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <Label className="text-[11px] font-medium">Billing cycle</Label>
                  <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">How often customer usage closes.</p>
                </div>
                <Select value={billingCycle} onValueChange={(value: "daily" | "weekly" | "monthly") => { setBillingCycle(value); setConfigDirty(true); }}>
                  <SelectTrigger className="h-9 bg-background/55 text-xs shadow-none"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily" className="text-xs">Daily</SelectItem>
                    <SelectItem value="weekly" className="text-xs">Weekly</SelectItem>
                    <SelectItem value="monthly" className="text-xs">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div>
                  <Label className="text-[11px] font-medium">Default pricing plan</Label>
                  <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">Applied when a customer has no plan assigned.</p>
                </div>
                <Select value={ratePlan} onValueChange={(value) => { setRatePlan(value); setConfigDirty(true); }}>
                  <SelectTrigger className="h-9 bg-background/55 text-xs shadow-none"><SelectValue placeholder="Select a pricing plan" /></SelectTrigger>
                  <SelectContent>
                    {ratePlansList.length === 0 && (
                      <SelectItem value="none" disabled className="text-xs">No pricing plans configured</SelectItem>
                    )}
                    {ratePlansList.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id} className="text-xs">{plan.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <footer className="flex min-h-14 items-center justify-between gap-4 border-t border-black/[0.055] px-5 py-3 dark:border-white/[0.055] sm:px-6">
              <p className={cn("text-[10px]", configDirty ? "text-amber-500" : "text-muted-foreground")}>
                {configDirty ? "Unsaved changes" : "Configuration is up to date"}
              </p>
              <Button
                size="sm"
                className="h-8 px-3 text-xs"
                disabled={!configDirty || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? "Saving…" : "Save changes"}
              </Button>
            </footer>
          </section>

          <section aria-labelledby="payment-providers-heading">
            <header className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 id="payment-providers-heading" className="text-sm font-medium tracking-[-0.015em]">Payment providers</h2>
                <p className="mt-1 max-w-[60ch] text-[11px] leading-4 text-muted-foreground">
                  Connect the payment rails your business uses to collect revenue and receive payouts.
                </p>
              </div>
              <p className="font-mono text-[9px] text-muted-foreground">{PAYMENT_PROVIDERS.length} providers</p>
            </header>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PAYMENT_PROVIDERS.map((provider) => {
                const isStripe = provider.id === "stripe";
                const stripeIsActive = isStripe && stripeConnect?.connected && stripeConnect.status === "active" && stripeConnect.charges_enabled;
                const stripeNeedsAttention = isStripe && stripeConnect?.connected && !stripeIsActive;

                return (
                  <article
                    key={provider.id}
                    className="flex min-h-[168px] flex-col rounded-xl bg-[#f3f3f1] p-4 ring-1 ring-inset ring-black/[0.05] transition-colors hover:bg-[#eeeeec] dark:bg-[#111111] dark:ring-white/[0.045] dark:hover:bg-[#151515]"
                  >
                    <header className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background/55 ring-1 ring-inset ring-black/[0.055] dark:ring-white/[0.06]">
                          <PaymentProviderMark provider={provider.id} />
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate text-xs font-medium">{provider.name}</h3>
                        </div>
                      </div>

                      {isStripe && stripeLoading ? (
                        <Skeleton className="h-5 w-14 rounded-md" />
                      ) : stripeIsActive ? (
                        <span className="rounded-md bg-emerald-500/[0.08] px-1.5 py-1 font-mono text-[8px] uppercase tracking-[0.08em] text-emerald-500 ring-1 ring-inset ring-emerald-500/15">Connected</span>
                      ) : stripeNeedsAttention ? (
                        <span className="rounded-md bg-amber-500/[0.08] px-1.5 py-1 font-mono text-[8px] uppercase tracking-[0.08em] text-amber-500 ring-1 ring-inset ring-amber-500/15">Action required</span>
                      ) : null}
                    </header>

                    <p className="mt-4 text-[10px] leading-4 text-muted-foreground">{provider.description}</p>

                    <div className="mt-auto pt-4">
                      {isStripe && stripeLoading ? (
                        <Skeleton className="h-8 w-full rounded-md" />
                      ) : stripeIsActive ? (
                        <div className="flex h-8 items-center gap-2 rounded-md bg-emerald-500/[0.06] px-2.5 text-[10px] text-emerald-500 ring-1 ring-inset ring-emerald-500/15">
                          <CheckCircle2 className="size-3.5 shrink-0" />
                          <span className="truncate">Ready to collect payments</span>
                        </div>
                      ) : isStripe ? (
                        <Button
                          size="sm"
                          variant={stripeNeedsAttention ? "outline" : "default"}
                          className="h-8 w-full gap-1.5 text-xs"
                          onClick={() => stripeConnectMutation.mutate()}
                          disabled={stripeConnectMutation.isPending}
                        >
                          {stripeConnectMutation.isPending
                            ? "Opening Stripe…"
                            : stripeNeedsAttention ? "Complete setup" : "Connect"}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="h-8 w-full text-xs"
                          disabled
                        >
                          Coming soon
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* ═══════════════════════ Customers Tab ═══════════════════════ */}
      {tab === "end_users" && (
        <div className="space-y-6">
          <section aria-labelledby="customer-overview-heading">
            <header className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 id="customer-overview-heading" className="text-sm font-medium tracking-[-0.015em]">Customer overview</h2>
                <p className="mt-1 text-[10px] text-muted-foreground">Daily customer activity, usage, and revenue.</p>
              </div>
              <span className="rounded-md bg-muted/55 px-2 py-1 font-mono text-[9px] text-muted-foreground ring-1 ring-inset ring-border/35">
                Last 30 days
              </span>
            </header>

            <div className="grid overflow-hidden rounded-xl bg-[#f3f3f1] ring-1 ring-inset ring-black/[0.05] dark:bg-[#111111] dark:ring-white/[0.045] md:grid-cols-2">
              {[
                { label: "Total customers", description: "All identified customers", value: euStats ? fmtNum(euStats.total_end_users) : "0", dataKey: "total_customers", formatChartValue: fmtNum, hasData: (euStats?.total_end_users ?? 0) > 0 },
                { label: "Active customers", description: "Unique customers in this period", value: euStats ? fmtNum(euStats.active_end_users) : "0", dataKey: "active_customers", formatChartValue: fmtNum, hasData: (euStats?.active_end_users ?? 0) > 0 },
                { label: "Tokens", description: "Metered AI usage", value: euStats ? formatTokens(euStats.total_tokens) : "0", dataKey: "tokens", formatChartValue: formatTokens, hasData: (euStats?.total_tokens ?? 0) > 0 },
                { label: "Revenue", description: "Gross customer revenue", value: euStats ? formatCurrency(euStats.customer_revenue_usd) : "$0.00", dataKey: "revenue", formatChartValue: formatCurrency, hasData: (euStats?.customer_revenue_usd ?? 0) > 0 },
              ].map((stat) => {
                const chartConfig = {
                  [stat.dataKey]: { label: stat.label, color: "var(--foreground)" },
                };
                const chartData = euStats?.daily_breakdown ?? [];
                const dateTicks = chartData.length > 0
                  ? [chartData[0].date, chartData[chartData.length - 1].date]
                  : [];

                return (
                  <article
                    key={stat.label}
                    className="overflow-hidden border-b border-black/[0.055] last:border-b-0 dark:border-white/[0.055] md:[&:nth-child(odd)]:border-r md:[&:nth-last-child(-n+2)]:border-b-0"
                  >
                    <div className="flex items-start justify-between gap-4 px-5 pt-5">
                      <div>
                        <p className="text-[11px] font-medium text-muted-foreground">{stat.label}</p>
                        {euStatsLoading ? (
                          <Skeleton className="mt-3 h-8 w-20" />
                        ) : (
                          <p className="mt-2 font-mono text-2xl font-medium tracking-[-0.04em] tabular-nums">{stat.value}</p>
                        )}
                      </div>
                      <p className="pt-0.5 text-right text-[9px] text-muted-foreground">{stat.description}</p>
                    </div>

                    <div className="relative mt-6 h-[228px] w-full px-4 pb-4">
                      {euStatsLoading ? (
                        <Skeleton className="h-full w-full rounded-md" />
                      ) : (
                        <>
                          <ChartContainer config={chartConfig} className="h-full w-full">
                            <LineChart data={chartData} margin={{ top: 8, right: 24, bottom: 0, left: 24 }}>
                              <CartesianGrid
                                vertical={false}
                                stroke="hsl(var(--border))"
                                strokeDasharray="3 3"
                                strokeOpacity={0.38}
                              />
                              <XAxis
                              dataKey="date"
                              ticks={dateTicks}
                              axisLine={false}
                              tickLine={false}
                              tickMargin={9}
                              interval={0}
                                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                                tickFormatter={formatChartDate}
                              />
                              <ChartTooltip
                                cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: "3 3", strokeOpacity: 0.3 }}
                                content={(
                                  <ChartTooltipContent
                                    indicator="line"
                                    labelFormatter={(label) => formatChartDate(String(label))}
                                    formatter={(value) => stat.formatChartValue(Number(value))}
                                  />
                                )}
                              />
                              <Line
                                type="monotone"
                                dataKey={stat.dataKey}
                                stroke={`var(--color-${stat.dataKey})`}
                                strokeOpacity={0.72}
                                strokeWidth={1.6}
                                dot={false}
                                activeDot={{ r: 3, strokeWidth: 0 }}
                                isAnimationActive={false}
                              />
                            </LineChart>
                          </ChartContainer>
                          {!stat.hasData && (
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-5" aria-label={`No ${stat.label.toLowerCase()} data for this period`}>
                              <span className="rounded-md bg-primary/50 px-2.5 py-1 text-[10px] text-primary-foreground/80">
                                No data for this period
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl bg-[#f3f3f1] ring-1 ring-inset ring-black/[0.05] dark:bg-[#111111] dark:ring-white/[0.045]" aria-labelledby="customer-directory-heading">
            <header className="flex flex-col gap-4 border-b border-black/[0.055] px-4 py-4 dark:border-white/[0.055] lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 id="customer-directory-heading" className="text-sm font-medium tracking-[-0.015em]">Customer directory</h2>
                <p className="mt-1 text-[10px] text-muted-foreground">Usage, pricing, and access for every identified customer.</p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <form
                  className="flex h-8 min-w-0 items-center rounded-md border border-border/40 bg-background/55 pl-2.5 focus-within:border-foreground/20 sm:w-56"
                  onSubmit={(event) => { event.preventDefault(); handleEuSearch(); }}
                >
                  <input
                    value={euSearchInput}
                    onChange={(event) => setEuSearchInput(event.target.value)}
                    placeholder="Search customers"
                    className="min-w-0 flex-1 bg-transparent text-[10px] outline-none placeholder:text-muted-foreground/65"
                    aria-label="Search customers"
                  />
                  <button type="submit" className="flex size-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground" aria-label="Submit customer search">
                    <Search className="size-3.5" />
                  </button>
                </form>

                {ratePlansList.length > 0 && (
                  <Select value={euRatePlanFilter} onValueChange={(value) => { setEuRatePlanFilter(value); setEuPage(1); }}>
                    <SelectTrigger className="h-8 w-full bg-background/55 text-[10px] shadow-none sm:w-32"><SelectValue placeholder="All plans" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">All plans</SelectItem>
                      {ratePlansList.map((plan) => (
                        <SelectItem key={plan.id} value={plan.id} className="text-xs">{plan.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <Select value={euStatusFilter} onValueChange={(value) => { setEuStatusFilter(value); setEuPage(1); }}>
                  <SelectTrigger className="h-8 w-full bg-background/55 text-[10px] shadow-none sm:w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">All status</SelectItem>
                    <SelectItem value="active" className="text-xs">Active</SelectItem>
                    <SelectItem value="blocked" className="text-xs">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </header>

            <div className="overflow-x-auto">
              <Table>
              <TableHeader className="bg-background/20">
                <TableRow className="border-black/[0.055] hover:bg-transparent dark:border-white/[0.055]">
                  <TableHead className="h-9 w-[140px] text-[9px] font-medium">External ID</TableHead>
                  <TableHead className="h-9 w-[130px] text-[9px] font-medium">Name</TableHead>
                  <TableHead className="h-9 w-[90px] text-[9px] font-medium">Plan</TableHead>
                  <TableHead className="h-9 w-[80px] text-right text-[9px] font-medium">Requests</TableHead>
                  <TableHead className="h-9 w-[80px] text-right text-[9px] font-medium">Tokens</TableHead>
                  <TableHead className="h-9 w-[70px] text-right text-[9px] font-medium">Cost</TableHead>
                  <TableHead className="h-9 w-[80px] text-[9px] font-medium">Last seen</TableHead>
                  <TableHead className="h-9 w-[70px] text-[9px] font-medium">Status</TableHead>
                  <TableHead className="h-9 w-[36px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {euIsLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i} className="border-black/[0.045] dark:border-white/[0.045]">
                      <TableCell><Skeleton className="h-3 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-3 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-14 rounded-md" /></TableCell>
                      <TableCell><Skeleton className="ml-auto h-3 w-8" /></TableCell>
                      <TableCell><Skeleton className="ml-auto h-3 w-10" /></TableCell>
                      <TableCell><Skeleton className="ml-auto h-3 w-10" /></TableCell>
                      <TableCell><Skeleton className="h-3 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-12 rounded-md" /></TableCell>
                      <TableCell><Skeleton className="size-6 rounded-md" /></TableCell>
                    </TableRow>
                  ))
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-56 p-6 text-center">
                      <div className="mx-auto max-w-sm">
                        <p className="text-xs font-medium">{euSearch || euRatePlanFilter !== "all" || euStatusFilter !== "all" ? "No matching customers" : "No customers yet"}</p>
                        <p className="mt-2 text-[10px] leading-5 text-muted-foreground">
                          {euSearch || euRatePlanFilter !== "all" || euStatusFilter !== "all"
                            ? "Try changing your search or filters."
                            : <>Pass a stable customer identifier in the <code className="rounded bg-background/60 px-1 py-0.5 font-mono text-[9px] text-foreground">user</code> field of an AI request. Cencori will begin metering automatically.</>}
                        </p>
                      </div>
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

            <footer className="flex min-h-12 items-center justify-between gap-3 border-t border-black/[0.055] px-4 py-2 dark:border-white/[0.055]">
              {euIsLoading ? (
                <Skeleton className="h-3 w-20" />
              ) : (
                <p className="text-[10px] tabular-nums text-muted-foreground">
                  {pagination ? `${fmtNum(pagination.total)} ${pagination.total === 1 ? "customer" : "customers"}` : "0 customers"}
                </p>
              )}

              {pagination && pagination.total_pages > 1 && (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="size-7" disabled={euPage <= 1} onClick={() => setEuPage(euPage - 1)} aria-label="Previous customers">
                    <ChevronLeft className="size-3.5" />
                  </Button>
                  <span className="min-w-16 text-center text-[9px] tabular-nums text-muted-foreground">{euPage} / {pagination.total_pages}</span>
                  <Button variant="ghost" size="icon" className="size-7" disabled={euPage >= pagination.total_pages} onClick={() => setEuPage(euPage + 1)} aria-label="Next customers">
                    <ChevronRight className="size-3.5" />
                  </Button>
                </div>
              )}
            </footer>
          </section>
        </div>
      )}

      {/* ═══════════════════════ Pricing Tab ═══════════════════════ */}
      {tab === "rate_plans" && (
        <>
          <section aria-labelledby="pricing-plans-heading">
            <header className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 id="pricing-plans-heading" className="text-sm font-medium tracking-[-0.015em]">Pricing plans</h2>
                <p className="mt-1 text-[10px] text-muted-foreground">Define what customers can use, what they pay, and what happens at their limits.</p>
              </div>
              <Button size="sm" className="h-8 px-3 text-xs" onClick={openRpCreate}>Create plan</Button>
            </header>

          {Array.isArray(ratePlans) && ratePlans.length === 0 ? (
            <div className="flex min-h-[320px] items-center justify-center rounded-xl bg-[#f3f3f1] px-6 text-center ring-1 ring-inset ring-black/[0.05] dark:bg-[#111111] dark:ring-white/[0.045]">
              <div className="max-w-sm">
                <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-background/70 ring-1 ring-inset ring-border/35">
                  <Layers className="size-4 text-muted-foreground" />
                </div>
                <h3 className="mt-4 text-sm font-medium">No pricing plans</h3>
                <p className="mx-auto mt-2 max-w-[38ch] text-[11px] leading-5 text-muted-foreground">Start with one plan that defines usage limits, pricing, and model access for your customers.</p>
                <Button size="sm" className="mt-5 h-8 px-3 text-xs" onClick={openRpCreate}>Create your first plan</Button>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl bg-[#f3f3f1] ring-1 ring-inset ring-black/[0.05] dark:bg-[#111111] dark:ring-white/[0.045]">
              {(Array.isArray(ratePlans) ? ratePlans : []).map((plan) => (
                <article key={plan.id} className="border-b border-black/[0.055] last:border-b-0 dark:border-white/[0.055]">
                  <header className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-medium tracking-[-0.015em]">{plan.name}</h3>
                        {plan.is_default && (
                          <Badge variant="secondary" className="h-5 rounded px-1.5 font-mono text-[8px] uppercase tracking-[0.08em]">Default</Badge>
                        )}
                      </div>
                      <p className="mt-1 font-mono text-[9px] text-muted-foreground">{plan.slug} · {plan.currency}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button variant="outline" size="sm" className="h-7 gap-1.5 bg-background/45 px-2.5 text-[10px]" onClick={() => openRpEdit(plan)}>
                        <Pencil className="size-3" /> Edit
                      </Button>
                      <Button variant="ghost" size="icon-xs" className="text-muted-foreground hover:bg-red-500/10 hover:text-red-500" onClick={() => setRpDeleteTarget(plan)} aria-label={`Delete ${plan.name}`}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </header>

                  <div className="grid border-y border-black/[0.045] dark:border-white/[0.045] sm:grid-cols-2 lg:grid-cols-4">
                    <div className="border-b border-black/[0.045] px-5 py-4 dark:border-white/[0.045] sm:border-r lg:border-b-0">
                      <p className="text-[9px] text-muted-foreground">Token allowance</p>
                      <p className="mt-2 font-mono text-base font-medium tracking-[-0.035em]">{plan.daily_token_limit ? `${formatRatePlanNum(plan.daily_token_limit)}/day` : "Unlimited"}</p>
                      <p className="mt-1 text-[9px] text-muted-foreground">{plan.monthly_token_limit ? `${formatRatePlanNum(plan.monthly_token_limit)}/month` : "No monthly limit"}</p>
                    </div>
                    <div className="border-b border-black/[0.045] px-5 py-4 dark:border-white/[0.045] lg:border-b-0 lg:border-r">
                      <p className="text-[9px] text-muted-foreground">Request allowance</p>
                      <p className="mt-2 font-mono text-base font-medium tracking-[-0.035em]">{plan.daily_request_limit ? `${formatRatePlanNum(plan.daily_request_limit)}/day` : "Unlimited"}</p>
                      <p className="mt-1 text-[9px] text-muted-foreground">{plan.requests_per_minute ? `${formatRatePlanNum(plan.requests_per_minute)} per minute` : plan.monthly_request_limit ? `${formatRatePlanNum(plan.monthly_request_limit)}/month` : "No rate limit"}</p>
                    </div>
                    <div className="border-b border-black/[0.045] px-5 py-4 dark:border-white/[0.045] sm:border-b-0 sm:border-r">
                      <p className="text-[9px] text-muted-foreground">Customer spend limit</p>
                      <p className="mt-2 font-mono text-base font-medium tracking-[-0.035em]">{plan.daily_cost_limit_usd ? `${formatUSD(plan.daily_cost_limit_usd, plan.currency)}/day` : "No limit"}</p>
                      <p className="mt-1 text-[9px] text-muted-foreground">{plan.monthly_cost_limit_usd ? `${formatUSD(plan.monthly_cost_limit_usd, plan.currency)}/month` : "No monthly limit"}</p>
                    </div>
                    <div className="px-5 py-4">
                      <p className="text-[9px] text-muted-foreground">Customer pricing</p>
                      <p className="mt-2 font-mono text-base font-medium tracking-[-0.035em]">{plan.markup_percentage ? `${plan.markup_percentage}% markup` : "At cost"}</p>
                      <p className="mt-1 text-[9px] text-muted-foreground">{plan.flat_rate_per_request ? `+${formatUSD(plan.flat_rate_per_request, plan.currency)}/request` : `${plan.platform_commission_percentage ?? 0}% platform commission`}</p>
                    </div>
                  </div>

                  <footer className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className="mr-1 text-[9px] text-muted-foreground">Model access</span>
                      {plan.allowed_models && plan.allowed_models.length > 0 ? plan.allowed_models.map((model) => (
                        <span key={model} className="rounded bg-background/65 px-1.5 py-1 font-mono text-[8px] text-muted-foreground ring-1 ring-inset ring-border/30">{model}</span>
                      )) : (
                        <span className="text-[9px] text-foreground/80">All models</span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-[9px] text-muted-foreground">
                      <span><span className="font-mono text-foreground">{plan.end_user_count ?? 0}</span> customers</span>
                      <span className={cn("rounded px-1.5 py-1 font-mono text-[8px] uppercase tracking-[0.06em]", OVERAGE_COLORS[plan.overage_action] || "bg-secondary text-secondary-foreground")}>{OVERAGE_LABELS[plan.overage_action] || plan.overage_action}</span>
                    </div>
                  </footer>
                </article>
              ))}
            </div>
          )}
          </section>

          {/* Create / Edit Dialog */}
          <Dialog open={rpDialogOpen} onOpenChange={(open) => { if (!open) closeRpDialog(); else setRpDialogOpen(true); }}>
            <DialogContent className="max-h-[88vh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden border-black/[0.08] p-0 dark:border-white/[0.08] sm:max-w-[720px]">
              <DialogHeader className="border-b border-border/35 px-6 py-5 pr-12">
                <DialogTitle className="text-base font-medium tracking-[-0.02em]">{rpEditingPlan ? "Edit pricing plan" : "Create pricing plan"}</DialogTitle>
                <DialogDescription className="mt-1 text-[11px]">
                  {rpEditingPlan ? "Update how this plan meters usage, charges customers, and handles limits." : "Set customer access, usage limits, and pricing in one plan."}
                </DialogDescription>
              </DialogHeader>

              <div className="min-h-0 overflow-y-auto">
                <section className="space-y-4 border-b border-border/35 px-6 py-5">
                  <header>
                    <h3 className="text-xs font-medium">Plan details</h3>
                    <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Name the plan and choose its billing currency.</p>
                  </header>
                  <div className="rounded-lg bg-muted/30 p-4 ring-1 ring-inset ring-border/30">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="plan-name" className="text-[10px]">Name</Label>
                        <Input id="plan-name" placeholder="Starter" className="h-9 text-xs" value={rpForm.name} onChange={(e) => handleRpNameChange(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="plan-slug" className="text-[10px]">Slug</Label>
                        <Input id="plan-slug" placeholder="starter" className="h-9 font-mono text-xs" value={rpForm.slug} onChange={(e) => { setRpNameManual(true); setRpForm(prev => ({ ...prev, slug: e.target.value })); }} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px]">Currency</Label>
                        <Select value={rpForm.currency} onValueChange={(v) => setRpForm(prev => ({ ...prev, currency: v }))}>
                          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select currency" /></SelectTrigger>
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
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-border/30 pt-4">
                      <div>
                        <Label className="text-[10px]">Default plan</Label>
                        <p className="mt-0.5 text-[9px] text-muted-foreground">Assign this plan to newly identified customers.</p>
                      </div>
                      <Switch checked={rpForm.is_default} onCheckedChange={(checked) => setRpForm(prev => ({ ...prev, is_default: checked }))} />
                    </div>
                  </div>
                </section>

                <section className="space-y-4 border-b border-border/35 px-6 py-5">
                  <header>
                    <h3 className="text-xs font-medium">Usage limits</h3>
                    <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Leave a field empty when that limit should not apply.</p>
                  </header>
                  <div className="space-y-4 rounded-lg bg-muted/30 p-4 ring-1 ring-inset ring-border/30">
                    <fieldset>
                      <legend className="mb-2 text-[10px] font-medium">Tokens</legend>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5"><Label htmlFor="daily-tokens" className="text-[9px] text-muted-foreground">Per day</Label><Input id="daily-tokens" type="number" placeholder="100000" className="h-9 text-xs" value={rpForm.daily_token_limit} onChange={(e) => setRpForm(prev => ({ ...prev, daily_token_limit: e.target.value }))} /></div>
                        <div className="space-y-1.5"><Label htmlFor="monthly-tokens" className="text-[9px] text-muted-foreground">Per month</Label><Input id="monthly-tokens" type="number" placeholder="1000000" className="h-9 text-xs" value={rpForm.monthly_token_limit} onChange={(e) => setRpForm(prev => ({ ...prev, monthly_token_limit: e.target.value }))} /></div>
                      </div>
                    </fieldset>
                    <fieldset className="border-t border-border/30 pt-4">
                      <legend className="mb-2 text-[10px] font-medium">Requests</legend>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="space-y-1.5"><Label htmlFor="daily-requests" className="text-[9px] text-muted-foreground">Per day</Label><Input id="daily-requests" type="number" placeholder="1000" className="h-9 text-xs" value={rpForm.daily_request_limit} onChange={(e) => setRpForm(prev => ({ ...prev, daily_request_limit: e.target.value }))} /></div>
                        <div className="space-y-1.5"><Label htmlFor="monthly-requests" className="text-[9px] text-muted-foreground">Per month</Label><Input id="monthly-requests" type="number" placeholder="10000" className="h-9 text-xs" value={rpForm.monthly_request_limit} onChange={(e) => setRpForm(prev => ({ ...prev, monthly_request_limit: e.target.value }))} /></div>
                        <div className="space-y-1.5"><Label htmlFor="rpm" className="text-[9px] text-muted-foreground">Per minute</Label><Input id="rpm" type="number" placeholder="60" className="h-9 text-xs" value={rpForm.requests_per_minute} onChange={(e) => setRpForm(prev => ({ ...prev, requests_per_minute: e.target.value }))} /></div>
                      </div>
                    </fieldset>
                    <fieldset className="border-t border-border/30 pt-4">
                      <legend className="mb-2 text-[10px] font-medium">Customer spend · {rpForm.currency}</legend>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5"><Label htmlFor="daily-cost" className="text-[9px] text-muted-foreground">Per day</Label><Input id="daily-cost" type="number" step="0.01" placeholder="5.00" className="h-9 text-xs" value={rpForm.daily_cost_limit_usd} onChange={(e) => setRpForm(prev => ({ ...prev, daily_cost_limit_usd: e.target.value }))} /></div>
                        <div className="space-y-1.5"><Label htmlFor="monthly-cost" className="text-[9px] text-muted-foreground">Per month</Label><Input id="monthly-cost" type="number" step="0.01" placeholder="50.00" className="h-9 text-xs" value={rpForm.monthly_cost_limit_usd} onChange={(e) => setRpForm(prev => ({ ...prev, monthly_cost_limit_usd: e.target.value }))} /></div>
                      </div>
                    </fieldset>
                  </div>
                </section>

                <section className="space-y-4 border-b border-border/35 px-6 py-5">
                  <header>
                    <h3 className="text-xs font-medium">Customer pricing</h3>
                    <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Set how usage turns into customer revenue.</p>
                  </header>
                  <div className="grid gap-3 rounded-lg bg-muted/30 p-4 ring-1 ring-inset ring-border/30 sm:grid-cols-3">
                    <div className="space-y-1.5"><Label htmlFor="rp-markup-pct" className="text-[9px] text-muted-foreground">Provider cost markup</Label><Input id="rp-markup-pct" type="number" step="0.1" placeholder="20" className="h-9 text-xs" value={rpForm.markup_percentage} onChange={(e) => setRpForm(prev => ({ ...prev, markup_percentage: e.target.value }))} /></div>
                    <div className="space-y-1.5"><Label htmlFor="rp-commission-pct" className="text-[9px] text-muted-foreground">Platform commission</Label><Input id="rp-commission-pct" type="number" step="0.1" placeholder="20" className="h-9 text-xs" value={rpForm.platform_commission_percentage} onChange={(e) => setRpForm(prev => ({ ...prev, platform_commission_percentage: e.target.value }))} /></div>
                    <div className="space-y-1.5"><Label htmlFor="flat-rate" className="text-[9px] text-muted-foreground">Flat rate per request · {rpForm.currency}</Label><Input id="flat-rate" type="number" step="0.001" placeholder="0.002" className="h-9 text-xs" value={rpForm.flat_rate_per_request} onChange={(e) => setRpForm(prev => ({ ...prev, flat_rate_per_request: e.target.value }))} /></div>
                  </div>
                </section>

                <section className="space-y-4 px-6 py-5">
                  <header>
                    <h3 className="text-xs font-medium">Access and limits</h3>
                    <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Control model access and the response to exceeded limits.</p>
                  </header>
                  <div className="grid gap-4 rounded-lg bg-muted/30 p-4 ring-1 ring-inset ring-border/30 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="allowed-models" className="text-[10px]">Allowed models</Label>
                      <Input id="allowed-models" placeholder="gpt-4o, claude-sonnet-4" className="h-9 font-mono text-xs" value={rpForm.allowed_models} onChange={(e) => setRpForm(prev => ({ ...prev, allowed_models: e.target.value }))} />
                      <p className="text-[9px] text-muted-foreground">Comma-separated. Empty allows every model.</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px]">When a limit is reached</Label>
                      <Select value={rpForm.overage_action} onValueChange={(v) => setRpForm(prev => ({ ...prev, overage_action: v as RatePlanForm["overage_action"] }))}>
                        <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="block" className="text-xs">Block further requests</SelectItem>
                          <SelectItem value="alert_only" className="text-xs">Continue and send an alert</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </section>
              </div>

              <DialogFooter className="border-t border-border/35 bg-background px-6 py-4">
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={closeRpDialog}>Cancel</Button>
                <Button size="sm" className="h-8 text-xs" onClick={handleRpSubmit} disabled={rpIsSaving || !rpForm.name.trim() || !rpForm.slug.trim()}>
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
                <AlertDialogTitle className="text-base">Delete pricing plan</AlertDialogTitle>
                <AlertDialogDescription className="text-xs">
                  Are you sure you want to delete <span className="font-medium text-foreground">{rpDeleteTarget?.name}</span>?
                  {(rpDeleteTarget?.end_user_count ?? 0) > 0 && (
                    <span className="block mt-1 text-amber-500">
                      This plan has {rpDeleteTarget?.end_user_count} customer{(rpDeleteTarget?.end_user_count ?? 0) !== 1 ? "s" : ""} assigned.
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
        <section className="space-y-5" aria-labelledby="revenue-overview-heading">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="revenue-overview-heading" className="text-sm font-medium tracking-[-0.015em]">Revenue overview</h2>
              <p className="mt-1 max-w-[54ch] text-[10px] leading-4 text-muted-foreground">
                Customer revenue, provider cost, margin, and billing activity.
              </p>
            </div>
            {enabled && (
              <div className="flex items-center gap-2">
                <Select value={period} onValueChange={(v: "7d" | "30d" | "90d") => setPeriod(v)}>
                  <SelectTrigger className="h-8 w-[108px] bg-background text-[11px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7d" className="text-xs">7 days</SelectItem>
                    <SelectItem value="30d" className="text-xs">30 days</SelectItem>
                    <SelectItem value="90d" className="text-xs">90 days</SelectItem>
                  </SelectContent>
                </Select>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 px-3 text-[11px]">
                      <Download className="h-3.5 w-3.5" />
                      Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    {isDemo ? (
                      <>
                        <DropdownMenuItem onSelect={() => stats && downloadRevenueExport("csv", stats, period)}>Export CSV</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => stats && downloadRevenueExport("json", stats, period)}>Export JSON</DropdownMenuItem>
                      </>
                    ) : (
                      <>
                        <DropdownMenuItem asChild>
                          <a href={`/api/projects/${projectId}/end-user-billing/export?format=csv&period=${period}`} download>
                            Export CSV
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <a href={`/api/projects/${projectId}/end-user-billing/export?format=json&period=${period}`} download>
                            Export JSON
                          </a>
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </header>

          {!enabled ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl bg-[#f3f3f1] px-6 text-center ring-1 ring-inset ring-black/[0.05] dark:bg-[#111111] dark:ring-white/[0.045]">
              <p className="text-sm font-medium tracking-[-0.015em]">Revenue tracking is off</p>
              <p className="mt-2 max-w-[46ch] text-[11px] leading-5 text-muted-foreground">
                Enable usage billing to calculate customer revenue, provider cost, margin, and invoices.
              </p>
              <Button size="sm" className="mt-5 h-8 px-3 text-[11px]" onClick={() => setTab("configuration")}>
                Configure billing
              </Button>
            </div>
          ) : (
            <>
              <div className="grid overflow-hidden rounded-xl bg-[#f3f3f1] ring-1 ring-inset ring-black/[0.05] dark:bg-[#111111] dark:ring-white/[0.045] md:grid-cols-2">
                {[
                  {
                    label: "Provider cost",
                    value: fmt(stats?.provider_cost_usd ?? 0),
                    description: "Underlying AI spend",
                    dataKey: "cost",
                    formatChartValue: fmt,
                  },
                  {
                    label: "Customer revenue",
                    value: fmt(stats?.customer_revenue_usd ?? 0),
                    description: "Gross usage revenue",
                    dataKey: "revenue",
                    formatChartValue: fmt,
                  },
                  {
                    label: "Margin",
                    value: fmt(stats?.margin_usd ?? 0),
                    description: "Revenue after provider cost",
                    dataKey: "margin",
                    formatChartValue: fmt,
                  },
                  {
                    label: "Margin rate",
                    value: fmtPct(stats?.margin_percentage ?? 0),
                    description: "Margin as a share of revenue",
                    dataKey: "margin_rate",
                    formatChartValue: fmtPct,
                  },
                ].map((stat) => (
                  <article
                    key={stat.label}
                    className="overflow-hidden border-b border-black/[0.055] dark:border-white/[0.055] md:[&:nth-child(odd)]:border-r"
                  >
                    <div className="flex items-start justify-between gap-4 px-5 pt-5">
                      <div>
                        <p className="text-[11px] font-medium text-muted-foreground">{stat.label}</p>
                        {statsLoading ? (
                          <Skeleton className="mt-3 h-8 w-24" />
                        ) : (
                          <p className="mt-2 font-mono text-2xl font-medium tracking-[-0.04em] tabular-nums">{stat.value}</p>
                        )}
                      </div>
                      <p className="pt-0.5 text-right text-[9px] text-muted-foreground">{stat.description}</p>
                    </div>

                    <div className="relative mt-6 h-[228px] w-full px-4 pb-4">
                      {statsLoading ? (
                        <Skeleton className="h-full w-full rounded-md" />
                      ) : (
                        <>
                          <ChartContainer
                            config={{
                              [stat.dataKey]: { label: stat.label, color: "var(--foreground)" },
                            }}
                            className="h-full w-full"
                          >
                            <LineChart data={revenueChartData} margin={{ top: 8, right: 24, bottom: 0, left: 24 }}>
                              <CartesianGrid
                                vertical={false}
                                stroke="hsl(var(--border))"
                                strokeDasharray="3 3"
                                strokeOpacity={0.38}
                              />
                              <XAxis
                                dataKey="date"
                                ticks={revenueDateTicks}
                                axisLine={false}
                                tickLine={false}
                                tickMargin={9}
                                interval={0}
                                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                                tickFormatter={formatChartDate}
                              />
                              <ChartTooltip
                                cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: "3 3", strokeOpacity: 0.3 }}
                                content={(
                                  <ChartTooltipContent
                                    indicator="line"
                                    labelFormatter={(label) => formatChartDate(String(label))}
                                    formatter={(value) => stat.formatChartValue(Number(value))}
                                  />
                                )}
                              />
                              <Line
                                type="monotone"
                                dataKey={stat.dataKey}
                                stroke={`var(--color-${stat.dataKey})`}
                                strokeOpacity={0.72}
                                strokeWidth={1.6}
                                dot={false}
                                activeDot={{ r: 3, strokeWidth: 0 }}
                                isAnimationActive={false}
                              />
                            </LineChart>
                          </ChartContainer>
                          {!hasRevenueChartData && (
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-5" aria-label={`No ${stat.label.toLowerCase()} data for this period`}>
                              <span className="rounded-md bg-primary/50 px-2.5 py-1 text-[10px] text-primary-foreground/80">
                                No data for this period
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </article>
                ))}

                <article className="overflow-hidden md:col-span-2">
                  <header className="flex flex-col gap-4 border-b border-black/[0.055] px-5 py-4 dark:border-white/[0.055] sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div>
                      <h3 className="text-sm font-medium tracking-[-0.015em]">Revenue and cost</h3>
                      <p className="mt-1 text-[10px] text-muted-foreground">Daily customer revenue compared with underlying provider spend.</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1" aria-label="Revenue chart series">
                      {REVENUE_SERIES.map((series) => {
                        const isVisible = !hiddenRevenueSeries.has(series.key);

                        return (
                          <button
                            key={series.key}
                            type="button"
                            aria-pressed={isVisible}
                            onClick={() => toggleRevenueSeries(series.key)}
                            title={`${isVisible ? "Hide" : "Show"} ${series.label}`}
                            className={cn(
                              "group flex min-h-8 items-center justify-center gap-2 rounded-sm px-2.5 text-[10px] transition-[background-color,opacity,transform] duration-200 hover:bg-muted/30 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                              isVisible ? "opacity-100" : "opacity-35"
                            )}
                          >
                            <span
                              aria-hidden="true"
                              className="flex size-3 shrink-0 items-center justify-center rounded-[3px] border transition-colors duration-200"
                              style={{
                                borderColor: series.color,
                                backgroundColor: isVisible ? series.color : "transparent",
                              }}
                            >
                              <svg
                                viewBox="0 0 10 10"
                                className={cn("size-2.5 text-black transition-opacity duration-200", isVisible ? "opacity-100" : "opacity-0")}
                                fill="none"
                              >
                                <path d="M2 5.2 4.1 7.1 8 2.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </span>
                            <span className="text-muted-foreground">{series.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </header>
                  <div className="relative h-[320px] px-4 pb-4 pt-6 sm:px-6">
                    {statsLoading ? (
                      <Skeleton className="h-full w-full rounded-md" />
                    ) : (
                      <>
                        <ChartContainer
                          config={{
                            revenue: { label: "Revenue", color: REVENUE_SERIES[0].color },
                            cost: { label: "Cost", color: REVENUE_SERIES[1].color },
                          }}
                          className="h-full w-full"
                        >
                          <BarChart data={revenueChartData} margin={{ left: 24, right: 24, top: 8, bottom: 0 }}>
                            <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" strokeOpacity={0.34} />
                            <XAxis
                              dataKey="date"
                              ticks={revenueDateTicks}
                              tickLine={false}
                              axisLine={false}
                              interval={0}
                              tickMargin={10}
                              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                              tickFormatter={formatChartDate}
                            />
                            <ChartTooltip
                              cursor={{ fill: "hsl(var(--muted)/0.25)" }}
                              content={<ChartTooltipContent labelFormatter={(label) => formatChartDate(String(label))} formatter={(value) => fmt(Number(value))} />}
                            />
                            <Bar dataKey="cost" stackId="billing" fill="var(--color-cost)" fillOpacity={0.72} hide={hiddenRevenueSeries.has("cost")} />
                            <Bar dataKey="revenue" stackId="billing" fill="var(--color-revenue)" fillOpacity={0.82} radius={[3, 3, 0, 0]} hide={hiddenRevenueSeries.has("revenue")} />
                          </BarChart>
                        </ChartContainer>
                        {!hasRevenueChartData && (
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-5" aria-label="No revenue data for this period">
                            <span className="rounded-md bg-primary/50 px-2.5 py-1 text-[10px] text-primary-foreground/80">
                              No data for this period
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </article>
              </div>

              <section className="overflow-hidden rounded-xl bg-[#f3f3f1] ring-1 ring-inset ring-black/[0.05] dark:bg-[#111111] dark:ring-white/[0.045]" aria-labelledby="top-customers-heading">
                <header className="border-b border-black/[0.055] px-5 py-4 dark:border-white/[0.055] sm:px-6">
                  <h3 id="top-customers-heading" className="text-sm font-medium tracking-[-0.015em]">Top customers</h3>
                  <p className="mt-1 text-[10px] text-muted-foreground">Customers contributing the most revenue in this period.</p>
                </header>
                {statsLoading ? (
                  <div className="space-y-2 px-5 py-5 sm:px-6">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
                  </div>
                ) : !stats?.top_users?.length ? (
                  <div className="flex min-h-[132px] items-center justify-center px-5 text-center">
                    <p className="text-[11px] text-muted-foreground">No customer activity for this period.</p>
                  </div>
                ) : (
                  <div className="overflow-auto">
                    <table className="w-full min-w-[680px] text-[11px]">
                      <thead>
                        <tr className="border-b border-black/[0.055] dark:border-white/[0.055]">
                          <th className="px-5 py-3 text-left font-medium text-muted-foreground sm:px-6">Customer ID</th>
                          <th className="py-3 text-right font-medium text-muted-foreground">Requests</th>
                          <th className="py-3 text-right font-medium text-muted-foreground">Tokens</th>
                          <th className="py-3 text-right font-medium text-muted-foreground">Cost</th>
                          <th className="py-3 text-right font-medium text-muted-foreground">Revenue</th>
                          <th className="py-3 pr-5 text-right font-medium text-muted-foreground sm:pr-6">Margin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.top_users.map((u) => (
                          <tr key={u.end_user_id} className="border-b border-black/[0.04] last:border-0 dark:border-white/[0.04]">
                            <td className="px-5 py-3 font-mono text-[10px] sm:px-6">{u.end_user_id}</td>
                            <td className="py-3 text-right tabular-nums">{fmtNum(u.requests)}</td>
                            <td className="py-3 text-right tabular-nums">{fmtNum(u.tokens)}</td>
                            <td className="py-3 text-right font-mono tabular-nums">{fmt(u.provider_cost_usd)}</td>
                            <td className="py-3 text-right font-mono tabular-nums">{fmt(u.customer_revenue_usd)}</td>
                            <td className="py-3 pr-5 text-right font-mono font-medium tabular-nums sm:pr-6">{fmt(u.customer_revenue_usd - u.provider_cost_usd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="overflow-hidden rounded-xl bg-[#f3f3f1] ring-1 ring-inset ring-black/[0.05] dark:bg-[#111111] dark:ring-white/[0.045]" aria-labelledby="invoices-heading">
                <header className="flex items-center justify-between gap-5 border-b border-black/[0.055] px-5 py-4 dark:border-white/[0.055] sm:px-6">
                  <div>
                    <h3 id="invoices-heading" className="text-sm font-medium tracking-[-0.015em]">Invoices</h3>
                    <p className="mt-1 text-[10px] text-muted-foreground">Generate and manage customer invoices.</p>
                  </div>
                  <Button size="sm" className="h-8 px-3 text-[11px]" onClick={() => setInvoiceDialogOpen(true)}>
                    Generate invoices
                  </Button>
                </header>
                {invoicesLoading ? (
                  <div className="space-y-2 px-5 py-5 sm:px-6">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-9 w-full" />)}
                  </div>
                ) : !invoicesData?.invoices?.length ? (
                  <div className="flex min-h-[132px] items-center justify-center px-5 text-center">
                    <p className="max-w-[48ch] text-[11px] leading-5 text-muted-foreground">No invoices yet. Generate invoices after customers have billable usage.</p>
                  </div>
                ) : (
                  <div className="overflow-auto">
                    <table className="w-full min-w-[760px] text-[11px]">
                      <thead>
                        <tr className="border-b border-black/[0.055] dark:border-white/[0.055]">
                          <th className="px-5 py-3 text-left font-medium text-muted-foreground sm:px-6">Customer</th>
                          <th className="py-3 text-left font-medium text-muted-foreground">Period</th>
                          <th className="py-3 text-right font-medium text-muted-foreground">Requests</th>
                          <th className="py-3 text-right font-medium text-muted-foreground">Total</th>
                          <th className="py-3 text-center font-medium text-muted-foreground">Status</th>
                          <th className="py-3 pr-5 text-right font-medium text-muted-foreground sm:pr-6">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoicesData.invoices.map((inv) => (
                          <tr key={inv.id} className="border-b border-black/[0.04] last:border-0 dark:border-white/[0.04]">
                            <td className="px-5 py-3 sm:px-6">
                              <p className="font-medium">{inv.end_user_name || inv.end_user_external_id || "—"}</p>
                              {inv.end_user_email && <p className="mt-0.5 text-[10px] text-muted-foreground">{inv.end_user_email}</p>}
                            </td>
                            <td className="py-3 text-muted-foreground">{inv.period_start} — {inv.period_end}</td>
                            <td className="py-3 text-right tabular-nums">{fmtNum(inv.total_requests)}</td>
                            <td className="py-3 text-right font-mono font-medium tabular-nums">{fmt(parseFloat(String(inv.total_usd)))}</td>
                            <td className="py-3 text-center">
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
                            <td className="py-3 pr-5 text-right text-muted-foreground sm:pr-6">
                              {new Date(inv.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <Dialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Generate Invoices</DialogTitle>
                    <DialogDescription>
                      Generate invoices for all customers with usage in the current billing period.
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
                          <p className="text-xs text-muted-foreground">Create and finalize Stripe invoices for customers with email addresses</p>
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
            </>
          )}
        </section>
      )}
    </main>
  );
}
