"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, ChevronRight, Shield, Eye, Activity, Terminal, Code2, Copy, Check, Server } from "lucide-react";
import {
    NextjsLogo,
    PythonLogo,
    NodeLogo,
    GoLogo,
    RustLogo
} from "@/components/icons/BrandIcons";

// Simple copy button
function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
        </button>
    );
}

export default function DevelopersPage() {

    const features = [
        { icon: Shield, title: "Middleware Protection", description: "Secure your endpoints with a single line of middleware." },
        { icon: Activity, title: "Real-time Logging", description: "Stream logs to your observability stack (Datadog, Grafana)." },
        { icon: Terminal, title: "Type-safe SDKs", description: "First-class TypeScript and Python support." },
        { icon: Server, title: "Self-hosting Optional", description: "Run Cencori Gateway as a container in your VPC." },
    ];

    const sdks = [
        { name: "Node.js", icon: NodeLogo },
        { name: "Python", icon: PythonLogo },
        { name: "Go", icon: GoLogo },
        { name: "Rust", icon: RustLogo },
        { name: "Next.js", icon: NextjsLogo },
    ];

    return (
      <main>
                {/* Hero Section */}
                <section className="relative flex flex-col items-center justify-center overflow-hidden bg-background pt-32 pb-20">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-foreground/5 via-background to-background pointer-events-none" />

                    <div className="container relative z-10 px-4 md:px-6 flex flex-col items-center text-center">
                        <div className="mb-8 animate-appear">
                            <Link href="/docs/api" className="inline-flex items-center rounded-full border border-foreground/10 bg-foreground/5 px-3 py-1 text-sm font-medium text-foreground/80 transition-colors hover:bg-foreground/10 hover:text-foreground">
                                <span className="flex h-2 w-2 rounded-full bg-blue-500 mr-2 animate-pulse" />
                                <span className="mr-2">For Developers</span>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </Link>
                        </div>

                        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tighter mb-6 max-w-4xl animate-appear [animation-delay:100ms] text-transparent bg-clip-text bg-gradient-to-b from-foreground to-foreground/50">
                            The security layer for <span className="italic">production</span> AI
                        </h1>

                        <p className="text-lg md:text-xl text-muted-foreground max-w-xl mb-10 animate-appear [animation-delay:200ms] leading-relaxed">
                            Stop building your own rate limiting, PII redaction, and logging. Add Cencori to your stack in minutes.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-3 animate-appear [animation-delay:300ms]">
                            <Link href="/login">
                                <Button size="default" className="h-10 px-6 text-sm rounded-full bg-foreground text-background hover:bg-foreground/90 transition-all">
                                    Get Started Free <ArrowRight className="ml-2 h-4 w-4" />
                                </Button>
                            </Link>
                            <Link href="/docs/api">
                                <Button variant="outline" size="default" className="h-10 px-6 text-sm rounded-full border-foreground/20 hover:bg-foreground/5 hover:border-foreground/40 transition-all">
                                    API Reference
                                </Button>
                            </Link>
                        </div>
                    </div>
                </section>

                {/* SDK bar */}
                <section className="py-8 border-y border-border/30">
                    <div className="container px-4 md:px-6">
                        <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
                            <span className="text-sm text-muted-foreground">Native SDKs for</span>
                            {sdks.map((sdk) => (
                                <div key={sdk.name} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                                    <sdk.icon className="h-5 w-5" />
                                    <span className="text-sm hidden sm:inline">{sdk.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Features Section */}
                <section className="py-20 bg-background">
                    <div className="container mx-auto px-4 md:px-6">
                        <div className="flex flex-col items-center text-center mb-12">
                            <h2 className="text-2xl md:text-4xl font-bold tracking-tighter mb-4 text-foreground">
                                Infrastructure, <span className="text-muted-foreground">not just an API wrapper.</span>
                            </h2>
                            <p className="text-base text-muted-foreground max-w-xl">
                                Built for high-throughput production environments.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
                            {features.map((feature) => (
                                <div key={feature.title} className="p-6 border border-border/30 hover:border-border/60 hover:bg-muted/20 transition-colors">
                                    <feature.icon className="h-5 w-5 text-muted-foreground mb-4" />
                                    <h3 className="text-sm font-semibold mb-2 text-foreground">{feature.title}</h3>
                                    <p className="text-xs text-muted-foreground leading-relaxed">{feature.description}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Integration Code Section */}
                <section className="py-20 bg-background border-y border-border/30">
                    <div className="container mx-auto px-4 md:px-6">
                        <div className="max-w-4xl mx-auto">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                                <div>
                                    <h2 className="text-2xl md:text-3xl font-bold tracking-tighter mb-4 text-foreground">
                                        Just change the <span className="text-muted-foreground">baseURL</span>
                                    </h2>
                                    <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                                        Cencori is a drop-in placement for OpenAI's API. You can keep using your existing client libraries.
                                    </p>
                                    <ul className="space-y-2 text-xs text-muted-foreground">
                                        <li className="flex items-center gap-2">
                                            <span className="w-1 h-1 rounded-full bg-blue-500" />
                                            Compatible with official OpenAI SDK
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <span className="w-1 h-1 rounded-full bg-blue-500" />
                                            Works with LangChain, LlamaIndex
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <span className="w-1 h-1 rounded-full bg-blue-500" />
                                            Zero latency overhead mode available
                                        </li>
                                    </ul>
                                </div>

                                <div className="rounded-lg border border-border/40 bg-card overflow-hidden">
                                    <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/30">
                                        <div className="flex items-center gap-2">
                                            <div className="flex gap-1.5">
                                                <span className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                                                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
                                                <span className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
                                            </div>
                                            <span className="text-xs text-muted-foreground ml-2 font-mono">client.ts</span>
                                        </div>
                                        <div className="flex gap-2">
                                            <button className="text-xs text-muted-foreground hover:text-foreground">Node</button>
                                            <button className="text-xs text-muted-foreground/50 hover:text-foreground">Python</button>
                                        </div>
                                    </div>
                                    <pre className="p-4 text-xs overflow-x-auto font-mono">
                                        <code className="text-foreground/90">
                                            <span className="text-purple-400">import</span> OpenAI <span className="text-purple-400">from</span> <span className="text-emerald-400">&apos;openai&apos;</span>;{"\n\n"}
                                            <span className="text-purple-400">const</span> client = <span className="text-blue-400">new</span> <span className="text-yellow-300">OpenAI</span>({"{"}{"\n"}
                                            {"  "}apiKey: process.env.<span className="text-blue-300">CENCORI_API_KEY</span>,{"\n"}
                                            {"  "}baseURL: <span className="text-emerald-400">&apos;https://api.cencori.com/v1&apos;</span>{"\n"}
                                            {"}"});{"\n\n"}
                                            <span className="text-gray-500">// Requests are now secured, logged, and rate-limited</span>
                                        </code>
                                    </pre>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* CTA Section */}
                <section className="py-20 bg-background">
                    <div className="container mx-auto px-4 md:px-6">
                        <div className="max-w-2xl mx-auto text-center">
                            <h2 className="text-2xl md:text-3xl font-bold tracking-tighter mb-4 text-foreground">
                                Build better AI apps
                            </h2>
                            <p className="text-base text-muted-foreground mb-8">
                                Join 10,000+ developers shipping with Cencori.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                <Link href="/login">
                                    <Button size="default" className="h-10 px-6 text-sm rounded-full bg-foreground text-background hover:bg-foreground/90 transition-all">
                                        Get Started <ArrowRight className="ml-2 h-4 w-4" />
                                    </Button>
                                </Link>
                                <Link href="/contact">
                                    <Button variant="outline" size="default" className="h-10 px-6 text-sm rounded-full border-foreground/20 hover:bg-foreground/5 hover:border-foreground/40 transition-all">
                                        Contact Sales
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

    );
}
