"use client";

import React, { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
    GhostContainer,
    GhostBox,
    GhostBoxTitle,
    GhostBoxContent,
    GhostGrid,
    GhostArrow,
    GhostDashedLine,
    GhostPlaceholder,
    GhostCaption,
    GhostLabel,
    GhostIcon,
} from "@/components/ui/ghost-diagram";

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

export default function GhostDiagramsPage() {
    return (
        <div className="space-y-12">
            <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">Ghost Diagrams 👻</h1>
                <p className="text-sm text-muted-foreground max-w-2xl">
                    Minimalist, theme-aware diagrams that blend seamlessly with any background.
                </p>
            </div>

            {/* Philosophy */}
            <section className="space-y-4">
                <h2 className="text-lg font-semibold">The Philosophy</h2>
                <div className="rounded-xl border border-border/50 bg-card p-6">
                    <div className="grid gap-4 md:grid-cols-2 text-sm">
                        <div className="space-y-1">
                            <p className="font-medium">Transparent backgrounds</p>
                            <p className="text-xs text-muted-foreground">No solid fills—let the page show through</p>
                        </div>
                        <div className="space-y-1">
                            <p className="font-medium">currentColor everywhere</p>
                            <p className="text-xs text-muted-foreground">Auto-adapts to light and dark mode</p>
                        </div>
                        <div className="space-y-1">
                            <p className="font-medium">Thin borders</p>
                            <p className="text-xs text-muted-foreground">Never heavier than 1-2px strokes</p>
                        </div>
                        <div className="space-y-1">
                            <p className="font-medium">Subtle opacity</p>
                            <p className="text-xs text-muted-foreground">Use /15, /20, /30, /40 for hierarchy</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Core Technique */}
            <section className="space-y-4">
                <h2 className="text-lg font-semibold">The Core Technique</h2>
                <CodeBlock code={`// [Yes] Ghost style - auto-adapts to theme
<div className="border border-current/20 text-current/60" />

// [No] Fixed colors - breaks in light/dark mode
<div className="border border-gray-700 text-gray-400" />`} />
            </section>

            {/* Live Example */}
            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Live Example</h2>
                <div className="rounded-xl border border-border/50 bg-card p-6">
                    <GhostContainer maxWidth="md">
                        <GhostLabel>User Input</GhostLabel>
                        <GhostBox>
                            <div className="flex items-center gap-3">
                                <GhostIcon>→</GhostIcon>
                                <GhostPlaceholder lines={2} />
                            </div>
                        </GhostBox>
                        <GhostArrow />
                        <GhostBox label="Phase 1">
                            <GhostBoxTitle>Processing</GhostBoxTitle>
                            <GhostGrid items={['Validate', 'Parse', 'Transform']} />
                        </GhostBox>
                        <GhostArrow label="if valid" />
                        <GhostBox variant="success">
                            <GhostBoxTitle>✓ Complete</GhostBoxTitle>
                        </GhostBox>
                        <GhostCaption>Data flow diagram</GhostCaption>
                    </GhostContainer>
                </div>
            </section>

            {/* Primitives */}
            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Available Primitives</h2>
                <div className="rounded-xl border border-border/50 bg-card p-6 space-y-6">
                    <div className="grid gap-4 text-xs">
                        <div className="flex items-start gap-4">
                            <code className="bg-muted px-2 py-1 rounded font-mono w-40 shrink-0">GhostContainer</code>
                            <span className="text-muted-foreground">Root wrapper with max-width and spacing</span>
                        </div>
                        <div className="flex items-start gap-4">
                            <code className="bg-muted px-2 py-1 rounded font-mono w-40 shrink-0">GhostBox</code>
                            <span className="text-muted-foreground">Transparent bordered container with optional label</span>
                        </div>
                        <div className="flex items-start gap-4">
                            <code className="bg-muted px-2 py-1 rounded font-mono w-40 shrink-0">GhostGrid</code>
                            <span className="text-muted-foreground">Grid of small labeled cells</span>
                        </div>
                        <div className="flex items-start gap-4">
                            <code className="bg-muted px-2 py-1 rounded font-mono w-40 shrink-0">GhostArrow</code>
                            <span className="text-muted-foreground">Vertical arrow connector</span>
                        </div>
                        <div className="flex items-start gap-4">
                            <code className="bg-muted px-2 py-1 rounded font-mono w-40 shrink-0">GhostDashedLine</code>
                            <span className="text-muted-foreground">Horizontal dashed line with arrows</span>
                        </div>
                        <div className="flex items-start gap-4">
                            <code className="bg-muted px-2 py-1 rounded font-mono w-40 shrink-0">GhostPlaceholder</code>
                            <span className="text-muted-foreground">Fake text lines (skeleton UI)</span>
                        </div>
                        <div className="flex items-start gap-4">
                            <code className="bg-muted px-2 py-1 rounded font-mono w-40 shrink-0">GhostCaption</code>
                            <span className="text-muted-foreground">Centered caption text</span>
                        </div>
                        <div className="flex items-start gap-4">
                            <code className="bg-muted px-2 py-1 rounded font-mono w-40 shrink-0">GhostLabel</code>
                            <span className="text-muted-foreground">Uppercase tracking label</span>
                        </div>
                        <div className="flex items-start gap-4">
                            <code className="bg-muted px-2 py-1 rounded font-mono w-40 shrink-0">GhostIcon</code>
                            <span className="text-muted-foreground">Small icon placeholder</span>
                        </div>
                    </div>
                </div>
                <CodeBlock code={`import {
  GhostContainer,
  GhostBox,
  GhostBoxTitle,
  GhostGrid,
  GhostArrow,
  GhostCaption
} from '@/components/ui/ghost-diagram';`} />
            </section>

            {/* Variants */}
            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Box Variants</h2>
                <div className="rounded-xl border border-border/50 bg-card p-6">
                    <div className="grid gap-4 md:grid-cols-2">
                        <GhostBox variant="default">
                            <GhostBoxTitle>Default</GhostBoxTitle>
                            <GhostBoxContent>Neutral styling</GhostBoxContent>
                        </GhostBox>
                        <GhostBox variant="muted">
                            <GhostBoxTitle>Muted</GhostBoxTitle>
                            <GhostBoxContent>Subtle tinted background</GhostBoxContent>
                        </GhostBox>
                        <GhostBox variant="success">
                            <GhostBoxTitle>Success</GhostBoxTitle>
                            <GhostBoxContent>Completion, success states</GhostBoxContent>
                        </GhostBox>
                        <GhostBox variant="warning">
                            <GhostBoxTitle>Warning</GhostBoxTitle>
                            <GhostBoxContent>Caution, attention needed</GhostBoxContent>
                        </GhostBox>
                        <GhostBox variant="error">
                            <GhostBoxTitle>Error</GhostBoxTitle>
                            <GhostBoxContent>Failure, blocked states</GhostBoxContent>
                        </GhostBox>
                    </div>
                </div>
            </section>

            {/* Do's and Don'ts */}
            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Do&apos;s and Don&apos;ts</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-3">
                        <p className="text-sm font-medium text-emerald-500">Do</p>
                        <ul className="text-xs text-muted-foreground space-y-2">
                            <li>• Use opacity for hierarchy (/60, /40, /20)</li>
                            <li>• Keep it minimal—remove what you can</li>
                            <li>• Use thin strokes (1-2px max)</li>
                            <li>• Let it breathe with generous padding</li>
                            <li>• Center-align diagrams</li>
                            <li>• Add captions to explain</li>
                            <li>• Use select-none to prevent selection</li>
                        </ul>
                    </div>
                    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5 space-y-3">
                        <p className="text-sm font-medium text-red-500">Don&apos;t</p>
                        <ul className="text-xs text-muted-foreground space-y-2">
                            <li>• Use solid fills (bg-gray-800)</li>
                            <li>• Use fixed colors (text-gray-500)</li>
                            <li>• Add shadows—stay flat</li>
                            <li>• Use gradients—stay simple</li>
                            <li>• Overcrowd—split into multiple</li>
                            <li>• Use heavy fonts—font-medium max</li>
                            <li>• Add animations—keep it static</li>
                        </ul>
                    </div>
                </div>
            </section>

            {/* Opacity Reference */}
            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Opacity Reference</h2>
                <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-border/40 bg-muted/30">
                                <th className="text-left px-4 py-2 font-medium">Use Case</th>
                                <th className="text-left px-4 py-2 font-medium">Opacity</th>
                                <th className="text-left px-4 py-2 font-medium">Preview</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="border-b border-border/30">
                                <td className="px-4 py-2 text-muted-foreground">Primary text</td>
                                <td className="px-4 py-2 font-mono">/80 - /100</td>
                                <td className="px-4 py-2"><span className="text-current/90">Sample text</span></td>
                            </tr>
                            <tr className="border-b border-border/30">
                                <td className="px-4 py-2 text-muted-foreground">Secondary text</td>
                                <td className="px-4 py-2 font-mono">/60</td>
                                <td className="px-4 py-2"><span className="text-current/60">Sample text</span></td>
                            </tr>
                            <tr className="border-b border-border/30">
                                <td className="px-4 py-2 text-muted-foreground">Tertiary text</td>
                                <td className="px-4 py-2 font-mono">/40</td>
                                <td className="px-4 py-2"><span className="text-current/40">Sample text</span></td>
                            </tr>
                            <tr className="border-b border-border/30">
                                <td className="px-4 py-2 text-muted-foreground">Primary borders</td>
                                <td className="px-4 py-2 font-mono">/30</td>
                                <td className="px-4 py-2"><div className="w-16 h-4 border border-current/30 rounded" /></td>
                            </tr>
                            <tr className="border-b border-border/30">
                                <td className="px-4 py-2 text-muted-foreground">Secondary borders</td>
                                <td className="px-4 py-2 font-mono">/20</td>
                                <td className="px-4 py-2"><div className="w-16 h-4 border border-current/20 rounded" /></td>
                            </tr>
                            <tr>
                                <td className="px-4 py-2 text-muted-foreground">Background tint</td>
                                <td className="px-4 py-2 font-mono">/[0.02]</td>
                                <td className="px-4 py-2"><div className="w-16 h-4 bg-current/[0.03] border border-current/15 rounded" /></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
