'use client';

import { use } from 'react';
import { AirdropIcon } from '@hugeicons/core-free-icons';
import { ProjectPickerLanding } from '@/components/dashboard/ProjectPickerLanding';

interface PageProps {
    params: Promise<{ orgSlug: string }>;
}

export default function OrgWebhooksPickerPage({ params }: PageProps) {
    const { orgSlug } = use(params);
    return (
        <ProjectPickerLanding
            orgSlug={orgSlug}
            title="Webhooks"
            subtitle="Select a project to manage its webhooks."
            icon={AirdropIcon}
            destinationSuffix="webhooks"
            emptyStateBody="Webhooks live inside projects. Create a project to subscribe to events and delivery notifications."
        />
    );
}
