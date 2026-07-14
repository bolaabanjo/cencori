'use client';

import { use } from 'react';
import { DiscoverSquareIcon } from '@hugeicons/core-free-icons';
import { ProjectPickerLanding } from '@/components/dashboard/ProjectPickerLanding';

interface PageProps {
    params: Promise<{ orgSlug: string }>;
}

export default function OrgAiGatewayPickerPage({ params }: PageProps) {
    const { orgSlug } = use(params);
    return (
        <ProjectPickerLanding
            orgSlug={orgSlug}
            title="AI Gateway"
            subtitle="Select a project to view its AI Gateway overview."
            icon={DiscoverSquareIcon}
            destinationSuffix="ai-gateway"
            emptyStateBody="AI Gateway usage is scoped per project. Create a project to start making AI requests."
        />
    );
}
