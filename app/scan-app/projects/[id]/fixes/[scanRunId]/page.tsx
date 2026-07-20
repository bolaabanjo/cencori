"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { ScanMarkdownRenderer } from "@/components/scan/ScanMarkdownRenderer";
import { ScanThinkingIndicator } from "@/components/scan/ScanThinkingIndicator";
import { ScanUpgradePanel } from "@/components/scan/ScanUpgradePanel";
import { openScanPaywallFromResponse } from "@/lib/scan/paywall-client";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
} from "@/components/ui/dialog";
import {
    AlertTriangle,
    ArrowLeft,
    ArrowUp,
    ChevronDown,
    Copy,
    GitPullRequest,
    Loader2,
    RotateCcw,
    Square,
    ThumbsDown,
    ThumbsUp,
} from "lucide-react";
import { toast } from "@/components/ui/toast";

interface ScanIssue {
    type: string;
    category?: string;
    severity: "critical" | "high" | "medium" | "low";
    name: string;
    match: string;
    line: number;
    file: string;
    description?: string;
}

interface ScanRun {
    id: string;
    status: string;
    score: string | null;
    files_scanned: number;
    issues_found: number;
    scan_duration_ms: number;
    created_at: string;
    fix_status?: "pending" | "dismissed" | "pr_opened" | "done" | "not_applicable";
    fix_pr_url?: string | null;
    fix_pr_number?: number | null;
    fix_branch_name?: string | null;
    results?: {
        issues?: ScanIssue[];
    };
}

interface ProjectSummary {
    id: string;
    github_repo_full_name: string;
    github_repo_url: string;
}

interface FixProposal {
    id: string;
    file: string;
    line: number;
    issueType: string;
    issueName: string;
    severity: string;
    strategy: "deterministic" | "ai";
    originalCode: string;
    fixedCode: string;
    explanation: string;
    issueKey?: string;
    updatedFileContent?: string;
    aiModel?: string;
}

interface ManualGuidance {
    issueKey: string;
    issueType: string;
    issueName: string;
    severity: string;
    file: string;
    line: number;
    summary: string;
    steps: string[];
}

interface GenerateFixesResponse {
    fixes?: FixProposal[];
    totalIssues?: number;
    deterministicCount?: number;
    aiCount?: number;
    unfixableIssueCount?: number;
    manualGuidance?: ManualGuidance[];
    message?: string;
}

interface ChatMessage {
    role: "user" | "assistant";
    content: string;
    analysis?: string;
    isStreaming?: boolean;
    isError?: boolean;
}

function issueKey(issue: Pick<ScanIssue, "file" | "line" | "type" | "name">): string {
    return `${issue.file}:${issue.line}:${issue.type}:${issue.name}`;
}

function fixIssueKey(fix: FixProposal): string {
    return `${fix.file}:${fix.line}:${fix.issueType}:${fix.issueName}`;
}

function computeDiffStats(original: string, fixed: string): { added: number; removed: number } {
    const originalLines = original.split("\n");
    const fixedLines = fixed.split("\n");
    const max = Math.max(originalLines.length, fixedLines.length);
    let added = 0, removed = 0;
    for (let i = 0; i < max; i++) {
        const before = originalLines[i] ?? "";
        const after = fixedLines[i] ?? "";
        if (before !== after) {
            if (before !== "") removed++;
            if (after !== "") added++;
        }
    }
    return { added, removed };
}

function FileDiffPanel({ fix, defaultOpen = false }: { fix: FixProposal; defaultOpen?: boolean }) {
    const [open, setOpen] = useState(defaultOpen);
    const originalLines = fix.originalCode.split("\n");
    const fixedLines = fix.fixedCode.split("\n");
    const max = Math.max(originalLines.length, fixedLines.length);
    const { added, removed } = computeDiffStats(fix.originalCode, fix.fixedCode);

    // build unified diff rows
    const rows: { type: "same" | "add" | "remove"; content: string; lineNum: number }[] = [];
    let lineCounter = 1;
    for (let i = 0; i < max; i++) {
        const before = originalLines[i] ?? "";
        const after = fixedLines[i] ?? "";
        if (before === after) {
            rows.push({ type: "same", content: before, lineNum: lineCounter++ });
        } else {
            if (before !== "") rows.push({ type: "remove", content: before, lineNum: lineCounter });
            if (after !== "") { rows.push({ type: "add", content: after, lineNum: lineCounter }); lineCounter++; }
        }
    }

    return (
        <div className="border-b border-border/20 last:border-b-0">
            {/* File row */}
            <button
                onClick={() => setOpen((v) => !v)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors text-left"
            >
                <ChevronDown
                    className={cn("h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-150", open ? "" : "-rotate-90")}
                />
                <span className="flex-1 text-xs font-mono text-foreground/90 truncate">{fix.file}</span>
                <span className="text-xs font-mono text-emerald-400 shrink-0">+{added}</span>
                <span className="text-xs font-mono text-red-400 shrink-0 ml-1">-{removed}</span>
            </button>

            {/* Code panel */}
            {open && (
                <div className="font-mono text-[11px] leading-5 overflow-x-auto">
                    {rows.map((row, idx) => (
                        <div
                            key={idx}
                            className={cn(
                                "flex gap-0 min-w-0",
                                row.type === "add" && "bg-emerald-500/15",
                                row.type === "remove" && "bg-red-500/15",
                            )}
                        >
                            {/* Line number */}
                            <span className={cn(
                                "select-none shrink-0 w-10 text-right pr-3 py-0.5 border-r border-border/20",
                                row.type === "add" ? "text-emerald-500/50 border-emerald-500/20" :
                                    row.type === "remove" ? "text-red-500/50 border-red-500/20" :
                                        "text-muted-foreground/40"
                            )}>{row.lineNum}</span>
                            {/* Sign */}
                            <span className={cn(
                                "select-none shrink-0 w-5 text-center py-0.5",
                                row.type === "add" ? "text-emerald-400" :
                                    row.type === "remove" ? "text-red-400" :
                                        "text-transparent"
                            )}>
                                {row.type === "add" ? "+" : row.type === "remove" ? "-" : " "}
                            </span>
                            {/* Code */}
                            <span className={cn(
                                "flex-1 py-0.5 pr-4 whitespace-pre",
                                row.type === "add" ? "text-emerald-700 dark:text-emerald-200" :
                                    row.type === "remove" ? "text-red-700 dark:text-red-300" :
                                        "text-foreground/75"
                            )}>{row.content || " "}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function FixWorkspacePage() {
    const params = useParams();
    const projectId = params.id as string;
    const scanRunId = params.scanRunId as string;

    const [loading, setLoading] = useState(true);
    const [isCheckingAccess, setIsCheckingAccess] = useState(true);
    const [loadingFixes, setLoadingFixes] = useState(true);
    const [creatingPr, setCreatingPr] = useState(false);
    const [diffDialogOpen, setDiffDialogOpen] = useState(false);
    const [project, setProject] = useState<ProjectSummary | null>(null);
    const [scanRun, setScanRun] = useState<ScanRun | null>(null);
    const [issues, setIssues] = useState<ScanIssue[]>([]);
    const [fixes, setFixes] = useState<FixProposal[]>([]);
    const [selectedFixIds, setSelectedFixIds] = useState<Set<string>>(new Set());
    const [selectedIssueKey, setSelectedIssueKey] = useState<string>("");
    const [error, setError] = useState<string>("");
    const [prInfo, setPrInfo] = useState<{ url: string; number: number } | null>(null);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState("");
    const [chatLoading, setChatLoading] = useState(false);
    const [chatPending, setChatPending] = useState(false);
    const [analysisText, setAnalysisText] = useState("");
    const [hasScanAccess, setHasScanAccess] = useState(true);
    const [manualGuidance, setManualGuidance] = useState<ManualGuidance[]>([]);
    const [noFixesMessage, setNoFixesMessage] = useState("");
    const hasGeneratedFixes = useRef(false);
    const suggestionsAbortRef = useRef<AbortController | null>(null);
    const chatAbortRef = useRef<AbortController | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const fetchWorkspace = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await fetch(`/api/scan/projects/${projectId}/fixes/${scanRunId}`);
            if (!response.ok) {
                throw new Error("Failed to load fix workspace");
            }

            const data = await response.json();
            const fetchedScanRun = data.scanRun as ScanRun;
            const scanIssues = fetchedScanRun.results?.issues || [];

            setProject(data.project);
            setScanRun(fetchedScanRun);
            setIssues(scanIssues);
            if (scanIssues.length > 0) {
                setSelectedIssueKey(issueKey(scanIssues[0]));
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load workspace");
        } finally {
            setLoading(false);
        }
    }, [projectId, scanRunId]);

    const streamFixSuggestions = useCallback(
        async (generatedFixes: FixProposal[], guidance: ManualGuidance[]) => {
            if (!scanRunId) return;

            suggestionsAbortRef.current?.abort();
            const controller = new AbortController();
            suggestionsAbortRef.current = controller;
            setAnalysisText("");

            // Inject streaming assistant placeholder as first chat message
            setChatMessages((prev) => [...prev, { role: "assistant", content: "", isStreaming: true }]);

            try {
                const suggestionPayloadFixes = generatedFixes.map((fix) => ({
                    file: fix.file,
                    line: fix.line,
                    issueType: fix.issueType,
                    issueName: fix.issueName,
                    severity: fix.severity,
                    strategy: fix.strategy,
                    explanation: fix.explanation,
                    selected: true,
                }));

                const response = await fetch(`/api/scan/projects/${projectId}/fixes/suggestions`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ scanRunId, fixes: suggestionPayloadFixes, manualGuidance: guidance }),
                    signal: controller.signal,
                });

                if (!response.ok) {
                    if (response.status === 402) {
                        await openScanPaywallFromResponse(response);
                        return;
                    }
                    const data = await response.json().catch(() => ({}));
                    throw new Error(data.error || "Failed to stream suggestions");
                }

                const reader = response.body?.getReader();
                if (!reader) throw new Error("No streaming response body");

                const decoder = new TextDecoder();
                let fullContent = "";
                let localAnalysis = "";
                let buffer = "";

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const events = buffer.split("\n\n");
                    buffer = events.pop() || "";

                    for (const event of events) {
                        for (const line of event.split("\n")) {
                            if (!line.startsWith("data: ")) continue;
                            const data = line.slice(6).trim();
                            if (!data || data === "[DONE]") continue;
                            try {
                                const parsed = JSON.parse(data);
                                // Route by event type
                                if (parsed.type === "analysis" && typeof parsed.content === "string") {
                                    localAnalysis += parsed.content;
                                    setAnalysisText((prev) => prev + parsed.content);
                                } else if (typeof parsed.content === "string" && parsed.content.length > 0) {
                                    // content event (or legacy untyped) → chat message
                                    // First real chunk — clear the pending state
                                    setChatPending(false);
                                    fullContent += parsed.content;
                                    setChatMessages((prev) => {
                                        const next = [...prev];
                                        const last = next[next.length - 1];
                                        if (last?.role === "assistant") {
                                            next[next.length - 1] = { ...last, content: fullContent };
                                        }
                                        return next;
                                    });
                                }
                            } catch { /* ignore non-JSON */ }
                        }
                    }
                }

                // Persist investigation steps so the completed message can still be expanded.
                setChatMessages((prev) => {
                    const next = [...prev];
                    const last = next[next.length - 1];
                    if (last?.role === "assistant") {
                        next[next.length - 1] = {
                            ...last,
                            isStreaming: false,
                            analysis: localAnalysis || last.analysis,
                        };
                    }
                    return next;
                });
            } catch (err) {
                if ((err as Error).name !== "AbortError") {
                    setChatMessages((prev) => {
                        const next = [...prev];
                        const last = next[next.length - 1];
                        if (last?.role === "assistant" && last.isStreaming) {
                            next[next.length - 1] = { role: "assistant", content: "Failed to generate suggestions. Please try again.", isStreaming: false };
                        }
                        return next;
                    });
                } else {
                    // On abort: remove empty placeholder or mark complete
                    setChatMessages((prev) => {
                        const next = [...prev];
                        const last = next[next.length - 1];
                        if (last?.role === "assistant" && last.isStreaming) {
                            if (!last.content) next.pop();
                            else next[next.length - 1] = { ...last, isStreaming: false };
                        }
                        return next;
                    });
                }
            } finally {
                if (suggestionsAbortRef.current === controller) suggestionsAbortRef.current = null;
            }
        },
        [projectId, scanRunId]
    );

    const generateFixes = useCallback(async () => {
        setLoadingFixes(true);
        setError("");
        try {
            const response = await fetch(`/api/scan/projects/${projectId}/fixes/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ scanRunId }),
            });

            if (!response.ok) {
                if (response.status === 402) {
                    await openScanPaywallFromResponse(response);
                    return;
                }
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || "Failed to generate fixes");
            }

            const data: GenerateFixesResponse = await response.json();
            const generatedFixes = data.fixes || [];
            const generatedGuidance = data.manualGuidance || [];
            setFixes(generatedFixes);
            setManualGuidance(generatedGuidance);
            setNoFixesMessage(data.message || "");
            setSelectedFixIds(new Set(generatedFixes.map((fix) => fix.id)));
            setChatPending(true);
            void streamFixSuggestions(generatedFixes, generatedGuidance);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to generate fixes");
        } finally {
            setLoadingFixes(false);
        }
    }, [projectId, scanRunId, streamFixSuggestions]);

    useEffect(() => {
        let cancelled = false;
        const fetchEntitlement = async () => {
            try {
                const response = await fetch('/api/scan/entitlement');
                if (!response.ok) {
                    return;
                }

                const data = await response.json();
                if (!cancelled) {
                    setHasScanAccess(Boolean(data?.entitlement?.hasScanAccess));
                }
            } catch (err) {
                console.error('Error fetching scan entitlement:', err);
            } finally {
                if (!cancelled) {
                    setIsCheckingAccess(false);
                }
            }
        };

        fetchEntitlement();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (isCheckingAccess || !hasScanAccess) {
            return;
        }
        fetchWorkspace();
    }, [fetchWorkspace, hasScanAccess, isCheckingAccess]);

    useEffect(() => {
        if (loading || isCheckingAccess || !hasScanAccess || hasGeneratedFixes.current || !scanRun) return;
        hasGeneratedFixes.current = true;
        generateFixes();
    }, [generateFixes, hasScanAccess, isCheckingAccess, loading, scanRun]);

    useEffect(() => {
        return () => {
            suggestionsAbortRef.current?.abort();
            chatAbortRef.current?.abort();
        };
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chatMessages]);

    const fixMap = useMemo(() => {
        const map = new Map<string, FixProposal>();
        for (const fix of fixes) {
            map.set(fixIssueKey(fix), fix);
        }
        return map;
    }, [fixes]);

    const selectedIssue = useMemo(
        () => issues.find((issue) => issueKey(issue) === selectedIssueKey) || null,
        [issues, selectedIssueKey]
    );
    const selectedIssueFix = selectedIssue ? fixMap.get(issueKey(selectedIssue)) : undefined;

    const selectedFixes = useMemo(
        () => fixes.filter((fix) => selectedFixIds.has(fix.id)),
        [fixes, selectedFixIds]
    );
    const fixesForDiffDialog = selectedFixes.length > 0 ? selectedFixes : fixes;

    const handleCreatePr = async () => {
        if (selectedFixes.length === 0) return;

        setCreatingPr(true);
        setError("");
        try {
            const fileTotals = fixes.reduce<Record<string, number>>((acc, fix) => {
                acc[fix.file] = (acc[fix.file] || 0) + 1;
                return acc;
            }, {});
            const fileSelected = selectedFixes.reduce<Record<string, number>>((acc, fix) => {
                acc[fix.file] = (acc[fix.file] || 0) + 1;
                return acc;
            }, {});
            const selectionByFile = Object.fromEntries(
                Object.entries(fileTotals).map(([file, total]) => [
                    file,
                    { selected: fileSelected[file] || 0, total },
                ])
            );

            const response = await fetch(`/api/scan/projects/${projectId}/fixes/apply`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    scanRunId,
                    fixes: selectedFixes,
                    selectionByFile,
                }),
            });

            if (response.status === 402) {
                await openScanPaywallFromResponse(response);
                return;
            }

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to create PR");
            }

            setPrInfo({ url: data.prUrl, number: data.prNumber });
            setScanRun((prev) => prev ? {
                ...prev,
                fix_status: "pr_opened",
                fix_pr_url: data.prUrl,
                fix_pr_number: data.prNumber,
                fix_branch_name: data.branchName,
            } : prev);
            window.open(data.prUrl, "_blank");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create PR");
        } finally {
            setCreatingPr(false);
        }
    };

    const handleSendChat = async () => {
        if (!chatInput.trim() || chatLoading) return;
        setError("");

        const userMessage: ChatMessage = { role: "user", content: chatInput.trim() };
        const nextMessages = [...chatMessages, userMessage];
        setChatMessages((prev) => [...prev, userMessage]);
        setChatInput("");
        setChatLoading(true);
        setAnalysisText("");

        // Add streaming assistant placeholder
        setChatMessages((prev) => [...prev, { role: "assistant", content: "", isStreaming: true }]);

        chatAbortRef.current?.abort();
        const controller = new AbortController();
        chatAbortRef.current = controller;

        try {
            const response = await fetch(`/api/scan/projects/${projectId}/fixes/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    scanRunId,
                    question: userMessage.content,
                    issue: selectedIssue || undefined,
                    fix: selectedIssueFix,
                    history: nextMessages,
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                if (response.status === 402) {
                    await openScanPaywallFromResponse(response);
                    return;
                }
                let message = `Failed to get response (${response.status})`;
                try {
                    const data = await response.json();
                    if (typeof data?.error === "string" && data.error.trim()) {
                        const parts = [data.error.trim()];
                        if (typeof data?.code === "string" && data.code.trim()) parts.push(`[${data.code.trim()}]`);
                        if (typeof data?.details === "string" && data.details.trim()) parts.push(data.details.trim());
                        message = parts.join(" ");
                    }
                } catch {
                    // Keep default HTTP status message.
                }
                throw new Error(message);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error("No response body");

            const decoder = new TextDecoder();
            let fullContent = "";
            let fullAnalysis = "";
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const events = buffer.split("\n\n");
                buffer = events.pop() || "";
                for (const event of events) {
                    for (const line of event.split("\n")) {
                        if (!line.startsWith("data: ")) continue;
                        const data = line.slice(6).trim();
                        if (!data || data === "[DONE]") continue;
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.type === "analysis" && typeof parsed.content === "string") {
                                fullAnalysis += parsed.content;
                                setChatMessages((prev) => {
                                    const next = [...prev];
                                    const last = next[next.length - 1];
                                    if (last?.role === "assistant") next[next.length - 1] = { ...last, analysis: fullAnalysis };
                                    return next;
                                });
                            } else if (parsed.type === "content" && typeof parsed.content === "string") {
                                fullContent += parsed.content;
                                setChatMessages((prev) => {
                                    const next = [...prev];
                                    const last = next[next.length - 1];
                                    if (last?.role === "assistant") next[next.length - 1] = { ...last, content: fullContent };
                                    return next;
                                });
                            } else if (parsed.type === "error" && typeof parsed.message === "string") {
                                setError(parsed.message);
                            } else if (!parsed.type && typeof parsed.content === "string") {
                                // Fallback for pure content streams
                                fullContent += parsed.content;
                                setChatMessages((prev) => {
                                    const next = [...prev];
                                    const last = next[next.length - 1];
                                    if (last?.role === "assistant") next[next.length - 1] = { ...last, content: fullContent };
                                    return next;
                                });
                            }
                        } catch { /* ignore */ }
                    }
                }
            }

            setChatMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === "assistant") next[next.length - 1] = { ...last, isStreaming: false };
                return next;
            });
        } catch (err) {
            if ((err as Error).name !== "AbortError") {
                const failureMessage = err instanceof Error
                    ? err.message.slice(0, 500)
                    : "Sorry, I encountered an error. Please try again.";
                setError(failureMessage);
                setChatMessages((prev) => {
                    const next = [...prev];
                    const last = next[next.length - 1];
                    if (last?.role === "assistant" && last.isStreaming) {
                        next[next.length - 1] = { role: "assistant", content: failureMessage, isStreaming: false, isError: true };
                    }
                    return next;
                });
            } else {
                setChatMessages((prev) => {
                    const next = [...prev];
                    const last = next[next.length - 1];
                    if (last?.role === "assistant" && last.isStreaming) {
                        if (!last.content) next.pop();
                        else next[next.length - 1] = { ...last, isStreaming: false };
                    }
                    return next;
                });
            }
        } finally {
            setChatLoading(false);
            if (chatAbortRef.current === controller) chatAbortRef.current = null;
        }
    };



    // True once the first AI message has content (stream started)
    const aiHasStarted = chatMessages.some((m) => m.role === "assistant");
    // True once all AI messages are done streaming
    const aiIsDone = chatMessages.length > 0 && chatMessages.every((m) => !m.isStreaming);
    const lastMessage = chatMessages[chatMessages.length - 1];
    const lastIsAssistant = lastMessage?.role === "assistant";

    if (isCheckingAccess) {
        return (
            <div className="w-full max-w-6xl mx-auto px-6 py-8">
                <p className="text-xs text-muted-foreground">Checking scan access...</p>
            </div>
        );
    }

    if (!hasScanAccess) {
        return (
            <div className="w-full max-w-5xl mx-auto px-6 py-8">
                <Link
                    href={`/projects/${projectId}`}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6"
                >
                    <ArrowLeft className="h-3 w-3" />
                    Back to project
                </Link>
                <ScanUpgradePanel />
            </div>
        );
    }

    if (!loading && (!scanRun || !project)) {
        return (
            <div className="w-full max-w-6xl mx-auto px-6 py-8">
                <p className="text-sm text-red-400">{error || "Fix workspace not found."}</p>
                <Button size="sm" className="mt-4 h-7 text-xs px-3" asChild>
                    <Link href={`/projects/${projectId}`}>Back to project</Link>
                </Button>
            </div>
        );
    }

    return (
        <>
            {/* ── Main chat content ───────────────────────────────────── */}
            <div className="w-full max-w-3xl mx-auto px-4 py-8 pt-16 pb-40">
                {/* Header: back link only */}
                <Link
                    href={`/projects/${projectId}`}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-8"
                >
                    <ArrowLeft className="h-3 w-3" />
                    Back to project
                </Link>

                {/* Error banner */}
                {error && (
                    <div className="mb-6 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                        {error}
                    </div>
                )}

                {/* PR success banner */}
                {prInfo && (
                    <div className="mb-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 flex items-center justify-between gap-2">
                        <span>PR #{prInfo.number} created — branch pushed to GitHub.</span>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs px-3"
                            onClick={() => prInfo.url && window.open(prInfo.url, "_blank")}
                        >
                            Open on GitHub
                        </Button>
                    </div>
                )}

                {/* Chat thread */}
                <div className="space-y-6">

                    {/* Combined ThinkingIndicator — runs while loading or generating, before AI starts */}
                    {(loading || loadingFixes || chatPending) && !aiHasStarted && (
                        <ScanThinkingIndicator finished={false} liveText={analysisText || undefined} />
                    )}

                    {/* Manual guidance cards — shown when AI fixes failed but issues exist */}
                    {!loading && !loadingFixes && fixes.length === 0 && manualGuidance.length > 0 && !aiHasStarted && (
                        <div className="space-y-4">
                            {noFixesMessage && (
                                <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-300 flex items-center gap-2">
                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                    {noFixesMessage}
                                </div>
                            )}
                            <div className="space-y-3">
                                {manualGuidance.map((guidance) => (
                                    <div key={guidance.issueKey} className="rounded-md border border-border/40 bg-card p-4 space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <span className={cn(
                                                    "text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded",
                                                    guidance.severity === "critical" && "bg-red-500/20 text-red-400",
                                                    guidance.severity === "high" && "bg-orange-500/20 text-orange-400",
                                                    guidance.severity === "medium" && "bg-yellow-500/20 text-yellow-400",
                                                    guidance.severity === "low" && "bg-blue-500/20 text-blue-400",
                                                )}>{guidance.severity}</span>
                                                <span className="text-sm font-medium text-foreground">{guidance.issueName}</span>
                                            </div>
                                        </div>
                                        <p className="text-xs text-muted-foreground font-mono">{guidance.file}:{guidance.line}</p>
                                        <p className="text-xs text-foreground/80">{guidance.summary}</p>
                                        <div className="space-y-1 pt-1">
                                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Remediation Steps</p>
                                            <ol className="list-decimal list-inside space-y-0.5">
                                                {guidance.steps.map((step, idx) => (
                                                    <li key={idx} className="text-xs text-foreground/70">{step}</li>
                                                ))}
                                            </ol>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* AI messages */}
                    {chatMessages.map((message, idx) =>
                        message.role === "user" ? (
                            <div key={`msg-${idx}`} className="flex justify-end">
                                <div className="max-w-[85%] bg-primary text-primary-foreground rounded-2xl rounded-br-md px-3 py-2">
                                    <p className="text-sm" style={{ fontFamily: 'var(--font-geist)' }}>{message.content}</p>
                                </div>
                            </div>
                        ) : (
                            <div key={`msg-${idx}`} className="w-full max-w-none space-y-1.5">
                                <div className="mb-2">
                                    {/* Show while streaming or after if investigation steps were captured */}
                                    {(message.isStreaming || message.analysis) && (
                                        <ScanThinkingIndicator
                                            finished={!!message.content}
                                            liveText={message.analysis || undefined}
                                        />
                                    )}
                                </div>
                                {message.content && (
                                    message.isError ? (
                                        <div className="inline-flex items-center gap-2 text-sm text-red-400/90 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                            <span>{message.content}</span>
                                        </div>
                                    ) : (
                                        <div style={{ fontFamily: 'var(--font-geist)' }}>
                                            <ScanMarkdownRenderer content={message.content} />
                                        </div>
                                    )
                                )}
                                {!message.isStreaming && message.content && (
                                    <div className="flex items-center gap-0.5 pt-1">
                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" title="Helpful">
                                            <ThumbsUp className="h-3 w-3" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" title="Not helpful">
                                            <ThumbsDown className="h-3 w-3" />
                                        </Button>
                                        <Button
                                            variant="ghost" size="icon"
                                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                            title="Copy"
                                            onClick={() => {
                                                navigator.clipboard.writeText(message.content);
                                                toast.success("Copied");
                                            }}
                                        >
                                            <Copy className="h-3 w-3" />
                                        </Button>
                                        <Button
                                            variant="ghost" size="icon"
                                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                            title="Retry"
                                            onClick={() => {
                                                const lastUser = [...chatMessages].reverse().find(m => m.role === "user");
                                                if (lastUser) {
                                                    setChatInput(lastUser.content);
                                                    setTimeout(() => void handleSendChat(), 0);
                                                }
                                            }}
                                        >
                                            <RotateCcw className="h-3 w-3" />
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )
                    )}



                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* ── Diff dialog ─────────────────────────────────────────── */}
            <Dialog open={diffDialogOpen} onOpenChange={setDiffDialogOpen}>
                <DialogContent className="!max-w-[40vw] !w-[40vw] p-0 overflow-hidden bg-background border border-border/30">
                    {/* Header bar */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/25">
                        <span className="text-sm font-medium text-foreground">
                            {fixesForDiffDialog.length} file{fixesForDiffDialog.length === 1 ? "" : "s"} changed
                        </span>
                        {(() => {
                            const totals = fixesForDiffDialog.reduce(
                                (acc, fix) => {
                                    const s = computeDiffStats(fix.originalCode, fix.fixedCode);
                                    return { added: acc.added + s.added, removed: acc.removed + s.removed };
                                },
                                { added: 0, removed: 0 }
                            );
                            return (
                                <>
                                    <span className="text-sm font-mono text-emerald-400">+{totals.added}</span>
                                    <span className="text-sm font-mono text-red-400">-{totals.removed}</span>
                                </>
                            );
                        })()}
                    </div>

                    {/* File list */}
                    <div className="max-h-[76vh] overflow-y-auto">
                        {fixesForDiffDialog.length === 0 ? (
                            <p className="px-4 py-6 text-xs text-muted-foreground">No diffs available yet.</p>
                        ) : (
                            fixesForDiffDialog.map((fix) => (
                                <FileDiffPanel key={fix.id} fix={fix} />
                            ))
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── Fixed bottom input bar ──────────────────────────────── */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-sm pb-8">
                <div className="max-w-3xl mx-auto">
                    {/* ── Persistent Diff + PR buttons ──────────────────── */}
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs px-4 gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                            onClick={() => setDiffDialogOpen(true)}
                            disabled={fixes.length === 0 || loadingFixes}
                        >
                            Diffs
                            {fixes.length > 0 && (() => {
                                const t = fixes.reduce(
                                    (acc, fix) => {
                                        const s = computeDiffStats(fix.originalCode, fix.fixedCode);
                                        return { added: acc.added + s.added, removed: acc.removed + s.removed };
                                    },
                                    { added: 0, removed: 0 }
                                );
                                return (
                                    <>
                                        <span className="text-emerald-400">+{t.added}</span>
                                        <span className="text-red-400">-{t.removed}</span>
                                    </>
                                );
                            })()}
                        </Button>
                        {scanRun?.fix_status === "pr_opened" && scanRun?.fix_pr_url ? (
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs px-4"
                                onClick={() => window.open(scanRun?.fix_pr_url as string, "_blank")}
                            >
                                Open PR
                            </Button>
                        ) : (
                            <Button
                                size="sm"
                                className="h-8 text-xs px-4 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed"
                                onClick={handleCreatePr}
                                disabled={creatingPr || selectedFixes.length === 0 || loadingFixes}
                                title={selectedFixes.length === 0 ? "No fixes available to create a PR" : undefined}
                            >
                                {creatingPr ? (
                                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                ) : (
                                    <GitPullRequest className="h-3.5 w-3.5 mr-1.5" />
                                )}
                                Create PR
                            </Button>
                        )}
                    </div>

                    <div className="relative flex items-center gap-2 rounded-full border border-border/50 bg-muted/20 px-2.5 pl-4 py-2 transition-all hover:bg-muted/30 hover:border-border/80 focus-within:border-white/20 focus-within:bg-muted/30">
                        <textarea
                            value={chatInput}
                            onChange={(event) => setChatInput(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey) {
                                    event.preventDefault();
                                    void handleSendChat();
                                }
                            }}
                            placeholder="Ask a question..."
                            rows={1}
                            className="flex-1 resize-none bg-transparent py-2 text-sm placeholder:text-muted-foreground focus:outline-none max-h-32"
                            style={{ fontFamily: 'var(--font-geist)', minHeight: "24px" }}
                        />
                        <div className="flex-shrink-0">
                            {chatLoading ? (
                                <Button
                                    size="icon"
                                    className="h-8 w-8 rounded-full bg-foreground text-background hover:bg-foreground/90 transition-all"
                                    onClick={() => chatAbortRef.current?.abort()}
                                >
                                    <Square className="h-3.5 w-3.5 fill-current" />
                                </Button>
                            ) : (
                                <Button
                                    size="icon"
                                    className="h-8 w-8 rounded-full bg-foreground text-background hover:bg-foreground/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    onClick={handleSendChat}
                                    disabled={!chatInput.trim()}
                                >
                                    <ArrowUp className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                    <div className="text-center mt-3">
                        <Link href="/" className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                            Powered by Cencori
                        </Link>
                    </div>
                </div>
            </div>
        </>
    );
}
