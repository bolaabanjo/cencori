'use client';

import { use } from 'react';
import { PuzzleIcon } from '@hugeicons/core-free-icons';
import { ProjectPickerLanding } from '@/components/dashboard/ProjectPickerLanding';

interface PageProps {
    params: Promise<{ orgSlug: string }>;
}

export default function OrgEdgePickerPage({ params }: PageProps) {
    const { orgSlug } = use(params);
    return (
        <ProjectPickerLanding
            orgSlug={orgSlug}
            title="Edge"
            subtitle="Select a project to manage its edge integrations."
            icon={PuzzleIcon}
            destinationSuffix="edge"
            emptyStateBody="Edge integrations live inside projects. Create a project to connect to Vercel, Cloudflare, or your own runtime."
        />
    );
}
