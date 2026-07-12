"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, ChevronRight, Briefcase, FileText, LayoutTemplate, Shield } from "lucide-react";

export default function AgenciesPage() {

    return (
      <main>
                <section className="relative flex flex-col items-center justify-center overflow-hidden bg-background pt-32 pb-20">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-500/5 via-background to-background pointer-events-none" />

                    <div className="container relative z-10 px-4 md:px-6 flex flex-col items-center text-center">
                        <div className="mb-8 animate-appear">
                            <Link href="/partners" className="inline-flex items-center rounded-full border border-foreground/10 bg-foreground/5 px-3 py-1 text-sm font-medium text-foreground/80 transition-colors hover:bg-foreground/10 hover:text-foreground">
                                <span className="flex h-2 w-2 rounded-full bg-indigo-500 mr-2 animate-pulse" />
                                <span className="mr-2">Partner Program</span>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </Link>
                        </div>

                        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tighter mb-6 max-w-4xl animate-appear [animation-delay:100ms] text-transparent bg-clip-text bg-gradient-to-b from-foreground to-foreground/50">
                            Build <span className="italic">secure</span> AI for your clients
                        </h1>

                        <p className="text-lg md:text-xl text-muted-foreground max-w-xl mb-10 animate-appear [animation-delay:200ms] leading-relaxed">
                            Deliver production-ready AI applications with built-in compliance, monitoring, and safety rails.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-3 animate-appear [animation-delay:300ms]">
                            <Link href="/login">
                                <Button size="default" className="h-10 px-6 text-sm rounded-full bg-foreground text-background hover:bg-foreground/90 transition-all">
                                    Start Building <ArrowRight className="ml-2 h-4 w-4" />
                                </Button>
                            </Link>
                        </div>
                    </div>
                </section>

                <section className="py-20 bg-background">
                    <div className="container mx-auto px-4 md:px-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                            <div className="p-6 border border-border/30 rounded-lg">
                                <Briefcase className="h-6 w-6 text-indigo-500 mb-4" />
                                <h3 className="font-semibold text-lg mb-2">Client Management</h3>
                                <p className="text-sm text-muted-foreground">
                                    Manage multiple client projects from a single dashboard. Separate billing and usage tracking for each account.
                                </p>
                            </div>
                            <div className="p-6 border border-border/30 rounded-lg">
                                <Shield className="h-6 w-6 text-blue-500 mb-4" />
                                <h3 className="font-semibold text-lg mb-2">Security Standard</h3>
                                <p className="text-sm text-muted-foreground">
                                    Standardize your agency&apos;s AI security stack. Offer PII protection and prompt defense as value-add services.
                                </p>
                            </div>
                            <div className="p-6 border border-border/30 rounded-lg">
                                <FileText className="h-6 w-6 text-emerald-500 mb-4" />
                                <h3 className="font-semibold text-lg mb-2">Handover Ready</h3>
                                <p className="text-sm text-muted-foreground">
                                    Easy handover to clients. Transfer project ownership in one click while keeping configurations intact.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="py-24 bg-background border-t border-border/30">
                    <div className="container mx-auto px-4 md:px-6 text-center">
                        <h2 className="text-3xl font-bold tracking-tighter mb-4">
                            Differentiate your agency
                        </h2>
                        <div className="flex justify-center mt-8">
                            <Link href="/contact">
                                <Button size="lg" className="rounded-full px-8">
                                    Contact Partner Team
                                </Button>
                            </Link>
                        </div>
                    </div>
                </section>
            </main>
    );
}
