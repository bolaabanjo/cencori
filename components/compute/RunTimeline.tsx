"use client";

/**
 * RunTimeline — dashboard client for the Runtime Contract v2 run lifecycle.
 *
 * Starts a run against the agent (via the same-origin proxy), streams the
 * normalized event timeline over EventSource, and drives suspend→resume and
 * cancel. Renders the events the shim emits: run.started · message ·
 * run.suspended · run.output · run.failed · run.completed.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, Square, Loader2, CircleCheck, CircleAlert, Hand, CornerDownRight } from "lucide-react";

type RunStatus = "idle" | "running" | "suspended" | "completed" | "failed" | "canceled";

interface RunEvent {
    seq: number;
    ts: number;
    type: string;
    data?: unknown;
    output?: unknown;
    reason?: string;
    error?: { code: string; message: string };
    status?: string;
}

const KNOWN = ["run.started", "message", "run.suspended", "run.output", "run.failed", "run.completed"] as const;

function parseInput(raw: string): unknown {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    try {
        return JSON.parse(trimmed);
    } catch {
        return trimmed; // plain text → send as the input value
    }
}

function preview(value: unknown, max = 240): string {
    let s: string;
    try {
        s = typeof value === "string" ? value : JSON.stringify(value);
    } catch {
        s = String(value);
    }
    if (s == null) return "—";
    return s.length > max ? s.slice(0, max) + "…" : s;
}

export function RunTimeline({ projectId, agentId }: { projectId: string; agentId: string }) {
    const base = `/api/projects/${projectId}/agents/${agentId}`;
    const [input, setInput] = useState("");
    const [runId, setRunId] = useState<string | null>(null);
    const [status, setStatus] = useState<RunStatus>("idle");
    const [events, setEvents] = useState<RunEvent[]>([]);
    const [suspend, setSuspend] = useState<{ reason?: string; data?: unknown } | null>(null);
    const [resumeInput, setResumeInput] = useState("");
    const [error, setError] = useState<string | null>(null);
    const esRef = useRef<EventSource | null>(null);

    const closeStream = useCallback(() => {
        esRef.current?.close();
        esRef.current = null;
    }, []);

    useEffect(() => closeStream, [closeStream]);

    const openStream = useCallback((id: string) => {
        closeStream();
        const es = new EventSource(`${base}/runs/${id}/events`);
        esRef.current = es;
        const onEvent = (e: MessageEvent) => {
            let rec: RunEvent;
            try {
                rec = JSON.parse(e.data);
            } catch {
                return;
            }
            setEvents((prev) => (prev.some((p) => p.seq === rec.seq) ? prev : [...prev, rec]));
            if (rec.type === "run.suspended") {
                setSuspend({ reason: rec.reason, data: rec.data });
                setStatus("suspended");
            } else if (rec.type === "run.completed") {
                const final = (rec.status as RunStatus) ?? "completed";
                setStatus(final);
                closeStream(); // terminal — stop EventSource auto-reconnect
            } else if (rec.type === "run.failed") {
                setError(rec.error?.message ?? "Run failed");
            }
        };
        for (const t of KNOWN) es.addEventListener(t, onEvent as EventListener);
        es.onerror = () => {
            // EventSource auto-reconnects (resumes via Last-Event-ID) unless terminal.
            if (status === "completed" || status === "failed" || status === "canceled") closeStream();
        };
    }, [base, closeStream, status]);

    const start = useCallback(async () => {
        setError(null);
        setEvents([]);
        setSuspend(null);
        setStatus("running");
        try {
            const res = await fetch(`${base}/runs`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ input: parseInput(input) }),
            });
            const body = await res.json();
            if (!res.ok) {
                setStatus("idle");
                setError(body?.message ?? body?.error ?? "Could not start the run.");
                return;
            }
            setRunId(body.id);
            openStream(body.id);
        } catch {
            setStatus("idle");
            setError("Could not reach the runtime.");
        }
    }, [base, input, openStream]);

    const cancel = useCallback(async () => {
        if (!runId) return;
        await fetch(`${base}/runs/${runId}/cancel`, { method: "POST" }).catch(() => undefined);
    }, [base, runId]);

    const resume = useCallback(async () => {
        if (!runId) return;
        setStatus("running");
        setSuspend(null);
        await fetch(`${base}/runs/${runId}/resume`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ resume: parseInput(resumeInput) }),
        }).catch(() => undefined);
        setResumeInput("");
    }, [base, runId, resumeInput]);

    const running = status === "running";
    const output = [...events].reverse().find((e) => e.type === "run.output")?.output;

    return (
        <div className="p-4 space-y-3">
            {/* Input */}
            <div className="space-y-2">
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder='Input — plain text, or JSON like {"messages":[{"role":"user","content":"hi"}]}'
                    rows={3}
                    className="w-full resize-y rounded-md border border-border/40 bg-background/60 px-3 py-2 font-mono text-[12px] outline-none focus:border-border"
                    disabled={running}
                />
                <div className="flex items-center gap-2">
                    {running || status === "suspended" ? (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={cancel}>
                            <Square className="h-3 w-3 mr-1.5" /> Cancel
                        </Button>
                    ) : (
                        <Button size="sm" className="h-7 text-xs" onClick={start}>
                            <Play className="h-3 w-3 mr-1.5" /> Run
                        </Button>
                    )}
                    <StatusPill status={status} />
                    {runId && <span className="font-mono text-[10px] text-muted-foreground/60">run {runId.slice(0, 8)}</span>}
                </div>
            </div>

            {error && (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-400">{error}</div>
            )}

            {/* Timeline */}
            {events.length > 0 && (
                <div className="rounded-md border border-border/30 divide-y divide-border/20">
                    {events.map((e) => (
                        <EventRow key={e.seq} e={e} />
                    ))}
                </div>
            )}

            {/* Suspended → resume */}
            {status === "suspended" && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                    <div className="flex items-center gap-2 text-[12px] text-amber-500">
                        <Hand className="h-3.5 w-3.5" /> Awaiting input{suspend?.reason ? ` · ${suspend.reason}` : ""}
                    </div>
                    {suspend?.data != null && (
                        <pre className="overflow-x-auto rounded bg-background/50 p-2 font-mono text-[11px] text-muted-foreground">{preview(suspend.data, 500)}</pre>
                    )}
                    <div className="flex items-center gap-2">
                        <input
                            value={resumeInput}
                            onChange={(e) => setResumeInput(e.target.value)}
                            placeholder="Resume value (text or JSON)"
                            className="flex-1 rounded-md border border-border/40 bg-background/60 px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-border"
                            onKeyDown={(e) => e.key === "Enter" && resume()}
                        />
                        <Button size="sm" className="h-7 text-xs" onClick={resume}>
                            <CornerDownRight className="h-3 w-3 mr-1.5" /> Resume
                        </Button>
                    </div>
                </div>
            )}

            {/* Final output */}
            {(status === "completed" || status === "canceled") && output != null && (
                <div className="rounded-md border border-emerald-500/25 bg-emerald-500/[0.06] p-3">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-mono mb-1.5">Output</div>
                    <pre className="overflow-x-auto font-mono text-[11.5px] leading-relaxed">{preview(output, 2000)}</pre>
                </div>
            )}
        </div>
    );
}

function EventRow({ e }: { e: RunEvent }) {
    const meta = rowMeta(e);
    return (
        <div className="flex items-start gap-2.5 px-3 py-2">
            <span className={`mt-0.5 shrink-0 ${meta.color}`}>{meta.icon}</span>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">{meta.label}</span>
                </div>
                {meta.body && <div className="mt-0.5 truncate font-mono text-[11.5px] text-foreground/80">{meta.body}</div>}
            </div>
        </div>
    );
}

function rowMeta(e: RunEvent): { icon: React.ReactNode; color: string; label: string; body?: string } {
    switch (e.type) {
        case "run.started":
            return { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, color: "text-sky-400", label: "started" };
        case "message":
            return { icon: <CornerDownRight className="h-3.5 w-3.5" />, color: "text-muted-foreground", label: "message", body: preview(e.data) };
        case "run.suspended":
            return { icon: <Hand className="h-3.5 w-3.5" />, color: "text-amber-500", label: `suspended${e.reason ? ` · ${e.reason}` : ""}`, body: preview(e.data) };
        case "run.output":
            return { icon: <CircleCheck className="h-3.5 w-3.5" />, color: "text-emerald-500", label: "output", body: preview(e.output) };
        case "run.failed":
            return { icon: <CircleAlert className="h-3.5 w-3.5" />, color: "text-red-500", label: "failed", body: e.error?.message };
        case "run.completed":
            return { icon: <CircleCheck className="h-3.5 w-3.5" />, color: "text-muted-foreground", label: `completed · ${e.status ?? "done"}` };
        default:
            return { icon: <CornerDownRight className="h-3.5 w-3.5" />, color: "text-muted-foreground", label: e.type };
    }
}

function StatusPill({ status }: { status: RunStatus }) {
    const map: Record<RunStatus, { dot: string; text: string; label: string }> = {
        idle: { dot: "bg-muted-foreground", text: "text-muted-foreground", label: "Idle" },
        running: { dot: "bg-sky-500 animate-pulse", text: "text-sky-400", label: "Running" },
        suspended: { dot: "bg-amber-500 animate-pulse", text: "text-amber-500", label: "Suspended" },
        completed: { dot: "bg-emerald-500", text: "text-emerald-500", label: "Completed" },
        failed: { dot: "bg-red-500", text: "text-red-500", label: "Failed" },
        canceled: { dot: "bg-muted-foreground", text: "text-muted-foreground", label: "Canceled" },
    };
    const s = map[status];
    return (
        <span className="inline-flex items-center gap-1.5 text-[11px]">
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            <span className={s.text}>{s.label}</span>
        </span>
    );
}
