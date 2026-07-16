'use client';

import { useState, useEffect } from 'react';
import { Zap, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';
import { UpgradeDialog } from '@/components/billing/UpgradeDialog';

interface UsageLimitBannerProps {
    orgId: string;
    orgSlug: string;
}

interface OrgUsage {
    subscription_tier: 'free' | 'pro' | 'team' | 'enterprise';
    monthly_requests_used: number;
    monthly_request_limit: number;
}

export function UsageLimitBanner({ orgId, orgSlug }: UsageLimitBannerProps) {
    const [usage, setUsage] = useState<OrgUsage | null>(null);
    const [dismissed, setDismissed] = useState(false);
    const [upgradeOpen, setUpgradeOpen] = useState(false);

    useEffect(() => {
        const fetch = async () => {
            const { data } = await supabase
                .from('organizations')
                .select('subscription_tier, monthly_requests_used, monthly_request_limit')
                .eq('id', orgId)
                .single();
            if (data) setUsage(data);
        };
        fetch();
    }, [orgId]);

    if (!usage || dismissed) return null;

    const { subscription_tier, monthly_requests_used, monthly_request_limit } = usage;
    const pct = monthly_request_limit > 0
        ? Math.round((monthly_requests_used / monthly_request_limit) * 100)
        : 0;

    // Only show at 80%+
    if (pct < 80) return null;
    // Don't nag paid enterprise users
    if (subscription_tier === 'enterprise') return null;

    const isAtLimit = pct >= 100;
    const canUpgrade = subscription_tier === 'free';

    const reason = isAtLimit
        ? `You've used all ${monthly_request_limit.toLocaleString()} requests on your ${subscription_tier} plan this month. API calls are now blocked.`
        : `You've used ${pct}% of your ${monthly_request_limit.toLocaleString()} monthly requests.`;

    return (
        <>
            <div
                className={cn(
                    'flex items-center gap-3 px-4 py-2.5 text-xs border-b',
                    isAtLimit
                        ? 'bg-red-500/5 border-red-500/20 text-red-600 dark:text-red-400'
                        : 'bg-amber-500/5 border-amber-500/20 text-amber-600 dark:text-amber-400'
                )}
            >
                <Zap className="w-3.5 h-3.5 shrink-0" />

                <span className="flex-1">{reason}</span>

                {/* Progress bar */}
                <div className="hidden sm:flex items-center gap-2">
                    <div className="w-20 h-1 rounded-full bg-current/20 overflow-hidden">
                        <div
                            className={cn(
                                'h-full rounded-full transition-all',
                                isAtLimit ? 'bg-red-500' : 'bg-amber-500'
                            )}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                    </div>
                    <span className="font-medium tabular-nums">{Math.min(pct, 100)}%</span>
                </div>

                {canUpgrade && (
                    <Button
                        size="sm"
                        variant="default"
                        className="h-6 px-3 text-[11px] rounded-full shrink-0"
                        onClick={() => setUpgradeOpen(true)}
                    >
                        Upgrade
                    </Button>
                )}

                <button
                    onClick={() => setDismissed(true)}
                    className="ml-1 opacity-50 hover:opacity-100 transition-opacity shrink-0"
                    aria-label="Dismiss"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>

            {canUpgrade && (
                <UpgradeDialog
                    open={upgradeOpen}
                    onOpenChange={setUpgradeOpen}
                    orgId={orgId}
                    orgSlug={orgSlug}
                    currentTier="free"
                    reason={reason}
                    recommendedTier="pro"
                />
            )}
        </>
    );
}
