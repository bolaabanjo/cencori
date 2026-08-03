"use client";

import React from "react";
import { Reveal } from "@/components/landing/Reveal";

const layers = [
    {
        name: "AI Gateway",
        status: "Live",
        statusColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        description: "Unified routing across 100+ models. Automatic failover, rate limiting, jailbreak detection, PII masking, audit trails, and monetization — all in one endpoint."
    },
    {
        name: "Scan",
        status: "Live",
        statusColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        description: "Real-time security layer for AI applications. Detects jailbreaks, masks PII, inspects outputs, and logs every security incident before it reaches your users."
    },
    {
        name: "Billing",
        status: "Live",
        statusColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        description: "Turn AI cost into margin. Meter, limit, and charge your users for AI usage. Stripe Connect, Paystack, Flutterwave — and African payment rails built in."
    },
    {
        name: "Compute",
        status: "In Build",
        statusColor: "bg-purple-500/10 text-purple-400 border-purple-500/20",
        description: "GPU infrastructure for inference, fine-tuning, and training. Run any open-source model. Train your own. Deploy it instantly. Software-defined today, proprietary hardware on the roadmap."
    },
    {
        name: "Memory",
        status: "Coming Soon",
        statusColor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
        description: "Persistent intelligence across sessions. Vector storage, knowledge bases, long-term user profiles, RAG pipelines, and GDPR-compliant selective forgetting."
    },
    {
        name: "Deployment",
        status: "Coming Soon",
        statusColor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
        description: "From trained model to real users in one command. Serverless endpoints, autoscaling, A/B testing, edge serving, and full agent deployment with spend caps."
    },
    {
        name: "Workflow",
        status: "Coming Soon",
        statusColor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
        description: "Agentic orchestration for complex AI products. Multi-step pipelines, tool calling, multi-agent coordination, human-in-the-loop, and visual workflow builder."
    },
    {
        name: "Data",
        status: "Roadmap",
        statusColor: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
        description: "Dataset marketplace, visual cleaning pipelines, synthetic data generation, and version control — including the first serious platform for African language training data."
    }
];

export const FullStack = () => {
    return (
        <section className="py-24 sm:py-32 bg-background relative overflow-hidden border-t border-border/10">
            <div className="max-w-screen-xl mx-auto px-4 md:px-6 relative z-10">
                
                {/* Section Header */}
                <div className="flex flex-col items-center text-center mb-20 sm:mb-28">
                    <Reveal delay={0.05}>
                        <h2 className="max-w-4xl text-[2.5rem] sm:text-[3.5rem] md:text-[4.25rem] font-heading font-black leading-[1.05] tracking-[-0.02em] text-foreground text-balance">
                            Everything you need <br />
                            <span className="font-serif italic font-normal text-muted-foreground">to ship AI.</span>
                        </h2>
                    </Reveal>
                    <Reveal delay={0.1}>
                        <p className="mt-6 text-base text-muted-foreground max-w-2xl leading-[1.7]">
                            Start with the product you need today. The platform grows with you.
                        </p>
                    </Reveal>
                </div>

                {/* Minimal Grid (No cards, no icons) */}
                <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-12 sm:gap-y-16 relative">
                    {layers.map((layer, index) => (
                        <Reveal key={layer.name} delay={0.1 + index * 0.05}>
                            <div className="space-y-4 pt-6 border-t border-border/30">
                                
                                {/* Header with Name and Status Badge */}
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="text-base sm:text-lg font-bold tracking-tight text-foreground font-heading">
                                        {layer.name}
                                    </h3>
                                    <span className={`text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${layer.statusColor}`}>
                                        {layer.status}
                                    </span>
                                </div>
                                
                                {/* Description */}
                                <p className="text-xs sm:text-sm text-muted-foreground leading-[1.6]">
                                    {layer.description}
                                </p>

                                {/* Meta details */}
                                <div className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-widest text-muted-foreground/35 pt-1">
                                    <span>Layer 0{index + 1}</span>
                                </div>
                                
                            </div>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    );
};
