"use client";

import React from "react";
import Link from "next/link";
import {
    ArrowRightIcon,
    Squares2X2Icon,
    ArrowsRightLeftIcon,
    ClockIcon,
    UserGroupIcon,
    ChevronRightIcon,
    CheckCircleIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";

import { CTA } from "@/components/landing/CTA";
import { WaitlistModal } from "@/components/landing/WaitlistModal";
import { Button } from "@/components/ui/button";

const pillars = [
    {
        id: "builder",
        title: "Visual Builder",
        tagline: "n8n for AI",
        description: "Drag-and-drop interface to build complex AI pipelines. No code required for common workflows.",
        icon: Squares2X2Icon,
        color: "pink",
        features: ["Drag-and-drop nodes", "100+ templates", "Real-time preview"],
    },
    {
        id: "orchestration",
        title: "Agent Orchestration",
        tagline: "Multi-agent workflows",
        description: "Coordinate multiple AI agents working together. Chain prompts, tools, and decisions.",
        icon: ArrowsRightLeftIcon,
        color: "emerald",
        features: ["Agent chaining", "Parallel execution", "Conditional branching"],
    },
    {
        id: "triggers",
        title: "Triggers & Webhooks",
        tagline: "Event-driven AI",
        description: "Trigger workflows from webhooks, schedules, or external events. Connect to any system.",
        icon: ClockIcon,
        color: "blue",
        features: ["Cron scheduling", "Webhook endpoints", "Event listeners"],
    },
    {
        id: "human",
        title: "Human-in-the-Loop",
        tagline: "AI + human collaboration",
        description: "Add approval steps, reviews, and human input to your AI workflows when needed.",
        icon: UserGroupIcon,
        color: "orange",
        features: ["Approval gates", "Review queues", "Escalation rules"],
    },
];

const colorClasses: Record<string, { bg: string; border: string; text: string }> = {
    pink: { bg: "bg-pink-500/10", border: "border-pink-500/30", text: "text-pink-500" },
    emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-500" },
    blue: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-500" },
    orange: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-500" },
};

export default function WorkflowPage() {
    return (
            <main>
                {/* Hero Section */}
                <section className="relative flex flex-col items-center justify-center overflow-hidden bg-background pt-32 pb-20">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-pink-500/5 via-background to-background pointer-events-none" />

                    <div className="container relative z-10 px-4 md:px-6 flex flex-col items-center text-center">
                        <div className="mb-8 animate-appear">
                            <div className="group inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground transition-colors hover:text-foreground">
                                <span>Coming Soon</span>
                            </div>
                        </div>

                        <h1 className="mb-8 max-w-3xl text-[3rem] font-heading font-black leading-[0.95] tracking-[-0.02em] animate-appear sm:text-[4.5rem] lg:text-[5.5rem] text-foreground">
                            <span className="font-serif italic font-normal text-muted-foreground">Workflow.</span>
                        </h1>

                        <p className="mb-10 max-w-[38rem] text-base leading-[1.7] text-muted-foreground animate-appear [animation-delay:200ms]">
                            Visual AI pipeline builder. Orchestrate agents. Automate everything.
                        </p>

                        <div className="mb-10 flex flex-wrap items-center justify-center gap-3 animate-appear [animation-delay:300ms]">
                            <WaitlistModal productName="Workflow">
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

                <section className="py-20 bg-background">
                    <div className="container mx-auto px-4 md:px-6">
                        <div className="flex flex-col items-center text-center mb-12">
                            <h2 className="text-2xl md:text-4xl font-bold tracking-tighter mb-4 text-foreground">
                                Build AI pipelines <span className="text-muted-foreground">visually</span>
                            </h2>
                            <p className="text-base text-muted-foreground max-w-xl">
                                From simple automations to complex multi-agent workflows, all in one canvas.
                            </p>
                        </div>

                        <div className="relative max-w-5xl mx-auto">
                            <div className="relative border border-border/40 bg-background">
                                <div className="absolute -top-[7px] -left-[7px] w-[14px] h-[14px] flex items-center justify-center text-muted-foreground/50 text-xs z-10">+</div>
                                <div className="absolute -top-[7px] -right-[7px] w-[14px] h-[14px] flex items-center justify-center text-muted-foreground/50 text-xs z-10">+</div>
                                <div className="absolute -bottom-[7px] -left-[7px] w-[14px] h-[14px] flex items-center justify-center text-muted-foreground/50 text-xs z-10">+</div>
                                <div className="absolute -bottom-[7px] -right-[7px] w-[14px] h-[14px] flex items-center justify-center text-muted-foreground/50 text-xs z-10">+</div>

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
                                                    !isLastRow && "border-b border-border/40",
                                                    !isRightEdge && "md:border-r border-border/40"
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
                    </div>
                </section>

                <section className="py-16 bg-background">
                    <div className="container mx-auto px-4 md:px-6">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
                            {[
                                { value: "100+", label: "Templates" },
                                { value: "50+", label: "Integrations" },
                                { value: "<1s", label: "Trigger Latency" },
                                { value: "∞", label: "Workflow Steps" },
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
