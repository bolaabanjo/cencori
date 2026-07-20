"use client";

import React, { useState } from "react";
import { Copy, Check, ArrowRight, Settings, User, Search, Bell, Home, Plus, Trash2, Edit, Eye, Download, Upload, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { Cloudflare, Aws, Azure, Google, OpenAI, Claude, Gemini } from "@lobehub/icons";

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

const iconSizes = [
    { context: "Buttons (small)", size: "h-3 w-3", px: "12px" },
    { context: "Buttons (default)", size: "h-4 w-4", px: "16px" },
    { context: "Cards / Lists", size: "h-5 w-5", px: "20px" },
    { context: "Feature icons", size: "h-6 w-6", px: "24px" },
    { context: "Hero icons", size: "h-8 w-8", px: "32px" },
];

export default function IconsPage() {
    return (
        <div className="space-y-12">
            {/* Header */}
            <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">Icons</h1>
                <p className="text-sm text-muted-foreground max-w-2xl">
                    Icon libraries, sizing patterns, and brand icon usage.
                </p>
            </div>

            {/* Icon Sources */}
            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Icon Sources</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-border/50 bg-card p-5">
                        <h3 className="text-sm font-semibold mb-2">Lucide React (Primary)</h3>
                        <p className="text-xs text-muted-foreground mb-4">UI icons for navigation, actions, and status.</p>
                        <div className="flex flex-wrap gap-3">
                            <Home className="h-5 w-5 text-muted-foreground" />
                            <Settings className="h-5 w-5 text-muted-foreground" />
                            <User className="h-5 w-5 text-muted-foreground" />
                            <Search className="h-5 w-5 text-muted-foreground" />
                            <Bell className="h-5 w-5 text-muted-foreground" />
                            <Plus className="h-5 w-5 text-muted-foreground" />
                            <Edit className="h-5 w-5 text-muted-foreground" />
                            <Trash2 className="h-5 w-5 text-muted-foreground" />
                        </div>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-card p-5">
                        <h3 className="text-sm font-semibold mb-2">@lobehub/icons (Brand)</h3>
                        <p className="text-xs text-muted-foreground mb-4">Brand logos for AI providers and platforms.</p>
                        <div className="flex flex-wrap gap-3">
                            <OpenAI size={20} />
                            <Claude size={20} />
                            <Gemini size={20} />
                            <Cloudflare.Color size={20} />
                            <Aws.Color size={20} />
                            <Azure.Color size={20} />
                            <Google.Color size={20} />
                        </div>
                    </div>
                </div>
            </section>

            {/* Icon Sizing */}
            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Icon Sizing</h2>
                <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                    <div className="grid grid-cols-4 gap-4 px-4 py-2 border-b border-border/40 bg-muted/30">
                        <span className="text-[10px] font-medium text-muted-foreground">Context</span>
                        <span className="text-[10px] font-medium text-muted-foreground">Class</span>
                        <span className="text-[10px] font-medium text-muted-foreground">Size</span>
                        <span className="text-[10px] font-medium text-muted-foreground">Example</span>
                    </div>
                    {iconSizes.map((item) => (
                        <div key={item.context} className="grid grid-cols-4 gap-4 px-4 py-3 border-b border-border/40 last:border-0 items-center">
                            <span className="text-xs">{item.context}</span>
                            <code className="text-xs font-mono text-emerald-500">{item.size}</code>
                            <span className="text-xs text-muted-foreground">{item.px}</span>
                            <Settings className={item.size} />
                        </div>
                    ))}
                </div>
            </section>

            {/* Brand Icons */}
            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Brand Icons with Colors</h2>
                <p className="text-xs text-muted-foreground">Use the .Color variant to display brand colors.</p>
                <CodeBlock code={`import { Cloudflare, Aws, Azure, Google, OpenAI, Claude } from "@lobehub/icons";

// Color variants (for cloud platforms)
<Cloudflare.Color size={20} />
<Aws.Color size={20} />
<Azure.Color size={20} />
<Google.Color size={20} />

// Base variants (for AI providers)
<OpenAI size={20} />
<Claude size={20} />

// Monochrome with custom color
<Cloudflare size={20} className="text-muted-foreground" />`} />
            </section>

            {/* Usage with Buttons */}
            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Icons in Buttons</h2>
                <div className="rounded-xl border border-border/50 bg-card p-6 space-y-4">
                    <div className="flex flex-wrap gap-3">
                        <Button size="sm" className="h-8 text-xs rounded-full">
                            <Plus className="h-3 w-3 mr-1.5" />
                            Create
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 text-xs rounded-full">
                            <Download className="h-3 w-3 mr-1.5" />
                            Download
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs">
                            <RefreshCw className="h-3 w-3 mr-1.5" />
                            Refresh
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Settings className="h-4 w-4" />
                        </Button>
                    </div>
                    <CodeBlock code={`// Icon before text
<Button size="sm" className="h-8 text-xs rounded-full">
  <Plus className="h-3 w-3 mr-1.5" />
  Create
</Button>

// Icon after text
<Button className="h-9 px-4 rounded-full">
  Continue
  <ArrowRight className="h-3 w-3 ml-1.5" />
</Button>

// Icon only
<Button variant="ghost" size="icon" className="h-8 w-8">
  <Settings className="h-4 w-4" />
</Button>`} />
                </div>
            </section>
        </div>
    );
}
