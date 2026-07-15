'use client';

import { use } from 'react';
import { AiCloudIcon } from '@hugeicons/core-free-icons';
import { ProjectPickerLanding } from '@/components/dashboard/ProjectPickerLanding';

interface PageProps {
    params: Promise<{ orgSlug: string }>;
}

export default function OrgBYOKPickerPage({ params }: PageProps) {
    const { orgSlug } = use(params);
    return (
        <ProjectPickerLanding
            orgSlug={orgSlug}
            title="BYOK"
            subtitle="Select a project to manage its provider keys."
            icon={AiCloudIcon}
            destinationSuffix="ai-gateway/providers"
            emptyStateBody="Provider keys live inside projects. Create a project to bring your own OpenAI, Anthropic, or other keys."
        />
    );
}
