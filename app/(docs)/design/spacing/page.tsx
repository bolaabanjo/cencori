"use client";

import React, { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

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
                <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={handleCopy}>
                    {copied ? <><Check className="h-3 w-3 mr-1" />Copied</> : <><Copy className="h-3 w-3 mr-1" />Copy</>}
                </Button>
            </div>
            <pre className="p-4 text-xs font-mono text-muted-foreground overflow-x-auto">
                <code>{code}</code>
            </pre>
        </div>
    );
}

const containers = [
    { name: "Dashboard pages", class: "max-w-5xl mx-auto px-6 py-8", description: "Standard dashboard content width" },
    { name: "Landing sections", class: "max-w-6xl mx-auto px-4 md:px-6", description: "Wider for marketing pages" },
    { name: "Docs pages", class: "max-w-4xl mx-auto px-6 py-12", description: "Comfortable reading width" },
];

const componentSpacing = [
    { element: "Cards", padding: "p-4 to p-5", gap: "—" },
    { element: "Buttons (sm)", padding: "h-7 px-2.5 or h-8 px-3", gap: "gap-1.5" },
    { element: "Buttons (default)", padding: "h-9 px-4", gap: "gap-2" },
    { element: "Form rows", padding: "px-4 py-3", gap: "—" },
    { element: "Section margins", padding: "—", gap: "space-y-6" },
];

const verticalRhythm = [
    { pattern: "space-y-1.5", usage: "Tight within form fields" },
    { pattern: "space-y-3", usage: "Within sections" },
    { pattern: "space-y-4", usage: "Between form groups" },
    { pattern: "space-y-6", usage: "Between sections" },
    { pattern: "space-y-8", usage: "Major section breaks" },
    { pattern: "space-y-12", usage: "Page section breaks" },
];

export default function SpacingPage() {
    return (
        <div className="space-y-12">
            {/* Header */}
            <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">Spacing</h1>
                <p className="text-sm text-muted-foreground max-w-2xl">
                    Consistent spacing system for layouts and components.
                </p>
            </div>

            {/* Page Containers */}
            <section className="space-y-4">
                <div>
                    <h2 className="text-lg font-semibold">Page Containers</h2>
                    <p className="text-xs text-muted-foreground mt-1">Standard max-widths for different page types.</p>
                </div>
                <div className="space-y-3">
                    {containers.map((container) => (
                        <div key={container.name} className="rounded-xl border border-border/50 bg-card p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium">{container.name}</span>
                                <code className="text-xs font-mono text-emerald-500 bg-muted px-2 py-0.5 rounded">
                                    {container.class}
                                </code>
                            </div>
                            <p className="text-xs text-muted-foreground">{container.description}</p>
                            {/* Visual representation */}
                            <div className="mt-3 bg-muted/30 rounded-lg p-2">
                                <div className="bg-muted h-2 rounded" style={{
                                    width: container.name.includes("Dashboard") ? "70%" :
                                        container.name.includes("Landing") ? "85%" : "60%",
                                    margin: "0 auto"
                                }} />
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Component Spacing */}
            <section className="space-y-4">
                <div>
                    <h2 className="text-lg font-semibold">Component Spacing</h2>
                    <p className="text-xs text-muted-foreground mt-1">Padding and gaps for common components.</p>
                </div>
                <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                    <div className="grid grid-cols-3 gap-4 px-4 py-2 border-b border-border/40 bg-muted/30">
                        <span className="text-[10px] font-medium text-muted-foreground">Element</span>
                        <span className="text-[10px] font-medium text-muted-foreground">Padding</span>
                        <span className="text-[10px] font-medium text-muted-foreground">Gap</span>
                    </div>
                    {componentSpacing.map((item) => (
                        <div key={item.element} className="grid grid-cols-3 gap-4 px-4 py-3 border-b border-border/40 last:border-0">
                            <span className="text-xs font-medium">{item.element}</span>
                            <code className="text-xs font-mono text-emerald-500">{item.padding}</code>
                            <code className="text-xs font-mono text-muted-foreground">{item.gap}</code>
                        </div>
                    ))}
                </div>
            </section>

            {/* Vertical Rhythm */}
            <section className="space-y-4">
                <div>
                    <h2 className="text-lg font-semibold">Vertical Rhythm</h2>
                    <p className="text-xs text-muted-foreground mt-1">Consistent vertical spacing using space-y-*</p>
                </div>
                <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                    {verticalRhythm.map((item) => (
                        <div key={item.pattern} className="flex items-center justify-between px-4 py-3 border-b border-border/40 last:border-0">
                            <div className="flex items-center gap-4">
                                <code className="text-xs font-mono text-emerald-500 w-24">{item.pattern}</code>
                                <span className="text-xs text-muted-foreground">{item.usage}</span>
                            </div>
                            {/* Visual representation */}
                            <div className="flex flex-col" style={{ gap: parseInt(item.pattern.split('-')[1]) * 4 }}>
                                <div className="w-6 h-1 bg-muted rounded" />
                                <div className="w-6 h-1 bg-muted rounded" />
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Quick Reference */}
            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Quick Reference</h2>
                <CodeBlock code={`// Page container
<div className="max-w-5xl mx-auto px-6 py-8">

// Card
<div className="rounded-xl border border-border/50 bg-card p-5">

// Section spacing
<div className="space-y-6">

// Form row
<div className="flex items-center justify-between px-4 py-3">

// Button
<Button className="h-9 px-4 text-sm rounded-full">`} />
            </section>
        </div>
    );
}
