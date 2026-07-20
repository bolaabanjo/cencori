"use client";

import React, { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

export default function LayoutsPage() {
    return (
        <div className="space-y-12">
            {/* Header */}
            <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">Layouts</h1>
                <p className="text-sm text-muted-foreground max-w-2xl">
                    Page templates and layout patterns for dashboard and landing pages.
                </p>
            </div>

            {/* Dashboard Page */}
            <section className="space-y-4">
                <div>
                    <h2 className="text-lg font-semibold">Dashboard Page Template</h2>
                    <p className="text-xs text-muted-foreground mt-1">Standard layout for dashboard content pages.</p>
                </div>
                {/* Visual preview */}
                <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
                    <div className="bg-card rounded-lg border border-border/50 p-4 max-w-md mx-auto">
                        <div className="space-y-3">
                            <div>
                                <div className="h-4 w-24 bg-muted rounded mb-1" />
                                <div className="h-2 w-48 bg-muted/50 rounded" />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="h-16 bg-muted/50 rounded-lg" />
                                <div className="h-16 bg-muted/50 rounded-lg" />
                                <div className="h-16 bg-muted/50 rounded-lg" />
                            </div>
                        </div>
                    </div>
                    <p className="text-center text-[10px] text-muted-foreground mt-3">max-w-5xl mx-auto px-6 py-8</p>
                </div>
                <CodeBlock code={`<div className="w-full max-w-5xl mx-auto px-6 py-8 space-y-6">
  {/* Header */}
  <div>
    <h1 className="text-xl font-semibold">Page Title</h1>
    <p className="text-sm text-muted-foreground">Description</p>
  </div>

  {/* Content */}
  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
    {cards}
  </div>
</div>`} />
            </section>

            {/* Landing Section */}
            <section className="space-y-4">
                <div>
                    <h2 className="text-lg font-semibold">Landing Section Template</h2>
                    <p className="text-xs text-muted-foreground mt-1">Standard layout for marketing page sections.</p>
                </div>
                {/* Visual preview */}
                <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
                    <div className="bg-card rounded-lg border border-border/50 p-4 max-w-lg mx-auto text-center">
                        <Badge variant="outline" className="rounded-full text-[10px] mb-3">Label</Badge>
                        <div className="h-5 w-48 bg-muted rounded mx-auto mb-2" />
                        <div className="h-2 w-64 bg-muted/50 rounded mx-auto mb-4" />
                        <div className="grid grid-cols-2 gap-2">
                            <div className="h-20 bg-muted/50 rounded-lg" />
                            <div className="h-20 bg-muted/50 rounded-lg" />
                        </div>
                    </div>
                    <p className="text-center text-[10px] text-muted-foreground mt-3">max-w-6xl mx-auto py-20</p>
                </div>
                <CodeBlock code={`<section className="py-20 px-4">
  <div className="max-w-6xl mx-auto">
    <div className="text-center mb-12">
      <Badge>Label</Badge>
      <h2 className="text-2xl md:text-4xl font-bold mt-4">
        Section Title
      </h2>
      <p className="text-muted-foreground max-w-md mx-auto mt-4">
        Description text
      </p>
    </div>
    {/* Content */}
  </div>
</section>`} />
            </section>

            {/* Grid Patterns */}
            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Grid Patterns</h2>
                <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                    <div className="px-4 py-2 border-b border-border/40 bg-muted/30">
                        <span className="text-[10px] font-medium text-muted-foreground">Common grid configurations</span>
                    </div>
                    <div className="divide-y divide-border/40">
                        <div className="flex items-center justify-between px-4 py-3">
                            <code className="text-xs font-mono text-emerald-500">grid-cols-1 md:grid-cols-2</code>
                            <span className="text-xs text-muted-foreground">Two-column on tablet+</span>
                        </div>
                        <div className="flex items-center justify-between px-4 py-3">
                            <code className="text-xs font-mono text-emerald-500">grid-cols-1 md:grid-cols-2 lg:grid-cols-3</code>
                            <span className="text-xs text-muted-foreground">Three-column on desktop</span>
                        </div>
                        <div className="flex items-center justify-between px-4 py-3">
                            <code className="text-xs font-mono text-emerald-500">grid-cols-2 lg:grid-cols-4</code>
                            <span className="text-xs text-muted-foreground">Four-column cards</span>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
