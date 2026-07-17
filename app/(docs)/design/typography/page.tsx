"use client";

import React, { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// Code block component with copy functionality
function CodeBlock({ code, language = "tsx" }: { code: string; language?: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        toast.success("Copied to clipboard");
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="relative rounded-lg border border-border/50 bg-muted/30 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40 bg-muted/50">
                <span className="text-[10px] text-muted-foreground font-mono">{language}</span>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px]"
                    onClick={handleCopy}
                >
                    {copied ? (
                        <>
                            <Check className="h-3 w-3 mr-1" />
                            Copied
                        </>
                    ) : (
                        <>
                            <Copy className="h-3 w-3 mr-1" />
                            Copy
                        </>
                    )}
                </Button>
            </div>
            <pre className="p-4 text-xs font-mono text-muted-foreground overflow-x-auto">
                <code>{code}</code>
            </pre>
        </div>
    );
}

const dashboardScale = [
    { class: "text-[10px]", usage: "Labels, metadata, timestamps", example: "Last updated 2 hours ago" },
    { class: "text-xs", usage: "Body text, feature lists, descriptions", example: "This is body text content." },
    { class: "text-sm", usage: "Section labels, form labels", example: "Section Label" },
    { class: "text-base", usage: "Rarely used in dashboard", example: "Rarely used" },
    { class: "text-lg", usage: "Page titles (h1)", example: "Page Title" },
    { class: "text-xl", usage: "Hero titles only", example: "Hero Title" },
];

const landingScale = [
    { class: "text-xs", usage: "Badges, small labels", example: "BETA" },
    { class: "text-sm", usage: "Body copy, subtitles", example: "Subtitle text" },
    { class: "text-base", usage: "Descriptions", example: "Description paragraph" },
    { class: "text-xl", usage: "Section titles", example: "Section Title" },
    { class: "text-2xl", usage: "Hero subheadings", example: "Subheading" },
    { class: "text-3xl", usage: "Hero headlines", example: "Headline" },
];

const fontWeights = [
    { class: "font-medium", usage: "Labels, navigation", value: "500" },
    { class: "font-semibold", usage: "Headings, emphasis", value: "600" },
    { class: "font-bold", usage: "Hero headlines only", value: "700" },
];

export default function TypographyPage() {
    return (
        <div className="space-y-12">
            {/* Header */}
            <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">Typography</h1>
                <p className="text-sm text-muted-foreground max-w-2xl">
                    Font families, text scale, and font weights for dashboard and landing page contexts.
                </p>
            </div>

            {/* Font Families */}
            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Font Families</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-border/50 bg-card p-5">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold">Manrope</h3>
                            <code className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">font-sans</code>
                        </div>
                        <p className="text-xs text-muted-foreground mb-4">Primary font for all UI text, headings, and body copy. Base weight 500.</p>
                        <div className="space-y-2 border-t border-border/40 pt-4">
                            <p className="text-2xl font-bold">Aa Bb Cc</p>
                            <p className="text-sm font-medium">The quick brown fox jumps over the lazy dog.</p>
                            <p className="text-xs text-muted-foreground font-medium">0123456789</p>
                        </div>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-card p-5">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold font-mono">JetBrains Mono</h3>
                            <code className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">font-mono</code>
                        </div>
                        <p className="text-xs text-muted-foreground mb-4">Monospace font for code, API keys, and technical content.</p>
                        <div className="space-y-2 border-t border-border/40 pt-4 font-mono">
                            <p className="text-2xl font-bold">Aa Bb Cc</p>
                            <p className="text-sm">const api = new Cencori();</p>
                            <p className="text-xs text-muted-foreground">0123456789</p>
                        </div>
                    </div>
                </div>
                <CodeBlock code={`// CSS Variables (set in layout.tsx)
--font-sans: Manrope (base weight 500)
--font-mono: JetBrains Mono

// Tailwind usage
className="font-sans font-medium"  // Default body
className="font-mono"  // For code blocks and technical text`} language="css" />
            </section>

            {/* Dashboard Scale */}
            <section className="space-y-4">
                <div>
                    <h2 className="text-lg font-semibold">Dashboard Scale</h2>
                    <p className="text-xs text-muted-foreground mt-1">Dense typography for information-rich interfaces.</p>
                </div>
                <div className="overflow-x-auto">
                    <div className="rounded-xl border border-border/50 bg-card overflow-hidden min-w-[400px]">
                        <div className="grid grid-cols-3 gap-4 px-4 py-2 border-b border-border/40 bg-muted/30">
                            <span className="text-[10px] font-medium text-muted-foreground">Class</span>
                            <span className="text-[10px] font-medium text-muted-foreground">Usage</span>
                            <span className="text-[10px] font-medium text-muted-foreground">Example</span>
                        </div>
                        {dashboardScale.map((item) => (
                            <div key={item.class} className="grid grid-cols-3 gap-4 px-4 py-3 border-b border-border/40 last:border-0">
                                <code className="text-xs font-mono text-emerald-500">{item.class}</code>
                                <span className="text-xs text-muted-foreground">{item.usage}</span>
                                <span className={item.class}>{item.example}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Landing Scale */}
            <section className="space-y-4">
                <div>
                    <h2 className="text-lg font-semibold">Landing Page Scale</h2>
                    <p className="text-xs text-muted-foreground mt-1">Expressive typography for marketing contexts.</p>
                </div>
                <div className="overflow-x-auto">
                    <div className="rounded-xl border border-border/50 bg-card overflow-hidden min-w-[400px]">
                        <div className="grid grid-cols-3 gap-4 px-4 py-2 border-b border-border/40 bg-muted/30">
                            <span className="text-[10px] font-medium text-muted-foreground">Class</span>
                            <span className="text-[10px] font-medium text-muted-foreground">Usage</span>
                            <span className="text-[10px] font-medium text-muted-foreground">Example</span>
                        </div>
                        {landingScale.map((item) => (
                            <div key={item.class} className="grid grid-cols-3 gap-4 px-4 py-3 border-b border-border/40 last:border-0 items-center">
                                <code className="text-xs font-mono text-emerald-500">{item.class}</code>
                                <span className="text-xs text-muted-foreground">{item.usage}</span>
                                <span className={item.class}>{item.example}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Font Weights */}
            <section className="space-y-4">
                <div>
                    <h2 className="text-lg font-semibold">Font Weights</h2>
                    <p className="text-xs text-muted-foreground mt-1">Use weight sparingly for emphasis.</p>
                </div>
                <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                    {fontWeights.map((item) => (
                        <div key={item.class} className="flex items-center justify-between px-4 py-3 border-b border-border/40 last:border-0">
                            <div className="flex items-center gap-4">
                                <code className="text-xs font-mono text-emerald-500">{item.class}</code>
                                <span className="text-xs text-muted-foreground">{item.usage}</span>
                            </div>
                            <span className={`text-sm ${item.class}`}>Weight {item.value}</span>
                        </div>
                    ))}
                </div>
            </section>

            {/* Code Example */}
            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Usage Example</h2>
                <CodeBlock code={`// Page header
<h1 className="text-xl font-semibold">Page Title</h1>
<p className="text-sm text-muted-foreground">Description</p>

// Labels
<span className="text-[10px] text-muted-foreground">Metadata</span>

// Body content
<p className="text-xs">Feature description text</p>`} />
            </section>
        </div>
    );
}
