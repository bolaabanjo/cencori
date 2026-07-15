'use client';

import { use } from 'react';
import { CreditCardAcceptIcon } from '@hugeicons/core-free-icons';
import { ProjectPickerLanding } from '@/components/dashboard/ProjectPickerLanding';

interface PageProps {
    params: Promise<{ orgSlug: string }>;
}

export default function OrgEndUserBillingPickerPage({ params }: PageProps) {
    const { orgSlug } = use(params);
    return (
        <ProjectPickerLanding
            orgSlug={orgSlug}
            title="End-User Billing"
            subtitle="Select a project to configure end-user billing."
            icon={CreditCardAcceptIcon}
            destinationSuffix="end-user-billing"
            emptyStateBody="End-user billing lives inside projects. Create a project to bill your users for their AI usage."
        />
    );
}
