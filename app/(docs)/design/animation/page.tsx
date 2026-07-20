"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Copy, Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

function CodeBlock({ code, language = "tsx" }: { code: string; language?: string }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        toast.success("Copied to clipboard");
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="relative rounded-lg border border-border/50 bg-muted/30 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40 bg-muted/50">
                <span className="text-[10px] text-muted-foreground font-mono">{language}</span>
                <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={handleCopy}>
                    {copied ? <><Check className="h-3 w-3 mr-1" />Copied</> : <><Copy className="h-3 w-3 mr-1" />Copy</>}
                </Button>
            </div>
            <pre className="p-4 text-xs font-mono text-muted-foreground overflow-x-auto">
                <code>{code}</code>
            </pre>
        </div>
    );
}

const transitions = [
    { class: "transition-colors", usage: "Color changes only" },
    { class: "transition-opacity", usage: "Fade effects" },
    { class: "transition-transform", usage: "Scale and translate" },
    { class: "transition-all", usage: "Multiple properties" },
    { class: "duration-200", usage: "Quick (default)" },
    { class: "duration-300", usage: "Standard" },
    { class: "duration-500", usage: "Slow (rare)" },
];

export default function AnimationPage() {
    const [key, setKey] = useState(0);
    const replay = () => setKey(k => k + 1);

    return (
        <div className="space-y-12">
            <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">Animation</h1>
                <p className="text-sm text-muted-foreground max-w-2xl">
                    Motion guidelines and animation patterns using CSS transitions and Framer Motion.
                </p>
            </div>

            <section className="space-y-4">
                <h2 className="text-lg font-semibold">CSS Transitions</h2>
                <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                    {transitions.map((item) => (
                        <div key={item.class} className="flex items-center justify-between px-4 py-3 border-b border-border/40 last:border-0">
                            <code className="text-xs font-mono text-emerald-500">{item.class}</code>
                            <span className="text-xs text-muted-foreground">{item.usage}</span>
                        </div>
                    ))}
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Hover Effects</h2>
                <div className="rounded-xl border border-border/50 bg-card p-6 space-y-6">
                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="rounded-xl border border-border/50 bg-card p-4 transition-all hover:border-border hover:shadow-lg cursor-pointer">
                            <p className="text-xs font-medium">Card Hover</p>
                            <p className="text-[10px] text-muted-foreground">Shadow on hover</p>
                        </div>
                        <Button variant="outline" className="group h-10 rounded-lg">
                            Button Hover
                            <ArrowRight className="h-3 w-3 ml-1.5 transition-transform group-hover:translate-x-0.5" />
                        </Button>
                        <div className="rounded-xl border border-border/50 bg-muted/30 p-4 transition-transform hover:scale-105 cursor-pointer flex items-center justify-center">
                            <p className="text-xs">Scale Effect</p>
                        </div>
                    </div>
                    <CodeBlock code={`// Card hover shadow
className="transition-all hover:border-border hover:shadow-lg"

// Button with arrow translate
className="group"
<ArrowRight className="transition-transform group-hover:translate-x-0.5" />

// Scale on hover
className="transition-transform hover:scale-105"`} />
                </div>
            </section>

            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Framer Motion</h2>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={replay}>
                        Replay Animations
                    </Button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-border/50 bg-card p-6">
                        <p className="text-xs font-medium mb-4">Fade In</p>
                        <motion.div
                            key={`fade-${key}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.5 }}
                            className="h-16 bg-muted rounded-lg flex items-center justify-center"
                        >
                            <span className="text-xs text-muted-foreground">Content</span>
                        </motion.div>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-card p-6">
                        <p className="text-xs font-medium mb-4">Slide Up</p>
                        <motion.div
                            key={`slide-${key}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5 }}
                            className="h-16 bg-muted rounded-lg flex items-center justify-center"
                        >
                            <span className="text-xs text-muted-foreground">Content</span>
                        </motion.div>
                    </div>
                </div>
                <CodeBlock code={`import { motion } from "framer-motion";

// Fade in
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: 0.3 }}
>
  {content}
</motion.div>

// Slide up
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3 }}
>
  {content}
</motion.div>`} />
            </section>

            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Staggered Children</h2>
                <div className="rounded-xl border border-border/50 bg-card p-6">
                    <motion.div
                        key={`stagger-${key}`}
                        initial="hidden"
                        animate="visible"
                        variants={{
                            visible: { transition: { staggerChildren: 0.1 } }
                        }}
                        className="grid grid-cols-4 gap-3"
                    >
                        {[1, 2, 3, 4].map((i) => (
                            <motion.div
                                key={i}
                                variants={{
                                    hidden: { opacity: 0, y: 10 },
                                    visible: { opacity: 1, y: 0 }
                                }}
                                className="h-12 bg-muted rounded-lg"
                            />
                        ))}
                    </motion.div>
                </div>
            </section>

            <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
                <h3 className="text-sm font-semibold text-emerald-500 mb-3">Animation Guidelines</h3>
                <ul className="space-y-2">
                    <li className="text-xs text-muted-foreground flex items-start gap-2">
                        <span className="text-emerald-500">•</span>
                        Keep durations short: 0.2s to 0.4s maximum
                    </li>
                    <li className="text-xs text-muted-foreground flex items-start gap-2">
                        <span className="text-emerald-500">•</span>
                        Use ease-out for entrances, ease-in for exits
                    </li>
                    <li className="text-xs text-muted-foreground flex items-start gap-2">
                        <span className="text-emerald-500">•</span>
                        Prefer opacity + transform over layout shifts
                    </li>
                    <li className="text-xs text-muted-foreground flex items-start gap-2">
                        <span className="text-emerald-500">•</span>
                        Respect prefers-reduced-motion for accessibility
                    </li>
                </ul>
            </section>
        </div>
    );
}
