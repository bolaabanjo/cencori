"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Shield, Zap, Lock, Users, Settings, Globe, ChevronRight, Code, Layers } from "lucide-react";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";

const features = [
  {
    title: "Request & Response Interception",
    description: "Transparently intercepts all AI calls to apply security and compliance policies in real-time.",
    icon: Shield,
    className: "md:col-span-2 md:row-span-2",
    visual: "bg-emerald-500/10",
  },
  {
    title: "Rule Engine",
    description: "Configurable rules using keywords, regex, patterns, and thresholds.",
    icon: Settings,
    className: "md:col-span-2 md:row-span-1",
    visual: "bg-blue-500/10",
  },
  {
    title: "Redaction & Sanitization",
    description: "Automatically masks or rewrites content to remove sensitive information.",
    icon: Lock,
    className: "md:col-span-1 md:row-span-2",
    visual: "bg-purple-500/10",
  },
  {
    title: "Per-tenant Policies",
    description: "Tailor security policies to individual organizations or projects.",
    icon: Users,
    className: "md:col-span-1 md:row-span-1",
    visual: "bg-orange-500/10",
  },
  {
    title: "Low Latency Mode",
    description: "Optimized for <50ms added latency in production environments.",
    icon: Zap,
    className: "md:col-span-2 md:row-span-1",
    visual: "bg-yellow-500/10",
  },
  {
    title: "Global Edge Network",
    description: "Deploy protection close to your users worldwide.",
    icon: Globe,
    className: "md:col-span-1 md:row-span-1",
    visual: "bg-cyan-500/10",
  },
];

const integrations = [
  {
    title: "TypeScript SDK",
    description: "Easy integration with full type safety.",
    icon: Code,
  },
  {
    title: "Edge Middleware",
    description: "Deploy at the edge on Vercel, Cloudflare, and more.",
    icon: Globe,
  },
  {
    title: "Simple Proxy Swap",
    description: "Replace your existing LLM proxy endpoint.",
    icon: Layers,
  },
];

export default function ProductAIPage() {
  return (
      <main>
        <section className="relative flex flex-col items-center justify-center overflow-hidden bg-background pt-32 pb-20">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-foreground/5 via-background to-background pointer-events-none" />

          <div className="container relative z-10 px-4 md:px-6 flex flex-col items-center text-center">
            <div className="mb-8 animate-appear">
              <Link href="/docs" className="inline-flex items-center rounded-full border border-foreground/10 bg-foreground/5 px-3 py-1 text-sm font-medium text-foreground/80 transition-colors hover:bg-foreground/10 hover:text-foreground">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 mr-2 animate-pulse" />
                <span className="mr-2">AI Gateway</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tighter mb-6 max-w-4xl animate-appear [animation-delay:100ms] text-transparent bg-clip-text bg-gradient-to-b from-foreground to-foreground/50">
              AI <span className="italic">Gateway</span>
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-xl mb-10 animate-appear [animation-delay:200ms] leading-relaxed">
              The inline proxy between your applications and LLMs. Inspect, redact, sanitize, or block content in real-time.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 animate-appear [animation-delay:300ms]">
              <Link href={siteConfig.links.getStartedUrl}>
                <Button size="default" className="h-10 px-6 text-sm rounded-full bg-foreground text-background hover:bg-foreground/90 transition-all shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)] dark:shadow-[0_0_20px_-5px_rgba(255,255,255,0.1)]">
                  Get Started Free <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/docs">
                <Button variant="outline" size="default" className="h-10 px-6 text-sm rounded-full border-foreground/20 hover:bg-foreground/5 hover:border-foreground/40 transition-all">
                  Documentation
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="py-20 bg-background">
          <div className="container mx-auto px-4 md:px-6">
            <div className="flex flex-col items-center text-center mb-12">
              <h2 className="text-2xl md:text-4xl font-bold tracking-tighter mb-4 text-foreground">
                Everything you need to{" "}
                <span className="text-muted-foreground">protect your AI stack</span>
              </h2>
              <p className="text-base text-muted-foreground max-w-xl">
                Comprehensive request/response protection and policy enforcement for every AI interaction.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 auto-rows-[160px] gap-4 max-w-5xl mx-auto">
              {features.map((feature, i) => (
                <div
                  key={i}
                  className={cn(
                    "group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border/40 bg-gradient-to-b from-background/80 to-transparent p-6 transition-all duration-300 hover:border-foreground/20",
                    feature.className
                  )}
                >
                  <div className={cn(
                    "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500",
                    "bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-foreground/5 via-transparent to-transparent"
                  )} />

                  <div className="relative z-10 flex flex-col gap-2">
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", feature.visual)}>
                      <feature.icon className="h-4 w-4 text-foreground/80" />
                    </div>
                    <h3 className="text-base font-semibold tracking-tight">{feature.title}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {feature.description}
                    </p>
                  </div>

                  <div className={cn(
                    "absolute bottom-0 right-0 w-1/2 h-1/2 rounded-tl-[30px] opacity-10 group-hover:opacity-20 transition-opacity",
                    feature.visual
                  )} />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 bg-background border-t border-border/40">
          <div className="container mx-auto px-4 md:px-6">
            <div className="flex flex-col items-center text-center mb-12">
              <h2 className="text-2xl md:text-4xl font-bold tracking-tighter mb-4 text-foreground">
                Integrate in <span className="text-muted-foreground">minutes</span>
              </h2>
              <p className="text-base text-muted-foreground max-w-xl">
                Multiple integration options to fit your existing workflow.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
              {integrations.map((integration, i) => (
                <div
                  key={i}
                  className="group relative flex flex-col p-6 rounded-xl border border-border/40 bg-gradient-to-b from-foreground/[0.02] to-transparent transition-all duration-300 hover:border-foreground/20"
                >
                  <div className="w-10 h-10 rounded-lg bg-foreground/10 flex items-center justify-center mb-4">
                    <integration.icon className="h-5 w-5 text-foreground/80" />
                  </div>
                  <h3 className="text-base font-semibold tracking-tight mb-2">{integration.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {integration.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 bg-background border-t border-border/40">
          <div className="container mx-auto px-4 md:px-6">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-2xl md:text-4xl font-bold tracking-tighter mb-4 text-foreground">
                Built for <span className="text-muted-foreground">modern teams</span>
              </h2>
              <p className="text-base text-muted-foreground leading-relaxed mb-8">
                Whether you&apos;re a developer team, AI-first startup, or enterprise, AI Gateway helps you secure your AI applications.
              </p>

              <div className="flex flex-wrap justify-center gap-3">
                {["Developer Teams", "AI-first Startups", "SMBs", "Enterprise"].map((tag) => (
                  <div key={tag} className="px-4 py-2 rounded-full border border-foreground/10 bg-foreground/5 text-xs font-medium">
                    {tag}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 bg-background relative overflow-hidden">
          <div className="max-w-screen-xl mx-auto px-4 md:px-6 relative z-10">
            <div className="relative overflow-hidden rounded-xl border border-border/30 bg-foreground/[0.02] px-6 py-12 md:px-10 text-center">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-foreground/5 via-transparent to-transparent opacity-50" />
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:20px_20px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

              <div className="relative z-10 flex flex-col items-center max-w-2xl mx-auto">
                <div className="mb-4 inline-flex items-center justify-center rounded-full border border-border/40 bg-muted/30 px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  <span>Start building today</span>
                </div>

                <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3 text-foreground">
                  Ready to secure your AI?
                </h2>
                <p className="text-sm text-muted-foreground mb-6 max-w-lg leading-relaxed">
                  Get started with AI Gateway and protect your AI applications in minutes.
                </p>

                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <Link href={siteConfig.links.getStartedUrl}>
                    <Button size="sm" className="h-8 px-4 text-xs rounded-full bg-foreground text-background hover:bg-foreground/90 transition-all">
                      Get Started Free
                      <ArrowRight className="ml-1.5 w-3 h-3" />
                    </Button>
                  </Link>
                  <Link href="/docs">
                    <Button variant="ghost" size="sm" className="h-8 px-4 text-xs rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
                      View Documentation
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
  );
}
