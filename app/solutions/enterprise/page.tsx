"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Reveal } from "@/components/landing/Reveal";

export default function EnterprisePage() {
    const [form, setForm] = useState({ firstName: "", lastName: "", email: "", company: "", message: "" });
    const [submitted, setSubmitted] = useState(false);

    return (
            <main>
                {/* ━━━ HERO + FORM ━━━ */}
                <section className="pt-28 sm:pt-40 pb-24 sm:pb-32">
                    <div className="mx-auto max-w-6xl px-4 md:px-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-start">
                            <div className="pt-2">
                                <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground mb-8 animate-appear">
                                    Cencori for Enterprise
                                </p>
                                <h1 className="text-[2.75rem] sm:text-[3.5rem] lg:text-[4rem] font-heading font-black tracking-[-0.035em] leading-[1.05] mb-8 animate-appear [animation-delay:100ms] text-foreground">
                                    AI infrastructure
                                    <br />
                                    <span className="font-serif italic font-normal text-muted-foreground">built for scale.</span>
                                </h1>
                                <p className="text-base text-muted-foreground leading-[1.7] max-w-[26rem] mb-12 animate-appear [animation-delay:200ms]">
                                    Security, governance, and observability for every AI request your organization makes.
                                </p>
                                <div className="flex gap-6 text-[13px] text-muted-foreground animate-appear [animation-delay:300ms]">
                                    <span>SOC 2 Type II</span>
                                    <span className="text-border">|</span>
                                    <span>99.99% SLA</span>
                                    <span className="text-border">|</span>
                                    <span>SSO & RBAC</span>
                                </div>
                            </div>

                            <div className="animate-appear [animation-delay:250ms]">
                                {submitted ? (
                                    <div className="py-16 text-center">
                                        <p className="text-lg font-medium mb-2">Thank you</p>
                                        <p className="text-sm text-muted-foreground">We&apos;ll be in touch within one business day.</p>
                                    </div>
                                ) : (
                                    <form onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }} className="space-y-5">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">First Name</label>
                                                <Input placeholder="Jane" value={form.firstName} onChange={e => setForm(s => ({ ...s, firstName: e.target.value }))} required className="h-11 bg-transparent border-border/60 rounded-lg" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Last Name</label>
                                                <Input placeholder="Doe" value={form.lastName} onChange={e => setForm(s => ({ ...s, lastName: e.target.value }))} required className="h-11 bg-transparent border-border/60 rounded-lg" />
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Work Email</label>
                                            <Input type="email" placeholder="jane@company.com" value={form.email} onChange={e => setForm(s => ({ ...s, email: e.target.value }))} required className="h-11 bg-transparent border-border/60 rounded-lg" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Company</label>
                                            <Input placeholder="Acme Inc." value={form.company} onChange={e => setForm(s => ({ ...s, company: e.target.value }))} className="h-11 bg-transparent border-border/60 rounded-lg" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Message</label>
                                            <Textarea placeholder="Tell us about your use case..." value={form.message} onChange={e => setForm(s => ({ ...s, message: e.target.value }))} className="min-h-[90px] bg-transparent border-border/60 rounded-lg resize-none" />
                                        </div>
                                        <Button type="submit" size="sm" className="w-full h-10 text-xs px-3">
                                            Request a Demo
                                        </Button>
                                        <p className="text-[11px] text-muted-foreground/50 text-center">
                                            By submitting, you agree to our{" "}
                                            <Link href="/privacy-policy" className="underline underline-offset-2 hover:text-muted-foreground transition-colors">Privacy Policy</Link>.
                                        </p>
                                    </form>
                                )}
                            </div>
                        </div>
                    </div>
                </section>

                {/* ━━━ NUMBERS ━━━ */}
                <section className="py-20 sm:py-24">
                    <div className="mx-auto max-w-6xl px-4 md:px-6">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-y-12">
                            {[
                                { number: "99.99%", label: "Uptime SLA" },
                                { number: "<50ms", label: "Added latency" },
                                { number: "50+", label: "Security rules" },
                                { number: "24/7", label: "Priority support" },
                            ].map((s, i) => (
                                <Reveal key={s.label} delay={i * 0.08}>
                                    <div className="text-center lg:text-left">
                                        <p className="text-[2.5rem] sm:text-[3rem] font-heading font-black tracking-[-0.03em] leading-none mb-2 text-foreground">{s.number}</p>
                                        <p className="text-sm text-muted-foreground">{s.label}</p>
                                    </div>
                                </Reveal>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ━━━ SECURITY ━━━ */}
                <section className="py-24 sm:py-32">
                    <div className="mx-auto max-w-6xl px-4 md:px-6">
                        <Reveal>
                            <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-emerald-500 mb-4">Security</p>
                        </Reveal>
                        <Reveal delay={0.05}>
                            <h2 className="text-3xl sm:text-[2.75rem] font-heading font-black tracking-[-0.03em] leading-[1.1] mb-6 max-w-xl text-foreground">
                                Every request is inspected before it reaches a model
                            </h2>
                        </Reveal>
                        <Reveal delay={0.1}>
                            <p className="text-muted-foreground leading-[1.7] max-w-lg mb-20">
                                Cencori sits between your application and every AI provider. Threats are blocked, sensitive data is redacted, and every interaction is logged — automatically.
                            </p>
                        </Reveal>

                        <div className="space-y-0">
                            {[
                                { title: "Threat Prevention", desc: "Prompt injection, jailbreaks, and data exfiltration attempts are detected and blocked in real time with a configurable rule engine." },
                                { title: "PII Redaction", desc: "Credit card numbers, social security numbers, emails, and phone numbers are automatically identified and masked before leaving your perimeter." },
                                { title: "Zero Retention", desc: "Process AI requests without storing any payload data. Configure data residency policies per project, with VPC and on-premise deployment options." },
                                { title: "Content Filtering", desc: "Define custom content policies per project. Filter responses for toxicity, bias, or off-topic content before they reach your users." },
                            ].map((item, i) => (
                                <Reveal key={item.title} delay={i * 0.06}>
                                    <div className="group grid grid-cols-1 sm:grid-cols-12 gap-4 sm:gap-8 py-8 sm:py-10 cursor-default">
                                        <div className="sm:col-span-1 text-sm text-muted-foreground/40 tabular-nums font-mono">
                                            {String(i + 1).padStart(2, "0")}
                                        </div>
                                        <h3 className="sm:col-span-4 text-base font-medium group-hover:text-emerald-500 transition-colors duration-300">
                                            {item.title}
                                        </h3>
                                        <p className="sm:col-span-7 text-sm text-muted-foreground leading-[1.7]">
                                            {item.desc}
                                        </p>
                                    </div>
                                </Reveal>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ━━━ OBSERVABILITY ━━━ */}
                <section className="py-24 sm:py-32">
                    <div className="mx-auto max-w-6xl px-4 md:px-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24">
                            <div>
                                <Reveal>
                                    <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground/60 mb-4">Observability</p>
                                </Reveal>
                                <Reveal delay={0.05}>
                                    <h2 className="text-3xl sm:text-[2.75rem] font-heading font-black tracking-[-0.03em] leading-[1.1] mb-6 text-foreground">
                                        See everything.
                                        <br />
                                        <span className="font-serif italic font-normal text-muted-foreground">Miss nothing.</span>
                                    </h2>
                                </Reveal>
                                <Reveal delay={0.1}>
                                    <p className="text-muted-foreground leading-[1.7] max-w-md">
                                        Real-time dashboards, audit trails, and cost breakdowns — from individual tokens to organization-wide trends.
                                    </p>
                                </Reveal>
                            </div>

                            <div className="space-y-10 sm:space-y-12">
                                {[
                                    { title: "Cost Analytics", desc: "Track spend by team, project, model, and provider. Set budgets and get alerts before costs spiral." },
                                    { title: "Performance", desc: "Per-request latency tracking, model comparison, and automatic fallback routing when providers degrade." },
                                    { title: "Audit Logs", desc: "Immutable, searchable logs for every AI request. Full traceability — who, what, when, and what was filtered." },
                                ].map((item, i) => (
                                    <Reveal key={item.title} delay={i * 0.1}>
                                        <div>
                                            <h3 className="text-lg font-medium mb-2">{item.title}</h3>
                                            <p className="text-sm text-muted-foreground leading-[1.7]">{item.desc}</p>
                                        </div>
                                    </Reveal>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                {/* ━━━ PLATFORM ━━━ */}
                <section className="py-24 sm:py-32">
                    <div className="mx-auto max-w-6xl px-4 md:px-6">
                        <Reveal>
                            <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground mb-4">Platform</p>
                        </Reveal>
                        <Reveal delay={0.05}>
                            <h2 className="text-3xl sm:text-[2.75rem] font-heading font-black tracking-[-0.03em] leading-[1.1] mb-20 max-w-2xl text-foreground">
                                One API to route, cache, secure, and observe — across every model provider
                            </h2>
                        </Reveal>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-14">
                            {[
                                { title: "Universal Gateway", desc: "Single endpoint for OpenAI, Anthropic, Google, Mistral, and more. Swap models without touching code." },
                                { title: "Smart Routing", desc: "Route by cost, latency, or capability. Automatic fallbacks during provider outages." },
                                { title: "Edge Caching", desc: "Semantic and exact-match caching at the edge. Cut costs and latency for repeated queries." },
                                { title: "Access Control", desc: "SAML and OIDC single sign-on. Granular role-based permissions at org, project, and key level." },
                                { title: "Multi-Tenancy", desc: "Isolated billing, rate limits, and policies per team or business unit." },
                                { title: "Dedicated Infrastructure", desc: "Custom deployment options including VPC peering and on-premise for regulated environments." },
                            ].map((item, i) => (
                                <Reveal key={item.title} delay={i * 0.06}>
                                    <div className="group">
                                        <div className="h-px w-8 bg-border mb-6 group-hover:w-16 group-hover:bg-foreground/30 transition-all duration-500" />
                                        <h3 className="text-[15px] font-medium mb-2.5 group-hover:translate-x-1 transition-transform duration-300">{item.title}</h3>
                                        <p className="text-[13px] text-muted-foreground leading-[1.7]">{item.desc}</p>
                                    </div>
                                </Reveal>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ━━━ WHAT'S INCLUDED ━━━ */}
                <section className="py-24 sm:py-32">
                    <div className="mx-auto max-w-6xl px-4 md:px-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24">
                            <div>
                                <Reveal>
                                    <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground mb-4">Enterprise Plan</p>
                                </Reveal>
                                <Reveal delay={0.05}>
                                    <h2 className="text-3xl sm:text-[2.75rem] font-heading font-black tracking-[-0.03em] leading-[1.1] mb-6 text-foreground">
                                        Everything your team needs
                                    </h2>
                                </Reveal>
                                <Reveal delay={0.1}>
                                    <p className="text-muted-foreground leading-[1.7] mb-10 max-w-md">
                                        Dedicated support, advanced security, and full control — built for organizations with strict requirements.
                                    </p>
                                </Reveal>
                                <Reveal delay={0.15}>
                                    <div className="flex gap-4">
                                        <a href="/contact/sales">
                                            <Button size="sm" className="h-7 text-xs px-3">Request a Demo</Button>
                                        </a>
                                        <Link href="/pricing">
                                            <Button variant="outline" size="sm" className="h-7 text-xs px-3">View Pricing</Button>
                                        </Link>
                                    </div>
                                </Reveal>
                            </div>

                            <div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
                                    {[
                                        "Unlimited gateway requests",
                                        "Advanced security pipeline",
                                        "Full audit log retention",
                                        "SSO / SAML / OIDC",
                                        "Role-based access control",
                                        "Custom rate limits & quotas",
                                        "Dedicated infrastructure",
                                        "Custom data retention",
                                        "24/7 priority support",
                                        "Named account manager",
                                        "Quarterly business reviews",
                                        "Migration assistance",
                                    ].map((item, i) => (
                                        <Reveal key={item} delay={i * 0.03}>
                                            <div className="group flex items-baseline gap-3 py-2.5 cursor-default">
                                                <span className="text-[10px] text-emerald-500 font-medium leading-none select-none">&#x2713;</span>
                                                <span className="text-sm group-hover:text-foreground text-muted-foreground transition-colors duration-300">{item}</span>
                                            </div>
                                        </Reveal>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ━━━ BOTTOM CTA ━━━ */}
                <Reveal>
                    <section className="py-28 sm:py-36">
                        <div className="mx-auto max-w-6xl px-4 md:px-6 text-center">
                            <h2 className="text-3xl sm:text-[2.75rem] font-heading font-black tracking-[-0.03em] leading-[1.1] mb-5 text-foreground">
                                Ready to get started?
                            </h2>
                            <p className="text-muted-foreground text-sm leading-[1.7] mb-10 max-w-md mx-auto">
                                Talk to our team about your security, compliance, and scale requirements.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                <Link href="/contact/sales">
                                    <Button size="sm" className="h-7 text-xs px-3">Contact Sales</Button>
                                </Link>
                                <Link href="/docs">
                                    <Button variant="outline" size="sm" className="h-7 text-xs px-3">Read the Docs</Button>
                                </Link>
                            </div>
                        </div>
                    </section>
                </Reveal>
            </main>
    );
}
