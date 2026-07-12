"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, ChevronRight, Stethoscope, HeartPulse, ShieldCheck, Activity } from "lucide-react";

export default function HealthcarePage() {

    return (
      <main>
                <section className="relative flex flex-col items-center justify-center overflow-hidden bg-background pt-32 pb-20">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-pink-500/5 via-background to-background pointer-events-none" />

                    <div className="container relative z-10 px-4 md:px-6 flex flex-col items-center text-center">
                        <div className="mb-8 animate-appear">
                            <span className="inline-flex items-center rounded-full border border-foreground/10 bg-foreground/5 px-3 py-1 text-sm font-medium text-foreground/80">
                                <span className="flex h-2 w-2 rounded-full bg-pink-500 mr-2 animate-pulse" />
                                <span className="mr-2">Healthcare & Life Sciences</span>
                            </span>
                        </div>

                        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tighter mb-6 max-w-4xl animate-appear [animation-delay:100ms] text-transparent bg-clip-text bg-gradient-to-b from-foreground to-foreground/50">
                            HIPAA-ready AI <span className="italic">infrastructure</span>
                        </h1>

                        <p className="text-lg md:text-xl text-muted-foreground max-w-xl mb-10 animate-appear [animation-delay:200ms] leading-relaxed">
                            Protect patient data with built-in PHI detection and redaction. Sign BAA with Cencori for full compliance coverage.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-3 animate-appear [animation-delay:300ms]">
                            <Link href="/contact">
                                <Button size="default" className="h-10 px-6 text-sm rounded-full bg-foreground text-background hover:bg-foreground/90 transition-all">
                                    Contact Sales <ArrowRight className="ml-2 h-4 w-4" />
                                </Button>
                            </Link>
                        </div>
                    </div>
                </section>

                <section className="py-20 bg-background">
                    <div className="container mx-auto px-4 md:px-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                            <div className="p-6 border border-border/30 rounded-lg">
                                <Stethoscope className="h-6 w-6 text-pink-500 mb-4" />
                                <h3 className="font-semibold text-lg mb-2">PHI Redaction</h3>
                                <p className="text-sm text-muted-foreground">
                                    Industry-leading models to detect and redact medical record numbers, names, and other identifiers in real-time.
                                </p>
                            </div>
                            <div className="p-6 border border-border/30 rounded-lg">
                                <ShieldCheck className="h-6 w-6 text-blue-500 mb-4" />
                                <h3 className="font-semibold text-lg mb-2">BAA Support</h3>
                                <p className="text-sm text-muted-foreground">
                                    We offer Business Associate Agreements (BAA) for enterprise customers to support your HIPAA compliance needs.
                                </p>
                            </div>
                            <div className="p-6 border border-border/30 rounded-lg">
                                <Activity className="h-6 w-6 text-emerald-500 mb-4" />
                                <h3 className="font-semibold text-lg mb-2">Audit Trails</h3>
                                <p className="text-sm text-muted-foreground">
                                    Complete traceability of who accessed what model and when. Crucial for forensic analysis and compliance audits.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="py-24 bg-background border-t border-border/30">
                    <div className="container mx-auto px-4 md:px-6 text-center">
                        <h2 className="text-3xl font-bold tracking-tighter mb-4">
                            Safe AI for healthcare
                        </h2>
                        <div className="flex justify-center mt-8">
                            <Link href="/contact">
                                <Button size="lg" className="rounded-full px-8">
                                    Talk to an Expert
                                </Button>
                            </Link>
                        </div>
                    </div>
                </section>
            </main>
    );
}
