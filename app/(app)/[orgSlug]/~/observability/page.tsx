'use client';

import { use } from 'react';
import { Analytics01Icon } from '@hugeicons/core-free-icons';
import { ProjectPickerLanding } from '@/components/dashboard/ProjectPickerLanding';

interface PageProps {
    params: Promise<{ orgSlug: string }>;
}

export default function OrgObservabilityPickerPage({ params }: PageProps) {
    const { orgSlug } = use(params);
    return (
        <ProjectPickerLanding
            orgSlug={orgSlug}
            title="Observability"
            subtitle="Select a project to view its observability dashboard."
            icon={Analytics01Icon}
            destinationSuffix="observability"
            emptyStateBody="Observability metrics live inside projects. Create a project to start capturing traces and metrics."
        />
    );
}
