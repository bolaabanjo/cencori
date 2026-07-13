'use client';

import { use } from 'react';
import { AiSettingIcon } from '@hugeicons/core-free-icons';
import { ProjectPickerLanding } from '@/components/dashboard/ProjectPickerLanding';

interface PageProps {
    params: Promise<{ orgSlug: string }>;
}

export default function OrgCustomProvidersPickerPage({ params }: PageProps) {
    const { orgSlug } = use(params);
    return (
        <ProjectPickerLanding
            orgSlug={orgSlug}
            title="Custom Providers"
            subtitle="Select a project to manage custom providers."
            icon={AiSettingIcon}
            destinationSuffix="ai-gateway/custom-providers"
            emptyStateBody="Custom providers live inside projects. Create a project to plug in your own hosted models."
        />
    );
}
