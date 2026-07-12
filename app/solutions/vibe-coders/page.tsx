"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";
import { Reveal } from "@/components/landing/Reveal";
import {
    VercelLogo,
    CursorLogo,
    VSCodeLogo,
    WindsurfLogo,
    ClaudeLogo,
    NextjsLogo,
    ViteLogo,
    PythonLogo,
    ReactLogo,
    SvelteLogo,
    VueLogo,
    LovableLogo,
    ReplitLogo,
    V0Logo,
    BoltLogo,
} from "@/components/icons/BrandIcons";

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
        </button>
    );
}

export default function VibeCodersPage() {

    return (
            <main>
                {/* ━━━ HERO ━━━ */}
                <section className="bg-background border-b border-border/30 pt-28 sm:pt-36 pb-0">
                    <div className="mx-auto max-w-6xl border-t border-x border-border/30 relative px-6 sm:px-12 py-24 sm:py-32">
                        <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground mb-8 animate-appear">
                            For Vibe Coders
                        </p>
                        <h1 className="text-[2.75rem] sm:text-[3.5rem] lg:text-[4.25rem] font-semibold tracking-[-0.035em] leading-[1.05] mb-8 max-w-3xl animate-appear [animation-delay:100ms]">
                            AI writes the code.
                            <br />
                            <span className="text-muted-foreground">Cencori handles the rest</span>
                        </h1>
                        <p className="text-base sm:text-lg text-muted-foreground leading-[1.7] max-w-[28rem] mb-12 animate-appear [animation-delay:200ms]">
                            
                        </p>
                        <div className="flex gap-4 animate-appear [animation-delay:300ms]">
                            <Link href="/login">
                                <Button size="sm" className="h-7 text-xs px-3">Get Started Free</Button>
                            </Link>
                            <Link href="/docs/quick-start">
                                <Button variant="outline" size="sm" className="h-7 text-xs px-3">Quickstart</Button>
                            </Link>
                        </div>
                    </div>
                </section>

                {/* ━━━ WORKS WITH — Logos woven into flowing text ━━━ */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative px-6 sm:px-12 py-20 sm:py-28">
                        <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <Reveal>
                            <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground mb-12">
                                Works with everything you already use
                            </p>
                        </Reveal>

                        {/* Editors */}
                        <Reveal delay={0.05}>
                            <div className="mb-16">
                                <p className="text-sm text-muted-foreground mb-6">Editors</p>
                                <div className="flex flex-wrap gap-10 items-center">
                                    {[
                                        { name: "Cursor", Logo: CursorLogo },
                                        { name: "VS Code", Logo: VSCodeLogo },
                                        { name: "Windsurf", Logo: WindsurfLogo },
                                        { name: "Claude", Logo: ClaudeLogo },
                                    ].map((editor) => (
                                        <Link
                                            key={editor.name}
                                            href="/docs/integrations"
                                            className="group flex items-center gap-3 text-muted-foreground hover:text-foreground transition-colors duration-300"
                                        >
                                            <editor.Logo className="h-6 w-6 opacity-50 group-hover:opacity-100 transition-opacity duration-300" size={24} />
                                            <span className="text-[15px] font-medium group-hover:translate-x-0.5 transition-transform duration-300">{editor.name}</span>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        </Reveal>

                        {/* Platforms */}
                        <Reveal delay={0.1}>
                            <div className="mb-16">
                                <p className="text-sm text-muted-foreground mb-6">Platforms</p>
                                <div className="flex flex-wrap gap-10 items-center">
                                    {[
                                        { name: "Lovable", Logo: LovableLogo },
                                        { name: "Replit", Logo: ReplitLogo },
                                        { name: "v0", Logo: V0Logo },
                                        { name: "Bolt", Logo: BoltLogo },
                                    ].map((platform) => (
                                        <div
                                            key={platform.name}
                                            className="group flex items-center gap-3 text-muted-foreground hover:text-foreground transition-colors duration-300 cursor-default"
                                        >
                                            <platform.Logo className="h-5 w-5 opacity-40 group-hover:opacity-90 transition-opacity duration-300" size={20} />
                                            <span className="text-[15px] font-medium group-hover:translate-x-0.5 transition-transform duration-300">{platform.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </Reveal>

                        {/* Frameworks */}
                        <Reveal delay={0.15}>
                            <div>
                                <p className="text-sm text-muted-foreground mb-6">Frameworks</p>
                                <div className="flex flex-wrap gap-10 items-center">
                                    {[
                                        { name: "Next.js", Logo: NextjsLogo },
                                        { name: "React", Logo: ReactLogo },
                                        { name: "Vue", Logo: VueLogo },
                                        { name: "Svelte", Logo: SvelteLogo },
                                        { name: "Vite", Logo: ViteLogo },
                                        { name: "Python", Logo: PythonLogo },
                                    ].map((fw) => (
                                        <div
                                            key={fw.name}
                                            className="group flex items-center gap-3 text-muted-foreground hover:text-foreground transition-colors duration-300 cursor-default"
                                        >
                                            <fw.Logo className="h-5 w-5 opacity-40 group-hover:opacity-90 transition-opacity duration-300" />
                                            <span className="text-[15px] font-medium group-hover:translate-x-0.5 transition-transform duration-300">{fw.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </Reveal>
                    </div>
                </section>

                {/* ━━━ WHAT YOU GET ━━━ */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative px-6 sm:px-12 py-24 sm:py-32">
                        <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <Reveal>
                            <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-emerald-500 mb-4">What you get</p>
                        </Reveal>
                        <Reveal delay={0.05}>
                            <h2 className="text-3xl sm:text-[2.75rem] font-semibold tracking-[-0.03em] leading-[1.1] mb-6 max-w-xl">
                                AI writes the code.
                                <br />
                                <span className="text-muted-foreground">We handle the rest.</span>
                            </h2>
                        </Reveal>
                        <Reveal delay={0.1}>
                            <p className="text-muted-foreground leading-[1.7] max-w-lg mb-20">
                                Everything you need to ship AI features without becoming a DevOps engineer.
                            </p>
                        </Reveal>

                        <div className="space-y-0">
                            {[
                                { title: "Security by default", desc: "PII filtering, prompt injection detection, and content moderation — active on every request, zero config." },
                                { title: "Full observability", desc: "See every request, response, and token in real time. Debug production issues in seconds, not hours." },
                                { title: "Cost control", desc: "Per-user budgets and rate limits. Know exactly what you're spending. No surprise bills at the end of the month." },
                                { title: "Zero overhead", desc: "Edge processing adds less than 50ms of latency. Your users won't notice. Your investors will." },
                                { title: "Any model, one API", desc: "OpenAI, Claude, Gemini — switch between providers with one line. No vendor lock-in, ever." },
                                { title: "Drop-in integration", desc: "Works with the Vercel AI SDK. Keep using streamText() and useChat(). Just swap the model." },
                            ].map((item, i) => (
                                <Reveal key={item.title} delay={i * 0.05}>
                                    <div className="group grid grid-cols-1 sm:grid-cols-12 gap-4 sm:gap-8 py-7 sm:py-9 cursor-default">
                                        <div className="sm:col-span-1 text-sm text-muted-foreground/30 tabular-nums font-mono">
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

                {/* ━━━ VERCEL AI SDK — Code as the visual ━━━ */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative px-6 sm:px-12 py-24 sm:py-32">
                        <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-start">
                            <div>
                                <Reveal>
                                    <div className="flex items-center gap-3 mb-8">
                                        <VercelLogo className="h-4 w-4 text-foreground" />
                                        <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                                            Vercel AI SDK
                                        </span>
                                    </div>
                                </Reveal>
                                <Reveal delay={0.05}>
                                    <h2 className="text-3xl sm:text-[2.75rem] font-semibold tracking-[-0.03em] leading-[1.1] mb-6">
                                        Drop-in.
                                        <br />
                                        <span className="text-muted-foreground">No rewrite.</span>
                                    </h2>
                                </Reveal>
                                <Reveal delay={0.1}>
                                    <p className="text-muted-foreground leading-[1.7] max-w-md mb-10">
                                        Already using Vercel AI SDK? Keep using{" "}
                                        <code className="text-[13px] text-foreground/70 font-mono">streamText()</code> and{" "}
                                        <code className="text-[13px] text-foreground/70 font-mono">useChat()</code> — just swap the model.
                                    </p>
                                </Reveal>
                                <Reveal delay={0.15}>
                                    <div className="space-y-3 text-sm text-muted-foreground">
                                        <p className="group cursor-default hover:text-foreground transition-colors duration-300">
                                            <span className="text-emerald-500/60 mr-3">&#x2713;</span>
                                            One API for OpenAI, Claude, Gemini
                                        </p>
                                        <p className="group cursor-default hover:text-foreground transition-colors duration-300">
                                            <span className="text-emerald-500/60 mr-3">&#x2713;</span>
                                            Safety filtering on every request
                                        </p>
                                        <p className="group cursor-default hover:text-foreground transition-colors duration-300">
                                            <span className="text-emerald-500/60 mr-3">&#x2713;</span>
                                            Cost tracking built-in
                                        </p>
                                    </div>
                                </Reveal>
                            </div>

                            {/* Code block — raw, no card */}
                            <Reveal delay={0.1}>
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <span className="text-[11px] font-mono text-muted-foreground/50">route.ts</span>
                                        <CopyButton text={`import { cencori } from 'cencori';\nimport { streamText } from 'ai';\n\nconst result = streamText({\n  model: cencori('gpt-4o'),\n  messages,\n});`} />
                                    </div>
                                    <pre className="text-[13px] sm:text-sm font-mono leading-[1.8] text-foreground/80 overflow-x-auto">
                                        <code>
                                            <span className="text-muted-foreground/40">1</span>{"  "}<span className="text-violet-400">import</span> {"{ "}<span className="text-foreground">cencori</span>{" }"} <span className="text-violet-400">from</span> <span className="text-emerald-400">&apos;cencori&apos;</span>;{"\n"}
                                            <span className="text-muted-foreground/40">2</span>{"  "}<span className="text-violet-400">import</span> {"{ "}<span className="text-foreground">streamText</span>{" }"} <span className="text-violet-400">from</span> <span className="text-emerald-400">&apos;ai&apos;</span>;{"\n"}
                                            <span className="text-muted-foreground/40">3</span>{"\n"}
                                            <span className="text-muted-foreground/40">4</span>{"  "}<span className="text-violet-400">const</span> result = <span className="text-blue-400">streamText</span>({"{"}{"\n"}
                                            <span className="text-muted-foreground/40">5</span>{"    "}model: <span className="text-blue-400">cencori</span>(<span className="text-emerald-400">&apos;gpt-4o&apos;</span>),{"\n"}
                                            <span className="text-muted-foreground/40">6</span>{"    "}messages,{"\n"}
                                            <span className="text-muted-foreground/40">7</span>{"  "}{"}"});
                                        </code>
                                    </pre>
                                </div>
                            </Reveal>
                        </div>
                    </div>
                </section>

                {/* ━━━ PROMPTS — Copy-paste starters ━━━ */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative px-6 sm:px-12 py-24 sm:py-32">
                        <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <Reveal>
                            <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground mb-4">Get started</p>
                        </Reveal>
                        <Reveal delay={0.05}>
                            <h2 className="text-3xl sm:text-[2.75rem] font-semibold tracking-[-0.03em] leading-[1.1] mb-6 max-w-lg">
                                Copy. Paste. Ship.
                            </h2>
                        </Reveal>
                        <Reveal delay={0.1}>
                            <p className="text-muted-foreground leading-[1.7] max-w-lg mb-16">
                                Drop these prompts into your AI editor to scaffold a production-ready app with Cencori.
                            </p>
                        </Reveal>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
                            {[
                                {
                                    label: "01",
                                    title: "Bootstrap with Cencori",
                                    prompt: "Set up a Next.js app with Cencori AI Gateway. Install cencori and create a streaming chat endpoint at /api/chat that uses cencori('gpt-4o') as the model.",
                                },
                                {
                                    label: "02",
                                    title: "Add security layer",
                                    prompt: "Add Cencori Edge middleware to protect /api/ai/* routes. Enable PII detection and prompt injection protection. Log all blocked requests.",
                                },
                            ].map((item, i) => (
                                <Reveal key={item.title} delay={i * 0.1}>
                                    <div className="group">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-baseline gap-4">
                                                <span className="text-sm text-muted-foreground/30 tabular-nums font-mono">{item.label}</span>
                                                <h3 className="text-base font-medium">{item.title}</h3>
                                            </div>
                                            <CopyButton text={item.prompt} />
                                        </div>
                                        <p className="text-[13px] font-mono text-muted-foreground leading-[1.8] bg-foreground/[0.03] rounded-lg p-5 group-hover:bg-foreground/[0.05] transition-colors duration-500">
                                            {item.prompt}
                                        </p>
                                    </div>
                                </Reveal>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ━━━ PRICING CALLOUT ━━━ */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative px-6 sm:px-12 py-24 sm:py-32">
                        <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                        <Reveal>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-end">
                                <div>
                                    <h2 className="text-3xl sm:text-[2.75rem] font-semibold tracking-[-0.03em] leading-[1.1] mb-6">
                                        Free to start.
                                        <br />
                                        <span className="text-muted-foreground">Fair when you scale.</span>
                                    </h2>
                                    <p className="text-muted-foreground leading-[1.7] max-w-md">
                                        A generous free tier for prototyping. Pay only when your side project becomes a real product.
                                    </p>
                                </div>
                                <div className="flex lg:justify-end">
                                    <Link href="/pricing">
                                        <Button variant="outline" size="sm" className="h-7 text-xs px-3 group">
                                            View Pricing
                                            <span className="ml-2 group-hover:translate-x-0.5 transition-transform duration-300 inline-block">&rarr;</span>
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        </Reveal>
                    </div>
                </section>

                {/* ━━━ BOTTOM CTA ━━━ */}
                <section className="bg-background">
                    <Reveal>
                        <div className="mx-auto max-w-6xl border-x border-border/30 relative px-6 sm:px-12 py-28 sm:py-36 text-center">
                            <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                            <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                            <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                            <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                            <h2 className="text-3xl sm:text-[2.75rem] font-semibold tracking-[-0.03em] leading-[1.1] mb-5">
                                Ready to ship?
                            </h2>
                            <p className="text-muted-foreground text-sm leading-[1.7] mb-10 max-w-md mx-auto">
                                Your AI-built app deserves production-grade infrastructure.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                <Link href="/login">
                                    <Button size="sm" className="h-7 text-xs px-3">Get Started Free</Button>
                                </Link>
                                <Link href="/contact">
                                    <Button variant="outline" size="sm" className="h-7 text-xs px-3">Talk to Us</Button>
                                </Link>
                            </div>
                        </div>
                    </Reveal>
                </section>
            </main>
    );
}
