"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { Loader2, Sparkles } from "lucide-react";
import { ShieldCheckIcon, ShieldExclamationIcon, XCircleIcon } from "@heroicons/react/24/solid";

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

export function AIDetectTest({ projectId }: AIDetectTestProps) {
    const [content, setContent] = useState("");
    const [prompt, setPrompt] = useState("");
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [result, setResult] = useState<{ success: boolean; analysis: AnalysisResult; model: string; tokens: number } | null>(null);

    const handleAnalyze = async () => {
        if (!content.trim()) {
            toast.error("Please enter content to analyze");
            return;
        }

        setIsAnalyzing(true);
        setResult(null);

        try {
            const res = await fetch(`/api/projects/${projectId}/ai-detect`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    content,
                    prompt: prompt.trim() || undefined
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Analysis failed");
            }

            setResult(data);
            if (data.analysis?.is_flagged) {
                toast.warning("Content flagged by AI detection");
            } else {
                toast.success("Content passed AI detection");
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Analysis failed");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const getSeverityColor = (severity: string) => {
        switch (severity) {
            case "critical": return "text-red-500";
            case "high": return "text-orange-500";
            case "medium": return "text-amber-500";
            case "low": return "text-emerald-500";
            default: return "text-muted-foreground";
        }
    };

    const getRecommendationIcon = (rec: string) => {
        switch (rec) {
            case "block": return <XCircleIcon className="h-4 w-4 text-red-500" />;
            case "redact": return <ShieldExclamationIcon className="h-4 w-4 text-orange-500" />;
            case "mask": return <ShieldExclamationIcon className="h-4 w-4 text-amber-500" />;
            default: return <ShieldCheckIcon className="h-4 w-4 text-emerald-500" />;
        }
    };

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="content" className="text-xs">Content to Analyze</Label>
                <Textarea
                    id="content"
                    placeholder="Enter content to test against AI detection..."
                    className="min-h-[120px] text-xs resize-none"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="prompt" className="text-xs">Custom Detection Prompt (optional)</Label>
                <Input
                    id="prompt"
                    placeholder="E.g., 'Detect personal opinions or biased statements'"
                    className="h-8 text-xs"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                />
            </div>

            <Button
                size="sm"
                className="h-8 text-xs"
                onClick={handleAnalyze}
                disabled={isAnalyzing || !content.trim()}
            >
                {isAnalyzing ? (
                    <>
                        <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                        Analyzing...
                    </>
                ) : (
                    "Analyze with AI"
                )}
            </Button>

            {result?.analysis && (
                <div className="border border-border/40 rounded-lg p-4 space-y-3 bg-card">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {getRecommendationIcon(result.analysis.recommendation)}
                            <span className="text-sm font-medium">
                                {result.analysis.is_flagged ? "Content Flagged" : "Content Allowed"}
                            </span>
                        </div>
                        <span className={`text-xs font-medium ${getSeverityColor(result.analysis.severity)}`}>
                            {result.analysis.severity.toUpperCase()} • {result.analysis.confidence}% confidence
                        </span>
                    </div>

                    {result.analysis.categories.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {result.analysis.categories.map((cat) => (
                                <span key={cat} className="px-2 py-0.5 text-[10px] bg-secondary rounded">
                                    {cat}
                                </span>
                            ))}
                        </div>
                    )}

                    {result.analysis.findings.length > 0 && (
                        <div className="space-y-1">
                            <p className="text-[10px] font-medium text-muted-foreground">Findings:</p>
                            <ul className="text-xs space-y-0.5">
                                {result.analysis.findings.map((finding, i) => (
                                    <li key={i} className="text-muted-foreground">• {finding}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-2 border-t border-border/40">
                        <span>Recommendation: <span className="font-medium">{result.analysis.recommendation}</span></span>
                        <span>{result.model} • {result.tokens} tokens</span>
                    </div>
                </div>
            )}
        </div>
    );
}
