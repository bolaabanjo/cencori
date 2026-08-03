"use client";

import React from "react";
import { Reveal } from "@/components/landing/Reveal";
import { Check, X, ArrowRight } from "lucide-react";
import Link from "next/link";

const competitors = [
    { name: "OpenRouter", gateway: "yes", compute: "no", billing: "no", fullStack: "no" },
    { name: "Portkey", gateway: "yes", compute: "no", billing: "no", fullStack: "no" },
    { name: "LiteLLM", gateway: "yes", compute: "no", billing: "no", fullStack: "no" },
    { name: "AWS Bedrock", gateway: "yes", compute: "yes", billing: "no", fullStack: "partial" },
    { name: "CoreWeave", gateway: "no", compute: "yes", billing: "no", fullStack: "no" },
    { name: "Cencori", gateway: "yes", compute: "yes", billing: "yes", fullStack: "yes", highlight: true },
];

export const CompetitiveLandscape = () => {
    return (
        <section className="py-24 sm:py-32 bg-background relative overflow-hidden border-t border-border/10">
            <div className="max-w-screen-xl mx-auto px-4 md:px-6 relative z-10">
                
                {/* Header */}
                <div className="flex flex-col items-center text-center mb-16 sm:mb-20">
                    <Reveal>
                        <span className="mb-4 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.25em] text-primary">
                            Competitive Landscape
                        </span>
                    </Reveal>
                    <Reveal delay={0.05}>
                        <h2 className="text-3xl sm:text-[3.25rem] font-heading font-black leading-[1.0] tracking-[-0.03em] mb-4 text-foreground">
                            Not a gateway. Not a proxy.
                        </h2>
                    </Reveal>
                    <Reveal delay={0.1}>
                        <h3 className="text-lg sm:text-xl font-serif italic text-muted-foreground">
                            Not general cloud.
                        </h3>
                    </Reveal>
                </div>

                {/* Grid Comparison Matrix */}
                <Reveal delay={0.15}>
                    <div className="max-w-4xl mx-auto overflow-x-auto rounded-2xl border border-border bg-card/40 backdrop-blur-sm shadow-xl p-1">
                        <table className="w-full border-collapse text-left min-w-[600px]">
                            <thead>
                                <tr className="border-b border-border/40 text-[10px] font-mono uppercase tracking-wider text-muted-foreground bg-foreground/[0.01]">
                                    <th className="py-4 px-6 font-medium">Competitor</th>
                                    <th className="py-4 px-6 text-center font-medium">Gateway</th>
                                    <th className="py-4 px-6 text-center font-medium">Compute</th>
                                    <th className="py-4 px-6 text-center font-medium">Monetization</th>
                                    <th className="py-4 px-6 text-center font-medium">Full Stack</th>
                                </tr>
                            </thead>
                            <tbody>
                                {competitors.map((comp) => (
                                    <tr 
                                        key={comp.name}
                                        className={`border-b border-border/10 transition-colors ${comp.highlight ? "bg-primary/[0.02] text-foreground font-semibold" : "text-muted-foreground hover:bg-foreground/[0.01]"}`}
                                    >
                                        <td className="py-4 px-6 text-sm font-heading flex items-center gap-2">
                                            {comp.name}
                                            {comp.highlight && (
                                                <span className="text-[9px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                                                    Platform
                                                </span>
                                            )}
                                        </td>
                                        
                                        {/* Gateway Column */}
                                        <td className="py-4 px-6 text-center">
                                            <div className="flex justify-center">
                                                {comp.gateway === "yes" ? (
                                                    <Check className="size-4.5 text-emerald-400 shrink-0" />
                                                ) : (
                                                    <X className="size-4 text-muted-foreground/35 shrink-0" />
                                                )}
                                            </div>
                                        </td>

                                        {/* Compute Column */}
                                        <td className="py-4 px-6 text-center">
                                            <div className="flex justify-center">
                                                {comp.compute === "yes" ? (
                                                    <Check className="size-4.5 text-emerald-400 shrink-0" />
                                                ) : (
                                                    <X className="size-4 text-muted-foreground/35 shrink-0" />
                                                )}
                                            </div>
                                        </td>

                                        {/* Monetization Column */}
                                        <td className="py-4 px-6 text-center">
                                            <div className="flex justify-center">
                                                {comp.billing === "yes" ? (
                                                    <Check className="size-4.5 text-emerald-400 shrink-0" />
                                                ) : (
                                                    <X className="size-4 text-muted-foreground/35 shrink-0" />
                                                )}
                                            </div>
                                        </td>

                                        {/* Full Stack Column */}
                                        <td className="py-4 px-6 text-center">
                                            <div className="flex justify-center">
                                                {comp.fullStack === "yes" ? (
                                                    <Check className="size-4.5 text-emerald-400 shrink-0" />
                                                ) : comp.fullStack === "partial" ? (
                                                    <span className="text-xs text-yellow-500/80 font-mono tracking-wide">Partial</span>
                                                ) : (
                                                    <X className="size-4 text-muted-foreground/35 shrink-0" />
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Reveal>

                {/* Callout & Jump button */}
                <div className="max-w-3xl mx-auto mt-12 text-center space-y-8">
                    <Reveal delay={0.2}>
                        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed italic max-w-2xl mx-auto">
                            &ldquo;No one else ships gateway + compute + monetization + memory under one roof. That&apos;s not a roadmap advantage, that&apos;s a category advantage.&rdquo;
                        </p>
                    </Reveal>
                    
                    <Reveal delay={0.25}>
                        <div className="flex justify-center">
                            <Link 
                                href="/compare" 
                                className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-border bg-foreground/[0.01] hover:bg-foreground/[0.03] text-sm text-foreground transition-all duration-300 font-medium hover:border-foreground/35 group"
                            >
                                <span>Compare all competitor profiles</span>
                                <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-1" />
                            </Link>
                        </div>
                    </Reveal>
                </div>

            </div>
        </section>
    );
};
