import { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { 
    ArrowRight,
    ChevronRight,
    Lock,
    CheckCircle,
} from 'lucide-react';

export const metadata: Metadata = {
    title: 'Cencori Scan | Security for AI Applications',
    description: 'Autonomous vulnerability scanning for AI-powered applications. Detect PII leakage, prompt injections, and data flow risks with AI-native security context.',
};

export default function ScanLandingPage() {
    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground selection:bg-foreground selection:text-background font-sans">

            <main className="flex-grow pt-28 sm:pt-40">
                {/* Hero Section */}
                <section className="mx-auto max-w-6xl px-4 md:px-6 mb-24">
                    <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
                        <Link
                            href="https://scan.cencori.com"
                            className="group mb-8 inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <span>Security for Vibe Coders & AI Builders</span>
                            <ArrowRight className="size-3 -translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
                        </Link>

                        <h1 className="mb-8 max-w-3xl text-[3rem] font-black leading-[0.95] tracking-[-0.03em] sm:text-[4.5rem] lg:text-[5.5rem]">
                            Vulnerability Scanning for
                            <br />
                            <span className="font-serif italic font-normal text-muted-foreground">AI Applications.</span>
                        </h1>

                        <p className="mb-12 max-w-[32rem] text-sm leading-[1.6] text-muted-foreground">
                            Cencori Scan provides autonomous security for generative apps. We index your architecture, trace data flows, and automatically remediate vulnerabilities before they hit production.
                        </p>

                        <div className="flex flex-wrap items-center justify-center gap-3">
                            <Button asChild size="sm" className="h-9 px-6 text-xs font-medium rounded-md bg-foreground text-background hover:bg-foreground/90">
                                <Link href="https://scan.cencori.com">
                                    Get Started Free
                                </Link>
                            </Button>
                            <Button variant="outline" size="sm" className="h-9 px-6 text-xs font-medium rounded-md border-border/60 hover:bg-muted/50">
                                <Link href="/docs/scan">
                                    Documentation
                                </Link>
                            </Button>
                        </div>
                    </div>
                </section>

                {/* Dashboard Mockup - Findings & Context */}
                <section className="mx-auto max-w-5xl px-4 md:px-6 mb-24">
                    <div className="relative rounded-xl border border-border/40 bg-card/30 backdrop-blur-sm overflow-hidden shadow-2xl">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/20">
                            <div className="flex items-center gap-4">
                                <div className="flex gap-1.5">
                                    <div className="size-2 rounded-full bg-border/40" />
                                    <div className="size-2 rounded-full bg-border/40" />
                                    <div className="size-2 rounded-full bg-border/40" />
                                </div>
                                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">scan.cencori.com/projects/acme-ai</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-[9px] font-mono text-muted-foreground/50">READY</span>
                                <Badge variant="outline" className="text-[9px] font-mono border-emerald-500/30 text-emerald-500 bg-emerald-500/5 px-2 py-0">SCORE: A</Badge>
                            </div>
                        </div>

                        <div className="p-8 grid md:grid-cols-12 gap-12">
                            <div className="md:col-span-8 space-y-8">
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <div className="h-px w-8 bg-primary/40" />
                                        <div className="text-[10px] font-mono text-primary uppercase tracking-widest">Finding 01</div>
                                    </div>
                                    <h3 className="text-base font-semibold">Untrusted user input flows to ChatCompletion sink</h3>
                                    <div className="p-5 rounded border border-border/20 bg-muted/5 font-mono text-[11px] leading-relaxed group">
                                        <div className="flex items-start gap-4 mb-3">
                                            <span className="text-muted-foreground/30 text-[9px] w-12 pt-0.5">SOURCE</span>
                                            <span className="text-foreground">app/api/chat/route.ts <span className="text-muted-foreground/40">:L42</span></span>
                                        </div>
                                        <div className="ml-16 h-8 border-l border-dashed border-border/40 my-1" />
                                        <div className="flex items-start gap-4">
                                            <span className="text-muted-foreground/30 text-[9px] w-12 pt-0.5">SINK</span>
                                            <span className="text-red-400">lib/openai-client.ts <span className="text-muted-foreground/40">:L128</span></span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <span className="text-[10px] font-mono text-muted-foreground border-r border-border/40 pr-3">PROMPT_INJECTION</span>
                                    <span className="text-[10px] font-mono text-red-400 border-r border-border/40 pr-3">CRITICAL</span>
                                    <span className="text-[10px] font-mono text-muted-foreground">CONFIDENCE_98%</span>
                                </div>
                            </div>
                            <div className="md:col-span-4 space-y-8">
                                <div className="space-y-4">
                                    <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest opacity-50">Continuity Memory</div>
                                    <div className="space-y-4 border-l border-border/20 pl-4">
                                        {[
                                            { label: 'Project Purpose', text: 'Financial advisory agent' },
                                            { label: 'Data Sensitivity', text: 'Tier 1 (Customer PII)' },
                                            { label: 'Accepted Risk', text: 'Internal staging only' },
                                        ].map((item) => (
                                            <div key={item.label} className="space-y-1">
                                                <div className="text-[9px] text-muted-foreground/50 uppercase font-mono tracking-wider">{item.label}</div>
                                                <div className="text-xs font-medium">{item.text}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Section 1: The Multi-Model Engine */}
                <section className="mx-auto max-w-6xl px-4 md:px-6 mb-32 py-24 bg-muted/[0.02]">
                    <div className="grid lg:grid-cols-2 gap-20 items-center">
                        <div className="space-y-6">
                            <div className="text-[10px] font-mono text-primary uppercase tracking-[0.3em]">Unified Engine</div>
                            <h2 className="text-[2.5rem] font-bold leading-[1.1] tracking-tight">
                                Dual-Model
                                <br />
                                <span className="font-serif italic text-muted-foreground">Inference.</span>
                            </h2>
                            <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
                                We leverage the fastest and deepest models in the world. Cerebras provides sub-100ms structural analysis, while Gemini executes deep architectural reasoning and remediation logic.
                            </p>
                            {/* Removed model badges per request */}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-12 sm:gap-8">
                            <div className="flex flex-col justify-between space-y-6">
                                <div>
                                    <div className="font-mono text-[9px] text-muted-foreground/60 uppercase tracking-widest mb-3">Layer 01 // Speed</div>
                                    <div className="text-sm font-semibold mb-2">Pattern Recognition</div>
                                    <p className="text-[11px] text-muted-foreground leading-relaxed">Instant detection of known vulnerabilities, secrets, and PII across the entire codebase during every commit phase.</p>
                                </div>
                                <div className="font-mono text-[9px] text-muted-foreground/40">LATENCY: {'<'}100ms</div>
                            </div>
                            <div className="flex flex-col justify-between space-y-6">
                                <div>
                                    <div className="font-mono text-[9px] text-muted-foreground/60 uppercase tracking-widest mb-3">Layer 02 // Depth</div>
                                    <div className="text-sm font-semibold mb-2">Architectural Mapping</div>
                                    <p className="text-[11px] text-muted-foreground leading-relaxed">Deep reasoning over trust boundaries, data flows, and multi-file dependencies to identify complex architectural flaws.</p>
                                </div>
                                <div className="font-mono text-[9px] text-muted-foreground/40">CONTEXT_WINDOW: 1M_TOKENS</div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Section 2: Privacy & PII Masking */}
                <section className="mx-auto max-w-6xl px-4 md:px-6 mb-32">
                    <div className="max-w-3xl">
                        <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.3em] mb-4">Zero Trust Privacy</div>
                        <h2 className="text-[2.5rem] font-bold leading-[1.1] tracking-tight mb-8">
                            Privacy-First 
                            <br />
                            <span className="font-serif italic text-muted-foreground">Detection.</span>
                        </h2>
                        <p className="text-base text-muted-foreground leading-relaxed mb-12">
                            Scan identifies 32+ types of PII across your entire codebase. Our redaction engine ensures that sensitive data never leaves your environment while still providing high-fidelity remediation.
                        </p>
                    </div>
                    <div className="grid md:grid-cols-4 gap-4">
                        {[
                            { label: 'EMAIL_ADDR', val: 'jane.d***@company.com' },
                            { label: 'STRIPE_KEY', val: 'sk_live_****************' },
                            { label: 'SSN_ENTITY', val: '***-**-6482' },
                            { label: 'AUTH_TOKEN', val: 'Bearer *************' },
                        ].map((item) => (
                            <div key={item.label} className="p-4 rounded border border-border/30 bg-muted/5 font-mono text-[10px]">
                                <div className="text-muted-foreground/40 mb-1 uppercase tracking-tighter">{item.label}</div>
                                <div className="text-foreground truncate">{item.val}</div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* The Security Changelog - High Density Section */}
                <section className="mx-auto max-w-6xl px-4 md:px-6 mb-32">
                    <div className="grid lg:grid-cols-2 gap-16 items-center">
                        <div className="space-y-6">
                            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.3em]">Timeline Intelligence</div>
                            <h2 className="text-[2.5rem] font-bold leading-[1.1] tracking-tight">
                                The Security 
                                <br />
                                <span className="font-serif italic text-muted-foreground">Changelog.</span>
                            </h2>
                            <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
                                Every scan generates a semantic history of your security posture. Track vulnerability regression, fix verification, and architectural evolution in plain English.
                            </p>
                            <div className="grid grid-cols-2 gap-8 pt-4">
                                <div className="space-y-1">
                                    <div className="text-[2rem] font-bold tracking-tight">500+</div>
                                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Secret Patterns</div>
                                </div>
                                <div className="space-y-1">
                                    <div className="text-[2rem] font-bold tracking-tight">32</div>
                                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">PII Entity Types</div>
                                </div>
                            </div>
                        </div>
                        <div className="relative p-6 rounded-xl border border-border/40 bg-muted/5 font-mono text-[11px] space-y-6">
                            <div className="flex items-center justify-between opacity-40">
                                <span>CHANGELOG_POST_SCAN_v4.2</span>
                                <span>MAY 12, 2026</span>
                            </div>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <div className="text-emerald-500 flex items-center gap-2">
                                        <span>[VERIFIED]</span>
                                        <span className="h-px flex-1 bg-emerald-500/20" />
                                    </div>
                                    <p className="text-muted-foreground pl-4 leading-relaxed">
                                        Remediated 2 high-severity SQL injection vulnerabilities in <span className="text-foreground">/api/v1/search</span> via automated PR #142.
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <div className="text-orange-400 flex items-center gap-2">
                                        <span>[REGRESSION]</span>
                                        <span className="h-px flex-1 bg-orange-400/20" />
                                    </div>
                                    <p className="text-muted-foreground pl-4 leading-relaxed">
                                        Unencrypted API key exposed in new <span className="text-foreground">.env.example</span> commit. Remediation recommended.
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <div className="text-blue-400 flex items-center gap-2">
                                        <span>[EVOLUTION]</span>
                                        <span className="h-px flex-1 bg-blue-400/20" />
                                    </div>
                                    <p className="text-muted-foreground pl-4 leading-relaxed">
                                        New trust boundary detected: <span className="text-foreground">vector-db-internal</span>. Scan policies updated.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Section 3: The Integration Fabric */}
                <section className="mx-auto max-w-6xl px-4 md:px-6 mb-32 py-24 border-t border-border/20">
                    <div className="text-center mb-16">
                        <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.3em] mb-4">Native Connectivity</div>
                        <h2 className="text-[2.5rem] font-bold leading-[1.1] tracking-tight italic font-serif">Deep Integrations.</h2>
                    </div>
                    <div className="grid md:grid-cols-3 gap-8">
                        {[
                            { name: 'GitHub', desc: 'Native PR checks, remediation comments, and branch protection.' },
                            { name: 'Slack/Discord', desc: 'Real-time alerts for critical vulnerabilities and scan completions.' },
                            { name: 'Custom Webhooks', desc: 'Trigger CI/CD pipelines or custom security responses via signed events.' },
                        ].map((item) => (
                            <div key={item.name} className="p-6 rounded-xl border border-border/40 bg-card hover:bg-muted/10 transition-colors">
                                <h3 className="text-sm font-semibold mb-2">{item.name}</h3>
                                <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Section 4: The Cencori Score & Governance */}
                <section className="mx-auto max-w-6xl px-4 md:px-6 mb-32">
                    <div className="grid lg:grid-cols-2 gap-16 items-center">
                        <div className="order-2 lg:order-1 relative h-64 rounded-xl border border-border/40 bg-muted/5 flex items-center justify-center">
                            <div className="flex gap-4 items-end">
                                {['F', 'D', 'C', 'B', 'A'].map((grade, i) => (
                                    <div key={grade} className="flex flex-col items-center gap-2">
                                        <div 
                                            className={cn(
                                                "w-12 rounded-t-sm transition-all",
                                                grade === 'A' ? "bg-emerald-500 h-40" : "bg-muted/20",
                                                grade === 'B' ? "h-32" : "",
                                                grade === 'C' ? "h-24" : "",
                                                grade === 'D' ? "h-16" : "",
                                                grade === 'F' ? "h-8" : "",
                                            )} 
                                        />
                                        <span className={cn("text-xs font-bold", grade === 'A' ? "text-emerald-500" : "text-muted-foreground/30")}>{grade}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="order-1 lg:order-2 space-y-6">
                            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.3em]">Security Standards</div>
                            <h2 className="text-[2.5rem] font-bold leading-[1.1] tracking-tight">
                                Continuous
                                <br />
                                <span className="font-serif italic text-muted-foreground">Governance.</span>
                            </h2>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                Our A-F scoring system isn't just a number. It's a continuous audit of your project's security health, updated with every scan. Maintain an 'A' grade to ensure enterprise-ready security posture.
                            </p>
                            <ul className="space-y-2">
                                {['SOC2 Type II Readiness', 'HIPAA/PII Compliance', 'OWASP Top 10 Coverage'].map((item) => (
                                    <li key={item} className="flex items-center gap-2 text-xs font-medium">
                                        <CheckCircle className="size-3 text-emerald-500" />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </section>

                {/* Final CTA */}
                <section className="py-32 bg-muted/[0.03]">
                    <div className="mx-auto max-w-3xl px-4 md:px-6 text-center">
                        <div className="inline-flex items-center gap-2 mb-8 px-3 py-1 rounded-full border border-border/40 bg-background text-[10px] font-mono text-muted-foreground">
                            <span className="size-1 rounded-full bg-primary animate-pulse" />
                            NETWORK_STABILITY: 99.99%
                        </div>
                        <h2 className="text-[2.5rem] font-bold tracking-tight mb-8">
                            Security for the next era 
                            <br />
                            <span className="font-serif italic text-muted-foreground">of engineering.</span>
                        </h2>
                        <div className="flex items-center justify-center gap-4">
                            <Button asChild size="sm" className="h-9 px-8 text-xs font-medium rounded-md bg-foreground text-background">
                                <Link href="https://scan.cencori.com">Launch Scan</Link>
                            </Button>
                            <Link href="/docs/scan" className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
                                Documentation <ChevronRight className="size-3" />
                            </Link>
                        </div>
                    </div>
                </section>
            </main>

        </div>
    );
}
