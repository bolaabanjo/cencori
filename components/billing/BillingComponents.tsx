'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowRight, Check, Sparkles, Zap, AlertTriangle } from 'lucide-react';
import { CENCORI_PAID_PLANS } from '@/lib/billing/plans';

// UsageCard lived here: a progress bar of requests used against the per-tier
// monthly ceiling, with "you've reached your monthly limit" copy. No tier has
// a ceiling now, and it had no callers.

interface TierBenefitsProps {
    tier: 'free' | 'pro' | 'team' | 'enterprise';
}

export function TierBenefits({ tier }: TierBenefitsProps) {
    const benefits = {
        free: [
            '1 project',
            'Basic security features',
            'Community support',
        ],
        pro: [
            'Unlimited projects',
            'All security features',
            'Priority support (24hr)',
            'Advanced analytics',
            'Webhooks',
        ],
        team: [
            'Everything in Pro',
            'Team collaboration (10 members)',
            'Priority support (4hr)',
            'API access',
            '90-day log retention',
        ],
        enterprise: [
            'Unlimited requests',
            'Everything in Team',
            'Unlimited members',
            'Dedicated support',
            'SLA guarantees',
            'Custom integrations',
        ],
    };

    return (
        <div className="space-y-2">
            {benefits[tier].map((benefit, index) => (
                <div key={index} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>{benefit}</span>
                </div>
            ))}
        </div>
    );
}

interface UpgradeCardProps {
    currentTier: 'free' | 'pro' | 'team';
    nextTier: 'pro' | 'team' | 'enterprise';
    orgId: string;
}

export function UpgradeCard({ currentTier, nextTier, orgId }: UpgradeCardProps) {
    const pricing = {
        pro: {
            monthly: CENCORI_PAID_PLANS.pro.prices.month / 100,
            annual: CENCORI_PAID_PLANS.pro.prices.year / 100,
        },
        team: {
            monthly: CENCORI_PAID_PLANS.team.prices.month / 100,
            annual: CENCORI_PAID_PLANS.team.prices.year / 100,
        },
        enterprise: { monthly: 'Custom', annual: 'Custom' },
    };

    const handleUpgrade = async (cycle: 'monthly' | 'annual') => {
        if (nextTier === 'enterprise') {
            window.location.href = '/contact';
            return;
        }

        try {
            const response = await fetch('/api/billing/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tier: nextTier,
                    interval: cycle === 'monthly' ? 'month' : 'year',
                    orgId,
                }),
            });

            const { checkoutUrl } = await response.json();
            window.location.href = checkoutUrl;
        } catch (error) {
            console.error('Checkout error:', error);
            alert('Failed to start checkout. Please try again.');
        }
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-2">
                    {nextTier === 'pro' && <Zap className="h-5 w-5 text-primary" />}
                    {nextTier === 'team' && <Sparkles className="h-5 w-5 text-primary" />}
                    <CardTitle>Upgrade to {nextTier.charAt(0).toUpperCase() + nextTier.slice(1)}</CardTitle>
                </div>
                <CardDescription>
                    {nextTier === 'enterprise'
                        ? 'Custom terms for organizations at scale'
                        : CENCORI_PAID_PLANS[nextTier].description}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <TierBenefits tier={nextTier} />

                <div className="pt-4 border-t space-y-2">
                    {nextTier !== 'enterprise' ? (
                        <>
                            <Button
                                className="w-full"
                                size="lg"
                                onClick={() => handleUpgrade('monthly')}
                            >
                                ${pricing[nextTier].monthly}/month
                            </Button>
                            <Button
                                variant="outline"
                                className="w-full"
                                onClick={() => handleUpgrade('annual')}
                            >
                                ${pricing[nextTier].annual}/year <Badge className="ml-2" variant="secondary">Save 17%</Badge>
                            </Button>
                        </>
                    ) : (
                        <Button
                            className="w-full"
                            size="lg"
                            onClick={() => handleUpgrade('monthly')}
                        >
                            Contact Sales
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
