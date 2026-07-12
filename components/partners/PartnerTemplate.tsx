"use client";

import React from "react";
import Link from "next/link";
import { Footer } from "@/components/landing/Footer";
import { Reveal } from "@/components/landing/Reveal";
import { PartnerConfig } from "@/types/partner";

interface PartnerTemplateProps {
    config: PartnerConfig;
}

export function PartnerTemplate({ config }: PartnerTemplateProps) {
    return (
        <>
            <main className="pt-24">
                <div className="mx-auto max-w-6xl px-4 md:px-6">
                    {/* Breadcrumbs & Navigation */}
                    <div className="pt-12 pb-8">
                        <Reveal>
                            <Link 
                                href="/partners" 
                                className="inline-flex items-center text-[9px] uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors group"
                            >
                                <span className="mr-3 group-hover:-translate-x-1 transition-transform duration-300">←</span> 
                                Index / {config.slug}
                            </Link>
                        </Reveal>
                    </div>

                    {/* High-Impact Header Section */}
                    <div className="py-12 border-t border-border/10">
                        <div className="flex flex-col md:flex-row md:items-end justify-between gap-12">
                            <Reveal delay={0.1}>
                                <div className="space-y-6">
                                    <div className="h-16 w-16 text-foreground border border-border/20 p-3 bg-foreground/[0.02]">
                                        <config.logo className="h-full w-full object-contain" />
                                    </div>
                                    <h1 className="text-5xl md:text-6xl font-semibold tracking-tighter uppercase">{config.name}</h1>
                                </div>
                            </Reveal>

                            <Reveal delay={0.2}>
                                <div className="flex flex-wrap gap-8 md:gap-16">
                                    <div className="space-y-1">
                                        <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground font-mono">Category</p>
                                        <p className="text-sm font-medium tracking-tight">{config.category || "Integration"}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground font-mono">Developer</p>
                                        <p className="text-sm font-medium tracking-tight">{config.name} Inc.</p>
                                    </div>
                                </div>
                            </Reveal>
                        </div>
                    </div>

                    {/* Screenshot / Visual Hero */}
                    {config.screenshots && config.screenshots.length > 0 && (
                        <div className="py-12 border-y border-border/10">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1">
                                {config.screenshots.map((src, i) => (
                                    <Reveal key={i} delay={i * 0.1}>
                                        <div className="aspect-[16/10] bg-foreground/[0.03] border border-border/5 overflow-hidden group relative">
                                            <div className="absolute inset-0 bg-foreground/[0.05] group-hover:bg-foreground/[0.02] transition-colors duration-700" />
                                            <img 
                                                src={src} 
                                                alt={`Screenshot ${i + 1}`}
                                                className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-700" 
                                            />
                                            <div className="absolute top-4 left-4 text-[8px] font-mono text-muted-foreground uppercase opacity-0 group-hover:opacity-100 transition-opacity">
                                                Visual_{i + 1}.bin
                                            </div>
                                        </div>
                                    </Reveal>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Technical Dossier Content */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-24 py-24">
                        {/* Main Dossier: Overview */}
                        <div className="lg:col-span-8 space-y-32">
                            <section className="relative">
                                <Reveal>
                                    <h2 className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground mb-12 flex items-center">
                                        <span className="w-8 h-px bg-border/40 mr-4" />
                                        Functional Overview
                                    </h2>
                                </Reveal>
                                <Reveal delay={0.1}>
                                    <div className="prose prose-invert prose-zinc max-w-2xl text-[15px] text-muted-foreground leading-relaxed font-light">
                                        {config.overview.content}
                                    </div>
                                </Reveal>
                            </section>
                        </div>

                        {/* Connection Sidebar */}
                        <aside className="lg:col-span-4">
                            <Reveal delay={0.2}>
                                <div className="space-y-12">
                                    <div className="space-y-10">
                                        <div className="group">
                                            <Link href={config.websiteUrl} className="block space-y-2">
                                                <p className="text-[8px] uppercase tracking-widest text-muted-foreground group-hover:text-zinc-500 transition-colors">Website</p>
                                                <p className="text-xs font-mono tracking-tight underline underline-offset-4 decoration-border/40 group-hover:decoration-foreground/20 transition-all">{config.websiteUrl.replace(/^https?:\/\//, "")}</p>
                                            </Link>
                                        </div>

                                        <div className="group">
                                            <Link href={config.docsUrl} className="block space-y-2">
                                                <p className="text-[8px] uppercase tracking-widest text-muted-foreground group-hover:text-zinc-500 transition-colors">Documentation</p>
                                                <p className="text-xs font-mono tracking-tight underline underline-offset-4 decoration-border/40 group-hover:decoration-foreground/20 transition-all">docs.{config.websiteUrl.replace(/^https?:\/\/www\./, "").replace(/^https?:\/\//, "")}</p>
                                            </Link>
                                        </div>
                                    </div>

                                    <div className="pt-12 border-t border-border/10">
                                        <div className="space-y-6">
                                            <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-mono">Partner Integrity</p>
                                            <div className="flex items-center justify-between text-[10px] font-mono">
                                                <span className="text-muted-foreground">Certified</span>
                                                <span className="text-foreground">True</span>
                                            </div>
                                            <div className="flex items-center justify-between text-[10px] font-mono">
                                                <span className="text-muted-foreground">Governance</span>
                                                <span className="text-foreground uppercase">Cencori Standard</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Reveal>
                        </aside>
                    </div>
                </div>
            </main>

            <Footer />
        </>
    );
}
