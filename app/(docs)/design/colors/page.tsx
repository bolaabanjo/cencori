"use client";

import React, { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

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

const semanticColors = [
    { name: "Foreground", token: "foreground", light: "hsl(0 0% 9%)", dark: "hsl(0 0% 98%)", class: "bg-foreground" },
    { name: "Background", token: "background", light: "hsl(0 0% 100%)", dark: "hsl(0 0% 5%)", class: "bg-background border" },
    { name: "Muted", token: "muted", light: "hsl(0 0% 96%)", dark: "hsl(0 0% 12%)", class: "bg-muted" },
    { name: "Card", token: "card", light: "hsl(0 0% 100%)", dark: "hsl(0 0% 8%)", class: "bg-card border" },
    { name: "Border", token: "border", light: "hsl(0 0% 90%)", dark: "hsl(0 0% 15%)", class: "bg-border" },
];

const accentColors = [
    { name: "Emerald", usage: "Success, connected, active", class: "bg-emerald-500", textClass: "text-emerald-500" },
    { name: "Amber", usage: "Warning, pending, soon", class: "bg-amber-500", textClass: "text-amber-500" },
    { name: "Red", usage: "Error, destructive, danger", class: "bg-red-500", textClass: "text-red-500" },
    { name: "Blue", usage: "Info, links (rare)", class: "bg-blue-500", textClass: "text-blue-500" },
];

const opacityPatterns = [
    { pattern: "border-border", description: "Full opacity", value: "100%" },
    { pattern: "border-border/50", description: "Soft (common)", value: "50%" },
    { pattern: "border-border/40", description: "Subtle", value: "40%" },
    { pattern: "bg-muted", description: "Full muted", value: "100%" },
    { pattern: "bg-muted/50", description: "Hover states", value: "50%" },
    { pattern: "bg-muted/30", description: "Very subtle", value: "30%" },
];

export default function ColorsPage() {
    return (
        <div className="space-y-12">
            <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">Colors</h1>
                <p className="text-sm text-muted-foreground max-w-2xl">
                    Semantic color tokens and accent colors for consistent theming.
                </p>
            </div>

            <section className="space-y-4">
                <div>
                    <h2 className="text-lg font-semibold">Semantic Tokens</h2>
                    <p className="text-xs text-muted-foreground mt-1">These tokens adapt automatically to dark/light mode.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {semanticColors.map((color) => (
                        <div key={color.name} className="rounded-xl border border-border/50 bg-card p-4">
                            <div className={cn("w-full h-12 rounded-lg mb-3", color.class)} />
                            <div className="space-y-1">
                                <p className="text-sm font-medium">{color.name}</p>
                                <p className="text-[10px] font-mono text-muted-foreground">{color.token}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="space-y-4">
                <div>
                    <h2 className="text-lg font-semibold">Accent Colors</h2>
                    <p className="text-xs text-muted-foreground mt-1">Use sparingly for status and emphasis.</p>
                </div>
                <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                    {accentColors.map((color) => (
                        <div key={color.name} className="flex items-center gap-4 px-4 py-3 border-b border-border/40 last:border-0">
                            <div className={cn("w-8 h-8 rounded-lg", color.class)} />
                            <div className="flex-1">
                                <p className={cn("text-sm font-medium", color.textClass)}>{color.name}</p>
                                <p className="text-[10px] text-muted-foreground">{color.usage}</p>
                            </div>
                            <code className="text-xs font-mono text-muted-foreground">{color.textClass}</code>
                        </div>
                    ))}
                </div>
            </section>

            <section className="space-y-4">
                <div>
                    <h2 className="text-lg font-semibold">Opacity Patterns</h2>
                    <p className="text-xs text-muted-foreground mt-1">Use opacity modifiers for subtle variations.</p>
                </div>
                <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                    <div className="grid grid-cols-3 gap-4 px-4 py-2 border-b border-border/40 bg-muted/30">
                        <span className="text-[10px] font-medium text-muted-foreground">Pattern</span>
                        <span className="text-[10px] font-medium text-muted-foreground">Usage</span>
                        <span className="text-[10px] font-medium text-muted-foreground">Opacity</span>
                    </div>
                    {opacityPatterns.map((item) => (
                        <div key={item.pattern} className="grid grid-cols-3 gap-4 px-4 py-3 border-b border-border/40 last:border-0">
                            <code className="text-xs font-mono text-emerald-500">{item.pattern}</code>
                            <span className="text-xs text-muted-foreground">{item.description}</span>
                            <span className="text-xs">{item.value}</span>
                        </div>
                    ))}
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Usage Example</h2>
                <CodeBlock code={`// Semantic tokens (theme-aware)
className="bg-background text-foreground"
className="border-border bg-card"
className="text-muted-foreground"

// Accent colors
className="text-emerald-500 bg-emerald-500/10"
className="text-amber-500"
className="text-red-500"

// Opacity modifiers
className="border-border/50"
className="bg-muted/30"`} />
            </section>

            <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
                <div className="flex items-start gap-3">
                    <span className="text-lg">⚠️</span>
                    <div>
                        <h3 className="text-sm font-semibold text-amber-500 mb-1">Avoid Raw Colors</h3>
                        <p className="text-xs text-muted-foreground">
                            Never use raw values like <code className="bg-muted px-1 rounded">bg-white</code> or <code className="bg-muted px-1 rounded">text-black</code>.
                            Always use semantic tokens so colors adapt to theme changes.
                        </p>
                    </div>
                </div>
            </section>
        </div>
    );
}
