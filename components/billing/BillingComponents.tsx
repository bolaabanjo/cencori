'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowRight, Check, Sparkles, Zap, AlertTriangle } from 'lucide-react';
import { CENCORI_PAID_PLANS } from '@/lib/billing/plans';

interface UsageCardProps {
    used: number;
    limit: number;
    tier: 'free' | 'pro' | 'team' | 'enterprise';
    orgSlug: string;
}

export function UsageCard({ used, limit, tier, orgSlug }: UsageCardProps) {
    const percentage = Math.min((used / limit) * 100, 100);
    const isNearLimit = percentage >= 80;
    const isAtLimit = percentage >= 100;

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle>Monthly Usage</CardTitle>
                    <Badge variant={isAtLimit ? 'destructive' : isNearLimit ? 'secondary' : 'default'}>
                        {tier.toUpperCase()}
                    </Badge>
                </div>
                <CardDescription>
                    {used.toLocaleString()} / {limit.toLocaleString()} requests this month
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Progress value={percentage} className="h-3" />

                <div className="text-sm text-muted-foreground">
                    {isAtLimit ? (
                        <Alert>
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>
                                You&apos;ve reached your monthly limit. Upgrade to continue making requests.
                            </AlertDescription>
                        </Alert>
                    ) : isNearLimit ? (
                        <Alert>
                            <AlertDescription>
                                You&apos;re approaching your monthly limit ({Math.round(100 - percentage)}% remaining).
                            </AlertDescription>
                        </Alert>
                    ) : (
                        <p>{Math.round(percentage)}% used • Resets on the 1st of each month</p>
                    )}
                </div>

                {(isAtLimit || isNearLimit) && tier !== 'enterprise' && (
                    <Button
                        className="w-full"
                        onClick={() => window.location.href = `/pricing`}
                    >
                        Upgrade Now <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                )}
            </CardContent>
        </Card>
    );
}

interface TierBenefitsProps {
    tier: 'free' | 'pro' | 'team' | 'enterprise';
}

export function TierBenefits({ tier }: TierBenefitsProps) {
    const benefits = {
        free: [
            '1,000 requests/month',
            '1 project',
            'Basic security features',
            'Community support',
        ],
        pro: [
            '50,000 requests/month',
            'Unlimited projects',
            'All security features',
            'Priority support (24hr)',
            'Advanced analytics',
            'Webhooks',
        ],
        team: [
            '250,000 requests/month',
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
            limit: CENCORI_PAID_PLANS.pro.requestLimit.toLocaleString(),
        },
        team: {
            monthly: CENCORI_PAID_PLANS.team.prices.month / 100,
            annual: CENCORI_PAID_PLANS.team.prices.year / 100,
            limit: CENCORI_PAID_PLANS.team.requestLimit.toLocaleString(),
        },
        enterprise: { monthly: 'Custom', annual: 'Custom', limit: 'Unlimited' },
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
                    Get {pricing[nextTier].limit} requests/month
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
