'use client';

import { use } from 'react';
import { AiChemistry01Icon } from '@hugeicons/core-free-icons';
import { ProjectPickerLanding } from '@/components/dashboard/ProjectPickerLanding';

interface PageProps {
    params: Promise<{ orgSlug: string }>;
}

export default function OrgPlaygroundPickerPage({ params }: PageProps) {
    const { orgSlug } = use(params);
    return (
        <ProjectPickerLanding
            orgSlug={orgSlug}
            title="Playground"
            subtitle="Select a project to open the playground."
            icon={AiChemistry01Icon}
            destinationSuffix="ai-gateway/playground"
            emptyStateBody="The playground runs inside a project so it uses your keys, quotas, and safety config. Create a project to start experimenting."
        />
    );
}
