'use client';

import Link from 'next/link';
import { LockClosedIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';

interface FeatureUpgradeWallProps {
    orgSlug: string;
    /** Human-readable feature name, e.g. "Analytics dashboard" */
    feature: string;
    /** Optional message from the API (falls back to a generic line) */
    message?: string;
}

/**
 * Inline page-level wall shown when a gated API route returns
 * 403 FEATURE_NOT_INCLUDED. Pair with fetchJsonWithFeatureGate().
 */
export function FeatureUpgradeWall({ orgSlug, feature, message }: FeatureUpgradeWallProps) {
    return (
        <div className="text-center py-16 flex flex-col items-center">
            <div className="w-10 h-10 rounded-md bg-secondary flex items-center justify-center mb-3">
                <LockClosedIcon className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">{feature} is available on paid plans</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                {message || `Upgrade your plan to unlock ${feature.toLowerCase()} for this project.`}
            </p>
            <Button asChild size="sm" className="mt-4 h-8 text-xs">
                <Link href={`/dashboard/organizations/${orgSlug}/billing`}>
                    Upgrade plan
                </Link>
            </Button>
        </div>
    );
}
