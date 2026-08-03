"use client";

import React, { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check, Copy, Shield, FileSearch, DollarSign, GitBranch, Users, Lock, Eye, BarChart3, Siren } from "lucide-react";
import { Reveal } from "@/components/landing/Reveal";

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

const complianceItems = [
    { name: "GLBA", desc: "Financial privacy", comingSoon: true },
    { name: "SOX", desc: "Audit & controls", comingSoon: true },
    { name: "PCI DSS", desc: "Card data", comingSoon: true },
    { name: "SOC 2", desc: "Type II", comingSoon: true },
    { name: "GDPR", desc: "Data rights", comingSoon: true },
    { name: "CCPA", desc: "Privacy", comingSoon: true },
];

const useCases = [
    {
        icon: FileSearch,
        title: "AI-Powered Customer Support",
        description: "Handle account inquiries, disputes, and balance checks with LLMs — without exposing account numbers or SSNs to the model.",
        points: [
            "PII redacted before reaching the LLM",
            "Every interaction logged for compliance",
            "Zero-retention mode for sensitive queries",
        ],
    },
    {
        icon: Siren,
        title: "Fraud Detection & Analysis",
        description: "Route transaction data through AI models for real-time fraud scoring while maintaining full audit trails and data residency controls.",
        points: [
            "Custom data rules flag suspicious patterns",
            "Immutable audit trail for every decision",
            "Configurable data residency per region",
        ],
    },
    {
        icon: DollarSign,
        title: "Personalized Banking & Monetization",
        description: "Deliver tailored financial advice and product recommendations — and bill your end users per request via Stripe Connect.",
        points: [
            "Monetization with markup pricing",
            "Per-customer rate limits and budgets",
            "Usage analytics per product line",
        ],
    },
];

const features = [
    {
        icon: Shield,
        title: "PII Redaction & Tokenization",
        desc: "Detect and redact account numbers, SSNs, routing numbers, card data, and custom PII patterns before they reach any LLM. Tokenize sensitive fields so models never see raw financial data.",
    },
    {
        icon: Lock,
        title: "Zero-Retention Mode",
        desc: "Process AI requests with zero payload persistence. Cencori can proxy requests and responses without storing any financial data — meeting the strictest data minimization requirements.",
    },
    {
        icon: Eye,
        title: "Immutable Audit Trails",
        desc: "Every AI request is logged with actor identity, timestamp, model used, and redaction events. Append-only logs for SOX, GLBA, and PCI compliance. Export to your SIEM via webhook.",
    },
    {
        icon: BarChart3,
        title: "Cost & Usage Observability",
        desc: "Track AI spend per product line, per customer, or per compliance tier. Real-time dashboards for cost allocation, chargebacks, and anomaly detection.",
    },
    {
        icon: GitBranch,
        title: "Multi-Provider Failover",
        desc: "Route across OpenAI, Anthropic, Google, and 10+ providers with automatic failover. If one provider goes down, your financial application stays up — no code changes.",
    },
    {
        icon: Users,
        title: "Monetization",
        desc: "Pass AI costs directly to your end customers with configurable markup. Stripe Connect handles payments and payouts. Rate plans, quotas, and spend caps per customer.",
    },
];

export default function FintechPage() {

    return (
            <main>
                {/* ━━━ HERO ━━━ */}
                <section className="bg-background border-b border-border/30 pt-28 sm:pt-36 pb-0 relative overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-500/5 via-background to-background pointer-events-none" />

                    <div className="mx-auto max-w-6xl border-t border-x border-border/30 relative px-6 sm:px-12 py-20 sm:py-28 z-10 flex flex-col items-center text-center">
                        <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

                        <Reveal>
                            <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground mb-8">
                                Cencori for Financial Services
                            </p>
                        </Reveal>
                        <Reveal delay={0.05}>
                            <h1 className="text-[2.5rem] sm:text-[3.5rem] lg:text-[4.5rem] font-heading font-black leading-[0.95] tracking-[-0.02em] mb-6 max-w-4xl">
                                AI infrastructure for
                                <br />
                                <span className="text-muted-foreground">regulated finance.</span>
                            </h1>
                        </Reveal>
                        <Reveal delay={0.1}>
                            <p className="text-base text-muted-foreground max-w-[34rem] mb-10 leading-[1.7]">
                                Deploy AI across customer support, fraud detection, and personalized banking — with PII redaction, audit trails, and monetization baked in. Compliance-ready architecture.
                            </p>
                        </Reveal>
                        <Reveal delay={0.15}>
                            <div className="flex flex-wrap items-center justify-center gap-3">
                                <Link href="/contact/sales">
                                    <Button size="default" className="h-8 px-4 text-xs font-medium rounded-md bg-foreground text-background hover:bg-foreground/90 transition-all">
                                        Contact Sales <ArrowRight className="ml-1.5 h-3 w-3" />
                                    </Button>
                                </Link>
                                <Link href="/signup">
                                    <Button variant="outline" size="default" className="h-8 px-4 text-xs font-medium rounded-md border-foreground/20 hover:bg-foreground/5 hover:border-foreground/40 transition-all">
                                        Start Free Trial
                                    </Button>
                                </Link>
                            </div>
                        </Reveal>
                    </div>
                </section>

                {/* ━━━ COMPLIANCE BAR ━━━ */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative px-6 sm:px-12 py-12">
                        <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

                        <Reveal>
                            <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground text-center mb-8">
                                Built for regulated environments
                            </p>
                        </Reveal>
                        <div className="flex flex-wrap justify-center gap-x-10 gap-y-6">
                            {complianceItems.map((item, i) => (
                                <Reveal key={item.name} delay={i * 0.05}>
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                            <span className="text-[9px] font-mono font-bold text-amber-500 tracking-wider uppercase">soon</span>
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-foreground">{item.name}</p>
                                            <p className="text-[11px] text-muted-foreground">{item.desc}</p>
                                        </div>
                                    </div>
                                </Reveal>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ━━━ THE PROBLEM ━━━ */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative">
                        <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

                        <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/30">
                            <div className="px-6 py-16 md:py-24 md:pr-12">
                                <Reveal>
                                    <p className="mb-6 text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground">The old way</p>
                                </Reveal>
                                <Reveal delay={0.05}>
                                    <h2 className="text-2xl sm:text-3xl font-semibold tracking-[-0.03em] leading-[1.15] mb-4">
                                        AI without guardrails
                                        <br />
                                        <span className="text-muted-foreground">is a liability.</span>
                                    </h2>
                                </Reveal>
                                <Reveal delay={0.1}>
                                    <ul className="space-y-3">
                                        {[
                                            "Customer PII leaks through prompts into training data",
                                            "No audit trail for regulatory examiners",
                                            "Single provider lock-in with no fallback",
                                            "AI costs eat margins with no pass-through",
                                            "No per-customer rate limits or spend controls",
                                        ].map((item, i) => (
                                            <li key={i} className="flex gap-3 text-sm text-muted-foreground">
                                                <span className="text-red-400/60 shrink-0 mt-0.5">&#x2717;</span>
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                </Reveal>
                            </div>

                            <div className="px-6 py-16 md:py-24 md:pl-12">
                                <Reveal>
                                    <p className="mb-6 text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground">With Cencori</p>
                                </Reveal>
                                <Reveal delay={0.05}>
                                    <h2 className="text-2xl sm:text-3xl font-semibold tracking-[-0.03em] leading-[1.15] mb-4">
                                        AI with controls
                                        <br />
                                        <span className="text-muted-foreground">built for compliance.</span>
                                    </h2>
                                </Reveal>
                                <Reveal delay={0.1}>
                                    <ul className="space-y-3">
                                        {[
                                            "PII redacted before reaching any LLM",
                                            "Immutable audit logs for SOX & GLBA",
                                            "Multi-provider failover with zero downtime",
                                            "Monetization with configurable markup",
                                            "Per-customer quotas, budgets, and rate limits",
                                        ].map((item, i) => (
                                            <li key={i} className="flex gap-3 text-sm text-muted-foreground">
                                                <span className="text-emerald-500/60 shrink-0 mt-0.5">&#x2713;</span>
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                </Reveal>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ━━━ USE CASES ━━━ */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative">
                        <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

                        <div className="flex flex-col px-6 py-20 sm:px-12 sm:py-28">
                            <Reveal>
                                <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground mb-4">Use cases</p>
                            </Reveal>
                            <Reveal delay={0.05}>
                                <h2 className="text-3xl sm:text-[2.75rem] font-semibold tracking-[-0.03em] leading-[1.1] mb-6 max-w-xl">
                                    What fintech teams
                                    <br />
                                    <span className="text-muted-foreground">build with Cencori.</span>
                                </h2>
                            </Reveal>
                        </div>

                        <div className="relative border-t border-border/30">
                            <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                            <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

                            <div className="grid grid-cols-1 md:grid-cols-3">
                                {useCases.map((useCase, i) => (
                                    <Reveal key={useCase.title} delay={i * 0.05}>
                                        <div
                                            className={cn(
                                                "group p-8 transition-colors duration-300 hover:bg-foreground/[0.02]",
                                                "border-b border-border/30",
                                                i === 2 && "border-b-0",
                                                i >= 1 && "md:border-b-0",
                                                i === 0 && "md:border-r md:border-border/30",
                                                i === 1 && "md:border-r md:border-border/30",
                                            )}
                                        >
                                            <div className="mb-5 inline-flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 group-hover:text-emerald-400 transition-colors">
                                                <useCase.icon className="h-4 w-4" />
                                            </div>
                                            <h3 className="text-base font-semibold mb-3">{useCase.title}</h3>
                                            <p className="text-[13px] text-muted-foreground leading-[1.7] mb-5">{useCase.description}</p>
                                            <ul className="space-y-2">
                                                {useCase.points.map((point) => (
                                                    <li key={point} className="flex gap-2 text-[12px] text-muted-foreground">
                                                        <span className="text-emerald-500/60 shrink-0">&#x2713;</span>
                                                        {point}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </Reveal>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                {/* ━━━ FEATURES ━━━ */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative">
                        <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

                        <div className="flex flex-col px-6 py-20 sm:px-12 sm:py-28">
                            <Reveal>
                                <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground mb-4">Platform capabilities</p>
                            </Reveal>
                            <Reveal delay={0.05}>
                                <h2 className="text-3xl sm:text-[2.75rem] font-semibold tracking-[-0.03em] leading-[1.1] mb-6 max-w-xl">
                                    Security, compliance, billing
                                    <br />
                                    <span className="text-muted-foreground">unified in one platform.</span>
                                </h2>
                            </Reveal>
                            <Reveal delay={0.1}>
                                <p className="text-muted-foreground text-sm leading-[1.7] max-w-lg">
                                    Instead of stitching together a PII scrubber, an audit database, a billing system, and a gateway — you get one platform with one API.
                                </p>
                            </Reveal>
                        </div>

                        <div className="relative border-t border-border/30">
                            <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                            <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                                {features.map((item, i) => (
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
                                            <div className="mb-4 inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 group-hover:text-emerald-400 transition-colors">
                                                <item.icon className="h-4 w-4" />
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

                {/* ━━━ HOW IT WORKS ━━━ */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative px-6 sm:px-12 py-20 sm:py-28">
                        <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

                        <div className="max-w-3xl mx-auto">
                            <Reveal>
                                <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground mb-4 text-center">How it works</p>
                            </Reveal>
                            <Reveal delay={0.05}>
                                <h2 className="text-3xl sm:text-[2.75rem] font-semibold tracking-[-0.03em] leading-[1.1] mb-12 text-center">
                                    Every request, protected
                                    <br />
                                    <span className="text-muted-foreground">from prompt to provider.</span>
                                </h2>
                            </Reveal>

                            <div className="space-y-0">
                                {[
                                    { step: "01", title: "User sends a request", desc: "Your app sends a chat completion to Cencori's OpenAI-compatible endpoint. Account number, SSN, or transaction data may be in the prompt." },
                                    { step: "02", title: "Cencori redacts PII before it reaches the model", desc: "Custom data rules and PII detectors scan the input. Card numbers, SSNs, routing numbers are redacted or tokenized. Only safe text reaches the LLM." },
                                    { step: "03", title: "Request is logged for compliance", desc: "The full request, redaction events, model response, and latency are recorded in an append-only audit log. Ready for SOX/GLBA examiners." },
                                    { step: "04", title: "Usage is metered and billed", desc: "Token count, cost, and end-user ID are recorded. If you enable Monetization, Stripe Connect handles invoices and payouts automatically." },
                                ].map((item, i) => (
                                    <Reveal key={item.step} delay={i * 0.08}>
                                        <div className={cn(
                                            "flex gap-5 py-6",
                                            i < 3 && "border-b border-border/20",
                                        )}>
                                            <span className="text-[11px] font-mono font-bold text-muted-foreground/30 w-8 shrink-0 pt-0.5">{item.step}</span>
                                            <div>
                                                <h3 className="text-sm font-semibold mb-1">{item.title}</h3>
                                                <p className="text-[13px] text-muted-foreground leading-[1.7]">{item.desc}</p>
                                            </div>
                                        </div>
                                    </Reveal>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                {/* ━━━ CODE EXAMPLE ━━━ */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative px-6 sm:px-12 py-20 sm:py-28">
                        <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-start">
                            <div>
                                <Reveal>
                                    <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground mb-4">Drop-in integration</p>
                                </Reveal>
                                <Reveal delay={0.05}>
                                    <h2 className="text-3xl sm:text-[2.75rem] font-semibold tracking-[-0.03em] leading-[1.1] mb-6">
                                        One API swap.
                                        <br />
                                        <span className="text-muted-foreground">PII protection included.</span>
                                    </h2>
                                </Reveal>
                                <Reveal delay={0.1}>
                                    <p className="text-muted-foreground text-sm leading-[1.7] mb-8 max-w-md">
                                        Change your base URL and API key. Cencori automatically detects and redacts PII before it reaches the model. No SDK changes, no middleware to write.
                                    </p>
                                </Reveal>
                                <Reveal delay={0.15}>
                                    <div className="space-y-4">
                                        {[
                                            "No code changes to your app",
                                            "PII redaction enabled by default",
                                            "Works with any OpenAI-compatible SDK",
                                            "Audit logging starts immediately",
                                        ].map((item) => (
                                            <div key={item} className="flex gap-3 text-sm text-muted-foreground">
                                                <span className="text-emerald-500/60 shrink-0">&#x2713;</span>
                                                {item}
                                            </div>
                                        ))}
                                    </div>
                                </Reveal>
                            </div>

                            <Reveal delay={0.1}>
                                <div className="border border-border/20 rounded-lg overflow-hidden">
                                    <div className="flex items-center justify-between px-4 py-2.5 bg-foreground/[0.03] border-b border-border/20">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-mono text-emerald-500/60">PII_PROTECTED</span>
                                            <span className="text-[10px] font-mono text-muted-foreground/50">index.ts</span>
                                        </div>
                                        <CopyButton text={"import { Cencori } from 'cencori';\n\nconst cencori = new Cencori();\n\n// PII is automatically redacted\n// before reaching the LLM\nconst res = await cencori.ai.chat({\n  model: 'gpt-4o',\n  messages: [\n    { role: 'user', content: \"What's my balance for account ****1234?\" },\n  ],\n});"} />
                                    </div>
                                    <pre className="text-[12px] font-mono leading-[1.7] text-foreground/80 p-4 overflow-x-auto">
                                        <code>
                                            <span className="text-muted-foreground/40"> 1</span>{"  "}<span className="text-violet-400">import</span> {"{ "}<span className="text-foreground">Cencori</span>{" }"} <span className="text-violet-400">from</span> <span className="text-emerald-400">&apos;cencori&apos;</span>;{"\n"}
                                            <span className="text-muted-foreground/40"> 2</span>{"\n"}
                                            <span className="text-muted-foreground/40"> 3</span>{"  "}<span className="text-violet-400">const</span> cencori = <span className="text-violet-400">new</span> <span className="text-blue-400">Cencori</span>();{"\n"}
                                            <span className="text-muted-foreground/40"> 4</span>{"\n"}
                                            <span className="text-muted-foreground/40"> 5</span>{"  "}<span className="text-muted-foreground/50">// PII is automatically redacted</span>{"\n"}
                                            <span className="text-muted-foreground/40"> 6</span>{"  "}<span className="text-muted-foreground/50">// before reaching the LLM</span>{"\n"}
                                            <span className="text-muted-foreground/40"> 7</span>{"  "}<span className="text-violet-400">const</span> res = <span className="text-violet-400">await</span> cencori.ai.<span className="text-blue-400">chat</span>({"{"}{"\n"}
                                            <span className="text-muted-foreground/40"> 8</span>{"    "}model: <span className="text-emerald-400">&apos;gpt-4o&apos;</span>,{"\n"}
                                            <span className="text-muted-foreground/40"> 9</span>{"    "}messages: [{"\n"}
                                            <span className="text-muted-foreground/40">10</span>{"      "}{"{"} role: <span className="text-emerald-400">&apos;user&apos;</span>, content: <span className="text-emerald-400">&quot;</span>What&apos;s my balance for account ****1234?<span className="text-emerald-400">&quot;</span>{" "}{"}"},{"\n"}
                                            <span className="text-muted-foreground/40">11</span>{"    "}],{"\n"}
                                            <span className="text-muted-foreground/40">12</span>{"  "}{"}"});
                                        </code>
                                    </pre>
                                </div>
                            </Reveal>
                        </div>
                    </div>
                </section>

                {/* ━━━ BILLING ECONOMICS ━━━ */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative px-6 sm:px-12 py-20 sm:py-28">
                        <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-start">
                            <div>
                                <Reveal>
                                    <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground mb-4">Monetize your AI features</p>
                                </Reveal>
                                <Reveal delay={0.05}>
                                    <h2 className="text-3xl sm:text-[2.75rem] font-semibold tracking-[-0.03em] leading-[1.1] mb-6">
                                        Pass costs through.
                                        <br />
                                        <span className="text-muted-foreground">Keep margins healthy.</span>
                                    </h2>
                                </Reveal>
                                <Reveal delay={0.1}>
                                    <p className="text-muted-foreground text-sm leading-[1.7] mb-8 max-w-md">
                                        Every AI feature in your fintech app — balance inquiries, fraud scoring, transaction enrichment — has a cost. Cencori meters usage per customer and handles billing via Stripe Connect.
                                    </p>
                                </Reveal>
                                <Reveal delay={0.15}>
                                    <div className="space-y-4">
                                        {[
                                            { title: "Markup on every model", desc: "Buy tokens at wholesale, sell at your margin. 2x, 5x, or variable per customer tier." },
                                            { title: "Per-customer rate plans", desc: "Free tier, pro tier, enterprise tier. Rate limits, spend caps, and overage blocks per plan." },
                                            { title: "Stripe Connect payouts", desc: "Customers pay via Stripe. Cencori handles metering, invoicing, and payout reconciliation." },
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

                            <Reveal delay={0.1}>
                                <div className="border border-border/20 rounded-lg p-6 bg-foreground/[0.02]">
                                    <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground mb-6">Per-customer economics</p>
                                    <div className="space-y-5">
                                        <div className="flex justify-between items-center pb-4 border-b border-border/10">
                                            <span className="text-sm text-muted-foreground">Your cost (GPT-4o)</span>
                                            <span className="text-sm font-mono text-muted-foreground">$0.002 / request</span>
                                        </div>
                                        <div className="flex justify-between items-center pb-4 border-b border-border/10">
                                            <span className="text-sm text-muted-foreground">Your markup</span>
                                            <span className="text-sm font-mono text-emerald-500">3x</span>
                                        </div>
                                        <div className="flex justify-between items-center pb-4 border-b border-border/10">
                                            <span className="text-sm text-muted-foreground">You charge customer</span>
                                            <span className="text-sm font-mono text-foreground">$0.006 / request</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm font-medium">Your margin</span>
                                            <span className="text-sm font-mono font-medium text-emerald-500">$0.004 / request</span>
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground/50 mt-6 leading-relaxed">
                                        At 1M customer AI requests/month, that&apos;s $4,000/month margin. Cencori handles the metering, invoicing, and collection.
                                    </p>
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

                        <div className="max-w-xl mx-auto">
                            <Reveal>
                                <h2 className="text-3xl sm:text-[2.75rem] font-semibold tracking-[-0.03em] leading-[1.1] mb-5">
                                    Ship AI features.
                                    <br />
                                    <span className="text-muted-foreground">Stay compliant.</span>
                                </h2>
                            </Reveal>
                            <Reveal delay={0.05}>
                                <p className="text-muted-foreground text-sm leading-[1.7] mb-10 max-w-md mx-auto">
                                    PII redaction, audit trails, monetization, and multi-provider failover — one platform, one API. Used by fintechs serving millions of customers.
                                </p>
                            </Reveal>
                            <Reveal delay={0.1}>
                                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                    <Link href="/contact/sales">
                                        <Button size="sm" className="h-7 text-xs px-3 bg-foreground text-background hover:bg-foreground/90">
                                            Talk to Sales <ArrowRight className="ml-1.5 h-3 w-3" />
                                        </Button>
                                    </Link>
                                    <Link href="/signup">
                                        <Button variant="outline" size="sm" className="h-7 text-xs px-3">
                                            Start Free
                                        </Button>
                                    </Link>
                                </div>
                            </Reveal>
                            <Reveal delay={0.15}>
                                <p className="text-[11px] text-muted-foreground/50 mt-8">
                                    SOC 2 · GLBA · SOX · PCI DSS · GDPR · CCPA <span className="text-amber-500/60">(coming soon)</span>
                                </p>
                            </Reveal>
                        </div>
                    </div>
                </section>
            </main>
    );
}
