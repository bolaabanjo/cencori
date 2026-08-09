"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface AIDetectTestProps {
    projectId: string;
}

interface AnalysisResult {
    is_flagged: boolean;
    confidence: number;
    categories: string[];
    findings: string[];
    severity: "low" | "medium" | "high" | "critical";
    recommendation: "allow" | "mask" | "redact" | "block";
}

interface DetectionResponse {
    success: boolean;
    analysis: AnalysisResult;
    model: string;
    provider?: string;
    tokens: number;
}

export function AIDetectTest({ projectId }: AIDetectTestProps) {
    const [content, setContent] = useState("");
    const [prompt, setPrompt] = useState("");
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<DetectionResponse | null>(null);

    const handleAnalyze = async () => {
        if (!content.trim()) {
            setError("Enter content before running a detection test.");
            return;
        }

        setError(null);
        setIsAnalyzing(true);
        setResult(null);

        try {
            const response = await fetch(`/api/projects/${projectId}/ai-detect`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    content,
                    prompt: prompt.trim() || undefined,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || data.error || "Analysis failed");
            }

            setResult(data);
        } catch (analysisError) {
            setError(analysisError instanceof Error ? analysisError.message : "Analysis failed");
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <section className="overflow-hidden rounded-lg border border-border/25 bg-[#f3f3f1] dark:bg-[#111111]">
            <div className="grid lg:grid-cols-[minmax(0,1.08fr)_minmax(20rem,0.92fr)]">
                <form
                    className="flex min-h-[34rem] flex-col border-b border-border/25 lg:border-b-0 lg:border-r"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void handleAnalyze();
                    }}
                >
                    <header className="border-b border-border/25 px-6 py-5 sm:px-7">
                        <div className="flex items-start justify-between gap-6">
                            <div>
                                <h3 className="text-xs font-medium">Test configuration</h3>
                                <p className="mt-1 max-w-md text-[11px] leading-4 text-muted-foreground">
                                    Submit representative content without sending it through your production endpoint.
                                </p>
                            </div>
                            <span className="shrink-0 rounded-[3px] border border-border/25 bg-background/30 px-2 py-1 font-mono text-[9px] tracking-[0.1em] text-muted-foreground">
                                ISOLATED
                            </span>
                        </div>
                    </header>

                    <div className="flex flex-1 flex-col gap-5 px-6 py-6 sm:px-7">
                        <div className="flex flex-1 flex-col space-y-2">
                            <div className="flex items-center justify-between gap-4">
                                <Label htmlFor="content" className="text-[11px]">Content</Label>
                                <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
                                    {content.length.toLocaleString()} characters
                                </span>
                            </div>
                            <Textarea
                                id="content"
                                placeholder="Paste the prompt, response, or payload you want to inspect…"
                                className="min-h-64 flex-1 resize-none border-border/25 bg-background/35 px-4 py-3 text-xs leading-5 shadow-none focus-visible:ring-1"
                                value={content}
                                aria-invalid={Boolean(error && !content.trim())}
                                onChange={(event) => {
                                    setError(null);
                                    setContent(event.target.value);
                                }}
                            />
                        </div>

                        <div className="space-y-2">
                            <div>
                                <Label htmlFor="prompt" className="text-[11px]">Detection instruction <span className="text-muted-foreground">· optional</span></Label>
                                <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                                    Leave blank to use the default security policy, or narrow the classifier to a specific concern.
                                </p>
                            </div>
                            <Input
                                id="prompt"
                                placeholder="Detect internal financial projections or customer credentials"
                                className="h-9 border-border/25 bg-background/35 text-xs shadow-none"
                                value={prompt}
                                onChange={(event) => setPrompt(event.target.value)}
                            />
                        </div>
                    </div>

                    <footer className="flex flex-col gap-3 border-t border-border/25 bg-background/15 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
                        <div className="min-h-4" aria-live="polite">
                            {error ? (
                                <p className="text-[10px] leading-4 text-red-700 dark:text-red-400">{error}</p>
                            ) : (
                                <p className="text-[10px] leading-4 text-muted-foreground">Uses the project&apos;s configured provider and model.</p>
                            )}
                        </div>
                        <Button
                            type="submit"
                            size="sm"
                            className="h-8 min-w-28 shadow-none active:translate-y-px"
                            disabled={isAnalyzing || !content.trim()}
                        >
                            {isAnalyzing ? "Analyzing…" : "Run detection"}
                        </Button>
                    </footer>
                </form>

                <DetectionResultPanel result={result} isAnalyzing={isAnalyzing} />
            </div>
        </section>
    );
}

function DetectionResultPanel({ result, isAnalyzing }: { result: DetectionResponse | null; isAnalyzing: boolean }) {
    if (isAnalyzing) {
        return (
            <aside className="flex min-h-[30rem] flex-col" aria-live="polite">
                <ResultHeader label="Decision output" status="Evaluating" />
                <div className="flex flex-1 flex-col justify-center px-7 py-12">
                    <span className="mb-6 block h-px w-12 animate-pulse bg-foreground/55" />
                    <p className="text-sm font-medium">Evaluating content</p>
                    <p className="mt-2 max-w-xs text-[11px] leading-5 text-muted-foreground">
                        The classifier is comparing the sample with your instruction and active security policy.
                    </p>
                </div>
            </aside>
        );
    }

    if (!result?.analysis) {
        return (
            <aside className="flex min-h-[30rem] flex-col">
                <ResultHeader label="Decision output" status="Awaiting test" />
                <div className="flex flex-1 flex-col justify-center px-7 py-12">
                    <span className="mb-6 block h-px w-12 bg-foreground/25" />
                    <p className="text-sm font-medium">No analysis yet</p>
                    <p className="mt-2 max-w-xs text-[11px] leading-5 text-muted-foreground">
                        Run a representative sample to inspect its severity, findings, and recommended enforcement action.
                    </p>
                </div>
                <div className="grid grid-cols-3 border-t border-border/25">
                    <EmptyMetric label="Severity" />
                    <EmptyMetric label="Confidence" />
                    <EmptyMetric label="Action" />
                </div>
            </aside>
        );
    }

    const analysis = result.analysis;
    const outcome = analysis.is_flagged ? "Flagged" : "Allowed";
    const outcomeColor = analysis.is_flagged ? "text-orange-600 dark:text-orange-400" : "text-emerald-700 dark:text-emerald-400";

    return (
        <aside className="flex min-h-[30rem] flex-col" aria-live="polite">
            <ResultHeader label="Decision output" status="Complete" />

            <div className="border-b border-border/25 px-6 py-6 sm:px-7">
                <p className={`text-2xl font-medium tracking-[-0.04em] ${outcomeColor}`}>{outcome}</p>
                <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                    {analysis.is_flagged
                        ? "The classifier found content that should be handled before it reaches production."
                        : "The sample passed the selected detection policy without a blocking finding."}
                </p>
            </div>

            <dl className="grid grid-cols-3 border-b border-border/25">
                <ResultMetric label="Severity" value={analysis.severity} />
                <ResultMetric label="Confidence" value={`${analysis.confidence}%`} mono />
                <ResultMetric label="Action" value={analysis.recommendation} />
            </dl>

            <div className="flex-1 space-y-6 px-6 py-6 sm:px-7">
                <div>
                    <h4 className="text-[10px] font-medium text-muted-foreground">Findings</h4>
                    {analysis.findings.length > 0 ? (
                        <ul className="mt-3 divide-y divide-border/20 border-y border-border/20">
                            {analysis.findings.map((finding, index) => (
                                <li key={`${finding}-${index}`} className="py-3 text-[11px] leading-5 text-foreground/85">
                                    {finding}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="mt-3 text-[11px] leading-5 text-muted-foreground">No specific security findings were returned.</p>
                    )}
                </div>

                {analysis.categories.length > 0 && (
                    <div>
                        <h4 className="text-[10px] font-medium text-muted-foreground">Categories</h4>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {analysis.categories.map((category) => (
                                <span key={category} className="rounded-[3px] border border-border/25 bg-background/30 px-2 py-1 font-mono text-[9px] text-muted-foreground">
                                    {category.replaceAll("_", " ")}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <footer className="flex items-center justify-between gap-4 border-t border-border/25 px-6 py-4 font-mono text-[9px] text-muted-foreground sm:px-7">
                <span className="truncate">{result.provider ? `${result.provider} · ` : ""}{result.model}</span>
                <span className="shrink-0 tabular-nums">{result.tokens.toLocaleString()} tokens</span>
            </footer>
        </aside>
    );
}

function ResultHeader({ label, status }: { label: string; status: string }) {
    return (
        <header className="flex items-center justify-between gap-5 border-b border-border/25 px-6 py-5 sm:px-7">
            <h3 className="text-xs font-medium">{label}</h3>
            <span className="font-mono text-[9px] tracking-[0.08em] text-muted-foreground">{status.toUpperCase()}</span>
        </header>
    );
}

function EmptyMetric({ label }: { label: string }) {
    return (
        <div className="border-l border-border/20 px-4 py-4 first:border-l-0">
            <dt className="text-[9px] text-muted-foreground">{label}</dt>
            <dd className="mt-2 font-mono text-sm text-foreground/25">—</dd>
        </div>
    );
}

function ResultMetric({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="min-w-0 border-l border-border/20 px-4 py-4 first:border-l-0">
            <dt className="text-[9px] text-muted-foreground">{label}</dt>
            <dd className={`mt-2 truncate text-xs font-medium capitalize ${mono ? "font-mono tabular-nums" : ""}`}>{value}</dd>
        </div>
    );
}
