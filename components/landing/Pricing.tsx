"use client";

import React, { useEffect, useState } from "react";
import { ArrowRight, Check, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { CENCORI_PAID_PLANS } from "@/lib/billing/plans";

type Tier = "free" | "pro" | "team" | "enterprise";
type BillingPeriod = "monthly" | "annual";
type Currency = "USD" | "NGN";
type ScanTier = "scan_free" | "scan" | "scan_team";
type PaidScanTier = Exclude<ScanTier, "scan_free">;
type MatrixValue = boolean | string;
const SCAN_APP_ORIGIN = "https://scan.cencori.com";
const SCAN_SIGNUP_URL = `${SCAN_APP_ORIGIN}/signup?redirect=${encodeURIComponent(SCAN_APP_ORIGIN)}`;

const tiers: Array<{
    name: Tier;
    displayName: string;
    description: string;
    price: Record<Currency, { monthly: number | string; annual: number | string }>;
    features: string[];
    highlighted?: boolean;
    cta: string;
    ctaVariant?: "default" | "outline" | "ghost";
}> = [
    {
        name: "free",
        displayName: "Free",
        description: "Everything you need to build, experiment, and test.",
        price: {
            USD: { monthly: 0, annual: 0 },
            NGN: { monthly: 0, annual: 0 }
        },
        features: [
            "1,000 requests/month",
            "1 active project",
            "100+ AI models",
            "Community support",
            "No credit card required",
        ],
        cta: "Start Free",
        ctaVariant: "outline",
    },
    {
        name: "pro",
        displayName: "Pro",
        description: "For professional developers and growing products.",
        price: {
            USD: {
                monthly: CENCORI_PAID_PLANS.pro.prices.month / 100,
                annual: CENCORI_PAID_PLANS.pro.prices.year / 100,
            },
            NGN: { monthly: 39000, annual: 390000 }
        },
        features: [
            `${CENCORI_PAID_PLANS.pro.requestLimit.toLocaleString()} requests/month`,
            "Unlimited projects",
            "End-user billing",
            "Full security pipeline",
            "Jailbreak detection",
            "PII masking & audit trails",
            "Priority support",
        ],
        highlighted: true,
        cta: "Get Started",
    },
    {
        name: "team",
        displayName: "Team",
        description: "For scaling startups and production teams.",
        price: {
            USD: {
                monthly: CENCORI_PAID_PLANS.team.prices.month / 100,
                annual: CENCORI_PAID_PLANS.team.prices.year / 100,
            },
            NGN: { monthly: 150000, annual: 1500000 }
        },
        features: [
            `${CENCORI_PAID_PLANS.team.requestLimit.toLocaleString()} requests/month`,
            "Unlimited projects",
            "End-user billing",
            "Full security pipeline",
            "PII masking & jailbreak detection",
            "Team seats & collaboration",
            "24/7 Priority support",
        ],
        cta: "Get Started",
        ctaVariant: "outline",
    },
    {
        name: "enterprise",
        displayName: "Enterprise",
        description: "For large organizations with custom security and scale.",
        price: {
            USD: { monthly: "Custom", annual: "Custom" },
            NGN: { monthly: "Custom", annual: "Custom" }
        },
        features: [
            "Unlimited requests & projects",
            "Dedicated support & SLAs",
            "SSO & SAML",
            "RBAC & custom residency",
            "Bring your own infra",
            "SOC2 compliance audit logs",
        ],
        cta: "Contact Sales",
        ctaVariant: "outline",
    },
];

const scanAddons: Array<{
    name: ScanTier;
    displayName: string;
    price: Record<Currency, number>;
    description: string;
    features: string[];
    cta: string;
}> = [
    {
        name: "scan_free",
        displayName: "Scan Free",
        price: { USD: 0, NGN: 0 },
        description: "Start scanning at no cost with limited usage.",
        features: [
            "Up to 5 imported projects",
            "2 scans per project",
            "Scan dashboard access",
            "Upgrade anytime to unlimited",
        ],
        cta: "Start Free",
    },
    {
        name: "scan",
        displayName: "Scan",
        price: { USD: 9, NGN: 9000 },
        description: "Unlimited standalone scan access for individual engineers.",
        features: [
            "Unlimited repository imports",
            "Unlimited scans per project",
            "AI fix generation",
            "Fix PR workflow",
        ],
        cta: "Start Scan",
    },
    {
        name: "scan_team",
        displayName: "Scan Teams",
        price: { USD: 29, NGN: 29000 },
        description: "Unlimited standalone scan access for teams.",
        features: [
            "Everything in Scan",
            "Team-oriented scan workflows",
            "Changelog and remediation pipeline",
            "Priority scan support",
        ],
        cta: "Start Scan Teams",
    },
];

const matrixSections: Array<{
    title: string;
    description: string;
    rows: Array<{
        feature: string;
        values: Record<Tier, MatrixValue>;
    }>;
}> = [
    {
        title: "AI Gateway",
        description: "Inference capabilities.",
        rows: [
            {
                feature: "100+ AI models (chat, image, audio, embeddings)",
                values: { free: true, pro: true, team: true, enterprise: true },
            },
            {
                feature: "Streaming & tool calling",
                values: { free: true, pro: true, team: true, enterprise: true },
            },
            {
                feature: "Structured output",
                values: { free: true, pro: true, team: true, enterprise: true },
            },
        ],
    },
    {
        title: "Infrastructure",
        description: "Provider routing and reliability.",
        rows: [
            {
                feature: "Bring your own provider keys (BYOK)",
                values: { free: true, pro: true, team: true, enterprise: true },
            },
            {
                feature: "Multi-provider routing",
                values: { free: false, pro: true, team: true, enterprise: true },
            },
            {
                feature: "Failover & circuit breaker",
                values: { free: false, pro: true, team: true, enterprise: true },
            },
            {
                feature: "Semantic cache",
                values: { free: false, pro: true, team: true, enterprise: true },
            },
        ],
    },
    {
        title: "Security",
        description: "Content safety and data protection.",
        rows: [
            {
                feature: "Jailbreak detection",
                values: { free: false, pro: true, team: true, enterprise: true },
            },
            {
                feature: "PII masking & redaction",
                values: { free: false, pro: true, team: true, enterprise: true },
            },
            {
                feature: "Output scanning",
                values: { free: false, pro: true, team: true, enterprise: true },
            },
            {
                feature: "Security incidents & audit trails",
                values: { free: false, pro: true, team: true, enterprise: true },
            },
        ],
    },
    {
        title: "Observability",
        description: "Monitoring and analytics.",
        rows: [
            {
                feature: "Request logs & analytics",
                values: { free: false, pro: true, team: true, enterprise: true },
            },
            {
                feature: "Cost tracking",
                values: { free: false, pro: true, team: true, enterprise: true },
            },
        ],
    },
    {
        title: "Platform",
        description: "Collaboration and support.",
        rows: [
            {
                feature: "Active Projects",
                values: { free: "1", pro: "Unlimited", team: "Unlimited", enterprise: "Unlimited" },
            },
            {
                feature: "Support",
                values: {
                    free: "Community",
                    pro: "Priority",
                    team: "24/7 Priority",
                    enterprise: "Dedicated SLA",
                },
            },
            {
                feature: "SSO & SAML",
                values: { free: false, pro: false, team: false, enterprise: true },
            },
            {
                feature: "SLA guarantees",
                values: { free: false, pro: false, team: false, enterprise: true },
            },
        ],
    },
];

function renderMatrixValue(value: MatrixValue) {
    if (value === true) {
        return <Check className="mx-auto h-4 w-4 text-foreground" aria-hidden="true" />;
    }
    if (value === false) {
        return <Minus className="mx-auto h-4 w-4 text-muted-foreground" aria-hidden="true" />;
    }
    return <span className="text-xs md:text-sm text-foreground/90">{value}</span>;
}

function getDisplayPrice(tier: (typeof tiers)[number], billingPeriod: BillingPeriod, currency: Currency) {
    const priceObj = tier.price[currency];
    if (typeof priceObj.monthly !== "number") {
        return priceObj.monthly;
    }
    if (billingPeriod === "annual" && priceObj.monthly > 0) {
        return Math.round(Number(priceObj.annual) / 12);
    }
    return priceObj.monthly;
}

function getYearlySavings(tier: (typeof tiers)[number], currency: Currency) {
    const priceObj = tier.price[currency];
    if (typeof priceObj.monthly !== "number" || typeof priceObj.annual !== "number") {
        return null;
    }
    if (priceObj.monthly === 0) {
        return null;
    }
    const monthlyTotal = priceObj.monthly * 12;
    const annualTotal = priceObj.annual;
    const savings = monthlyTotal - annualTotal;
    return savings;
}

function getSubPriceLabel(tier: (typeof tiers)[number], billingPeriod: BillingPeriod, currency: Currency) {
    const priceObj = tier.price[currency];
    if (typeof priceObj.monthly !== "number") {
        return "Talk to sales";
    }
    if (priceObj.monthly === 0) {
        return "Free + you pay for AI usage";
    }
    if (billingPeriod === "annual") {
        const formattedAnnual = formatCurrency(priceObj.annual, currency, { maximumFractionDigits: 0 });
        return `Billed ${formattedAnnual}/year`;
    }
    return "Platform subscription";
}

function isPaidScanTier(tier: ScanTier): tier is PaidScanTier {
    return tier === "scan" || tier === "scan_team";
}

export function Pricing() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
    const [currency, setCurrency] = useState<Currency>("USD");
    const [orgId, setOrgId] = useState<string | null>(null);
    const [loadingTier, setLoadingTier] = useState<Tier | null>(null);
    const [loadingScanTier, setLoadingScanTier] = useState<ScanTier | null>(null);

    useEffect(() => {
        try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const isNigeriaTz = tz && (tz === "Africa/Lagos" || tz.includes("Lagos"));
            
            const locale = typeof navigator !== "undefined" ? (navigator.language || (navigator.languages && navigator.languages[0]) || "") : "";
            const isNigeriaLocale = locale.includes("-NG") || locale === "en-NG";

            if (isNigeriaTz || isNigeriaLocale) {
                setCurrency("NGN");
            }
        } catch (e) {
            console.warn("Timezone/Locale detection failed", e);
        }
    }, []);

    useEffect(() => {
        const checkAuth = async () => {
            const {
                data: { session },
            } = await supabase.auth.getSession();
            setIsAuthenticated(!!session);
            if (session?.user) {
                const { data: membership } = await supabase
                    .from("organization_members")
                    .select("organization_id")
                    .eq("user_id", session.user.id)
                    .limit(1)
                    .single();
                if (membership) {
                    setOrgId(membership.organization_id);
                }
            }
        };
        checkAuth();

        const { data: authListener } = supabase.auth.onAuthStateChange(
            (_event: string, session: { user: { user_metadata?: Record<string, unknown>; email?: string; id?: string } } | null) => {
                setIsAuthenticated(!!session);
            }
        );

        return () => {
            authListener.subscription.unsubscribe();
        };
    }, []);

    const handleCTA = async (tier: Tier) => {
        if (tier === "enterprise") {
            window.location.href = "/contact";
            return;
        }
        if (!isAuthenticated) {
            window.location.href = "/signup";
            return;
        }
        if (tier === "free") {
            window.location.href = "/dashboard";
            return;
        }
        if (!orgId) {
            window.location.href = "/dashboard";
            return;
        }
        setLoadingTier(tier);
        try {
            const res = await fetch("/api/billing/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tier, interval: billingPeriod === 'annual' ? 'year' : 'month', orgId }),
            });
            const data = await res.json();
            if (data.checkoutUrl) {
                window.location.href = data.checkoutUrl;
            } else {
                window.location.href = "/dashboard";
            }
        } catch {
            window.location.href = "/dashboard";
        } finally {
            setLoadingTier(null);
        }
    };

    const handleScanCTA = async (tier: ScanTier) => {
        if (!isAuthenticated) {
            window.location.href = SCAN_SIGNUP_URL;
            return;
        }

        if (tier === "scan_free") {
            window.location.href = SCAN_APP_ORIGIN;
            return;
        }

        setLoadingScanTier(tier);
        try {
            const res = await fetch("/api/billing/scan/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tier: isPaidScanTier(tier) ? tier : "scan" }),
            });
            const data = await res.json().catch(() => ({}));
            if (data.checkoutUrl) {
                window.location.href = data.checkoutUrl;
            } else {
                window.location.href = SCAN_APP_ORIGIN;
            }
        } catch {
            window.location.href = SCAN_APP_ORIGIN;
        } finally {
            setLoadingScanTier(null);
        }
    };

    return (
        <section className="relative overflow-hidden bg-background">
            <div
                className="pointer-events-none absolute inset-0 opacity-40"
                style={{
                    backgroundImage:
                        "linear-gradient(to right, hsl(var(--border) / 0.35) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border) / 0.35) 1px, transparent 1px)",
                    backgroundSize: "68px 68px",
                }}
            />

            <div className="relative z-10 mx-auto max-w-7xl px-4 py-20 md:px-6 md:py-24">
                <div className="mx-auto mb-12 max-w-3xl text-center">
                    <Badge variant="outline" className="mb-4 rounded-full border-border/60 px-4 py-1 text-xs">
                        Pricing
                    </Badge>
                    <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">
                        Pick a plan to power your AI applications.
                    </h1>
                    <p className="mx-auto mt-4 max-w-2xl text-sm text-muted-foreground md:text-base">
                        Free tier includes unlimited requests. Pro unlocks security scanning,
                        failover, caching, and observability. You pay providers directly for AI usage.
                    </p>
                </div>

                <div className="mb-10 flex justify-center">
                    {/* Billing Cycle Selector */}
                    <div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/90 p-1 backdrop-blur-sm">
                        <button
                            type="button"
                            onClick={() => setBillingPeriod("monthly")}
                            className={cn(
                                "rounded-full px-4 py-1.5 text-xs font-medium transition-colors",
                                billingPeriod === "monthly"
                                    ? "bg-foreground text-background"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            Monthly
                        </button>
                        <button
                            type="button"
                            onClick={() => setBillingPeriod("annual")}
                            className={cn(
                                "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition-colors",
                                billingPeriod === "annual"
                                    ? "bg-foreground text-background"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <span>Annual</span>
                            <span className={cn(
                                "rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase",
                                billingPeriod === "annual"
                                    ? "bg-background/20 text-background"
                                    : "bg-emerald-500/10 text-emerald-500"
                            )}>
                                Save up to 17%
                            </span>
                        </button>
                    </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-border/50 bg-background/95 backdrop-blur-sm">
                    <div className="grid border-b border-border/50 md:grid-cols-2 xl:grid-cols-4">
                        {tiers.map((tier, index) => {
                            const displayPrice = getDisplayPrice(tier, billingPeriod, currency);
                            return (
                                <article
                                    key={tier.name}
                                    className={cn(
                                        "relative flex flex-col gap-4 p-6",
                                        index < tiers.length - 1 && "border-b border-border/50 xl:border-b-0 xl:border-r",
                                        index === 1 && "bg-muted/20"
                                    )}
                                >
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="text-xl font-semibold">{tier.displayName}</p>
                                            {tier.highlighted && (
                                                <Badge className="rounded-full border-0 bg-foreground px-2 py-0.5 text-[10px] text-background">
                                                    Popular
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="mt-2 text-sm text-muted-foreground">{tier.description}</p>
                                    </div>

                                    <div>
                                        <div className="flex items-baseline gap-2 flex-wrap">
                                            <p className="text-3xl font-semibold tracking-tight">
                                                {typeof displayPrice === "number" ? formatCurrency(displayPrice, currency, { maximumFractionDigits: 0 }) : displayPrice}
                                                {typeof displayPrice === "number" && <span className="text-base text-muted-foreground"> /mo</span>}
                                            </p>
                                            {billingPeriod === "annual" && (() => {
                                                const savings = getYearlySavings(tier, currency);
                                                if (savings && savings > 0) {
                                                    return (
                                                        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500">
                                                            Save {formatCurrency(savings, currency, { maximumFractionDigits: 0 })}/yr
                                                        </span>
                                                    );
                                                }
                                                return null;
                                            })()}
                                        </div>
                                        <p className="mt-1 text-xs text-muted-foreground">{getSubPriceLabel(tier, billingPeriod, currency)}</p>
                                    </div>

                                    <ul className="space-y-2">
                                        {tier.features.map((feature) => (
                                            <li key={feature} className="flex items-start gap-2 text-xs text-muted-foreground">
                                                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" />
                                                <span>{feature}</span>
                                            </li>
                                        ))}
                                    </ul>

                                    <Button
                                        className="mt-auto w-full rounded-full text-xs"
                                        variant={tier.ctaVariant || "default"}
                                        onClick={() => handleCTA(tier.name)}
                                        disabled={loadingTier === tier.name}
                                    >
                                        {loadingTier === tier.name ? (
                                            <span className="inline-flex items-center gap-1.5">
                                                <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                                                Redirecting...
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5">
                                                {tier.cta}
                                                <ArrowRight className="h-3 w-3" />
                                            </span>
                                        )}
                                    </Button>
                                </article>
                            );
                        })}
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[980px] border-collapse text-left">
                            <thead>
                                <tr className="border-b border-border/50 bg-muted/15">
                                    <th className="w-[30%] px-5 py-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                        Features
                                    </th>
                                    {tiers.map((tier) => (
                                        <th key={tier.name} className="w-[17.5%] px-5 py-4 align-top">
                                            <div className="space-y-2">
                                                <p className="text-sm font-semibold">{tier.displayName}</p>
                                                <p className="text-xs text-muted-foreground">Platform subscription</p>
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {matrixSections.map((section) => (
                                    <React.Fragment key={section.title}>
                                        <tr className="border-y border-border/50 bg-muted/10">
                                            <td colSpan={tiers.length + 1} className="px-5 py-4">
                                                <p className="text-sm font-semibold">{section.title}</p>
                                                <p className="text-xs text-muted-foreground">{section.description}</p>
                                            </td>
                                        </tr>
                                        {section.rows.map((row) => (
                                            <tr key={row.feature} className="border-b border-border/40">
                                                <td className="px-5 py-3 text-sm text-foreground">{row.feature}</td>
                                                {tiers.map((tier) => (
                                                    <td key={tier.name} className="px-5 py-3 text-center">
                                                        {renderMatrixValue(row.values[tier.name])}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="mt-8 overflow-hidden rounded-2xl border border-border/50 bg-background/95">
                    <div className="border-b border-border/50 px-5 py-4">
                        <p className="text-sm font-semibold">Scan Add-on</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Standalone scan plans for users who only need scan workflows. Platform Pro, Team, and Enterprise
                            plans include full scan access automatically. Free scan usage includes 5 imported projects and 2 scans per project.
                        </p>
                    </div>
                    <div className="grid gap-0 border-border/50 md:grid-cols-3">
                        {scanAddons.map((addon, index) => (
                            <article
                                key={addon.name}
                                className={cn(
                                    "flex flex-col gap-4 p-5",
                                    index < scanAddons.length - 1 && "border-b border-border/50 md:border-b-0 md:border-r"
                                )}
                            >
                                <div>
                                    <p className="text-base font-semibold">{addon.displayName}</p>
                                    <p className="mt-1 text-sm text-muted-foreground">{addon.description}</p>
                                </div>

                                <p className="text-3xl font-semibold tracking-tight">
                                    {addon.price[currency] === 0 ? "Free" : formatCurrency(addon.price[currency], currency, { maximumFractionDigits: 0 })}
                                    <span className="text-base text-muted-foreground">{addon.price[currency] === 0 ? "" : " /mo"}</span>
                                </p>

                                <ul className="space-y-2">
                                    {addon.features.map((feature) => (
                                        <li key={feature} className="flex items-start gap-2 text-xs text-muted-foreground">
                                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" />
                                            <span>{feature}</span>
                                        </li>
                                    ))}
                                </ul>

                                <Button
                                    className="mt-auto w-full rounded-full text-xs"
                                    variant={addon.name === "scan_team" ? "default" : "outline"}
                                    onClick={() => handleScanCTA(addon.name)}
                                    disabled={loadingScanTier === addon.name}
                                >
                                    {loadingScanTier === addon.name ? (
                                        <span className="inline-flex items-center gap-1.5">
                                            <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                                            Redirecting...
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1.5">
                                            {addon.cta}
                                            <ArrowRight className="h-3 w-3" />
                                        </span>
                                    )}
                                </Button>
                            </article>
                        ))}
                    </div>
                </div>

                 <div className="mt-8 rounded-xl border border-border/50 bg-muted/20 p-4 text-xs text-muted-foreground">
                    <p>
                        Compute billed separately by GPU hour and token usage. Team plan and usage-based pricing launching soon.
                    </p>
                </div>
            </div>
        </section>
    );
}
