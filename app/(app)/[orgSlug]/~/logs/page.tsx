'use client';

import { use } from 'react';
import { Activity03Icon } from '@hugeicons/core-free-icons';
import { ProjectPickerLanding } from '@/components/dashboard/ProjectPickerLanding';

interface PageProps {
    params: Promise<{ orgSlug: string }>;
}

export default function OrgLogsPickerPage({ params }: PageProps) {
    const { orgSlug } = use(params);
    return (
        <ProjectPickerLanding
            orgSlug={orgSlug}
            title="Logs"
            subtitle="Select a project to view its request logs."
            icon={Activity03Icon}
            destinationSuffix="logs"
            emptyStateBody="Logs live inside projects. Create a project to start capturing request logs."
        />
    );
}
