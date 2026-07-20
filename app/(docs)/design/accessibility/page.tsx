"use client";

import React, { useState } from "react";
import { Copy, Check, X, Keyboard, Eye } from "lucide-react";
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

const wcagContrast = [
    { level: "AA Normal", ratio: "4.5:1", usage: "Body text (14px regular)" },
    { level: "AA Large", ratio: "3:1", usage: "Large text (18px+ or 14px bold)" },
    { level: "AAA Normal", ratio: "7:1", usage: "Enhanced accessibility" },
];

export default function AccessibilityPage() {
    return (
        <div className="space-y-12">
            <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">Accessibility</h1>
                <p className="text-sm text-muted-foreground max-w-2xl">
                    Guidelines for building accessible, inclusive interfaces.
                </p>
            </div>

            <section className="space-y-4">
                <div className="flex items-center gap-2">
                    <Keyboard className="h-5 w-5 text-muted-foreground" />
                    <h2 className="text-lg font-semibold">Focus States</h2>
                </div>
                <p className="text-xs text-muted-foreground">All interactive elements must have visible focus indicators.</p>
                <div className="rounded-xl border border-border/50 bg-card p-6 space-y-4">
                    <div className="flex flex-wrap gap-3">
                        <Button size="sm" className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                            Tab to focus me
                        </Button>
                        <Button variant="outline" size="sm">
                            Or me
                        </Button>
                    </div>
                    <CodeBlock code={`// Default focus ring (from Tailwind/shadcn)
focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2

// Custom focus for dark backgrounds
focus-visible:ring-2 focus-visible:ring-white/20`} />
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Keyboard Navigation</h2>
                <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                    <div className="divide-y divide-border/40">
                        <div className="flex items-center gap-3 px-4 py-3">
                            <kbd className="px-2 py-1 bg-muted rounded text-[10px] font-mono">Tab</kbd>
                            <span className="text-xs text-muted-foreground">Move focus to next element</span>
                        </div>
                        <div className="flex items-center gap-3 px-4 py-3">
                            <kbd className="px-2 py-1 bg-muted rounded text-[10px] font-mono">Shift + Tab</kbd>
                            <span className="text-xs text-muted-foreground">Move focus to previous element</span>
                        </div>
                        <div className="flex items-center gap-3 px-4 py-3">
                            <kbd className="px-2 py-1 bg-muted rounded text-[10px] font-mono">Enter / Space</kbd>
                            <span className="text-xs text-muted-foreground">Activate buttons and links</span>
                        </div>
                        <div className="flex items-center gap-3 px-4 py-3">
                            <kbd className="px-2 py-1 bg-muted rounded text-[10px] font-mono">Escape</kbd>
                            <span className="text-xs text-muted-foreground">Close modals and dropdowns</span>
                        </div>
                    </div>
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-lg font-semibold">ARIA Patterns</h2>
                <CodeBlock code={`// Icon-only buttons MUST have aria-label
<Button size="icon" aria-label="Close dialog">
  <X className="h-4 w-4" />
</Button>

// Loading states
<Button disabled aria-busy="true">
  <Loader2 className="animate-spin" aria-hidden="true" />
  Loading
</Button>

// Status indicators need labels
<span 
  className="w-2 h-2 rounded-full bg-emerald-500" 
  role="status"
  aria-label="Active"
/>

// Form inputs need labels
<label htmlFor="email" className="text-xs">Email</label>
<Input id="email" type="email" aria-describedby="email-hint" />
<p id="email-hint" className="text-[10px]">We won't share your email</p>`} />
            </section>

            <section className="space-y-4">
                <div className="flex items-center gap-2">
                    <Eye className="h-5 w-5 text-muted-foreground" />
                    <h2 className="text-lg font-semibold">Color Contrast</h2>
                </div>
                <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                    <div className="grid grid-cols-3 gap-4 px-4 py-2 border-b border-border/40 bg-muted/30">
                        <span className="text-[10px] font-medium text-muted-foreground">WCAG Level</span>
                        <span className="text-[10px] font-medium text-muted-foreground">Ratio</span>
                        <span className="text-[10px] font-medium text-muted-foreground">Usage</span>
                    </div>
                    {wcagContrast.map((item) => (
                        <div key={item.level} className="grid grid-cols-3 gap-4 px-4 py-3 border-b border-border/40 last:border-0">
                            <span className="text-xs font-medium">{item.level}</span>
                            <code className="text-xs font-mono text-emerald-500">{item.ratio}</code>
                            <span className="text-xs text-muted-foreground">{item.usage}</span>
                        </div>
                    ))}
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Common Mistakes</h2>
                <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <X className="h-4 w-4 text-red-500" />
                            <span className="text-xs font-medium text-red-500">Do Not</span>
                        </div>
                        <ul className="space-y-1.5">
                            <li className="text-xs text-muted-foreground">Use color alone to convey information</li>
                            <li className="text-xs text-muted-foreground">Disable zoom on mobile</li>
                            <li className="text-xs text-muted-foreground">Remove focus outlines without replacements</li>
                            <li className="text-xs text-muted-foreground">Use tabindex greater than 0</li>
                        </ul>
                    </div>
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Check className="h-4 w-4 text-emerald-500" />
                            <span className="text-xs font-medium text-emerald-500">Do</span>
                        </div>
                        <ul className="space-y-1.5">
                            <li className="text-xs text-muted-foreground">Add icons or text alongside color</li>
                            <li className="text-xs text-muted-foreground">Support 200% zoom</li>
                            <li className="text-xs text-muted-foreground">Provide visible focus-visible rings</li>
                            <li className="text-xs text-muted-foreground">Use logical tab order (DOM order)</li>
                        </ul>
                    </div>
                </div>
            </section>
        </div>
    );
}
