'use client';

import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import LockedIcon from '@hugeicons/core-free-icons/LockedIcon';
import { BorderBeam } from 'border-beam';
import { Button } from '@/components/ui/button';
import { UpgradeDialog } from '@/components/billing/UpgradeDialog';
import { cn } from '@/lib/utils';
import type { PaidPlanTier } from '@/lib/billing/plans';

interface FeatureUpgradeWallProps {
    orgSlug: string;
    /** Human-readable feature name, e.g. "Analytics dashboard" */
    feature: string;
    /** Optional message from the API (falls back to a generic line) */
    message?: string;
    className?: string;
    variant?: 'wall' | 'inline';
    orgId: string;
    orgName?: string;
    currentTier?: string | null;
    recommendedTier?: PaidPlanTier;
    returnPath?: string;
}

/**
 * Inline page-level wall shown when a gated API route returns
 * 403 FEATURE_NOT_INCLUDED. Pair with fetchJsonWithFeatureGate().
 */
export function FeatureUpgradeWall({
    orgSlug,
    feature,
    message,
    className,
    variant = 'wall',
    orgId,
    orgName,
    currentTier,
    recommendedTier = 'pro',
    returnPath,
}: FeatureUpgradeWallProps) {
    const [upgradeOpen, setUpgradeOpen] = useState(false);
    const checkoutTier = currentTier === 'pro' || currentTier === 'team' ? currentTier : 'free';
    const upgradeDialog = (
        <UpgradeDialog
            open={upgradeOpen}
            onOpenChange={setUpgradeOpen}
            orgId={orgId}
            orgSlug={orgSlug}
            orgName={orgName}
            currentTier={checkoutTier}
            reason={message || `${feature} requires a paid plan.`}
            recommendedTier={recommendedTier}
            checkoutMode="direct"
            returnPath={returnPath}
        />
    );

    if (variant === 'inline') {
        return (
            <>
                <BorderBeam
                    size="md"
                    colorVariant="colorful"
                    strength={0.59}
                    className={className}
                >
                    <div className="flex items-center justify-between gap-4 overflow-hidden rounded-md border border-border/35 bg-card px-4 py-3">
                        <div className="min-w-0">
                            <p className="text-xs font-medium">{feature}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {message || `Upgrade your plan to unlock ${feature.toLowerCase()}.`}
                            </p>
                        </div>
                        <Button size="sm" className="h-8 shrink-0 text-xs" onClick={() => setUpgradeOpen(true)}>
                            Upgrade
                        </Button>
                    </div>
                </BorderBeam>
                {upgradeDialog}
            </>
        );
    }

    return (
        <>
            <div
                className={cn(
                    "flex flex-col items-center overflow-hidden rounded-md border border-border/35 bg-card py-16 text-center",
                    className,
                )}
            >
                <div className="w-10 h-10 rounded-md bg-secondary flex items-center justify-center mb-3">
                    <HugeiconsIcon icon={LockedIcon} className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">{feature} is available on paid plans</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    {message || `Upgrade your plan to unlock ${feature.toLowerCase()} for this project.`}
                </p>
                <Button size="sm" className="mt-4 h-8 text-xs" onClick={() => setUpgradeOpen(true)}>
                    Upgrade plan
                </Button>
            </div>
            {upgradeDialog}
        </>
    );
}
