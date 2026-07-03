"use client";

import Navbar from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import Link from "next/link";

export default function ElinePage() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-foreground selection:text-background">
      <Navbar homeUrl="/" />

      <main>
        <section className="border-b border-border/30 pt-28 sm:pt-36 pb-0">
          <div className="mx-auto max-w-6xl border-t border-x border-border/30 relative px-6 py-20 sm:px-12 sm:py-28">
            <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
            <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
            <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
            <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

            <div className="max-w-3xl mx-auto text-center">
              <div className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[10px] font-medium tracking-widest uppercase bg-muted/30 text-muted-foreground border border-border/20 mb-8">
                Open Source
              </div>
              <h1 className="font-heading text-[1.875rem] sm:text-[2.125rem] lg:text-[2.375rem] font-semibold tracking-[-0.02em] leading-[1.1]">
                Build agents faster than the
                <span className="text-[#a855f7]"> speed of light</span>.
              </h1>
              <p className="mt-5 text-sm text-muted-foreground max-w-xl mx-auto leading-relaxed">
                Define agents as files. No SDK boilerplate, no DSL to learn. Write
                agents in TypeScript, deploy anywhere, and let Cencori handle the
                infrastructure.
              </p>
              <div className="mt-10 flex items-center justify-center gap-3">
                <a
                  href="https://github.com/cencori/eline"
                  className="inline-flex items-center gap-2 h-7 rounded-md bg-foreground text-background px-3 text-[11px] font-medium hover:bg-foreground/90 transition-all active:scale-[0.98]"
                >
                  Get Started
                </a>
                <Link
                  href="/eline/docs"
                  className="inline-flex items-center gap-2 h-7 rounded-md border border-foreground/20 bg-transparent px-3 text-[11px] font-medium text-foreground/90 hover:border-foreground/40 hover:bg-foreground/5 transition-all"
                >
                  Read the docs
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
