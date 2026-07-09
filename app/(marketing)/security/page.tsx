import { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/landing/Navbar';
import { Footer } from '@/components/landing/Footer';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

export const metadata: Metadata = {
    title: 'Security & Trust | Cencori',
    description:
        'How Cencori handles encryption, PII, audit logs, data residency, incident response, and certifications. Written for the security and compliance teams reviewing us.',
};

const CONTACT_EMAIL = 'security@cencori.com';
const DPA_EMAIL = `mailto:${CONTACT_EMAIL}?subject=Cencori%20%E2%80%94%20DPA%20request`;
const DISCLOSURE_EMAIL = `mailto:${CONTACT_EMAIL}?subject=Cencori%20%E2%80%94%20security%20disclosure`;

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

interface Control {
    title: string;
    lead: string;
    details: string[];
}

const CONTROLS: Control[] = [
    {
        title: 'Encryption in transit and at rest',
        lead: 'TLS 1.2+ on every edge. AES-256-GCM on everything persisted.',
        details: [
            'Automated certificate rotation on inbound and outbound edges.',
            'AES-256-GCM at rest on prompts, completions, embeddings, and logs.',
            'Key encryption keys stored in a hardware-backed KMS boundary.',
            'Customer-managed keys (CMK / BYOK) available on enterprise agreements.',
        ],
    },
    {
        title: 'PII detection and redaction',
        lead: 'Regulated identifiers inspected before any provider sees them.',
        details: [
            'Hybrid rule + model pipeline covers name, SSN/NIN, cards, accounts, phone, email, and health identifiers.',
            'Per-project policy: redact, tokenize (reversible), block, or allow with logging.',
            'Providers only ever receive the transformed value — never the raw one.',
            'Detection findings attached to the audit trail for compliance review.',
        ],
    },
    {
        title: 'Secrets, keys, and BYOK',
        lead: 'Bring your own keys. We never require you to hand us credentials.',
        details: [
            'Sign requests with your own OpenAI / Anthropic / Google / Mistral / Cohere / xAI keys.',
            'Cencori-managed keys encrypted at rest with per-org envelope encryption.',
            'Rotation, revocation, and per-project scoping are first-class in the dashboard.',
            'No key material is ever written to logs.',
        ],
    },
    {
        title: 'Immutable audit logs',
        lead: 'Every gateway request emits a cryptographically timestamped record.',
        details: [
            'Request, response, provider, model, cost, latency, PII decisions, and actor identity per call.',
            'Append-only writes with a hash chain — tampering is detectable.',
            'Exportable to Splunk, Datadog, Elastic, or a custom S3 sink.',
            'Retention configurable up to seven years for regulated industries.',
        ],
    },
    {
        title: 'Data residency and regional routing',
        lead: 'Residency is enforced at the gateway, not left to provider trust.',
        details: [
            'Pin projects to a region and restrict reachable providers from that region.',
            'Residency-violating requests are blocked, not silently routed abroad.',
            'Cencori Cloud (2027) adds on-shore inference in additional regions.',
            'Enterprise agreements can specify localization as a contractual term.',
        ],
    },
    {
        title: 'Access control and identity',
        lead: 'SSO, SCIM, and role-based access for every enterprise workspace.',
        details: [
            'SAML 2.0 SSO with Okta, Azure AD, Google Workspace, and any generic IdP.',
            'SCIM 2.0 provisioning and deprovisioning — leavers lose access automatically.',
            'Role-based access to projects, API keys, spend caps, and audit logs.',
            'Session policies, IP allowlists, and per-project MFA enforcement.',
        ],
    },
    {
        title: 'Runtime hardening',
        lead: 'Prompt injection, jailbreak, and abuse patterns filtered at the edge.',
        details: [
            'Multi-layer prompt-injection detection on every inbound request.',
            'Rate limiting, spend caps, and anomaly detection per key, project, and org.',
            'Providers can be blocklisted globally when an upstream vuln is disclosed.',
            'Circuit breakers isolate misbehaving providers so a vendor outage isn’t yours.',
        ],
    },
    {
        title: 'Vulnerability management',
        lead: 'Continuous scanning, dependency review, and staged rollouts.',
        details: [
            'Static analysis, dependency scanning, and secret scanning on every merge.',
            'Container images rebuilt daily to pull upstream security patches.',
            'Third-party penetration tests annually — reports available under NDA.',
            'Cencori Scan is dogfooded on our own repositories.',
        ],
    },
    {
        title: 'Certifications and compliance',
        lead: 'SOC 2 Type II is in progress. Adjacent frameworks follow.',
        details: [
            'SOC 2 Type II — audit window open, Type I report available on request.',
            'ISO 27001 — planned for the 2027 audit cycle.',
            'GDPR — DPA available on request, sub-processor list published and versioned.',
            'HIPAA — BAA available for healthcare workloads on enterprise agreements.',
        ],
    },
];

export default function SecurityPage() {
    return (
        <div className="min-h-screen bg-background text-foreground selection:bg-foreground selection:text-background">
            <Navbar />

            <main className="pt-28 sm:pt-36">
                {/* --- HERO ------------------------------------------------ */}
                <section className="bg-background border-b border-border/30 pb-0">
                    <div className="mx-auto max-w-6xl border-t border-x border-border/30 relative px-6 py-20 sm:px-12 sm:py-28">
                        <CornerMarkers />

                        <div className="mb-6 flex items-center gap-1.5 font-mono text-[10px] sm:text-[11px] tracking-wider text-muted-foreground select-none">
                            <span>Trust &amp; security ·</span>
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                All systems operational
                            </span>
                        </div>

                        <h1 className="font-heading text-[1.875rem] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground sm:text-[2.125rem] lg:text-[2.375rem]">
                            <span className="block sm:whitespace-nowrap">Security is</span>
                            <span className="block sm:whitespace-nowrap">the product,</span>
                            <span className="block sm:whitespace-nowrap">not a bolt-on.</span>
                        </h1>

                        <p className="mt-8 max-w-xl text-sm leading-relaxed text-muted-foreground">
                            Written for the people who have to sign off on us &mdash; security
                            engineers, procurement teams, compliance officers. No marketing
                            hand-waving. If a control isn&rsquo;t here yet, we say so.
                        </p>

                        <div className="mt-12 flex flex-wrap gap-3">
                            <Link href={DPA_EMAIL}>
                                <Button className="h-7 rounded-md bg-foreground px-3 text-[11px] font-medium text-background hover:bg-foreground/90">
                                    Request DPA
                                </Button>
                            </Link>
                            <Link href="/enterprise">
                                <Button
                                    variant="outline"
                                    className="h-7 rounded-md border-foreground/20 bg-transparent px-3 text-[11px] font-medium text-foreground/90 hover:border-foreground/40 hover:bg-foreground/5 hover:text-foreground"
                                >
                                    Enterprise overview
                                </Button>
                            </Link>
                        </div>
                    </div>
                </section>

                {/* --- STATUS STRIP ---------------------------------------- */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative">
                        <CornerMarkers />

                        <div className="px-6 sm:px-12 py-6 flex flex-wrap items-center justify-between gap-x-8 gap-y-3 font-mono text-[10px] sm:text-[11px] tracking-wider text-muted-foreground">
                            <div className="flex items-center gap-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
                                <span>Gateway healthy</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                                <span>SOC 2 Type II · in progress</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" aria-hidden="true" />
                                <span>ISO 27001 · planned 2027</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" aria-hidden="true" />
                                <span>HIPAA BAA · on request</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* --- CONTROLS -------------------------------------------- */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative">
                        <CornerMarkers />

                        <div className="px-6 pt-16 pb-12 sm:px-12 max-w-2xl">
                            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                                Controls
                            </p>
                            <h2 className="mt-4 font-serif text-3xl font-normal leading-tight tracking-tight sm:text-4xl text-foreground">
                                What you&rsquo;re <br />actually buying.
                            </h2>
                            <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                                Every control applies to every workload. You cannot opt out by
                                using a side door, because there is no side door.
                            </p>
                        </div>

                        <div className="border-t border-border/30 divide-y divide-border/30">
                            {CONTROLS.map(({ title, lead, details }) => (
                                <article
                                    key={title}
                                    className="grid md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-border/30"
                                >
                                    <div className="md:col-span-5 p-6 sm:p-8">
                                        <h3 className="font-heading text-sm font-semibold text-foreground mb-2">
                                            {title}
                                        </h3>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            {lead}
                                        </p>
                                    </div>
                                    <div className="md:col-span-7 p-6 sm:p-8">
                                        <ul className="space-y-2">
                                            {details.map((d) => (
                                                <li
                                                    key={d}
                                                    className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed"
                                                >
                                                    <Check className="mt-0.5 h-3.5 w-3.5 text-foreground shrink-0" />
                                                    <span>{d}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                {/* --- INCIDENT RESPONSE ----------------------------------- */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative">
                        <CornerMarkers withVertical />

                        <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/30">
                            <div className="px-6 py-16 md:py-24 md:pr-12 flex flex-col justify-center">
                                <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                                    Incident response
                                </p>
                                <h2 className="font-serif text-3xl font-normal leading-tight tracking-tight sm:text-4xl lg:text-5xl text-foreground">
                                    A named contact. <br />A written playbook. <br />An SLA.
                                </h2>
                            </div>
                            <div className="px-6 py-16 md:py-24 md:pl-12 flex flex-col justify-center space-y-4 text-sm leading-relaxed text-muted-foreground">
                                <p>
                                    Every enterprise contract names a specific engineer as the
                                    incident owner. You get a phone number, an escalation ladder,
                                    and a written commitment on notification timing.
                                </p>
                                <p>
                                    On a confirmed security incident we notify affected customers
                                    within 24 hours, provide an interim status within 72 hours,
                                    and publish a full post-mortem within 14 days.
                                </p>
                                <p>
                                    Responsible disclosure is welcomed at{' '}
                                    <Link
                                        href={DISCLOSURE_EMAIL}
                                        className="font-medium text-foreground hover:text-foreground/80"
                                    >
                                        {CONTACT_EMAIL}
                                    </Link>
                                    . We respond to every report within one business day.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* --- BOTTOM CTA ------------------------------------------ */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative">
                        <CornerMarkers />

                        <div className="px-6 pt-16 pb-12 sm:px-12 text-center max-w-2xl mx-auto">
                            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                                Talk to security
                            </p>
                            <h2 className="mt-4 font-serif text-3xl font-normal leading-tight tracking-tight sm:text-4xl text-foreground">
                                Send us your questionnaire.
                            </h2>
                            <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                                We fill out CAIQ, SIG, and vendor risk questionnaires as part of
                                the procurement conversation. No sales gatekeeping.
                            </p>
                            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                                <Link href={DPA_EMAIL}>
                                    <Button className="h-7 rounded-md bg-foreground px-3 text-[11px] font-medium text-background hover:bg-foreground/90 transition-colors">
                                        Email {CONTACT_EMAIL}
                                    </Button>
                                </Link>
                                <Link href="/enterprise">
                                    <Button
                                        variant="outline"
                                        className="h-7 rounded-md border-foreground/20 bg-transparent px-3 text-[11px] font-medium text-foreground/90 hover:border-foreground/40 hover:bg-foreground/5 hover:text-foreground transition-colors"
                                    >
                                        Back to Enterprise
                                    </Button>
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
