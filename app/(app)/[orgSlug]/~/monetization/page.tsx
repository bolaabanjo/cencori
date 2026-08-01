'use client';

import { use } from 'react';
import { CreditCardAcceptIcon } from '@hugeicons/core-free-icons';
import { ProjectPickerLanding } from '@/components/dashboard/ProjectPickerLanding';

interface PageProps {
    params: Promise<{ orgSlug: string }>;
}

export default function OrgMonetizationPickerPage({ params }: PageProps) {
    const { orgSlug } = use(params);
    return (
        <ProjectPickerLanding
            orgSlug={orgSlug}
            title="Monetization"
            subtitle="Select a project to manage AI monetization."
            icon={CreditCardAcceptIcon}
            destinationSuffix="monetization"
            emptyStateBody="Monetization lives inside projects. Create a project to meter usage, set pricing, and bill your customers."
        />
    );
}
