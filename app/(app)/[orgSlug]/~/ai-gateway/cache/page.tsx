'use client';

import { use } from 'react';
import { Blockchain03Icon } from '@hugeicons/core-free-icons';
import { ProjectPickerLanding } from '@/components/dashboard/ProjectPickerLanding';

interface PageProps {
    params: Promise<{ orgSlug: string }>;
}

export default function OrgCachePickerPage({ params }: PageProps) {
    const { orgSlug } = use(params);
    return (
        <ProjectPickerLanding
            orgSlug={orgSlug}
            title="Cache"
            subtitle="Select a project to view its cache stats."
            icon={Blockchain03Icon}
            destinationSuffix="ai-gateway/cache"
            emptyStateBody="Cache stats live inside projects. Create a project to start seeing hit rates and savings."
        />
    );
}
