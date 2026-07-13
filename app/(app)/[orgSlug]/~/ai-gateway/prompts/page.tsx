'use client';

import { use } from 'react';
import { AiChat01Icon } from '@hugeicons/core-free-icons';
import { ProjectPickerLanding } from '@/components/dashboard/ProjectPickerLanding';

interface PageProps {
    params: Promise<{ orgSlug: string }>;
}

export default function OrgPromptsPickerPage({ params }: PageProps) {
    const { orgSlug } = use(params);
    return (
        <ProjectPickerLanding
            orgSlug={orgSlug}
            title="Prompts"
            subtitle="Select a project to view its saved prompts."
            icon={AiChat01Icon}
            destinationSuffix="ai-gateway/prompts"
            emptyStateBody="Prompts live inside projects. Create a project to start saving reusable prompts."
        />
    );
}
