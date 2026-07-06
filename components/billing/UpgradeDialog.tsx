'use client';

import { useState } from 'react';
import { Check, ArrowRight, Zap, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface UpgradeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    orgId: string;
    orgSlug: string;
    /** What limit was hit — shown at the top of the dialog */
    reason?: string;
    /** Which tier to highlight as recommended (defaults to 'pro') */
    recommendedTier?: 'pro' | 'team';
}

const plans = [
    {
        id: 'pro' as const,
        name: 'Pro',
        price: { monthly: 49, annual: 490 },
        description: 'For professional developers and small teams.',
        features: [
            '50,000 requests/month',
            'Unlimited projects',
            'All security features',
            'Priority support (24hr)',
            'Advanced analytics',
            'Webhooks & integrations',
        ],
        highlighted: true,
    },
    {
        id: 'team' as const,
        name: 'Team',
        price: { monthly: 149, annual: 1490 },
        description: 'For growing teams needing collaboration.',
        features: [
            '250,000 requests/month',
            'Everything in Pro',
            'Team collaboration (10 members)',
            'Priority support (4hr)',
            '90-day log retention',
        ],
        highlighted: false,
    },
];

export function UpgradeDialog({
    open,
    onOpenChange,
    orgId,
    orgSlug,
    reason,
    recommendedTier = 'pro',
}: UpgradeDialogProps) {
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
    const [loading, setLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleUpgrade = async (tier: 'pro' | 'team') => {
        setLoading(tier);
        setError(null);
        try {
            const res = await fetch('/api/billing/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tier, interval: billingCycle === 'annual' ? 'year' : 'month', orgId }),
            });

            const data = await res.json();

            if (!res.ok || !data.checkoutUrl) {
                throw new Error(data.error || 'Failed to create checkout session');
            }

            window.location.href = data.checkoutUrl;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
            setLoading(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl p-0 overflow-hidden gap-0">
                {/* Header */}
                <div className="px-6 pt-6 pb-4 border-b border-border/50">
                    <DialogHeader>
                        <div className="flex items-center gap-2 mb-1">
                            <DialogTitle className="text-sm font-semibold">Upgrade your plan</DialogTitle>
                        </div>
                        {reason && (
                            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                                {reason}
                            </DialogDescription>
                        )}
                    </DialogHeader>

                    {/* Billing Toggle */}
                    <div className="mt-4 inline-flex items-center gap-1 p-1 rounded-full bg-muted/50 border border-border/50">
                        <button
                            onClick={() => setBillingCycle('monthly')}
                            className={cn(
                                'px-3 py-1 text-xs font-medium rounded-full transition-all',
                                billingCycle === 'monthly'
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            Monthly
                        </button>
                        <button
                            onClick={() => setBillingCycle('annual')}
                            className={cn(
                                'px-3 py-1 text-xs font-medium rounded-full transition-all flex items-center gap-1',
                                billingCycle === 'annual'
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            Annual
                            <span className="text-[10px] text-emerald-500 font-semibold">-17%</span>
                        </button>
                    </div>
                </div>

                {/* Plan Cards */}
                <div className="grid md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-border/50">
                    {plans.map((plan) => {
                        const isRecommended = plan.id === recommendedTier;
                        const monthlyPrice =
                            billingCycle === 'annual'
                                ? Math.round(plan.price.annual / 12)
                                : plan.price.monthly;

                        return (
                            <div
                                key={plan.id}
                                className={cn(
                                    'flex flex-col p-6',
                                    isRecommended ? 'bg-foreground/[0.02]' : ''
                                )}
                            >
                                {/* Plan name + badge */}
                                <div className="flex items-center gap-2 mb-1">
                                    <h3 className="text-sm font-semibold">{plan.name}</h3>
                                    {isRecommended && (
                                        <span className="text-[10px] font-medium text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">
                                            Recommended
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground mb-4">{plan.description}</p>

                                {/* Price */}
                                <div className="flex items-baseline gap-1 mb-5 pb-5 border-b border-border/50">
                                    <span className="text-2xl font-bold tracking-tight">${monthlyPrice}</span>
                                    <span className="text-xs text-muted-foreground">/mo</span>
                                    {billingCycle === 'annual' && (
                                        <span className="text-[10px] text-muted-foreground ml-1">billed annually</span>
                                    )}
                                </div>

                                {/* Features */}
                                <ul className="flex-1 space-y-2 mb-5">
                                    {plan.features.map((feature, i) => (
                                        <li key={i} className="flex items-start gap-2 text-xs">
                                            <Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-500" />
                                            <span className="text-muted-foreground">{feature}</span>
                                        </li>
                                    ))}
                                </ul>

                                {/* CTA */}
                                <Button
                                    size="sm"
                                    variant={isRecommended ? 'default' : 'outline'}
                                    className="w-full rounded-full h-8 text-xs font-medium group"
                                    onClick={() => handleUpgrade(plan.id)}
                                    disabled={!!loading}
                                >
                                    {loading === plan.id ? (
                                        <span className="flex items-center gap-1.5">
                                            <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                                            Redirecting...
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1">
                                            Upgrade to {plan.name}
                                            <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                                        </span>
                                    )}
                                </Button>
                            </div>
                        );
                    })}
                </div>

                {/* Error */}
                {error && (
                    <div className="px-6 py-3 border-t border-border/50 bg-red-500/5">
                        <p className="text-xs text-red-500 flex items-center gap-1.5">
                            <X className="w-3 h-3 shrink-0" />
                            {error}
                        </p>
                    </div>
                )}

                {/* Footer */}
                <div className="px-6 py-3 border-t border-border/50 bg-muted/20">
                    <p className="text-[10px] text-muted-foreground text-center">
                        Secure checkout via Bachs. Cancel anytime. All plans include SSL &amp; 99.9% uptime SLA.{' '}
                        <a href="/contact" className="underline underline-offset-2 hover:text-foreground transition-colors">
                            Contact sales
                        </a>{' '}
                        for Enterprise pricing.
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}
