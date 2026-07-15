"use client";

import { useState, use } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Badge } from "@/components/ui/badge";
import { Download, Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

interface AuditLogEntry {
    id: string;
    category: string;
    action: string;
    resource_type: string;
    resource_id: string | null;
    project_id: string | null;
    actor_email: string | null;
    actor_ip: string | null;
    actor_type: string;
    description: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
}

interface Project {
    id: string;
    name: string;
}

const CATEGORIES = [
    { value: "all", label: "All Categories" },
    { value: "project", label: "Project" },
    { value: "api_key", label: "API Key" },
    { value: "agent", label: "Agent" },
    { value: "member", label: "Member" },
    { value: "security", label: "Security" },
    { value: "billing", label: "Billing" },
    { value: "provider", label: "Provider" },
    { value: "webhook", label: "Webhook" },
    { value: "sso", label: "SSO" },
    { value: "settings", label: "Settings" },
    { value: "budget", label: "Budget" },
    { value: "prompt", label: "Prompt" },
    { value: "cache", label: "Cache" },
    { value: "integration", label: "Integration" },
    { value: "memory", label: "Memory" },
    { value: "export", label: "Export" },
];

const TIME_RANGES = [
    { value: "1h", label: "Last hour" },
    { value: "24h", label: "Last 24h" },
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
    { value: "90d", label: "Last 90 days" },
    { value: "all", label: "All time" },
];

const CATEGORY_COLORS: Record<string, string> = {
    project: "bg-blue-500/10 text-blue-500",
    api_key: "bg-amber-500/10 text-amber-500",
    agent: "bg-purple-500/10 text-purple-500",
    member: "bg-green-500/10 text-green-500",
    security: "bg-red-500/10 text-red-500",
    billing: "bg-emerald-500/10 text-emerald-500",
    provider: "bg-cyan-500/10 text-cyan-500",
    webhook: "bg-orange-500/10 text-orange-500",
    sso: "bg-indigo-500/10 text-indigo-500",
    settings: "bg-slate-500/10 text-slate-500",
    budget: "bg-yellow-500/10 text-yellow-500",
    prompt: "bg-pink-500/10 text-pink-500",
    cache: "bg-teal-500/10 text-teal-500",
    integration: "bg-violet-500/10 text-violet-500",
    memory: "bg-rose-500/10 text-rose-500",
    export: "bg-sky-500/10 text-sky-500",
};

function formatDate(date: string) {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;

    return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

interface PageProps {
    params: Promise<{ orgSlug: string }>;
}

export default function AuditLogPage({ params }: PageProps) {
    const { orgSlug } = use(params);
    const [category, setCategory] = useState("all");
    const [timeRange, setTimeRange] = useState("7d");
    const [search, setSearch] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [projectFilter, setProjectFilter] = useState("all");
    const [page, setPage] = useState(1);
    const [expandedRow, setExpandedRow] = useState<string | null>(null);

    // Fetch projects for filter
    const { data: projects } = useQuery<Project[]>({
        queryKey: ["auditLogProjects", orgSlug],
        queryFn: async () => {
            const { data: org } = await supabase
                .from("organizations")
                .select("id")
                .eq("slug", orgSlug)
                .single();
            if (!org) return [];
            const { data } = await supabase
                .from("projects")
                .select("id, name")
                .eq("organization_id", org.id)
                .order("name");
            return (data || []) as Project[];
        },
    });

    // Fetch audit logs
    const { data, isLoading } = useQuery({
        queryKey: ["auditLogs", orgSlug, category, timeRange, search, projectFilter, page],
        queryFn: async () => {
            const params = new URLSearchParams({
                category,
                time_range: timeRange,
                page: String(page),
                per_page: "50",
            });
            if (search) params.set("search", search);
            if (projectFilter !== "all") params.set("project_id", projectFilter);

            const res = await fetch(`/api/organizations/${orgSlug}/audit-logs?${params}`);
            if (!res.ok) throw new Error("Failed to fetch");
            return res.json() as Promise<{
                logs: AuditLogEntry[];
                pagination: { page: number; per_page: number; total: number; total_pages: number };
            }>;
        },
    });

    const logs = data?.logs || [];
    const pagination = data?.pagination;

    const handleSearch = () => {
        setSearch(searchInput);
        setPage(1);
    };

    const handleExport = (format: "csv" | "json") => {
        const params = new URLSearchParams({
            format,
            category,
            time_range: timeRange,
        });
        if (search) params.set("search", search);
        if (projectFilter !== "all") params.set("project_id", projectFilter);
        window.open(`/api/organizations/${orgSlug}/audit-logs?${params}`, "_blank");
    };

    return (
        <div className="flex-1 overflow-auto">
            <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-lg font-semibold">Audit Log</h1>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Track every change across your organization
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleExport("csv")}>
                            <Download className="h-3.5 w-3.5 mr-1.5" />
                            CSV
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleExport("json")}>
                            <Download className="h-3.5 w-3.5 mr-1.5" />
                            JSON
                        </Button>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap gap-2">
                    <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
                        <SelectTrigger className="w-[160px] h-8 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {CATEGORIES.map((c) => (
                                <SelectItem key={c.value} value={c.value} className="text-xs">
                                    {c.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={timeRange} onValueChange={(v) => { setTimeRange(v); setPage(1); }}>
                        <SelectTrigger className="w-[140px] h-8 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {TIME_RANGES.map((t) => (
                                <SelectItem key={t.value} value={t.value} className="text-xs">
                                    {t.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {projects && projects.length > 0 && (
                        <Select value={projectFilter} onValueChange={(v) => { setProjectFilter(v); setPage(1); }}>
                            <SelectTrigger className="w-[160px] h-8 text-xs">
                                <SelectValue placeholder="All projects" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all" className="text-xs">All projects</SelectItem>
                                {projects.map((p) => (
                                    <SelectItem key={p.id} value={p.id} className="text-xs">
                                        {p.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}

                    <div className="flex gap-1">
                        <Input
                            placeholder="Search descriptions..."
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                            className="w-[200px] h-8 text-xs"
                        />
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleSearch}>
                            <Search className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>

                {/* Table */}
                <div className="border rounded-lg">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="text-xs w-[140px]">Time</TableHead>
                                <TableHead className="text-xs w-[100px]">Category</TableHead>
                                <TableHead className="text-xs w-[90px]">Action</TableHead>
                                <TableHead className="text-xs">Description</TableHead>
                                <TableHead className="text-xs w-[160px]">Actor</TableHead>
                                <TableHead className="text-xs w-[40px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                Array.from({ length: 8 }).map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell colSpan={6}>
                                            <div className="h-5 bg-muted animate-pulse rounded" />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : logs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-12">
                                        <p className="text-sm text-muted-foreground">No audit log entries found</p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Events will appear here as changes are made across your organization.
                                        </p>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                logs.map((log) => (
                                    <>
                                        <TableRow
                                            key={log.id}
                                            className="cursor-pointer hover:bg-muted/50"
                                            onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                                        >
                                            <TableCell className="text-xs text-muted-foreground">
                                                {formatDate(log.created_at)}
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant="secondary"
                                                    className={`text-[10px] font-medium ${CATEGORY_COLORS[log.category] || ""}`}
                                                >
                                                    {log.category}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-xs font-mono">{log.action}</span>
                                            </TableCell>
                                            <TableCell className="text-xs max-w-[300px] truncate">
                                                {log.description}
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground truncate">
                                                {log.actor_email || log.actor_type}
                                            </TableCell>
                                            <TableCell>
                                                {log.metadata && Object.keys(log.metadata).length > 0 ? (
                                                    expandedRow === log.id
                                                        ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                                                        : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                                ) : null}
                                            </TableCell>
                                        </TableRow>
                                        {expandedRow === log.id && log.metadata && Object.keys(log.metadata).length > 0 && (
                                            <TableRow key={`${log.id}-detail`}>
                                                <TableCell colSpan={6} className="bg-muted/30 p-0">
                                                    <div className="px-4 py-3 space-y-1.5">
                                                        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
                                                            <div>
                                                                <span className="text-muted-foreground">Resource:</span>{" "}
                                                                <span className="font-mono">{log.resource_type}{log.resource_id ? ` / ${log.resource_id.substring(0, 8)}...` : ""}</span>
                                                            </div>
                                                            {log.actor_ip && (
                                                                <div>
                                                                    <span className="text-muted-foreground">IP:</span>{" "}
                                                                    <span className="font-mono">{log.actor_ip}</span>
                                                                </div>
                                                            )}
                                                            <div>
                                                                <span className="text-muted-foreground">Timestamp:</span>{" "}
                                                                <span className="font-mono">{new Date(log.created_at).toISOString()}</span>
                                                            </div>
                                                        </div>
                                                        <div className="pt-1">
                                                            <span className="text-xs text-muted-foreground">Metadata:</span>
                                                            <pre className="mt-1 text-[11px] font-mono bg-background rounded p-2 overflow-x-auto max-h-[200px]">
                                                                {JSON.stringify(log.metadata, null, 2)}
                                                            </pre>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Pagination */}
                {pagination && pagination.total_pages > 1 && (
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                            {pagination.total} entries
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page <= 1}
                                onClick={() => setPage(page - 1)}
                            >
                                <ChevronLeft className="h-3.5 w-3.5" />
                            </Button>
                            <span className="text-xs text-muted-foreground">
                                Page {page} of {pagination.total_pages}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page >= pagination.total_pages}
                                onClick={() => setPage(page + 1)}
                            >
                                <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
