"use client";

import React, { useState } from "react";
import { Copy, Check, ArrowRight, Plus, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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

export default function ComponentsPage() {
    const [activeTab, setActiveTab] = useState("general");
    const demoTabs = [
        { id: "general", label: "General", content: "General settings content" },
        { id: "providers", label: "Providers", content: "Providers configuration" },
        { id: "api-keys", label: "API Keys", content: "API key management" },
        { id: "danger", label: "Danger", content: "Danger zone - destructive actions", isDanger: true },
    ];

    return (
        <div className="space-y-12">
            <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">Components</h1>
                <p className="text-sm text-muted-foreground max-w-2xl">
                    Core UI components with Cenpact styling patterns.
                </p>
            </div>

            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Buttons</h2>
                <div className="rounded-xl border border-border/50 bg-card p-6 space-y-6">
                    <div className="flex flex-wrap gap-3">
                        <Button className="h-9 px-4 text-sm rounded-full">
                            Primary
                            <ArrowRight className="h-3 w-3 ml-1.5" />
                        </Button>
                        <Button variant="outline" className="h-8 px-3 text-xs rounded-full">
                            Secondary
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs">
                            Ghost
                        </Button>
                        <Button variant="destructive" size="sm" className="h-7 text-xs gap-1">
                            <Trash2 className="h-3 w-3" />
                            Delete
                        </Button>
                    </div>
                    <CodeBlock code={`// Primary CTA
<Button className="h-9 px-4 text-sm rounded-full">
  Get Started
  <ArrowRight className="h-3 w-3 ml-1.5" />
</Button>

// Secondary
<Button variant="outline" className="h-8 px-3 text-xs rounded-full">
  View Docs
</Button>

// Ghost
<Button variant="ghost" size="sm" className="h-7 text-xs">
  Cancel
</Button>`} />
                </div>
            </section>
            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Badges</h2>
                <div className="rounded-xl border border-border/50 bg-card p-6 space-y-6">
                    <div className="flex flex-wrap gap-3">
                        <Badge variant="outline" className="rounded-full px-3 py-0.5 text-[10px]">
                            Outline
                        </Badge>
                        <Badge className="rounded-full px-2 py-0.5 text-[10px] bg-emerald-500/10 text-emerald-500 border-0">
                            Connected
                        </Badge>
                        <Badge className="rounded-full px-2 py-0.5 text-[10px] bg-amber-500/10 text-amber-500 border-0">
                            Pending
                        </Badge>
                        <Badge className="rounded-full px-2 py-0.5 text-[10px] bg-red-500/10 text-red-500 border-0">
                            Error
                        </Badge>
                    </div>
                    <CodeBlock code={`// Outline
<Badge variant="outline" className="rounded-full px-3 py-0.5 text-[10px]">
  Beta
</Badge>

// Status badges
<Badge className="rounded-full px-2 py-0.5 text-[10px] bg-emerald-500/10 text-emerald-500 border-0">
  Connected
</Badge>`} />
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Cards</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-border/50 bg-card p-5">
                        <h3 className="text-sm font-semibold mb-1">Standard Card</h3>
                        <p className="text-xs text-muted-foreground">
                            Basic card with subtle border and padding.
                        </p>
                    </div>
                    <div className="relative rounded-xl border border-border bg-card p-5 shadow-lg">
                        <Badge variant="outline" className="absolute -top-2.5 left-4 rounded-full px-2 py-0.5 text-[10px] bg-background">
                            Popular
                        </Badge>
                        <h3 className="text-sm font-semibold mb-1 mt-1">Highlighted Card</h3>
                        <p className="text-xs text-muted-foreground">
                            With shadow and badge, no color inversion.
                        </p>
                    </div>
                </div>
                <CodeBlock code={`// Standard card
<div className="rounded-xl border border-border/50 bg-card p-5">
  {children}
</div>

// Highlighted card (badge, no color inversion)
<div className="relative rounded-xl border border-border bg-card p-5 shadow-lg">
  <Badge className="absolute -top-2.5 left-4">Popular</Badge>
  {children}
</div>`} />
            </section>

            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Tabs</h2>
                <div className="rounded-xl border border-border/50 bg-card p-6 space-y-4">
                    <p className="text-xs text-muted-foreground">
                        Tabs must use <code className="text-foreground bg-muted px-1 py-0.5 rounded">whitespace-nowrap</code> to prevent text like &quot;API Keys&quot; from wrapping on mobile.
                    </p>
                    <div className="border border-border/40 rounded-lg overflow-hidden">
                        <div className="flex w-full flex-nowrap overflow-x-auto border-b border-border">
                            {demoTabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`px-3 md:px-4 py-3 text-xs md:text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${activeTab === tab.id
                                            ? tab.isDanger
                                                ? "text-red-500 border-b-2 border-red-500"
                                                : "text-foreground border-b-2 border-foreground"
                                            : tab.isDanger
                                                ? "text-red-500/60 hover:text-red-500"
                                                : "text-muted-foreground hover:text-foreground"
                                        }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                        <div className="p-4 text-xs text-muted-foreground">
                            {demoTabs.find((t) => t.id === activeTab)?.content}
                        </div>
                    </div>
                </div>
                <CodeBlock code={`// TabsTrigger - whitespace-nowrap is critical!
<TabsTrigger className={cn(
  "px-3 md:px-4 py-3 text-xs md:text-sm font-medium",
  "whitespace-nowrap shrink-0",  // Prevents wrapping
  "text-muted-foreground hover:text-foreground",
  "data-[state=active]:text-foreground"
)}>

// TabsList - enables horizontal scroll on mobile
<TabsList className="flex w-full flex-nowrap overflow-x-auto">`} />
            </section>

            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Form Rows</h2>
                <p className="text-xs text-muted-foreground">Desktop-only horizontal layout.</p>
                <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
                        <div className="space-y-0.5">
                            <p className="text-xs font-medium">Project name</p>
                            <p className="text-[10px] text-muted-foreground">Displayed in dashboard</p>
                        </div>
                        <Input defaultValue="My Project" className="w-48 h-8 text-sm" />
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                        <div className="space-y-0.5">
                            <p className="text-xs font-medium">Status</p>
                            <p className="text-[10px] text-muted-foreground">Active or inactive</p>
                        </div>
                        <Badge variant="outline" className="rounded-full text-[10px]">Active</Badge>
                    </div>
                </div>
                <CodeBlock code={`<div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
  <div className="space-y-0.5">
    <p className="text-xs font-medium">Label</p>
    <p className="text-[10px] text-muted-foreground">Description</p>
  </div>
  <Input className="w-48 h-8 text-sm" />
</div>`} />
            </section>

            {/* Settings Form Rows - Mobile Responsive */}
            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Settings Form Rows (Mobile-Responsive)</h2>
                <p className="text-xs text-muted-foreground">Stacks vertically on mobile, horizontal on desktop.</p>
                <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                    {/* Input row */}
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between px-4 py-3 border-b border-border/40 gap-2 md:gap-0">
                        <div className="space-y-0.5">
                            <p className="text-sm md:text-xs font-medium">Project name</p>
                            <p className="text-xs md:text-[10px] text-muted-foreground">Displayed throughout the dashboard.</p>
                        </div>
                        <Input defaultValue="My Project" className="w-full md:w-64 h-10 md:h-8 text-sm md:text-xs" />
                    </div>
                    {/* Badge row */}
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between px-4 py-3 border-b border-border/40 gap-2 md:gap-0">
                        <div className="space-y-0.5">
                            <p className="text-sm md:text-xs font-medium">Project ID</p>
                            <p className="text-xs md:text-[10px] text-muted-foreground">Reference used in APIs.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="px-3 py-1.5 md:py-1 bg-muted/50 rounded-md font-mono text-sm md:text-xs text-muted-foreground">
                                my-project-id
                            </span>
                            <Button variant="outline" size="sm" className="h-8 md:h-7 text-xs gap-1.5">
                                <Copy className="h-3 w-3" />
                                Copy
                            </Button>
                        </div>
                    </div>
                    {/* Save button row */}
                    <div className="flex justify-end px-4 py-2.5 md:py-2 bg-muted/20">
                        <Button size="sm" className="h-9 md:h-7 px-4 md:px-3 text-sm md:text-xs">
                            Save changes
                        </Button>
                    </div>
                </div>
                <CodeBlock code={`// Stacks on mobile, horizontal on desktop
<div className="flex flex-col md:flex-row md:items-center md:justify-between px-4 py-3 border-b border-border/40 gap-2 md:gap-0">
  <div className="space-y-0.5">
    <p className="text-sm md:text-xs font-medium">Label</p>
    <p className="text-xs md:text-[10px] text-muted-foreground">Description</p>
  </div>
  <Input className="w-full md:w-64 h-10 md:h-8 text-sm md:text-xs" />
</div>

// Save button row
<div className="flex justify-end px-4 py-2.5 md:py-2 bg-muted/20">
  <Button size="sm" className="h-9 md:h-7 px-4 md:px-3 text-sm md:text-xs">
    Save changes
  </Button>
</div>`} />
            </section>

            {/* Inputs */}
            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Inputs</h2>
                <div className="rounded-xl border border-border/50 bg-card p-6 space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium">Default</label>
                            <Input placeholder="Enter value..." className="h-8 text-sm" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-red-500">Error</label>
                            <Input className="h-8 text-sm border-red-500" defaultValue="Invalid" />
                            <p className="text-[10px] text-red-500">This field is required</p>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium">With hint</label>
                            <Input placeholder="Email" className="h-8 text-sm" />
                            <p className="text-[10px] text-muted-foreground">We&apos;ll never share your email</p>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
