import React from "react";
import { Reveal } from "@/components/landing/Reveal";
import { AIGatewayDiagram } from "./diagrams/AIGatewayDiagram";
import { Network, ShieldCheck, CreditCard, ChevronRight } from "lucide-react";

export const Features = () => {
    return (
        <section className="py-24 sm:py-32 bg-background relative overflow-hidden border-t border-border/10">
            {/* Soft grid background */}
            <div 
                className="absolute inset-0 opacity-[0.02] pointer-events-none" 
                style={{
                    backgroundImage: `radial-gradient(circle, currentColor 1px, transparent 1px)`,
                    backgroundSize: '20px 20px',
                }}
            />

            <div className="max-w-screen-xl mx-auto px-4 md:px-6 relative z-10">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
                    
                    {/* Left Column: Flagship Product Copy */}
                    <div className="lg:col-span-6 flex flex-col justify-center">
                        <Reveal>
                            <span className="mb-4 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.25em] text-primary">
                                Flagship Product
                            </span>
                        </Reveal>

                        <Reveal delay={0.05}>
                            <h2 className="text-3xl sm:text-[3.25rem] font-heading font-black leading-[1.0] tracking-[-0.03em] mb-4 text-foreground">
                                AI Gateway.
                            </h2>
                        </Reveal>

                        <Reveal delay={0.1}>
                            <h3 className="text-xl sm:text-2xl font-serif italic text-muted-foreground mb-6">
                                Every AI request. Under your control.
                            </h3>
                        </Reveal>

                        <Reveal delay={0.15}>
                            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed mb-8">
                                One endpoint for 100+ models across every major provider. OpenAI, Anthropic, Google, Mistral, Groq, DeepSeek, xAI, and more — all behind a single, normalized API.
                            </p>
                        </Reveal>

                        {/* Pillars List */}
                        <div className="space-y-6">
                            
                            <Reveal delay={0.2}>
                                <div className="flex gap-4 group">
                                    <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20 shrink-0 h-10 w-10 flex items-center justify-center transition-all duration-300 group-hover:scale-105">
                                        <Network className="size-5" />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors mb-1.5">
                                            Routing & Reliability
                                        </h4>
                                        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                                            Dynamic routing based on latency, cost, and availability. Automatic failover, circuit breakers, caching, and model aliasing. If OpenAI is down, you keep running.
                                        </p>
                                    </div>
                                </div>
                            </Reveal>

                            <Reveal delay={0.25}>
                                <div className="flex gap-4 group">
                                    <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20 shrink-0 h-10 w-10 flex items-center justify-center transition-all duration-300 group-hover:scale-105">
                                        <ShieldCheck className="size-5" />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors mb-1.5">
                                            Enterprise Security
                                        </h4>
                                        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                                            Jailbreak detection before requests hit your models. PII masking in real time. Output scanning. Tamper-proof audit trails. SSO, RBAC, and custom data retention.
                                        </p>
                                    </div>
                                </div>
                            </Reveal>

                            <Reveal delay={0.3}>
                                <div className="flex gap-4 group">
                                    <div className="p-2 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 shrink-0 h-10 w-10 flex items-center justify-center transition-all duration-300 group-hover:scale-105">
                                        <CreditCard className="size-5" />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors mb-1.5">
                                            Monetization
                                        </h4>
                                        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                                            <span className="text-green-400 font-medium">The feature nobody else has.</span> Meter your users&apos; AI usage. Apply markup. Collect revenue automatically through Stripe Connect. Turn infrastructure cost into margin.
                                        </p>
                                    </div>
                                </div>
                            </Reveal>

                        </div>

                        {/* SDK details footer */}
                        <Reveal delay={0.35}>
                            <div className="mt-8 pt-6 border-t border-border/10 flex items-center gap-2 text-xs font-mono text-muted-foreground">
                                <ChevronRight className="size-3.5 text-primary" />
                                <span>SDKs available for TypeScript, Python, and Go. OpenAI-compatible payloads. Drop-in for any existing integration.</span>
                            </div>
                        </Reveal>

                    </div>

                    {/* Right Column: Animated Diagram */}
                    <div className="lg:col-span-6">
                        <Reveal delay={0.4}>
                            <div className="relative rounded-2xl border border-border bg-card/60 p-6 shadow-2xl overflow-hidden min-h-[500px] flex items-center justify-center backdrop-blur-sm">
                                {/* Corners decorator */}
                                <div className="absolute top-2 left-2 text-[10px] font-light text-muted-foreground/30">+</div>
                                <div className="absolute top-2 right-2 text-[10px] font-light text-muted-foreground/30">+</div>
                                <div className="absolute bottom-2 left-2 text-[10px] font-light text-muted-foreground/30">+</div>
                                <div className="absolute bottom-2 right-2 text-[10px] font-light text-muted-foreground/30">+</div>
                                
                                <div className="w-full">
                                    <AIGatewayDiagram />
                                </div>
                            </div>
                        </Reveal>
                    </div>

                </div>
            </div>
        </section>
    );
};
