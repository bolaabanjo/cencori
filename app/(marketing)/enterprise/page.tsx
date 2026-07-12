import { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

export const metadata: Metadata = {
    title: 'Cencori for Enterprise | The AI cloud for critical systems',
    description:
        'Cencori is the AI cloud for organizations that operate critical systems — banking, healthcare, energy, telecom, government, defense, and robotics. Global from day one.',
};

const CONTACT_EMAIL = 'enterprise@cencori.com';
const CAL_URL = 'https://cal.com/omogbolahan/cencori-enterprise';
const COMPUTE_EMAIL = `mailto:${CONTACT_EMAIL}?subject=Cencori%20Compute%20%E2%80%94%20early%20access`;
const ENTERPRISE_EMAIL = `mailto:${CONTACT_EMAIL}?subject=Cencori%20for%20Enterprise%20%E2%80%94%20conversation`;

function CornerMarkers({ withVertical = false }: { withVertical?: boolean }) {
    return (
        <>
            <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
            <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
            <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
            <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
            {withVertical && (
                <>
                    <div className="hidden md:flex absolute -top-1.5 left-1/2 -translate-x-1/2 h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                    <div className="hidden md:flex absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                </>
            )}
        </>
    );
}

const TRUST_ITEMS = [
    {
        title: 'Encryption everywhere',
        body: 'TLS in transit, AES-256 at rest, keys held in a dedicated KMS boundary. Customer prompts never persisted in plain text.',
    },
    {
        title: 'PII detection & redaction',
        body: 'Regulated identifiers inspected at the gateway before egress. Redact, tokenize, or block by policy — per project.',
    },
    {
        title: 'Immutable audit logs',
        body: 'Every request, provider call, and model swap recorded with a cryptographic timestamp. Exportable to your SIEM.',
    },
    {
        title: 'Regional routing',
        body: 'Pin workloads to a region and restrict providers by geography. Residency enforced at the gateway, not by trust.',
    },
    {
        title: 'Incident response',
        body: 'A named engineer, a written playbook, an SLA on notification. DPA available on request. Disclosure welcomed.',
    },
    {
        title: 'Certifications',
        body: 'SOC 2 Type II in progress. ISO 27001 planned. HIPAA BAA available on enterprise agreements.',
    },
];

const INDUSTRIES = [
    'Banking',
    'Healthcare',
    'Energy',
    'Telecom',
    'Government',
    'Defense',
    'Robotics',
];

export default function EnterprisePage() {
    return (
      <main className="pt-28 sm:pt-36">
                {/* --- HERO ------------------------------------------------ */}
                <section className="bg-background border-b border-border/30 pb-0">
                    <div className="mx-auto max-w-6xl border-t border-x border-border/30 relative px-6 py-20 sm:px-12 sm:py-28">
                        <CornerMarkers />

                        <div className="mb-6 flex flex-wrap items-center gap-1.5 font-mono text-[10px] sm:text-[11px] tracking-wider text-muted-foreground select-none">
                            <span>Cencori for Enterprise ·</span>
                            {INDUSTRIES.map((industry, i) => (
                                <span key={industry} className="tabular-nums">
                                    {industry}
                                    {i < INDUSTRIES.length - 1 && <span className="ml-1.5">·</span>}
                                </span>
                            ))}
                        </div>

                        <h1 className="font-heading text-[1.875rem] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground sm:text-[2.125rem] lg:text-[2.375rem]">
                            <span className="block sm:whitespace-nowrap">The AI cloud</span>
                            <span className="block sm:whitespace-nowrap">for critical</span>
                            <span className="block sm:whitespace-nowrap">systems.</span>
                        </h1>

                        <p className="mt-8 max-w-xl text-sm leading-relaxed text-muted-foreground">
                            Engineered for organizations that can&rsquo;t afford to compromise on
                            control. Downtime, data leakage, and model drift aren&rsquo;t incidents
                            in these workloads &mdash; they&rsquo;re headlines.
                        </p>

                        <div className="mt-12 flex flex-wrap gap-3">
                            <Link href={CAL_URL}>
                                <Button className="h-7 rounded-md bg-foreground px-3 text-[11px] font-medium text-background hover:bg-foreground/90">
                                    Talk to us
                                </Button>
                            </Link>
                            <Link href="/security">
                                <Button
                                    variant="outline"
                                    className="h-7 rounded-md border-foreground/20 bg-transparent px-3 text-[11px] font-medium text-foreground/90 hover:border-foreground/40 hover:bg-foreground/5 hover:text-foreground"
                                >
                                    Security posture
                                </Button>
                            </Link>
                        </div>
                    </div>
                </section>

                {/* --- WHERE YOU SIT --------------------------------------- */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative">
                        <CornerMarkers withVertical />

                        <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/30">
                            <div className="px-6 py-16 md:py-24 md:pr-12 flex flex-col justify-center">
                                <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                                    Where you sit
                                </p>
                                <h2 className="font-serif text-3xl font-normal leading-tight tracking-tight sm:text-4xl lg:text-5xl text-foreground">
                                    Between the demo <br />and the regulator.
                                </h2>
                            </div>
                            <div className="px-6 py-16 md:py-24 md:pl-12 flex flex-col justify-center space-y-4 text-sm leading-relaxed text-muted-foreground">
                                <p>
                                    The gap between AI as a demo and AI as production
                                    infrastructure is widest inside a regulated institution.
                                    Procurement wants residency, security wants tokenization
                                    and audit logs, engineering wants provider choice, finance
                                    wants caps. The demo has none of those things.
                                </p>
                                <p>
                                    Cencori is the layer that closes the gap. One API surface
                                    to every frontier model, with the controls, redaction, and
                                    evidence you&rsquo;re already required to have. You keep
                                    your provider agreements, your data boundary, and your
                                    budget. You lose the integration sprawl.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* --- THREE-LAYER PLATFORM -------------------------------- */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative">
                        <CornerMarkers />

                        <div className="px-6 pt-16 pb-12 sm:px-12 max-w-2xl">
                            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                                The platform
                            </p>
                            <h2 className="mt-4 font-serif text-3xl font-normal leading-tight tracking-tight sm:text-4xl text-foreground">
                                Three layers. One control plane.
                            </h2>
                            <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                                Adopt any layer independently. Most enterprises start with the
                                gateway and grow into compute and cloud as their model strategy
                                matures.
                            </p>
                        </div>

                        <div className="relative border-t border-border/30">
                            <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                            <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                            <div className="hidden md:flex absolute -top-1.5 left-1/3 -translate-x-1/2 h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                            <div className="hidden md:flex absolute -top-1.5 left-2/3 -translate-x-1/2 h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                            <div className="hidden md:flex absolute -bottom-1.5 left-1/3 -translate-x-1/2 h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                            <div className="hidden md:flex absolute -bottom-1.5 left-2/3 -translate-x-1/2 h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

                            <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border/30">
                                {/* Gateway */}
                                <div className="flex flex-col justify-between items-start p-8 sm:p-12 space-y-6">
                                    <div className="space-y-4 w-full">
                                        <div className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/5 px-2.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                            Live
                                        </div>
                                        <h3 className="font-heading text-xl font-semibold text-foreground">
                                            Cencori Gateway
                                        </h3>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            One SDK, every major model. Chat, embeddings,
                                            vision, documents, and voice, with BYOK, PII
                                            redaction, prompt-injection filtering, spend caps,
                                            audit logs, and per-team governance.
                                        </p>
                                        <ul className="space-y-2 pt-2">
                                            <li className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
                                                <span>150+ models · 10 providers</span>
                                            </li>
                                            <li className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
                                                <span>OpenAI-compatible API</span>
                                            </li>
                                            <li className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
                                                <span>Regional routing &amp; residency</span>
                                            </li>
                                        </ul>
                                    </div>
                                    <Link href="/docs" className="pt-2">
                                        <Button className="h-7 rounded-md bg-foreground px-3 text-[11px] font-medium text-background hover:bg-foreground/90 transition-colors">
                                            Read the docs
                                        </Button>
                                    </Link>
                                </div>

                                {/* Compute */}
                                <div className="flex flex-col justify-between items-start p-8 sm:p-12 space-y-6">
                                    <div className="space-y-4 w-full">
                                        <div className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/5 px-2.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                            Q4 2026 · Early access
                                        </div>
                                        <h3 className="font-heading text-xl font-semibold text-foreground">
                                            Cencori Compute
                                        </h3>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            Train, host, and deploy your own models. Point at
                                            a repo, wire a dataset, benchmark, publish. The
                                            model you ship becomes a first-class endpoint in
                                            your gateway.
                                        </p>
                                        <ul className="space-y-2 pt-2">
                                            <li className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
                                                <span>Repo &rarr; dataset &rarr; training</span>
                                            </li>
                                            <li className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
                                                <span>Benchmarks against reference models</span>
                                            </li>
                                            <li className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
                                                <span>Private tenants for regulated workloads</span>
                                            </li>
                                        </ul>
                                    </div>
                                    <Link href={COMPUTE_EMAIL} className="pt-2">
                                        <Button
                                            variant="outline"
                                            className="h-7 rounded-md border-foreground/20 bg-transparent px-3 text-[11px] font-medium text-foreground/90 hover:border-foreground/40 hover:bg-foreground/5 hover:text-foreground transition-colors"
                                        >
                                            Join early access
                                        </Button>
                                    </Link>
                                </div>

                                {/* Cloud */}
                                <div className="flex flex-col justify-between items-start p-8 sm:p-12 space-y-6">
                                    <div className="space-y-4 w-full">
                                        <div className="inline-flex items-center rounded-full border border-border/60 bg-background/50 px-2.5 py-0.5 text-[10px] font-medium text-foreground">
                                            2027 · Preview
                                        </div>
                                        <h3 className="font-heading text-xl font-semibold text-foreground">
                                            Cencori Cloud
                                        </h3>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            Region-native workload hosting for institutions
                                            that need on-shore data and compute. Lagos
                                            colocation partnerships in flight, additional
                                            regions as demand justifies the buildout.
                                        </p>
                                        <ul className="space-y-2 pt-2">
                                            <li className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
                                                <span>Region-locked storage &amp; inference</span>
                                            </li>
                                            <li className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
                                                <span>Residency by contract</span>
                                            </li>
                                            <li className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
                                                <span>CPU + GPU hybrid capacity</span>
                                            </li>
                                        </ul>
                                    </div>
                                    <Link href={ENTERPRISE_EMAIL} className="pt-2">
                                        <Button
                                            variant="outline"
                                            className="h-7 rounded-md border-foreground/20 bg-transparent px-3 text-[11px] font-medium text-foreground/90 hover:border-foreground/40 hover:bg-foreground/5 hover:text-foreground transition-colors"
                                        >
                                            Talk to us
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* --- TRUST POSTURE --------------------------------------- */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative">
                        <CornerMarkers />

                        <div className="px-6 pt-16 pb-12 sm:px-12 max-w-2xl">
                            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                                Trust posture
                            </p>
                            <h2 className="mt-4 font-serif text-3xl font-normal leading-tight tracking-tight sm:text-4xl text-foreground">
                                Built for procurement, <br />not around it.
                            </h2>
                        </div>

                        <div className="border-t border-border/30 grid grid-cols-1 md:grid-cols-3 divide-x divide-y divide-border/30">
                            {TRUST_ITEMS.map(({ title, body }) => (
                                <div key={title} className="p-6 sm:p-8 flex flex-col">
                                    <h3 className="font-heading text-sm font-semibold text-foreground mb-2">
                                        {title}
                                    </h3>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        {body}
                                    </p>
                                </div>
                            ))}
                        </div>

                        <div className="border-t border-border/30 px-6 sm:px-12 py-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-muted-foreground">
                            <Link href="/security" className="font-medium text-foreground hover:text-foreground/80">
                                Read the full security posture &rarr;
                            </Link>
                            <span className="opacity-40">/</span>
                            <Link href={ENTERPRISE_EMAIL} className="hover:text-foreground">
                                Request a DPA
                            </Link>
                            <span className="opacity-40">/</span>
                            <span className="font-mono">SOC 2 Type II · in progress</span>
                        </div>
                    </div>
                </section>

                {/* --- FOUNDING CUSTOMERS ---------------------------------- */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative">
                        <CornerMarkers />

                        <div className="px-6 py-16 sm:px-12 sm:py-20 max-w-3xl mx-auto text-center">
                            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                                Founding customers
                            </p>
                            <p className="mt-6 font-serif text-xl sm:text-2xl leading-[1.4] text-foreground">
                                We&rsquo;re working alongside financial institutions and government
                                agencies to shape the next generation of AI infrastructure &mdash;
                                quietly, and under contract.
                            </p>
                            <p className="mt-5 text-xs text-muted-foreground leading-relaxed">
                                Reference customers are available to enterprise procurement teams
                                under NDA.
                            </p>
                        </div>
                    </div>
                </section>

                {/* --- BOTTOM CTA ------------------------------------------ */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative">
                        <CornerMarkers />

                        <div className="px-6 pt-16 pb-12 sm:px-12 text-center max-w-2xl mx-auto">
                            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                                Get in touch
                            </p>
                            <h2 className="mt-4 font-serif text-3xl font-normal leading-tight tracking-tight sm:text-4xl text-foreground">
                                Bring us the workload nobody else wants to touch.
                            </h2>
                            <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                                We prefer to start with a real problem &mdash; a regulator letter,
                                a stalled procurement, a workload that keeps failing security
                                review. Tell us what you&rsquo;re trying to ship and we&rsquo;ll
                                come back with what it would take.
                            </p>
                            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                                <Link href={CAL_URL}>
                                    <Button className="h-7 rounded-md bg-foreground px-3 text-[11px] font-medium text-background hover:bg-foreground/90 transition-colors">
                                        Book a working session
                                    </Button>
                                </Link>
                                <Link href={ENTERPRISE_EMAIL}>
                                    <Button
                                        variant="outline"
                                        className="h-7 rounded-md border-foreground/20 bg-transparent px-3 text-[11px] font-medium text-foreground/90 hover:border-foreground/40 hover:bg-foreground/5 hover:text-foreground transition-colors"
                                    >
                                        Email {CONTACT_EMAIL}
                                    </Button>
                                </Link>
                            </div>
                            <p className="mt-6 font-mono text-[10px] tracking-wider text-muted-foreground">
                                Responses within one business day · NDA on request
                            </p>
                        </div>
                    </div>
                </section>
            </main>
    );
}
