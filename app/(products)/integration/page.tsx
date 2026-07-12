"use client";

import React from "react";
import Link from "next/link";
import {
    ArrowRightIcon,
    CodeBracketIcon,
    PuzzlePieceIcon,
    CloudArrowUpIcon,
    CursorArrowRaysIcon,
    GlobeAltIcon,
    CheckCircleIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";

import { CTA } from "@/components/landing/CTA";
import { Button } from "@/components/ui/button";
import { TypeScriptLogo, PythonLogo, GoLogo } from "@/components/icons/BrandIcons";

const accessPaths = [
    {
        id: "visual",
        title: "Visual Builder",
        tagline: "No code required",
        description: "Build AI agents and workflows visually in your browser. Drag-and-drop interface with real-time testing.",
        icon: CursorArrowRaysIcon,
        color: "violet",
        features: ["Drag-and-drop workflow builder", "Visual agent designer", "Real-time testing & debugging"],
    },
    {
        id: "automations",
        title: "Automation Platforms",
        tagline: "n8n, Zapier, Make",
        description: "Use Cencori as a node in your existing automation workflows. Connect to 1000+ apps instantly.",
        icon: PuzzlePieceIcon,
        color: "pink",
        features: ["n8n integration", "Zapier connector", "Make (Integromat) module"],
    },
    {
        id: "api",
        title: "REST API",
        tagline: "HTTP from anywhere",
        description: "Direct API access with your API key. Works with any language or platform that can make HTTP requests.",
        icon: GlobeAltIcon,
        color: "cyan",
        features: ["Simple HTTP endpoints", "OpenAPI spec", "Postman collection"],
    },
    {
        id: "sdks",
        title: "Official SDKs",
        tagline: "TypeScript, Python, Go",
        description: "First-class SDKs with full type safety, streaming support, and idiomatic APIs for developers.",
        icon: CodeBracketIcon,
        color: "emerald",
        features: ["TypeScript SDK", "Python SDK", "Go SDK"],
    },
];

const colorClasses: Record<string, { bg: string; border: string; text: string }> = {
    violet: { bg: "bg-violet-500/10", border: "border-violet-500/30", text: "text-violet-500" },
    pink: { bg: "bg-pink-500/10", border: "border-pink-500/30", text: "text-pink-500" },
    cyan: { bg: "bg-cyan-500/10", border: "border-cyan-500/30", text: "text-cyan-500" },
    emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-500" },
};

export default function IntegrationPage() {
    return (
            <main>
                {/* Hero Section */}
                <section className="relative flex flex-col items-center justify-center overflow-hidden bg-background pt-32 pb-20">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-500/5 via-background to-background pointer-events-none" />

                    <div className="container relative z-10 px-4 md:px-6 flex flex-col items-center text-center">
                        <div className="mb-8 animate-appear">
                            <div className="group inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground transition-colors hover:text-foreground">
                                <span>Coming Soon</span>
                            </div>
                        </div>

                        <h1 className="mb-8 max-w-3xl text-[3rem] font-heading font-black leading-[0.95] tracking-[-0.02em] animate-appear sm:text-[4.5rem] lg:text-[5.5rem] text-foreground">
                            <span className="font-serif italic font-normal text-muted-foreground">Integration.</span>
                        </h1>

                        <p className="mb-10 max-w-[38rem] text-base leading-[1.7] text-muted-foreground animate-appear [animation-delay:200ms]">
                            Connect AI everywhere. SDKs, agent frameworks, and platform connectors.
                        </p>

                        <div className="mb-10 flex flex-wrap items-center justify-center gap-3 animate-appear [animation-delay:300ms]">
                            <Link href="/docs/sdk">
                                <Button size="default" className="h-8 px-4 text-xs font-medium rounded-md bg-foreground text-background hover:bg-foreground/90 transition-all">
                                    View SDKs
                                </Button>
                            </Link>
                            <Link href="/docs">
                                <Button variant="outline" size="default" className="h-8 px-4 text-xs font-medium rounded-md border-foreground/20 hover:bg-foreground/5 hover:border-foreground/40 transition-all">
                                    Documentation
                                </Button>
                            </Link>
                        </div>
                    </div>
                </section>

                {/* Ways to Connect Section */}
                <section className="py-20 bg-background">
                    <div className="container mx-auto px-4 md:px-6">
                        <div className="flex flex-col items-center text-center mb-12">
                            <h2 className="text-2xl md:text-4xl font-bold tracking-tighter mb-4 text-foreground">
                                Your way <span className="text-muted-foreground">to connect</span>
                            </h2>
                            <p className="text-base text-muted-foreground max-w-xl">
                                Whether you write code or prefer no-code tools, there&apos;s a path for you.
                            </p>
                        </div>

                        <div className="relative max-w-5xl mx-auto">
                            <div className="relative border border-border/40 bg-background">
                                <div className="absolute -top-[7px] -left-[7px] w-[14px] h-[14px] flex items-center justify-center text-muted-foreground/50 text-xs z-10">+</div>
                                <div className="absolute -top-[7px] -right-[7px] w-[14px] h-[14px] flex items-center justify-center text-muted-foreground/50 text-xs z-10">+</div>
                                <div className="absolute -bottom-[7px] -left-[7px] w-[14px] h-[14px] flex items-center justify-center text-muted-foreground/50 text-xs z-10">+</div>
                                <div className="absolute -bottom-[7px] -right-[7px] w-[14px] h-[14px] flex items-center justify-center text-muted-foreground/50 text-xs z-10">+</div>

                                <div className="grid grid-cols-1 md:grid-cols-2">
                                    {accessPaths.map((path, index) => {
                                        const colors = colorClasses[path.color];
                                        const isLastRow = index >= 2;
                                        const isRightEdge = (index + 1) % 2 === 0;
                                        return (
                                            <div
                                                key={path.id}
                                                className={cn(
                                                    "group relative flex flex-col p-6 transition-colors duration-300 hover:bg-foreground/[0.02]",
                                                    !isLastRow && "border-b border-border/40",
                                                    !isRightEdge && "md:border-r border-border/40"
                                                )}
                                            >
                                                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-4", colors.bg, colors.border, "border")}>
                                                    <path.icon className={cn("h-4 w-4", colors.text)} aria-hidden="true" />
                                                </div>

                                                <h3 className="text-base font-semibold tracking-tight mb-1">{path.title}</h3>
                                                <p className={cn("text-xs font-medium mb-2", colors.text)}>{path.tagline}</p>
                                                <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                                                    {path.description}
                                                </p>

                                                <ul className="mt-auto space-y-1.5">
                                                    {path.features.map((feature: string, i: number) => (
                                                        <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                                                            <CheckCircleIcon className={cn("w-3 h-3", colors.text)} aria-hidden="true" />
                                                            {feature}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* SDK Section - For Developers */}
                <section className="py-20 bg-background">
                    <div className="container mx-auto px-4 md:px-6">
                        <div className="grid lg:grid-cols-2 gap-8 items-center max-w-5xl mx-auto">
                            <div>
                                <p className="text-xs font-medium text-emerald-500 mb-2 uppercase tracking-wider">For Developers</p>
                                <h2 className="text-2xl md:text-4xl font-bold tracking-tighter mb-4 text-foreground">
                                    One API, <span className="text-muted-foreground">every language</span>
                                </h2>
                                <p className="text-base text-muted-foreground mb-6 leading-relaxed">
                                    Prefer to write code? Our SDKs give you full type safety and idiomatic APIs.
                                </p>

                                <div className="space-y-3">
                                    {[
                                        { cmd: "npm install cencori", Icon: TypeScriptLogo, size: "w-5 h-5" },
                                        { cmd: "pip install cencori", Icon: PythonLogo, size: "w-6 h-6" },
                                        { cmd: "go get github.com/cencori/cencori-go", Icon: GoLogo, size: "w-12 h-12" },
                                    ].map(({ cmd, Icon, size }, i) => (
                                        <div key={i} className="flex items-center gap-3">
                                            <div className="w-8 h-8 flex items-center justify-center shrink-0">
                                                <Icon className={size} />
                                            </div>
                                            <code className="text-xs font-mono text-muted-foreground">{cmd}</code>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-6">
                                    <Link href="/docs/sdk">
                                        <Button variant="outline" size="sm" className="h-8 px-4 text-xs rounded-full">
                                            SDK Documentation <ArrowRightIcon className="ml-2 w-3 h-3" aria-hidden="true" />
                                        </Button>
                                    </Link>
                                </div>
                            </div>

                            <div className="relative">
                                <div className="border border-border/40 bg-muted/20 overflow-hidden">
                                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/40 bg-muted/30">
                                        <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
                                        <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
                                        <span className="ml-2 text-[10px] text-muted-foreground">example.ts</span>
                                    </div>
                                    <pre className="p-4 text-xs font-mono overflow-x-auto">
                                        <code className="text-muted-foreground font-mono">
                                            <span className="text-blue-400">import</span> {"{"} Cencori {"}"} <span className="text-blue-400">from</span> <span className="text-emerald-400">&apos;cencori&apos;</span>;{"\n\n"}
                                            <span className="text-blue-400">const</span> cencori = <span className="text-blue-400">new</span> <span className="text-yellow-400">Cencori</span>();{"\n\n"}
                                            <span className="text-slate-500">{"// Works with any AI provider"}</span>{"\n"}
                                            <span className="text-blue-400">const</span> response = <span className="text-blue-400">await</span> cencori.ai.<span className="text-yellow-400">chat</span>({"{"}{"\n"}
                                            {"  "}model: <span className="text-emerald-400">&apos;claude-3-5-sonnet&apos;</span>,{"\n"}
                                            {"  "}messages: [{"{"} role: <span className="text-emerald-400">&apos;user&apos;</span>, content: <span className="text-emerald-400">&apos;Hello!&apos;</span> {"}"}]{"\n"}
                                            {"}"});
                                        </code>
                                    </pre>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Stats Section */}
                <section className="py-16 bg-background">
                    <div className="container mx-auto px-4 md:px-6">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
                            {[
                                { value: "3", label: "Official SDKs" },
                                { value: "10+", label: "Framework Integrations" },
                                { value: "6+", label: "Platform Connectors" },
                                { value: "100%", label: "Type Safe" },
                            ].map((stat) => (
                                <div key={stat.label} className="text-center">
                                    <div className="text-2xl md:text-3xl font-bold tracking-tighter mb-1">{stat.value}</div>
                                    <div className="text-xs text-muted-foreground">{stat.label}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <CTA />
            </main>
    );
}
