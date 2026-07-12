"use client";

import React, { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export default function SalesContactPage() {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [form, setForm] = useState({
        firstName: "",
        lastName: "",
        email: "",
        company: "",
        message: "",
    });

    const handleFieldChange = (field: keyof typeof form, value: string) => {
        setForm((current) => ({ ...current, [field]: value }));
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (isSubmitting) return;

        setIsSubmitting(true);

        try {
            const name = `${form.firstName} ${form.lastName}`.trim();

            const response = await fetch("/api/contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    email: form.email,
                    company: form.company,
                    type: "enterprise",
                    subject: "Sales inquiry",
                    message: form.message,
                }),
            });

            const data = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(data?.error || "Failed to send message");
            }

            setIsSubmitted(true);
            toast.success("Request sent. We'll get back to you soon.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to send message");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
            <main>
                <section className="pt-28 pb-24 sm:pt-40 sm:pb-32">
                    <div className="mx-auto max-w-6xl px-4 md:px-6">
                        <div className="grid grid-cols-1 items-start gap-16 lg:grid-cols-2 lg:gap-24">
                            <div className="pt-2">
                                <p className="mb-8 animate-appear text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
                                    Cencori sales
                                </p>

                                <h1 className="mb-8 animate-appear text-[2.75rem] font-semibold leading-[1.05] tracking-[-0.035em] [animation-delay:100ms] sm:text-[3.5rem] lg:text-[4rem]">
                                    Let&apos;s build
                                    <br />
                                    the future of
                                    <br />
                                    AI observability.
                                </h1>

                                <p className="mb-16 max-w-md animate-appear text-[15px] leading-relaxed text-muted-foreground [animation-delay:200ms]">
                                    Enterprise-grade monitoring, security, and compliance for your AI infrastructure. Tell us about your use case and we&apos;ll get back to you within 24 hours.
                                </p>

                                <div className="hidden animate-appear space-y-3 [animation-delay:300ms] lg:block">
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                        SOC 2 Type II compliant
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                        SSO/SAML & SCIM provisioning
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                        Dedicated support & SLA
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                        Custom rate limits & data retention
                                    </div>
                                </div>
                            </div>

                            <div>
                                <div className="rounded-xl border border-border/60 bg-card p-6 sm:p-8">
                                    {isSubmitted ? (
                                        <div className="flex flex-col items-center justify-center py-12 text-center">
                                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                                                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                                            </div>
                                            <h3 className="mb-2 text-lg font-semibold">Thank you!</h3>
                                            <p className="max-w-xs text-sm text-muted-foreground">
                                                We&apos;ve received your request and will be in touch within 24 hours.
                                            </p>
                                        </div>
                                    ) : (
                                        <form onSubmit={handleSubmit} className="space-y-5">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <label htmlFor="firstName" className="text-xs font-medium">
                                                        First name
                                                    </label>
                                                    <Input
                                                        id="firstName"
                                                        value={form.firstName}
                                                        onChange={(e) => handleFieldChange("firstName", e.target.value)}
                                                        placeholder="Jane"
                                                        required
                                                        className="h-9 text-sm"
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label htmlFor="lastName" className="text-xs font-medium">
                                                        Last name
                                                    </label>
                                                    <Input
                                                        id="lastName"
                                                        value={form.lastName}
                                                        onChange={(e) => handleFieldChange("lastName", e.target.value)}
                                                        placeholder="Doe"
                                                        required
                                                        className="h-9 text-sm"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-1.5">
                                                <label htmlFor="email" className="text-xs font-medium">
                                                    Work email
                                                </label>
                                                <Input
                                                    id="email"
                                                    type="email"
                                                    value={form.email}
                                                    onChange={(e) => handleFieldChange("email", e.target.value)}
                                                    placeholder="jane@company.com"
                                                    required
                                                    className="h-9 text-sm"
                                                />
                                            </div>

                                            <div className="space-y-1.5">
                                                <label htmlFor="company" className="text-xs font-medium">
                                                    Company
                                                </label>
                                                <Input
                                                    id="company"
                                                    value={form.company}
                                                    onChange={(e) => handleFieldChange("company", e.target.value)}
                                                    placeholder="Acme Inc."
                                                    required
                                                    className="h-9 text-sm"
                                                />
                                            </div>

                                            <div className="space-y-1.5">
                                                <label htmlFor="message" className="text-xs font-medium">
                                                    Tell us about your use case
                                                </label>
                                                <Textarea
                                                    id="message"
                                                    value={form.message}
                                                    onChange={(e) => handleFieldChange("message", e.target.value)}
                                                    placeholder="I'm interested in..."
                                                    required
                                                    className="min-h-[120px] text-sm"
                                                />
                                            </div>

                                            <Button type="submit" disabled={isSubmitting} className="w-full h-9 text-sm">
                                                {isSubmitting ? (
                                                    <>
                                                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                                        Sending...
                                                    </>
                                                ) : (
                                                    "Contact Sales"
                                                )}
                                            </Button>

                                            <p className="text-center text-[10px] text-muted-foreground">
                                                By submitting, you agree to our{" "}
                                                <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
                                                    Privacy Policy
                                                </Link>
                                                .
                                            </p>
                                        </form>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
    );
}
