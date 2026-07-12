"use client";

import React from 'react';
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Code2, CheckCircle } from 'lucide-react';
import { CTA } from "@/components/landing/CTA";
import { WaitlistModal } from "@/components/landing/WaitlistModal";
import { VercelLogo, SupabaseLogo, VSCodeLogo, CursorLogo } from "@/components/icons/BrandIcons";

export default function ProductEdgePage() {
  const features = [
    {
      icon: VercelLogo,
      title: "Vercel Integration",
      description: "One-click install from Vercel marketplace. Adds Cencori request protection to all edge deployments with preview checks.",
    },
    {
      icon: SupabaseLogo,
      title: "Supabase Extension",
      description: "Route Supabase edge functions through Cencori for enhanced security and real-time request filtering.",
    },
    {
      icon: Code2,
      title: "IDE Plugins",
      description: "Pre-deploy security checks directly in Cursor and VSCode. Catch issues before they reach production.",
    },
  ];


  const capabilities = [
    "One-click marketplace installation",
    "Zero-config edge middleware",
    "Automatic request/response filtering",
    "Preview deploy protection",
    "Real-time security feedback",
    "Integration manifests for platforms",
  ];

  return (
      <main>
        {/* Hero Section */}
        <section className="relative flex flex-col items-center justify-center overflow-hidden bg-background pt-32 pb-20">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-500/5 via-background to-background pointer-events-none" />

          <div className="container relative z-10 px-4 md:px-6 flex flex-col items-center text-center">
            <div className="mb-8 animate-appear">
              <div className="group inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground transition-colors hover:text-foreground">
                <span>Platform Integrations</span>
              </div>
            </div>

            <h1 className="mb-8 max-w-3xl text-[3rem] font-heading font-black leading-[0.95] tracking-[-0.02em] animate-appear sm:text-[4.5rem] lg:text-[5.5rem] text-foreground">
              <span className="font-serif italic font-normal text-muted-foreground">Edge.</span>
            </h1>

            <p className="mb-10 max-w-[38rem] text-base leading-[1.7] text-muted-foreground animate-appear [animation-delay:200ms]">
              Pre-built integrations and middleware for Vercel, Supabase, and edge runtimes.
              Activate AI protection without extensive engineering effort.
            </p>

            <div className="mb-10 flex flex-wrap items-center justify-center gap-3 animate-appear [animation-delay:300ms]">
              <WaitlistModal productName="Edge">
                <Button size="default" className="h-8 px-4 text-xs font-medium rounded-md bg-foreground text-background hover:bg-foreground/90 transition-all">
                  Join the Waitlist
                </Button>
              </WaitlistModal>
              <Link href="/docs/integrations">
                <Button variant="outline" size="default" className="h-8 px-4 text-xs font-medium rounded-md border-foreground/20 hover:bg-foreground/5 hover:border-foreground/40 transition-all">
                  View Docs
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="py-16 px-4 border-t border-border/40">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-xl font-semibold mb-2">Key Integrations</h2>
              <p className="text-sm text-muted-foreground">
                Deploy Cencori protection across your entire stack
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="group p-6 rounded-lg border border-border/40 bg-card hover:border-border/60 transition-colors"
                >
                  <div className="w-10 h-10 rounded-md bg-secondary flex items-center justify-center mb-4">
                    <feature.icon className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                  <h3 className="text-sm font-semibold mb-2">{feature.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 px-4 border-t border-border/40 bg-muted/20">
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="text-xl font-semibold mb-2">Built for Platforms</h2>
                <p className="text-sm text-muted-foreground mb-6">
                  Edge is designed for platform marketplaces and developer product teams
                  who want to offer robust AI security to their users with minimal friction.
                </p>
                <Button variant="outline" asChild className="h-8 px-3 text-xs rounded-full">
                  <Link href="/contact">
                    Contact Sales
                  </Link>
                </Button>
              </div>
              <div className="space-y-3">
                {capabilities.map((capability, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    <span className="text-sm text-muted-foreground">{capability}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <CTA />
      </main>
  );
}
