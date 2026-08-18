import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

export const BottomCTA = () => {
  return (
    <section className="bg-background border-b border-border/30">
      <div className="mx-auto max-w-6xl border-x border-border/30 relative">
        {/* Corner Intersection Markers */}
        <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
        <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
        <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
        <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

        {/* Header section */}
        <div className="px-6 pt-16 pb-12 sm:px-12 text-center max-w-2xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            Get Started
          </p>
          <h2 className="mt-4 font-serif text-3xl font-normal leading-tight tracking-tight sm:text-4xl text-foreground">
            Scale your AI product.
          </h2>
          <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
            Choose Cencori Pro for security, caching, and observability, or build custom deployments with Cencori Enterprise.
          </p>
        </div>

        {/* Grid Section with horizontal divider */}
        <div className="relative border-t border-border/30">
          {/* Horizontal divider intersection markers */}
          <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
          <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
          <div className="hidden md:flex absolute -top-1.5 left-1/2 -translate-x-1/2 h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
          <div className="hidden md:flex absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

          <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/30">
            {/* Pro track */}
            <div className="flex flex-col justify-between items-start p-8 sm:p-12 space-y-6">
              <div className="space-y-4 w-full">
                <div className="inline-flex items-center rounded-full border border-border/60 bg-background/50 px-2.5 py-0.5 text-[10px] font-medium text-foreground">
                  Pro Plan
                </div>
                <h3 className="font-heading text-xl font-semibold text-foreground">
                  Power your production apps
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Unlock multi-provider routing, jailbreak detection, semantic caching, and full observability pipelines for growing AI workloads.
                </p>
                <ul className="space-y-2 pt-2">
                  <li className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Check className="h-3.5 w-3.5 text-foreground shrink-0 animate-pulse" />
                    <span>Unlimited requests</span>
                  </li>
                  <li className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Check className="h-3.5 w-3.5 text-foreground shrink-0 animate-pulse" />
                    <span>Full security and PII pipeline</span>
                  </li>
                  <li className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Check className="h-3.5 w-3.5 text-foreground shrink-0 animate-pulse" />
                    <span>Semantic cache & failover</span>
                  </li>
                </ul>
              </div>
              <Link href="/pricing" className="pt-2">
                <Button className="h-7 rounded-md bg-foreground px-3 text-[11px] font-medium text-background hover:bg-foreground/90 transition-colors">
                  Subscribe to Pro
                </Button>
              </Link>
            </div>

            {/* Enterprise track */}
            <div className="flex flex-col justify-between items-start p-8 sm:p-12 space-y-6">
              <div className="space-y-4 w-full">
                <div className="inline-flex items-center rounded-full border border-border/60 bg-background/50 px-2.5 py-0.5 text-[10px] font-medium text-foreground">
                  Enterprise
                </div>
                <h3 className="font-heading text-xl font-semibold text-foreground">
                  Custom security & scale
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  For organizations requiring dedicated infrastructure, SAML SSO/SAML, custom residency, SOC2 compliance audit logs, and custom SLAs.
                </p>
                <ul className="space-y-2 pt-2">
                  <li className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Check className="h-3.5 w-3.5 text-foreground shrink-0 animate-pulse" />
                    <span>Bring your own cloud / infrastructure</span>
                  </li>
                  <li className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Check className="h-3.5 w-3.5 text-foreground shrink-0 animate-pulse" />
                    <span>SAML SSO, RBAC & custom SLAs</span>
                  </li>
                  <li className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Check className="h-3.5 w-3.5 text-foreground shrink-0 animate-pulse" />
                    <span>SOC2 compliance audit logs</span>
                  </li>
                </ul>
              </div>
              <Link href="/contact" className="pt-2">
                <Button
                  variant="outline"
                  className="h-7 rounded-md border-foreground/20 bg-transparent px-3 text-[11px] font-medium text-foreground/90 hover:border-foreground/40 hover:bg-foreground/5 hover:text-foreground transition-colors"
                >
                  Contact Sales
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
