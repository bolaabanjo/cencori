"use client";

import { use, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ShieldCheck, ShieldAlert, Download, Check, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

interface Health { chain_ok: boolean; entries: number; pending_deadletter: number; complete: boolean }
interface PolicyRow { id: string; name: string; version: number; status: string; created_at: string }
interface ChangeRequest { id: string; action_type: string; payload: Record<string, unknown>; requested_by: string; requested_at: string }
interface TemplateRow { id: string; title: string; description: string; frameworks: string[] }
interface LedgerRow { seq: number; ts: string; event_type: string; decision: string | null; model: string | null; rationale: string | null }

const FRAMEWORKS = ["CBN-AML", "NDPR", "PCI-DSS", "ISO-42001", "SR-11-7"];

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
    return (
        <div className="rounded-lg border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold">{title}</h2>
                {action}
            </div>
            {children}
        </div>
    );
}

export default function GovernanceConsole({ params }: { params: Promise<{ orgSlug: string }> }) {
    const { orgSlug } = use(params);
    const qc = useQueryClient();
    const [framework, setFramework] = useState(FRAMEWORKS[0]);

    const { data: org } = useQuery({
        queryKey: ["gov-org", orgSlug],
        queryFn: async () => {
            const { data, error } = await supabase.from("organizations").select("id").eq("slug", orgSlug).single();
            if (error) throw error;
            return data as { id: string };
        },
    });
    const orgId = org?.id;

    const gov = useMemo(() => async (path: string, init?: RequestInit) => {
        const res = await fetch(`/api/v1/governance/${path}`, {
            ...init,
            headers: { "X-Organization-ID": orgId!, "Content-Type": "application/json", ...(init?.headers || {}) },
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `Request failed (${res.status})`);
        return res.status === 204 ? null : res.json();
    }, [orgId]);

    const enabled = !!orgId;
    const health = useQuery<Health>({ queryKey: ["gov-health", orgId], queryFn: () => gov("health"), enabled });
    const policies = useQuery<{ data: PolicyRow[] }>({ queryKey: ["gov-policies", orgId], queryFn: () => gov("policies"), enabled });
    const requests = useQuery<{ data: ChangeRequest[] }>({ queryKey: ["gov-requests", orgId], queryFn: () => gov("change-requests?status=pending"), enabled });
    const templates = useQuery<{ data: TemplateRow[] }>({ queryKey: ["gov-templates", orgId], queryFn: () => gov("templates"), enabled });
    const ledger = useQuery<{ data: LedgerRow[] }>({ queryKey: ["gov-ledger", orgId], queryFn: () => gov("ledger?limit=20"), enabled });

    const install = useMutation({
        mutationFn: (templateId: string) => gov(`templates/${templateId}/install`, { method: "POST", body: "{}" }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["gov-policies", orgId] }),
    });
    const resolve = useMutation({
        mutationFn: ({ id, decision }: { id: string; decision: "approved" | "rejected" }) =>
            gov(`change-requests/${id}`, { method: "POST", body: JSON.stringify({ decision }) }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["gov-requests", orgId] });
            qc.invalidateQueries({ queryKey: ["gov-policies", orgId] });
        },
    });

    async function downloadEvidence() {
        const pack = await gov(`evidence?framework=${encodeURIComponent(framework)}`);
        const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `evidence-${framework}-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    const h = health.data;

    return (
        <div className="space-y-6 p-6">
            <div>
                <h1 className="text-xl font-semibold">AI Governance</h1>
                <p className="text-sm text-muted-foreground">Policy enforcement, approvals, and the immutable audit ledger.</p>
            </div>

            {/* Ledger health */}
            <Card title="Ledger integrity">
                {h ? (
                    <div className="flex flex-wrap items-center gap-6">
                        <div className="flex items-center gap-2">
                            {h.complete ? <ShieldCheck className="h-5 w-5 text-green-600" /> : <ShieldAlert className="h-5 w-5 text-amber-600" />}
                            <span className="text-sm font-medium">{h.complete ? "Complete & verified" : "Attention needed"}</span>
                        </div>
                        <Stat label="Chain" value={h.chain_ok ? "valid" : "BROKEN"} bad={!h.chain_ok} />
                        <Stat label="Entries" value={h.entries.toLocaleString()} />
                        <Stat label="Pending (dead-letter)" value={String(h.pending_deadletter)} bad={h.pending_deadletter > 0} />
                    </div>
                ) : <Skeleton />}
            </Card>

            {/* Pending approvals */}
            <Card title={`Pending approvals${requests.data?.data.length ? ` (${requests.data.data.length})` : ""}`}>
                {requests.data?.data.length ? (
                    <Table>
                        <TableHeader><TableRow><TableHead>Action</TableHead><TableHead>Requested by</TableHead><TableHead>When</TableHead><TableHead className="text-right">Decision</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {requests.data.data.map((r) => (
                                <TableRow key={r.id}>
                                    <TableCell><Badge variant="outline">{r.action_type}</Badge></TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{r.requested_by.slice(0, 8)}…</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{new Date(r.requested_at).toLocaleString()}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button size="sm" variant="outline" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: r.id, decision: "approved" })}><Check className="mr-1 h-3 w-3" />Approve</Button>
                                            <Button size="sm" variant="ghost" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: r.id, decision: "rejected" })}><X className="mr-1 h-3 w-3" />Reject</Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : <Empty text="No pending approvals. (Approving your own request is blocked — segregation of duties.)" />}
            </Card>

            {/* Active policies */}
            <Card title="Policies">
                {policies.data?.data.length ? (
                    <Table>
                        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Version</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {policies.data.data.map((p) => (
                                <TableRow key={p.id}>
                                    <TableCell className="font-medium">{p.name}</TableCell>
                                    <TableCell>v{p.version}</TableCell>
                                    <TableCell><Badge variant={p.status === "active" ? "default" : "secondary"}>{p.status}</Badge></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : <Empty text="No policies yet. Install a template below to get started." />}
            </Card>

            {/* Templates */}
            <Card title="Starter templates">
                <div className="grid gap-3 sm:grid-cols-2">
                    {templates.data?.data.map((t) => (
                        <div key={t.id} className="rounded-md border p-4">
                            <div className="mb-1 flex items-center justify-between">
                                <span className="text-sm font-medium">{t.title}</span>
                                <Button size="sm" variant="outline" disabled={install.isPending} onClick={() => install.mutate(t.id)}>Install</Button>
                            </div>
                            <p className="mb-2 text-xs text-muted-foreground">{t.description}</p>
                            <div className="flex flex-wrap gap-1">{t.frameworks.map((f) => <Badge key={f} variant="secondary" className="text-[10px]">{f}</Badge>)}</div>
                        </div>
                    ))}
                </div>
            </Card>

            {/* Evidence export */}
            <Card title="Evidence pack" action={
                <div className="flex items-center gap-2">
                    <Select value={framework} onValueChange={setFramework}>
                        <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>{FRAMEWORKS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button size="sm" onClick={downloadEvidence}><Download className="mr-1 h-3 w-3" />Export</Button>
                </div>
            }>
                <p className="text-xs text-muted-foreground">Regulator-ready proof that each {framework} control fired, generated from the immutable ledger with chain-completeness attached.</p>
            </Card>

            {/* Recent decisions */}
            <Card title="Recent decisions">
                {ledger.data?.data.length ? (
                    <Table>
                        <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Event</TableHead><TableHead>Decision</TableHead><TableHead>Rationale</TableHead><TableHead>When</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {ledger.data.data.map((r) => (
                                <TableRow key={r.seq}>
                                    <TableCell className="text-xs text-muted-foreground">{r.seq}</TableCell>
                                    <TableCell className="text-xs">{r.event_type}</TableCell>
                                    <TableCell>{r.decision ? <Badge variant={r.decision === "block" ? "destructive" : "outline"}>{r.decision}</Badge> : "—"}</TableCell>
                                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground">{r.rationale || "—"}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{new Date(r.ts).toLocaleString()}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : <Empty text="No decisions recorded yet." />}
            </Card>
        </div>
    );
}

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
    return (
        <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className={`text-sm font-semibold ${bad ? "text-red-600" : ""}`}>{value}</div>
        </div>
    );
}
function Empty({ text }: { text: string }) { return <p className="py-2 text-sm text-muted-foreground">{text}</p>; }
function Skeleton() { return <div className="h-6 w-48 animate-pulse rounded bg-muted" />; }
