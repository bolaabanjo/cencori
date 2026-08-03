"use client";

import React, { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check, Copy, DollarSign, CreditCard, Users } from "lucide-react";
import { Reveal } from "@/components/landing/Reveal";
import { Logo } from "@/components/logo";
import { HugeiconsIcon } from "@hugeicons/react";
import {
    ApiGatewayIcon,
    AiSecurityIcon,
    CodeCircleIcon,
    ActivityIcon,
    BadgeDollarSignIcon,
    AiUserIcon,
    FlowConnectionIcon,
} from "@hugeicons/core-free-icons";
import {
    NextjsLogo,
    TanStackLogo,
    ViteLogo,
    VSCodeLogo,
    CursorLogo,
    ClaudeLogo,
    VercelLogo,
    CrewAILogo,
    LangChainLogo,
    LlamaIndexLogo,
    DifyLogo,
} from "@/components/icons/BrandIcons";

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
        </button>
    );
}

export default function AIBuildersPage() {

    return (
            <main>
                {/* ━━━ HERO ━━━ */}
                <section className="bg-background border-b border-border/30 pt-28 sm:pt-36 pb-0 relative overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-foreground/5 via-background to-background pointer-events-none" />

                    <div className="mx-auto max-w-6xl border-t border-x border-border/30 relative px-6 sm:px-12 py-20 sm:py-28 z-10 flex flex-col items-center text-center">
                        <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

                        <Reveal>
                            <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground mb-8">
                                For AI Builders
                            </p>
                        </Reveal>
                        <Reveal delay={0.05}>
                            <h1 className="text-[2.5rem] sm:text-[3.5rem] lg:text-[4.5rem] font-heading font-black leading-[0.95] tracking-[-0.02em] mb-6 max-w-3xl">
                                The platform for
                                <br />
                                <span className="text-muted-foreground">AI-native products.</span>
                            </h1>
                        </Reveal>
                        <Reveal delay={0.1}>
                            <p className="text-base text-muted-foreground max-w-[38rem] mb-10 leading-[1.7]">
                                Gateway, billing, security, and compute — unified behind one API.{" "}
                                Scaffold a new app with <code className="text-[13px] font-mono bg-foreground/5 px-1.5 py-0.5 rounded text-foreground/80">create-cencori-app</code>{" "}
                                or drop into your existing stack with the SDK. Start building, not plumbing.
                            </p>
                        </Reveal>
                        <Reveal delay={0.15}>
                            <div className="flex flex-wrap items-center justify-center gap-3">
                                <Link href="/login">
                                    <Button size="default" className="h-8 px-4 text-xs font-medium rounded-md bg-foreground text-background hover:bg-foreground/90 transition-all">
                                        Start Building Free <ArrowRight className="ml-1.5 h-3 w-3" />
                                    </Button>
                                </Link>
                                <Link href="/docs">
                                    <Button variant="outline" size="default" className="h-8 px-4 text-xs font-medium rounded-md border-foreground/20 hover:bg-foreground/5 hover:border-foreground/40 transition-all">
                                        Documentation
                                    </Button>
                                </Link>
                            </div>
                        </Reveal>
                    </div>
                </section>

                {/* ━━━ TWO PATHS ━━━ */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative">
                        <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="hidden md:flex absolute -top-1.5 left-1/2 -translate-x-1/2 h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="hidden md:flex absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

                        <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/30">
                            {/* Left: New app */}
                            <div className="px-6 py-16 md:py-24 md:pr-12">
                                <Reveal>
                                    <p className="mb-6 text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
                                        Starting from scratch
                                    </p>
                                </Reveal>
                                <Reveal delay={0.05}>
                                    <h2 className="text-2xl sm:text-3xl font-semibold tracking-[-0.03em] leading-[1.15] mb-4">
                                        Scaffold a full-stack AI app
                                        <br />
                                        <span className="text-muted-foreground">in one command.</span>
                                    </h2>
                                </Reveal>
                                <Reveal delay={0.1}>
                                    <p className="text-sm text-muted-foreground leading-[1.7] mb-8 max-w-sm">
                                        Choose from Next.js, TanStack, or a Node.js agent starter. Every template ships with Gateway integration, streaming, security, and config pre-wired.
                                    </p>
                                </Reveal>
                                <Reveal delay={0.15}>
                                    <div className="flex items-center gap-3 px-4 py-3 border border-border/20 rounded-lg bg-foreground/[0.02]">
                                        <span className="text-emerald-400 font-mono text-sm shrink-0">$</span>
                                        <code className="text-sm font-mono text-foreground/80 flex-1">npx create-cencori-app my-app</code>
                                        <CopyButton text="npx create-cencori-app my-app" />
                                    </div>
                                </Reveal>
                                <Reveal delay={0.2}>
                                    <div className="mt-5 grid grid-cols-2 gap-2">
                                        {[
                                            { name: "Next.js", icon: NextjsLogo },
                                            { name: "TanStack", icon: TanStackLogo },
                                            { name: "Cencori Agent", icon: "cencori" },
                                            { name: "+ more", icon: null },
                                        ].map((t) => (
                                            <div key={t.name} className="flex items-center gap-2 px-3 py-2 rounded-md border border-border/15 bg-foreground/[0.02]">
                                                {t.icon === "cencori" ? (
                                                    <Logo variant="mark" className="h-3 opacity-60" />
                                                ) : typeof t.icon === "function" ? (
                                                    <t.icon className="h-4 w-4 opacity-60" />
                                                ) : null}
                                                <span className="text-[11px] font-medium text-foreground/70">{t.name}</span>
                                            </div>
                                        ))}
                                        <div className="col-span-2 flex items-center justify-between px-3 py-2 rounded-md border border-border/15 bg-emerald-500/5 border-emerald-500/15">
                                            <span className="text-[11px] font-medium text-emerald-500/80">All pre-wired to Gateway</span>
                                            <div className="w-2 h-2 rounded-full bg-emerald-500/40" />
                                        </div>
                                    </div>
                                </Reveal>

                                <Reveal delay={0.25}>
                                    <div className="mt-8 grid grid-cols-2 gap-2">
                                        {[
                                            { icon: ApiGatewayIcon, label: "Gateway proxy" },
                                            { icon: AiUserIcon, label: "Monetization" },
                                            { icon: AiSecurityIcon, label: "Security filters" },
                                            { icon: CodeCircleIcon, label: "Agent compute" },
                                        ].map((item) => (
                                            <div key={item.label} className="flex items-center gap-2.5 px-3 py-2.5 rounded-md border border-border/15 bg-foreground/[0.02]">
                                                <div className="flex items-center justify-center w-6 h-6 rounded-md bg-foreground/5 shrink-0">
                                                    <HugeiconsIcon icon={item.icon} size={12} className="text-muted-foreground" />
                                                </div>
                                                <span className="text-[11px] font-medium text-foreground/70">{item.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </Reveal>
                            </div>

                            {/* Right: Existing app */}
                            <div className="px-6 py-16 md:py-24 md:pl-12">
                                <Reveal>
                                    <p className="mb-6 text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
                                        Already have an app
                                    </p>
                                </Reveal>
                                <Reveal delay={0.05}>
                                    <h2 className="text-2xl sm:text-3xl font-semibold tracking-[-0.03em] leading-[1.15] mb-4">
                                        Works with
                                        <br />
                                        <span className="text-muted-foreground">every AI framework.</span>
                                    </h2>
                                </Reveal>
                                <Reveal delay={0.1}>
                                    <p className="text-sm text-muted-foreground leading-[1.7] mb-8 max-w-sm">
                                        First-class SDK for Vercel AI SDK and TanStack. OpenAI-compatible endpoint for every other framework — LangChain, CrewAI, AutoGen, LlamaIndex, and more.
                                    </p>
                                </Reveal>

                                {/* Vercel AI SDK */}
                                <Reveal delay={0.15}>
                                    <div className="border border-border/20 rounded-lg overflow-hidden">
                                        <div className="flex items-center justify-between px-4 py-2.5 bg-foreground/[0.03] border-b border-border/20">
                                            <div className="flex items-center gap-2">
                                                <Logo variant="mark" className="h-3.5 w-3.5 opacity-50" />
                                                <span className="text-[10px] font-mono text-muted-foreground/50">route.ts</span>
                                            </div>
                                            <CopyButton text={[
                                                "import { cencori } from 'cencori';",
                                                "import { streamText } from 'ai';",
                                                "",
                                                "const result = streamText({",
                                                "  model: cencori('gpt-4o'),",
                                                "  messages,",
                                                "});",
                                            ].join('\n')} />
                                        </div>
                                        <pre className="text-[12px] font-mono leading-[1.7] text-foreground/80 p-4 overflow-x-auto">
                                            <code>
                                                <span className="text-muted-foreground/40">1</span>{"  "}<span className="text-violet-400">import</span> {"{ "}<span className="text-foreground">cencori</span>{" }"} <span className="text-violet-400">from</span> <span className="text-emerald-400">&apos;cencori&apos;</span>;{"\n"}
                                                <span className="text-muted-foreground/40">2</span>{"  "}<span className="text-violet-400">import</span> {"{ "}<span className="text-foreground">streamText</span>{" }"} <span className="text-violet-400">from</span> <span className="text-emerald-400">&apos;ai&apos;</span>;{"\n"}
                                                <span className="text-muted-foreground/40">3</span>{"\n"}
                                                <span className="text-muted-foreground/40">4</span>{"  "}<span className="text-violet-400">const</span> result = <span className="text-blue-400">streamText</span>({"{"}{"\n"}
                                                <span className="text-muted-foreground/40">5</span>{"    "}model: <span className="text-blue-400">cencori</span>(<span className="text-emerald-400">&apos;gpt-4o&apos;</span>),{"\n"}
                                                <span className="text-muted-foreground/40">6</span>{"    "}messages,{"\n"}
                                                <span className="text-muted-foreground/40">7</span>{"  "}{"}"});
                                            </code>
                                        </pre>
                                    </div>
                                </Reveal>

                                {/* Universal endpoint */}
                                <Reveal delay={0.2}>
                                    <div className="mt-5 border border-border/20 rounded-lg overflow-hidden">
                                        <div className="flex items-center justify-between px-4 py-2.5 bg-foreground/[0.03] border-b border-border/20">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-mono text-emerald-500/60">OPENAI_COMPATIBLE</span>
                                                <span className="text-[10px] font-mono text-muted-foreground/50">.env</span>
                                            </div>
                                            <CopyButton text="OPENAI_BASE_URL=https://api.cencori.com/v1" />
                                        </div>
                                        <pre className="text-[12px] font-mono leading-[1.7] text-foreground/80 p-4 overflow-x-auto">
                                            <code>
                                                <span className="text-muted-foreground/40">1</span>{"  "}<span className="text-foreground">OPENAI_BASE_URL</span>=<span className="text-emerald-400">https://api.cencori.com/v1</span>{"\n"}
                                                <span className="text-muted-foreground/40">2</span>{"  "}<span className="text-foreground">OPENAI_API_KEY</span>=<span className="text-emerald-400">cake_your_key_here</span>
                                            </code>
                                        </pre>
                                    </div>
                                </Reveal>
                                <Reveal delay={0.25}>
                                    <p className="text-[11px] text-muted-foreground/60 mt-3 leading-relaxed">
                                        Works with LangChain, LangGraph, LlamaIndex, CrewAI, AutoGen, Dify, and any OpenAI-compatible SDK in any language.
                                    </p>
                                </Reveal>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ━━━ PLATFORM CAPABILITIES ━━━ */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative">
                        <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

                        {/* Header */}
                        <div className="flex flex-col px-6 py-20 sm:px-12 sm:py-28">
                            <Reveal>
                                <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground mb-4">The platform</p>
                            </Reveal>
                            <Reveal delay={0.05}>
                                <h2 className="text-3xl sm:text-[2.75rem] font-semibold tracking-[-0.03em] leading-[1.1] mb-6 max-w-xl">
                                    Everything you need
                                    <br />
                                    <span className="text-muted-foreground">to build AI products.</span>
                                </h2>
                            </Reveal>
                            <Reveal delay={0.1}>
                                <p className="text-muted-foreground text-sm leading-[1.7] max-w-lg">
                                    Instead of stitching together providers, vector stores, billing systems, and security middleware — you get one platform with one API.
                                </p>
                            </Reveal>
                        </div>

                        {/* Connected grid */}
                        <div className="relative border-t border-border/30">
                            <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                            <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                                {[
                                    { hugeicon: ApiGatewayIcon, title: "Multi-Provider Gateway", desc: "Route requests to any LLM through a single OpenAI-compatible endpoint. Automatic fallback, model equivalence mapping, and 14+ providers." },
                                    { hugeicon: AiSecurityIcon, title: "AI Security", desc: "Prompt injection detection, PII scanning, and content moderation on every request. Zero-config, active by default." },
                                    { hugeicon: CodeCircleIcon, title: "Agent Compute", desc: "Serverless code execution for AI agents. Run tools, fetch data, and execute code without managing infrastructure." },
                                    { hugeicon: ActivityIcon, title: "Observability", desc: "Full request/response logging, P50/P90/P99 latency, token usage, and cost tracking. See everything in real time." },
                                    { hugeicon: BadgeDollarSignIcon, title: "Monetization", desc: "Meter token usage, set markup pricing, and collect payments via Stripe Connect. Monetize your AI product from day one." },
                                    { hugeicon: AiUserIcon, title: "Rate Limits & Budgets", desc: "Per-user rate limits and spending caps. Prevent abuse, control costs, and enforce plans without writing billing code." },
                                ].map((item, i) => (
                                    <Reveal key={item.title} delay={i * 0.05}>
                                    <div
                                        className={cn(
                                            "group p-8 transition-colors duration-300 hover:bg-foreground/[0.02]",
                                            "border-b border-border/30",
                                            i === 5 && "border-b-0",
                                            i >= 4 && "md:border-b-0",
                                            i >= 3 && "lg:border-b-0",
                                            i % 2 === 0 && "md:border-r md:border-border/30",
                                            i % 3 !== 2 && "lg:border-r lg:border-border/30",
                                            i % 3 === 2 && "lg:border-r-0",
                                        )}
                                    >
                                            <div className="mb-4 inline-flex items-center justify-center w-8 h-8 rounded-lg bg-foreground/5 text-foreground group-hover:text-emerald-500 transition-colors">
                                                <HugeiconsIcon icon={item.hugeicon} size={16} />
                                            </div>
                                            <h3 className="text-sm font-medium mb-2">{item.title}</h3>
                                            <p className="text-[13px] text-muted-foreground leading-[1.7]">{item.desc}</p>
                                        </div>
                                    </Reveal>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                {/* ━━━ BILL YOUR USERS ━━━ */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative px-6 sm:px-12 py-24 sm:py-32">
                        <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-start">
                            <div>
                                <Reveal>
                                    <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground mb-4">Monetize your AI</p>
                                </Reveal>
                                <Reveal delay={0.05}>
                                    <h2 className="text-3xl sm:text-[2.75rem] font-semibold tracking-[-0.03em] leading-[1.1] mb-6">
                                        Bill your users
                                        <br />
                                        <span className="text-muted-foreground">for every token.</span>
                                    </h2>
                                </Reveal>
                                <Reveal delay={0.1}>
                                    <p className="text-muted-foreground text-sm leading-[1.7] mb-8 max-w-md">
                                        Set your margin on every model. Cencori meters usage, enforces rate plans, and handles Stripe payouts. You focus on building — we do the billing.
                                    </p>
                                </Reveal>
                                <Reveal delay={0.15}>
                                    <div className="space-y-4">
                                        {[
                                            { title: "Markup pricing", desc: "Buy tokens at cost, sell at your price. Set a 2x, 5x, or 10x markup per model. The math is automatic." },
                                            { title: "Stripe Connect", desc: "Users pay you directly via Stripe. Cencori handles metering and invoicing. No PCI compliance, no billing infrastructure." },
                                            { title: "Per-user rate plans", desc: "Free tier, pro tier, enterprise tier — define budgets and rate limits per plan. Enforce them without writing code." },
                                        ].map((item, i) => (
                                            <div key={item.title} className="flex gap-4">
                                                <span className="text-emerald-500/60 text-sm mt-0.5 shrink-0">&#x2713;</span>
                                                <div>
                                                    <span className="text-sm font-medium text-foreground">{item.title}</span>
                                                    <p className="text-[13px] text-muted-foreground leading-[1.7] mt-0.5">{item.desc}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </Reveal>
                            </div>

                            {/* Economics card */}
                            <Reveal delay={0.1}>
                                <div className="border border-border/20 rounded-lg p-6 bg-foreground/[0.02]">
                                    <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground mb-6">Example economics</p>
                                    <div className="space-y-5">
                                        <div className="flex justify-between items-center pb-4 border-b border-border/10">
                                            <span className="text-sm text-muted-foreground">Your cost (GPT-4o)</span>
                                            <span className="text-sm font-mono text-muted-foreground">$0.002 / request</span>
                                        </div>
                                        <div className="flex justify-between items-center pb-4 border-b border-border/10">
                                            <span className="text-sm text-muted-foreground">Your markup</span>
                                            <span className="text-sm font-mono text-emerald-500">5x</span>
                                        </div>
                                        <div className="flex justify-between items-center pb-4 border-b border-border/10">
                                            <span className="text-sm text-muted-foreground">You charge user</span>
                                            <span className="text-sm font-mono text-foreground">$0.01 / request</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm font-medium">Your margin</span>
                                            <span className="text-sm font-mono font-medium text-emerald-500">$0.008 / request</span>
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground/50 mt-6 leading-relaxed">
                                        At 100K requests/day, that&apos;s $800/day margin. Cencori handles the metering, invoicing, and collection.
                                    </p>
                                </div>
                            </Reveal>
                        </div>
                    </div>
                </section>

                {/* ━━━ WORKS WITH ━━━ */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative px-6 sm:px-12 py-20 sm:py-28">
                        <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

                        <div className="max-w-2xl mx-auto text-center">
                            <Reveal>
                                <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground mb-10">Works with your stack</p>
                            </Reveal>
                            <Reveal delay={0.05}>
                                <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground mb-6">AI Frameworks</p>
                                <div className="flex flex-wrap justify-center gap-x-12 gap-y-8 items-center mb-14">
                                    {[
                                        { name: "Vercel AI SDK", Logo: VercelLogo },
                                        { name: "LangChain", Logo: LangChainLogo },
                                        { name: "CrewAI", Logo: CrewAILogo },
                                        { name: "LlamaIndex", Logo: LlamaIndexLogo },
                                        { name: "TanStack", Logo: TanStackLogo },
                                        { name: "AutoGen", Logo: null },
                                    ].map((tool) => (
                                        <div key={tool.name} className="flex items-center gap-3 text-muted-foreground hover:text-foreground transition-colors duration-300 cursor-default">
                                            {tool.Logo ? (
                                                <tool.Logo className="h-5 w-5 opacity-40 hover:opacity-90 transition-opacity duration-300" size={20} />
                                            ) : (
                                                <HugeiconsIcon icon={FlowConnectionIcon} size={18} className="opacity-40 text-muted-foreground" />
                                            )}
                                            <span className="text-sm font-medium">{tool.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </Reveal>
                            <Reveal delay={0.1}>
                                <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground mb-6">Editors & Platforms</p>
                                <div className="flex flex-wrap justify-center gap-x-12 gap-y-8 items-center">
                                    {[
                                        { name: "Cursor", Logo: CursorLogo },
                                        { name: "VS Code", Logo: VSCodeLogo },
                                        { name: "Claude", Logo: ClaudeLogo },
                                        { name: "Next.js", Logo: NextjsLogo },
                                        { name: "Vite", Logo: ViteLogo },
                                    ].map((tool) => (
                                        <div key={tool.name} className="flex items-center gap-3 text-muted-foreground hover:text-foreground transition-colors duration-300 cursor-default">
                                            <tool.Logo className="h-5 w-5 opacity-40 hover:opacity-90 transition-opacity duration-300" size={20} />
                                            <span className="text-sm font-medium">{tool.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </Reveal>
                        </div>
                    </div>
                </section>

                {/* ━━━ CTA ━━━ */}
                <section className="bg-background">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative px-6 sm:px-12 py-28 sm:py-36 text-center">
                        <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

                        <Reveal>
                            <h2 className="text-3xl sm:text-[2.75rem] font-semibold tracking-[-0.03em] leading-[1.1] mb-5">
                                Ship AI products.
                                <br />
                                <span className="text-muted-foreground">Not infrastructure.</span>
                            </h2>
                        </Reveal>
                        <Reveal delay={0.05}>
                            <p className="text-muted-foreground text-sm leading-[1.7] mb-10 max-w-md mx-auto">
                                Gateway, billing, security, and compute — unified. Free to start, pay when you scale.
                            </p>
                        </Reveal>
                        <Reveal delay={0.1}>
                            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                <Link href="/login">
                                    <Button size="sm" className="h-7 text-xs px-3 bg-foreground text-background hover:bg-foreground/90">
                                        Start Building Free <ArrowRight className="ml-1.5 h-3 w-3" />
                                    </Button>
                                </Link>
                                <Link href="/pricing">
                                    <Button variant="outline" size="sm" className="h-7 text-xs px-3">
                                        View Pricing
                                    </Button>
                                </Link>
                            </div>
                        </Reveal>
                    </div>
                </section>
            </main>
    );
}
