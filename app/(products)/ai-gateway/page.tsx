"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  ShieldCheckIcon,
  EyeIcon,
  CodeBracketIcon,
  DocumentCheckIcon,
  Square3Stack3DIcon,
  CheckCircleIcon,
  CurrencyDollarIcon,
} from "@heroicons/react/24/outline";
import {
  OpenAI,
  Anthropic,
  Google,
  Meta,
  Mistral,
  DeepSeek,
  Groq,
  Cohere,
  Perplexity,
  XAI,
} from "@lobehub/icons";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

import { Integrations } from "@/components/landing/Integrations";
import { CTA } from "@/components/landing/CTA";
import { Button } from "@/components/ui/button";
import { BudgetControl } from "@/components/landing/BudgetControl";

const pillars = [
  {
    id: "routing",
    title: "Multi-Provider Routing",
    tagline: "14+ providers, one API",
    description: "Route requests to OpenAI, Anthropic, Google, Mistral, Meta, and more through a single unified API.",
    icon: Square3Stack3DIcon,
    color: "emerald",
    features: ["OpenAI-compatible API", "Automatic fallback", "Model equivalence mapping"],
  },
  {
    id: "security",
    title: "AI Security",
    tagline: "Production-grade protection",
    description: "Real-time protection against prompt injection, PII leakage, and harmful content.",
    icon: ShieldCheckIcon,
    color: "blue",
    features: ["Prompt injection detection", "PII scanning", "Content filtering"],
  },
  {
    id: "observability",
    title: "Full Observability",
    tagline: "See everything",
    description: "Complete visibility into every AI request. Logs, analytics, latency, and cost tracking.",
    icon: EyeIcon,
    color: "purple",
    features: ["Request/response logging", "P50/P90/P99 latency", "Cost per request"],
  },
  {
    id: "devplatform",
    title: "Developer Platform",
    tagline: "Ship faster",
    description: "TypeScript and Python SDKs, Vercel AI SDK integration, API key management.",
    icon: CodeBracketIcon,
    color: "orange",
    features: ["TypeScript & Python SDKs", "Vercel AI SDK provider", "Rate limiting"],
  },
  {
    id: "compliance",
    title: "Compliance Ready",
    tagline: "Enterprise-grade audit",
    description: "Full audit trail, security incident logging, and data governance policies.",
    icon: DocumentCheckIcon,
    color: "cyan",
    features: ["Audit logs", "Security incidents", "Policy enforcement"],
  },
  {
    id: "billing",
    title: "End-User Billing",
    tagline: "Monetize AI usage",
    description: "Meter, limit, and charge your users for AI consumption. Stripe Connect native with markup pricing.",
    icon: CurrencyDollarIcon,
    color: "amber",
    features: ["Per-user metering", "Rate plan enforcement", "Stripe Connect payouts"],
  },
];

const providers = [
  { name: "OpenAI", icon: OpenAI },
  { name: "Anthropic", icon: Anthropic },
  { name: "Google", icon: Google },
  { name: "Meta", icon: Meta },
  { name: "Mistral", icon: Mistral },
  { name: "DeepSeek", icon: DeepSeek },
  { name: "Groq", icon: Groq },
  { name: "Cohere", icon: Cohere },
  { name: "Perplexity", icon: Perplexity },
  { name: "xAI", icon: XAI },
];

const colorClasses: Record<string, { bg: string; border: string; text: string }> = {
  emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-500" },
  blue: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-500" },
  purple: { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-500" },
  orange: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-500" },
  cyan: { bg: "bg-cyan-500/10", border: "border-cyan-500/30", text: "text-cyan-500" },
  amber: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-500" },
};

export default function AIGatewayPage() {
  const [selectedCalcModel, setSelectedCalcModel] = useState<"gpt" | "claude" | "llama">("gpt");
  const [markupPercent, setMarkupPercent] = useState(100);

  const modelInfo = {
    gpt: { name: "GPT-4o (OpenAI)", raw: 5.00 },
    claude: { name: "Claude 3.5 Sonnet", raw: 9.00 },
    llama: { name: "Llama 3 70B (Groq)", raw: 0.80 },
  };

  const selectedModel = modelInfo[selectedCalcModel];
  const rawCost = selectedModel.raw;
  const markupAmount = (rawCost * markupPercent) / 100;
  const retailPrice = rawCost + markupAmount;
  const profitMarginPercent = retailPrice > 0 ? Math.round((markupAmount / retailPrice) * 100) : 0;

  return (
      <main>
        <section className="bg-background border-b border-border/30 pt-28 sm:pt-36 pb-0 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-foreground/5 via-background to-background pointer-events-none" />

          <div className="mx-auto max-w-6xl border-t border-x border-border/30 relative px-6 py-20 sm:px-12 sm:py-28 z-10 flex flex-col items-center text-center">
            <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
            <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
            <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
            <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
            <Link
              href="/"
              className="group mb-8 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground transition-colors hover:text-foreground animate-appear"
            >
              <span>Try AI Gateway</span>
              <ArrowRightIcon className="size-3 -translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
            </Link>

            <h1 className="mb-8 max-w-3xl text-[2.5rem] font-heading font-black leading-[0.95] tracking-[-0.02em] animate-appear sm:text-[3.5rem] lg:text-[4.5rem] text-foreground">
            Every AI request, under your
              <span className="font-serif italic font-normal text-muted-foreground"> control.</span>
            </h1>

            <p className="mb-10 max-w-[38rem] text-base leading-[1.7] text-muted-foreground animate-appear [animation-delay:200ms]">
            One endpoint for 150+ models. AI control, security, observability, and monetization. <br/>OpenAI-compatible API. Fast setup. No rewrite.
            </p>

            <div className="mb-10 flex flex-wrap items-center justify-center gap-3 animate-appear [animation-delay:300ms]">
              <Link href={siteConfig.links.getStartedUrl}>
                <Button size="default" className="h-8 px-4 text-xs font-medium rounded-md bg-foreground text-background hover:bg-foreground/90 transition-all">
                  Get Started Free
                </Button>
              </Link>
              <Link href="/docs">
                <Button variant="outline" size="default" className="h-8 px-4 text-xs font-medium rounded-md border-foreground/20 hover:bg-foreground/5 hover:border-foreground/40 transition-all">
                  Documentation
                </Button>
              </Link>
            </div>

            <div className="mt-12 animate-appear [animation-delay:400ms]">
              <p className="text-[10px] text-muted-foreground mb-3 uppercase tracking-wider">Supported Providers</p>
              <div className="flex flex-wrap justify-center gap-4">
                {providers.map((provider) => (
                  <div key={provider.name} className="opacity-50 hover:opacity-100 transition-opacity">
                    <provider.icon className="w-6 h-6" aria-hidden="true" />
                  </div>
                ))}
              </div>
              <Link
                href="/ai/models"
                className="group mt-5 inline-flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
              >
                Browse all 150+ models
                <ArrowRightIcon className="size-3 -translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
              </Link>
            </div>
          </div>
        </section>

        <section className="bg-background border-b border-border/30">
          <div className="mx-auto max-w-6xl border-x border-border/30 relative">
            <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
            <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
            <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
            <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

            <div className="flex flex-col items-center text-center px-6 py-20 sm:px-12">
              <h2 className="text-2xl md:text-4xl font-heading font-semibold tracking-[-0.02em] mb-4 text-foreground leading-[1.1]">
                Everything in <span className="text-muted-foreground">one gateway</span>
              </h2>
              <p className="text-sm text-muted-foreground max-w-xl">
                AI Gateway combines six essential capabilities into one unified solution.
              </p>
            </div>

            <div className="relative border-t border-border/30">
              <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
              <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

              <div className="flex overflow-x-auto snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-2 lg:grid-cols-3">
                {pillars.map((pillar, index) => {
                  const colors = colorClasses[pillar.color];
                  return (
                    <div
                      key={pillar.id}
                      className={cn(
                        "group relative flex flex-col p-8 transition-colors duration-300 hover:bg-foreground/[0.02]",
                        "w-[80vw] max-w-[280px] sm:max-w-[320px] flex-shrink-0 snap-start md:w-auto md:max-w-none md:flex-shrink md:snap-align-none",
                        "border-r border-border/30 last:border-r-0 border-b-0",
                        index < 4 ? "md:border-b" : "md:border-b-0",
                        index % 2 === 0 ? "md:border-r" : "md:border-r-0",
                        index < 3 ? "lg:border-b" : "lg:border-b-0",
                        index % 3 !== 2 ? "lg:border-r" : "lg:border-r-0"
                      )}
                    >
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-4", colors.bg, colors.border, "border")}>
                        <pillar.icon className={cn("h-4 w-4", colors.text)} aria-hidden="true" />
                      </div>

                      <h3 className="text-base font-semibold tracking-tight mb-1">{pillar.title}</h3>
                      <p className={cn("text-xs font-medium mb-2", colors.text)}>{pillar.tagline}</p>
                      <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                        {pillar.description}
                      </p>

                      <ul className="mt-auto space-y-1.5">
                        {pillar.features.map((feature, i) => (
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
        </section>

        <Integrations />

        <section className="bg-background border-b border-border/30">
          <div className="mx-auto max-w-6xl border-x border-border/30 relative px-6 py-20 sm:px-12 sm:py-28">
            <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
            <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
            <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
            <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

            <div className="grid lg:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="text-2xl md:text-4xl font-heading font-semibold tracking-[-0.02em] mb-4 text-foreground leading-[1.1]">
                  Integrate in <span className="text-muted-foreground">3 lines</span>
                </h2>
                <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                  Drop-in replacement for your existing OpenAI calls. Switch providers with one parameter.
                </p>

                <div className="space-y-3">
                  {["Install the SDK", "Add your API key", "Start making requests"].map((step, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center">
                        <span className="text-xs font-medium text-emerald-500">{i + 1}</span>
                      </div>
                      <span className="text-sm">{step}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-6">
                  <Link href="/docs/quickstart">
                    <Button variant="outline" size="sm" className="h-8 px-4 text-xs rounded-full">
                      Read the Quickstart <ArrowRightIcon className="ml-2 w-3 h-3" aria-hidden="true" />
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="relative">
                <div className="border border-border/30 bg-muted/20 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/30 bg-muted/30">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
                    <span className="ml-2 text-[10px] text-muted-foreground">cencori.ts</span>
                  </div>
                  <pre className="p-4 text-xs font-mono overflow-x-auto">
                    <code className="text-muted-foreground font-mono">
                      <span className="text-blue-400">import</span> {"{"} Cencori {"}"} <span className="text-blue-400">from</span> <span className="text-emerald-400">&apos;cencori&apos;</span>;{"\n\n"}
                      <span className="text-blue-400">const</span> cencori = <span className="text-blue-400">new</span> <span className="text-yellow-400">Cencori</span>({"{"}{"\n"}
                      {"  "}apiKey: process.env.<span className="text-orange-400">CENCORI_API_KEY</span>{"\n"}
                      {"}"});{"\n\n"}
                      <span className="text-blue-400">const</span> response = <span className="text-blue-400">await</span> cencori.ai.<span className="text-yellow-400">chat</span>({"{"}{"\n"}
                      {"  "}model: <span className="text-emerald-400">&apos;gpt-4o&apos;</span>,{"\n"}
                      {"  "}messages: [{"{"} role: <span className="text-emerald-400">&apos;user&apos;</span>, content: <span className="text-emerald-400">&apos;Hello!&apos;</span> {"}"}]{"\n"}
                      {"}"});
                    </code>
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-background border-b border-border/30">
          <div className="mx-auto max-w-6xl border-x border-border/30 relative px-6 py-16 sm:px-12">
            <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
            <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
            <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
            <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
              {[
                { value: "14+", label: "Providers Supported" },
                { value: "<50ms", label: "Added Latency" },
                { value: "99.9%", label: "Uptime SLA" },
                { value: "100+", label: "Models Available" },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="text-2xl md:text-3xl font-bold tracking-tighter mb-1">{stat.value}</div>
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-background border-b border-border/30 relative overflow-hidden">
          <div className="mx-auto max-w-6xl border-x border-border/30 relative">
            <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
            <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
            <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
            <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

            <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
              <div className="lg:col-span-6 p-8 sm:p-12 sm:py-20 flex flex-col justify-center space-y-6">
                
                <h2 className="text-3xl sm:text-4xl lg:text-4xl font-heading font-black leading-[0.95] tracking-[-0.02em] text-foreground">
                  The only AI gateway <br/>
                  that <span className="font-serif italic font-normal text-muted-foreground">makes you money.</span>
                </h2>
                
                <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                Every other gateway stops at routing. Cencori closes the loop with native monetization, budgets, and direct payouts — no extra plumbing, no revenue leakage.
                </p>

                <div className="space-y-4 pt-4">
                  {[
                    {
                      title: "Zero-latency margin calculator",
                      desc: "Set percentage markups or flat fees per model. The math is calculated on the fly as payloads pass through the gateway.",
                    },
                    {
                      title: "Hard edge quota enforcement",
                      desc: "Define strict token, request, or dollar limits per user. When limits are exceeded, Cencori blocks requests with a neat 429 at the edge, keeping your API bills safe.",
                    },
                    {
                      title: "Direct Stripe Connect payouts",
                      desc: "Link your Stripe account once. Invoices are dispatched, funds are collected, and payouts land directly in your account. Cencori never touches the money.",
                    },
                  ].map((item, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="mt-1 flex-shrink-0 w-5 h-5 rounded-full bg-amber-500/10 flex items-center justify-center">
                        <CheckCircleIcon className="w-3 h-3 text-amber-500" aria-hidden="true" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">{item.title}</h4>
                        <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-6 flex flex-col border-t lg:border-t-0 lg:border-l border-border/30 bg-muted/[0.01]">
                <div className="relative border-b border-border/30 p-8 sm:px-10 sm:py-6 flex items-center justify-between">
                  <div className="flex items-center">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">Stripe Connect: Connected</span>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground bg-foreground/5 px-2 py-0.5 rounded border border-border/20">acct_cencori_19a</span>
                </div>

                <div className="relative border-b border-border/30 p-8 sm:px-10 sm:py-8 space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground block">1. Select Resold Model</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["gpt", "claude", "llama"] as const).map((modelKey) => (
                        <button
                          key={modelKey}
                          onClick={() => setSelectedCalcModel(modelKey)}
                          className={cn(
                            "py-2 px-3 text-xs font-medium rounded-md border transition-all",
                            selectedCalcModel === modelKey
                              ? "bg-foreground text-background border-foreground font-semibold"
                              : "border-border/30 hover:border-foreground/30 hover:bg-foreground/[0.02]"
                          )}
                        >
                          {modelKey === "gpt" ? "GPT-4o" : modelKey === "claude" ? "Claude 3.5" : "Llama 3"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">2. Surcharge / Markup Percentage</label>
                      <span className="text-xs font-mono font-bold text-amber-500">+{markupPercent}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="300"
                      step="5"
                      value={markupPercent}
                      onChange={(e) => setMarkupPercent(Number(e.target.value))}
                      className="w-full h-1 bg-border rounded-lg appearance-none cursor-pointer accent-amber-500 focus:outline-none"
                    />
                    <div className="flex justify-between text-[9px] text-muted-foreground/60 font-mono">
                      <span>Cost (0%)</span>
                      <span>100%</span>
                      <span>300%</span>
                    </div>
                  </div>
                </div>

                <div className="p-8 sm:px-10 sm:py-8 space-y-6 flex-grow flex flex-col justify-between">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground block mb-0.5">Raw API Cost</span>
                      <span className="text-lg font-mono font-semibold text-muted-foreground">${rawCost.toFixed(2)}<span className="text-[9px] font-normal text-muted-foreground/60 block">per 1M tokens</span></span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-mono tracking-wider text-amber-500 block mb-0.5">Retail Price Charged</span>
                      <span className="text-lg font-mono font-semibold text-foreground">${retailPrice.toFixed(2)}<span className="text-[9px] font-normal text-muted-foreground/60 block">per 1M tokens</span></span>
                    </div>
                  </div>

                  <div className="bg-amber-500/[0.03] border border-amber-500/20 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-mono tracking-wider text-amber-500 block mb-0.5">Gross Margin</span>
                      <span className="text-2xl font-mono font-black tracking-tight text-amber-500">
                        {profitMarginPercent}%
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground block mb-0.5">Your Margin Profit</span>
                      <span className="text-xl font-mono font-bold text-emerald-500">
                        +${markupAmount.toFixed(2)}<span className="text-xs font-normal text-muted-foreground/80">/1M</span>
                      </span>
                    </div>
                  </div>
                  
                  <div className="space-y-2 mt-2">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground block">3. Pass User Context in Header</span>
                    <div className="border border-border/20 bg-background/50 rounded overflow-hidden">
                      <pre className="p-3 text-[10px] font-mono text-muted-foreground/90 overflow-x-auto leading-relaxed">
                        <code>
                          <span className="text-blue-400">const</span> response = <span className="text-blue-400">await</span> cencori.ai.<span className="text-yellow-400">chat</span>({"{"}{"\n"}
                          {"  "}model: <span className="text-emerald-400">&apos;{selectedCalcModel === "gpt" ? "gpt-4o" : selectedCalcModel === "claude" ? "claude-3-5" : "llama-3"}&apos;</span>,{"\n"}
                          {"  "}messages: [{"{"} role: <span className="text-emerald-400">&apos;user&apos;</span>, content: <span className="text-emerald-400">&apos;...&apos;</span> {"}"}],{"\n"}
                          {"  "}<span className="text-amber-500 font-semibold">user: &apos;user_123&apos;</span> <span className="text-muted-foreground/50">// Meters & limits instantly</span>{"\n"}
                          {"}"});
                        </code>
                      </pre>
                    </div>
                  </div>

                  <p className="text-[10px] text-muted-foreground/60 text-center mt-2">
                    Every request meters token counts and charges user balance automatically at the network edge.
                  </p>
                </div>

              </div>
            </div>
          </div>
        </section>

        <BudgetControl />

        <section className="bg-background border-b border-border/30">
          <div className="mx-auto max-w-6xl border-x border-border/30 relative px-6 py-16 sm:px-12 text-center">
            <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
            <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
            <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
            <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3">Try it Now</p>
            <h2 className="text-2xl md:text-3xl font-heading font-semibold tracking-[-0.02em] text-foreground mb-3">
              Test any model in the <span className="text-muted-foreground">playground</span>
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
              No signup required. Pick a model, tweak parameters, and see results instantly.
            </p>
            <Link href="/playground">
              <Button size="default" className="h-8 px-4 text-xs font-medium rounded-md bg-foreground text-background hover:bg-foreground/90 transition-all">
                Open Playground
              </Button>
            </Link>
          </div>
        </section>

        <CTA />
      </main>
  );
}
