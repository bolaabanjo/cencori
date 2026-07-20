"use client";

import React, { useState } from "react";
import { Loader2, Check, ArrowRight } from "lucide-react";
import { toast } from "@/components/ui/toast";

export function NewsletterForm() {
    const [email, setEmail] = useState("");
    const [website, setWebsite] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);

    const handleSubscribe = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim() || isSubmitting) return;

        setIsSubmitting(true);
        try {
            const response = await fetch("/api/newsletter/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim(), source: "footer", website }),
            });

            const data = await response.json();

            if (!response.ok) {
                toast.error(data.error || "Could not subscribe.");
                return;
            }

            setIsSubmitted(true);
            toast.success(data.alreadySubscribed ? "You're already subscribed." : "Subscribed.");
        } catch {
            toast.error("Could not subscribe.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isSubmitted) {
        return (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-500/90 py-1.5">
                <Check className="w-3 h-3" />
                <span>Subscribed. Welcome to Cencori.</span>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubscribe} className="flex items-center gap-1 rounded-md border border-border/40 bg-foreground/[0.02] focus-within:border-border/70 transition-colors pr-1">
            <input
                type="text"
                name="website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="absolute left-[-9999px] w-0 h-0 opacity-0 pointer-events-none"
            />
            <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={isSubmitting}
                aria-label="Email address"
                className="flex-1 min-w-0 bg-transparent px-2.5 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none disabled:opacity-50 [&:-webkit-autofill]:[-webkit-box-shadow:0_0_0_1000px_var(--background)_inset] [&:-webkit-autofill]:[-webkit-text-fill-color:var(--foreground)] [&:-webkit-autofill]:[caret-color:var(--foreground)]"
            />
            <button
                type="submit"
                disabled={isSubmitting || !email.trim()}
                aria-label="Subscribe"
                className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
            >
                {isSubmitting ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                    <ArrowRight className="w-3 h-3" />
                )}
            </button>
        </form>
    );
}
