"use client";

import React from "react";
import Link from "next/link";
import {
    ArrowRightIcon,
    CpuChipIcon,
    ServerStackIcon,
    GlobeAltIcon,
    BoltIcon,
    CheckCircleIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";

import { CTA } from "@/components/landing/CTA";
import { WaitlistModal } from "@/components/landing/WaitlistModal";
import { Button } from "@/components/ui/button";

const pillars = [
    {
        id: "serverless",
        title: "Serverless Functions",
        tagline: "Zero infrastructure",
        description: "Deploy AI functions without managing servers. Auto-scaling, pay-per-use compute for any workload.",
        icon: BoltIcon,
        color: "violet",
        features: ["Auto-scaling", "Pay-per-invocation", "Sub-100ms cold starts"],
    },
    {
        id: "gpu",
        title: "GPU Access",
        tagline: "On-demand acceleration",
        description: "Access NVIDIA GPUs for training, fine-tuning, and high-performance inference on demand.",
        icon: CpuChipIcon,
        color: "emerald",
        features: ["NVIDIA A100/H100", "Spot & reserved pricing", "Multi-GPU clusters"],
    },
    {
        id: "edge",
        title: "Edge Deployment",
        tagline: "Global performance",
        description: "Run AI inference at the edge, close to your users, for ultra-low latency responses.",
        icon: GlobeAltIcon,
        color: "blue",
        features: ["200+ edge locations", "Sub-50ms latency", "Automatic routing"],
    },
    {
        id: "agents",
        title: "Agent Deployments",
        tagline: "Autonomous AI",
        description: "Deploy and manage AI agents with built-in orchestration, memory, and tool access.",
        icon: ServerStackIcon,
        color: "orange",
        features: ["Persistent agents", "Tool integration", "Memory management"],
    },
];

const colorClasses: Record<string, { bg: string; border: string; text: string }> = {
    violet: { bg: "bg-violet-500/10", border: "border-violet-500/30", text: "text-violet-500" },
    emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-500" },
    blue: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-500" },
    orange: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-500" },
};

const corner = "absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none";

function CornerMarkers({ bottom = true }: { bottom?: boolean }) {
    return (
        <>
            <div className={cn(corner, "-top-1.5 -left-1.5")}>+</div>
            <div className={cn(corner, "-top-1.5 -right-1.5")}>+</div>
            {bottom && (
                <>
                    <div className={cn(corner, "-bottom-1.5 -left-1.5")}>+</div>
                    <div className={cn(corner, "-bottom-1.5 -right-1.5")}>+</div>
                </>
            )}
        </>
    );
}

export default function ComputePage() {
    return (
            <main>
                <section className="bg-background border-b border-border/30 pt-28 sm:pt-36 pb-0 relative overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-violet-500/5 via-background to-background pointer-events-none" />

                    <div className="mx-auto max-w-6xl border-t border-x border-border/30 relative px-6 sm:px-12 py-20 sm:py-28 z-10 flex flex-col items-center text-center">
                        <CornerMarkers />

                        <div className="mb-8 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
                            <span>Compute</span>
                        </div>

                        <h1 className="mb-8 max-w-3xl text-[2.5rem] font-heading font-black leading-[0.95] tracking-[-0.02em] sm:text-[3.5rem] lg:text-[4.5rem] text-foreground">
                            <span className="font-serif italic font-normal text-muted-foreground">Run any model. Train any model. Scale without the infra pain.</span>
                        </h1>

                        <p className="mb-10 max-w-[38rem] text-base leading-[1.7] text-muted-foreground">
                            Serverless AI infrastructure. GPUs on demand. Deploy anywhere.
                        </p>

                        <div className="mb-10 flex flex-wrap items-center justify-center gap-3">
                            <WaitlistModal productName="Compute">
                                <Button size="default" className="h-8 px-4 text-xs font-medium rounded-md bg-foreground text-background hover:bg-foreground/90 transition-all">
                                    Join the Waitlist
                                </Button>
                            </WaitlistModal>
                            <Link href="/docs">
                                <Button variant="outline" size="default" className="h-8 px-4 text-xs font-medium rounded-md border-foreground/20 hover:bg-foreground/5 hover:border-foreground/40 transition-all">
                                    Learn More
                                </Button>
                            </Link>
                        </div>
                    </div>
                </section>

                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative px-6 sm:px-12 py-20 sm:py-28">
                        <CornerMarkers />

                        <div className="flex flex-col items-center text-center mb-14">
                            <h2 className="text-3xl sm:text-[2.75rem] font-semibold tracking-[-0.03em] leading-[1.1] mb-4 max-w-xl">
                                AI infrastructure <br />
                                <span className="text-muted-foreground">without limits</span>
                            </h2>
                            <p className="text-sm text-muted-foreground max-w-xl leading-[1.7]">
                                From serverless functions to GPU clusters, Compute handles your AI workloads.
                            </p>
                        </div>

                        <div className="relative border border-border/30">
                            <div className="absolute -top-[7px] -left-[7px] w-[14px] h-[14px] flex items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                            <div className="absolute -top-[7px] -right-[7px] w-[14px] h-[14px] flex items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                            <div className="absolute -bottom-[7px] -left-[7px] w-[14px] h-[14px] flex items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                            <div className="absolute -bottom-[7px] -right-[7px] w-[14px] h-[14px] flex items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

                            <div className="grid grid-cols-1 md:grid-cols-2">
                                {pillars.map((pillar, index) => {
                                    const colors = colorClasses[pillar.color];
                                    const isLastRow = index >= 2;
                                    const isRightEdge = (index + 1) % 2 === 0;
                                    return (
                                        <div
                                            key={pillar.id}
                                            className={cn(
                                                "group relative flex flex-col p-6 transition-colors duration-300 hover:bg-foreground/[0.02]",
                                                !isLastRow && "border-b border-border/30",
                                                !isRightEdge && "md:border-r border-border/30"
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

                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative px-6 sm:px-12 py-20 sm:py-28">
                        <CornerMarkers />

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-3xl mx-auto">
                            {[
                                { value: "<100ms", label: "Cold Start" },
                                { value: "200+", label: "Edge Locations" },
                                { value: "A100/H100", label: "GPU Options" },
                                { value: "99.9%", label: "Uptime SLA" },
                            ].map((stat) => (
                                <div key={stat.label} className="text-center">
                                    <div className="text-3xl sm:text-4xl font-bold tracking-tighter mb-1.5">{stat.value}</div>
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
