"use client";

import React, { useState } from "react";
import Navbar from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { Reveal } from "@/components/landing/Reveal";
import { Check, X, Shield, ArrowRight, Activity, DollarSign, Lock, HeartHandshake, Layers } from "lucide-react";
import Link from "next/link";

type CompetitorId = "openrouter" | "portkey" | "litellm" | "bedrock" | "helicone" | "braintrust";

interface MatrixRow {
    feature: string;
    competitor: boolean | "partial" | string;
    cencori: boolean | string;
}

interface CompetitorProfile {
    id: CompetitorId;
    name: string;
    subheader: string;
    honestSummary: string;
    verdict: string;
    icon: React.ComponentType<any>;
    matrix: MatrixRow[];
}

const competitors: CompetitorProfile[] = [
    {
        id: "openrouter",
        name: "OpenRouter",
        subheader: "OpenRouter routes. Cencori runs your infrastructure.",
        honestSummary: "OpenRouter is a model aggregator. It gives you a unified API to access multiple providers. That's genuinely useful — and that's where it stops. Cencori's Gateway does everything OpenRouter does, and then handles what happens after the request is routed: who's monitoring it, who's securing it, who's billing for it, and what you do when something goes wrong.",
        verdict: "If you only need to aggregate models and nothing else, OpenRouter works. The moment you need to know who's spending what, prevent your product from being jailbroken, charge your users for AI usage, or pass a compliance audit — OpenRouter cannot help you. Cencori starts where OpenRouter ends.",
        icon: Layers,
        matrix: [
            { feature: "100+ model access", competitor: true, cencori: true },
            { feature: "OpenAI-compatible API", competitor: true, cencori: true },
            { feature: "Automatic failover", competitor: "partial", cencori: true },
            { feature: "Circuit breakers", competitor: false, cencori: true },
            { feature: "Request-level caching", competitor: false, cencori: true },
            { feature: "Jailbreak detection", competitor: false, cencori: true },
            { feature: "PII masking", competitor: false, cencori: true },
            { feature: "Output scanning", competitor: false, cencori: true },
            { feature: "Tamper-proof audit logs", competitor: false, cencori: true },
            { feature: "SSO / SAML", competitor: false, cencori: true },
            { feature: "RBAC", competitor: false, cencori: true },
            { feature: "Monetization", competitor: false, cencori: true },
            { feature: "Per-user rate limiting", competitor: false, cencori: true },
            { feature: "Cost forecasting", competitor: false, cencori: true },
            { feature: "TypeScript / Python / Go SDKs", competitor: "partial", cencori: true },
            { feature: "Dashboard playground", competitor: false, cencori: true },
        ]
    },
    {
        id: "portkey",
        name: "Portkey",
        subheader: "Portkey adds observability. Cencori adds the whole infrastructure layer.",
        honestSummary: "Portkey is a solid LLM gateway with good observability tooling. It gives you logs, traces, and some reliability features. It's a meaningful step up from raw API calls. But Portkey is still a gateway with a dashboard bolted on. It has no monetization layer. No native PII masking with real-time redaction. No jailbreak detection as a pre-request security layer. No revenue collection. If you're building a product with real users, Portkey leaves you to solve the hardest problems yourself.",
        verdict: "Portkey solves observability well. Cencori solves observability — and security, and billing, and compliance — in one product. If you're building anything with real users, real revenue, or enterprise requirements, you'll outgrow Portkey quickly. Cencori is where you end up. You can start there instead.",
        icon: Activity,
        matrix: [
            { feature: "Multi-provider routing", competitor: true, cencori: true },
            { feature: "Automatic fallback", competitor: true, cencori: true },
            { feature: "Request logging", competitor: true, cencori: true },
            { feature: "Cost tracking", competitor: true, cencori: true },
            { feature: "Semantic caching", competitor: true, cencori: true },
            { feature: "Real-time PII masking + redaction", competitor: false, cencori: true },
            { feature: "Jailbreak detection (pre-request)", competitor: false, cencori: true },
            { feature: "Output scanning", competitor: false, cencori: true },
            { feature: "Tamper-proof audit trails", competitor: false, cencori: true },
            { feature: "Monetization", competitor: false, cencori: true },
            { feature: "Stripe Connect integration", competitor: false, cencori: true },
            { feature: "Per-user spend caps", competitor: false, cencori: true },
            { feature: "Security incident logging", competitor: false, cencori: true },
            { feature: "SSO / SAML", competitor: true, cencori: true },
            { feature: "RBAC", competitor: true, cencori: true },
        ]
    },
    {
        id: "litellm",
        name: "LiteLLM",
        subheader: "LiteLLM is a proxy. Cencori is a platform.",
        honestSummary: "LiteLLM is an open-source Python proxy that normalizes LLM APIs. It's lightweight, flexible, and widely used for good reason — it does one thing simply. That simplicity is also its ceiling. LiteLLM requires you to self-host, self-manage, and self-extend. Security features? You build them. Billing? You wire it yourself. Observability beyond basic logging? You add it. Every capability beyond basic routing is your engineering problem. Cencori is what you'd build if you had six months and a full infrastructure team — fully managed, production-grade, with no self-hosting required.",
        verdict: "LiteLLM is a good starting point if you want full control and don't mind running infrastructure. Cencori is what replaces it when you want to ship product instead of maintaining a proxy. One API key. No DevOps. Everything managed.",
        icon: HeartHandshake,
        matrix: [
            { feature: "Multi-provider routing", competitor: true, cencori: true },
            { feature: "OpenAI-compatible API", competitor: true, cencori: true },
            { feature: "Self-hosted requirement", competitor: "Required", cencori: "Not required" },
            { feature: "Managed / hosted option", competitor: false, cencori: true },
            { feature: "Real-time PII masking", competitor: false, cencori: true },
            { feature: "Jailbreak detection", competitor: false, cencori: true },
            { feature: "Output scanning", competitor: false, cencori: true },
            { feature: "Audit trails", competitor: false, cencori: true },
            { feature: "Monetization", competitor: false, cencori: true },
            { feature: "Revenue collection (Stripe)", competitor: false, cencori: true },
            { feature: "Budget caps per user", competitor: false, cencori: true },
            { feature: "Dashboard + analytics", competitor: "Basic", cencori: true },
            { feature: "SSO / RBAC", competitor: false, cencori: true },
            { feature: "SDK (TS, Python, Go)", competitor: "Python only", cencori: true },
        ]
    },
    {
        id: "bedrock",
        name: "AWS Bedrock",
        subheader: "Bedrock adds AI to cloud. Cencori builds infrastructure for AI.",
        honestSummary: "AWS Bedrock is a managed service that gives you access to foundation models through AWS. If you're already deep in the AWS ecosystem and just need model access bolted onto existing infrastructure, Bedrock is functional. But Bedrock was not designed for AI-native products. It has no native monetization — you can't meter your users' AI consumption and charge them for it without building that system yourself. It has no jailbreak detection, no PII masking, no AI-specific security pipeline. It's general-purpose cloud with AI features added on top. Cencori was designed from day one for the specific problem of building and monetizing intelligent products.",
        verdict: "Bedrock is general cloud infrastructure. Cencori is AI infrastructure. If you're building an intelligent product — not just querying a model inside a larger AWS workload — Cencori gives you more capability, faster setup, and the monetization primitives Bedrock doesn't have.",
        icon: Shield,
        matrix: [
            { feature: "Foundation model access", competitor: "AWS models only", cencori: "100+ across all providers" },
            { feature: "Multi-provider routing", competitor: false, cencori: true },
            { feature: "Automatic failover across providers", competitor: false, cencori: true },
            { feature: "Real-time PII masking", competitor: false, cencori: true },
            { feature: "Jailbreak detection", competitor: false, cencori: true },
            { feature: "Output scanning", competitor: false, cencori: true },
            { feature: "Tamper-proof audit trails", competitor: "Partial (CloudTrail)", cencori: "✓ (AI-native)" },
            { feature: "Monetization", competitor: false, cencori: true },
            { feature: "Revenue collection", competitor: false, cencori: true },
            { feature: "Per-user rate limiting", competitor: false, cencori: true },
            { feature: "Setup time", competitor: "Days–weeks", cencori: "Under 3 minutes" },
            { feature: "Designed for AI products", competitor: false, cencori: true },
        ]
    },
    {
        id: "helicone",
        name: "Helicone",
        subheader: "Helicone watches your requests. Cencori controls them.",
        honestSummary: "Helicone is an observability and logging proxy for LLM applications. It gives you a clean dashboard, request tracing, cost analytics, and some prompt management features. It's popular because it's easy to set up and good at what it does. But Helicone is read-only infrastructure. It observes and reports. It cannot protect your users from jailbreaks. It cannot mask PII before it reaches your model. It cannot bill your users for AI usage or cap their spend. It watches what happens — it doesn't control what happens. Cencori's Scan product does what Helicone does on observability, and adds an active security and billing layer on top.",
        verdict: "If logging and analytics are all you need, Helicone is a clean option. If you're building a product where security and monetization matter — and they will — Cencori is the infrastructure that does both. Observability is included. It's just not the ceiling.",
        icon: Activity,
        matrix: [
            { feature: "Request logging", competitor: true, cencori: true },
            { feature: "Cost analytics", competitor: true, cencori: true },
            { feature: "Usage dashboards", competitor: true, cencori: true },
            { feature: "Prompt management", competitor: true, cencori: true },
            { feature: "Jailbreak detection (active)", competitor: false, cencori: true },
            { feature: "PII masking (real-time)", competitor: false, cencori: true },
            { feature: "Output scanning", competitor: false, cencori: true },
            { feature: "Security incident logging", competitor: false, cencori: true },
            { feature: "Monetization", competitor: false, cencori: true },
            { feature: "Per-user rate limits", competitor: false, cencori: true },
            { feature: "Budget caps", competitor: false, cencori: true },
            { feature: "Multi-provider routing", competitor: false, cencori: true },
            { feature: "Automatic failover", competitor: false, cencori: true },
        ]
    },
    {
        id: "braintrust",
        name: "Braintrust",
        subheader: "Braintrust optimizes prompts. Cencori runs production.",
        honestSummary: "Braintrust is an AI evaluation and experimentation platform. It helps teams test prompts, score model outputs, run evaluations, and improve AI quality over time. That's genuinely valuable work — knowing whether your AI is performing well is important. But Braintrust is a development and evaluation tool, not production infrastructure. It's where you figure out what works. Cencori is where what works goes live — at scale, with security, with billing, with reliability.",
        verdict: "Braintrust and Cencori aren't really competing — they operate at different stages of the build cycle. Braintrust helps you refine your AI before it ships. Cencori is the infrastructure it ships on. Use Braintrust to get your prompts right. Use Cencori to run them in production.",
        icon: Lock,
        matrix: [
            { feature: "Prompt evaluation", competitor: true, cencori: false },
            { feature: "LLM experimentation", competitor: true, cencori: false },
            { feature: "Production-grade routing", competitor: false, cencori: true },
            { feature: "Multi-provider failover", competitor: false, cencori: true },
            { feature: "Jailbreak detection", competitor: false, cencori: true },
            { feature: "PII masking", competitor: false, cencori: true },
            { feature: "Tamper-proof audit logs", competitor: false, cencori: true },
            { feature: "Monetization", competitor: false, cencori: true },
            { feature: "Rate limiting", competitor: false, cencori: true },
            { feature: "Production SDKs (TS/Python/Go)", competitor: false, cencori: true },
            { feature: "Designed for shipping", competitor: false, cencori: true },
        ]
    }
];

export default function ComparePage() {
    const [activeCompetitor, setActiveCompetitor] = useState<CompetitorId>("openrouter");

    const activeProfile = competitors.find(c => c.id === activeCompetitor)!;
    const ActiveIcon = activeProfile.icon;

    return (
        <div className="min-h-screen bg-background text-foreground selection:bg-foreground selection:text-background">
            <Navbar homeUrl="/" />

            <main className="relative z-10 pt-28 pb-24 sm:pt-36 sm:pb-32">
                <div className="max-w-screen-xl mx-auto px-4 md:px-6">
                    
                    {/* Hero Section */}
                    <div className="max-w-3xl mx-auto text-center mb-16 sm:mb-20">
                        <Reveal>
                            <span className="mb-4 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-primary">
                                Comparative Intelligence
                            </span>
                        </Reveal>
                        <Reveal delay={0.05}>
                            <h1 className="text-4xl sm:text-6xl font-heading font-black tracking-[-0.03em] leading-[1.0] mb-6 text-foreground">
                                Cencori vs. <br />
                                <span className="font-serif italic font-normal text-muted-foreground">Everyone Else.</span>
                            </h1>
                        </Reveal>
                        <Reveal delay={0.1}>
                            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-xl mx-auto">
                                Other tools solve one problem. Cencori solves the infrastructure. Here&apos;s what that actually means — product by product, feature by feature.
                            </p>
                        </Reveal>
                    </div>

                    {/* Framing Statement Card */}
                    <Reveal delay={0.15}>
                        <div className="max-w-4xl mx-auto rounded-2xl border border-border/40 bg-foreground/[0.01] p-6 sm:p-8 mb-16 backdrop-blur-sm relative overflow-hidden">
                            {/* Accent line */}
                            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary" />
                            
                            <h2 className="text-lg font-semibold text-foreground mb-3 font-heading pl-2">
                                Two live products. Already ahead.
                            </h2>
                            <p className="text-sm text-muted-foreground leading-relaxed pl-2 mb-4">
                                Cencori&apos;s AI Gateway and Scan are live and in production today. This comparison is not about roadmap promises — it&apos;s about what you can use right now, and why Cencori&apos;s foundation is already a different category from what&apos;s available elsewhere.
                            </p>
                            <p className="text-sm text-muted-foreground leading-relaxed pl-2">
                                Every competitor below solves part of the problem. Cencori is the only platform where routing, security, and billing work as a single unified system — not bolted together from separate tools.
                            </p>
                        </div>
                    </Reveal>

                    {/* Interactive Switcher / Jump Anchors */}
                    <div className="mb-12 flex justify-center overflow-x-auto py-2 -mx-4 px-4 scrollbar-none">
                        <div className="inline-flex gap-1.5 p-1 rounded-full border border-border/50 bg-background/80 backdrop-blur-sm shrink-0">
                            {competitors.map(comp => (
                                <button
                                    key={comp.id}
                                    onClick={() => setActiveCompetitor(comp.id)}
                                    className={`px-4 py-1.5 rounded-full text-xs font-medium font-heading transition-all ${activeCompetitor === comp.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
                                >
                                    vs {comp.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Active Competitor Profile Card */}
                    <div className="max-w-4xl mx-auto">
                        <div className="rounded-2xl border border-border bg-card/60 shadow-2xl backdrop-blur-sm overflow-hidden p-6 sm:p-8">
                            
                            {/* Profile Header */}
                            <Reveal key={`header-${activeCompetitor}`} delay={0.05}>
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="p-3 rounded-xl bg-primary/10 border border-primary/25 text-primary">
                                        <ActiveIcon className="size-5 shrink-0" />
                                    </div>
                                    <div>
                                        <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground/60">
                                            Comparison Profile
                                        </span>
                                        <h3 className="text-xl sm:text-2xl font-semibold text-foreground font-heading mt-1">
                                            Cencori vs. {activeProfile.name}
                                        </h3>
                                    </div>
                                </div>
                            </Reveal>

                            {/* Subtitle & Honest Summary */}
                            <Reveal key={`summary-${activeCompetitor}`} delay={0.1}>
                                <div className="space-y-4 mb-8">
                                    <h4 className="text-sm font-semibold text-foreground">
                                        {activeProfile.subheader}
                                    </h4>
                                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                                        {activeProfile.honestSummary}
                                    </p>
                                </div>
                            </Reveal>

                            {/* Side by Side Matrix */}
                            <Reveal key={`matrix-${activeCompetitor}`} delay={0.15}>
                                <div className="overflow-x-auto rounded-xl border border-border/40 bg-foreground/[0.01] p-1 mb-8">
                                    <table className="w-full border-collapse text-left min-w-[500px]">
                                        <thead>
                                            <tr className="border-b border-border/30 text-[9px] font-mono uppercase tracking-wider text-muted-foreground/75 bg-foreground/[0.02]">
                                                <th className="py-3 px-4 font-medium">Feature</th>
                                                <th className="py-3 px-4 text-center font-medium w-[25%]">{activeProfile.name}</th>
                                                <th className="py-3 px-4 text-center font-medium w-[25%] bg-primary/5 text-primary">Cencori Gateway</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {activeProfile.matrix.map((row) => (
                                                <tr key={row.feature} className="border-b border-border/10 text-xs text-muted-foreground hover:bg-foreground/[0.005] transition-colors">
                                                    <td className="py-3 px-4 font-medium text-foreground/80">{row.feature}</td>
                                                    
                                                    {/* Competitor Value */}
                                                    <td className="py-3 px-4 text-center">
                                                        <div className="flex justify-center">
                                                            {typeof row.competitor === "boolean" ? (
                                                                row.competitor ? (
                                                                    <Check className="size-4 text-emerald-400" />
                                                                ) : (
                                                                    <X className="size-3.5 text-muted-foreground/30" />
                                                                )
                                                            ) : (
                                                                <span className="text-[11px] font-mono text-muted-foreground">{row.competitor}</span>
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* Cencori Value */}
                                                    <td className="py-3 px-4 text-center bg-primary/[0.01]">
                                                        <div className="flex justify-center">
                                                            {typeof row.cencori === "boolean" ? (
                                                                row.cencori ? (
                                                                    <Check className="size-4 text-emerald-400" />
                                                                ) : (
                                                                    <X className="size-3.5 text-muted-foreground/30" />
                                                                )
                                                            ) : (
                                                                <span className="text-[11px] font-mono text-primary font-semibold">{row.cencori}</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Reveal>

                            {/* Verdict Box */}
                            <Reveal key={`verdict-${activeCompetitor}`} delay={0.2}>
                                <div className="rounded-xl border border-primary/20 bg-primary/[0.02] p-5 sm:p-6">
                                    <h4 className="text-xs font-mono uppercase tracking-[0.15em] text-primary font-bold mb-2">
                                        The Verdict
                                    </h4>
                                    <p className="text-xs sm:text-sm text-foreground leading-relaxed">
                                        {activeProfile.verdict}
                                    </p>
                                </div>
                            </Reveal>

                        </div>
                    </div>

                    {/* Closing Section */}
                    <div className="max-w-3xl mx-auto mt-24 text-center space-y-8">
                        <Reveal delay={0.1}>
                            <h2 className="text-2xl sm:text-4xl font-heading font-black tracking-[-0.02em] text-foreground">
                                The real question isn&apos;t which gateway.
                            </h2>
                        </Reveal>
                        <Reveal delay={0.15}>
                            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-xl mx-auto">
                                Every tool in this comparison solves one or two of the seven infrastructure problems a team faces when building an AI product. Some solve routing. Some solve observability. Some help you experiment.
                            </p>
                        </Reveal>
                        <Reveal delay={0.2}>
                            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-xl mx-auto">
                                None of them solve all seven. None of them let you route, secure, monitor, and monetize your AI product from a single API key — without stitching together four separate systems, four separate contracts, and four separate engineering integrations.
                            </p>
                        </Reveal>
                        <Reveal delay={0.25}>
                            <p className="text-base text-foreground font-semibold italic">
                                That&apos;s what Cencori is. Not a better gateway. Not a faster proxy. AI infrastructure.
                            </p>
                        </Reveal>

                        {/* CTAs */}
                        <Reveal delay={0.3}>
                            <div className="flex flex-wrap items-center justify-center gap-3 pt-6">
                                <Link href="/login">
                                    <button className="px-6 py-2.5 rounded-full text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 transition-all shadow-md">
                                        Start Building — Free
                                    </button>
                                </Link>
                                <Link href="/docs">
                                    <button className="px-6 py-2.5 rounded-full text-xs font-semibold border border-border bg-foreground/[0.01] hover:bg-foreground/[0.03] text-foreground transition-all">
                                        View the Gateway Docs
                                    </button>
                                </Link>
                                <Link href="/contact/sales">
                                    <button className="px-6 py-2.5 rounded-full text-xs font-semibold border border-border bg-foreground/[0.01] hover:bg-foreground/[0.03] text-foreground transition-all">
                                        Talk to the Team
                                    </button>
                                </Link>
                            </div>
                        </Reveal>
                    </div>

                </div>
            </main>

            <Footer />
        </div>
    );
}
