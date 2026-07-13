'use client';

import { use } from 'react';
import { AiLockIcon } from '@hugeicons/core-free-icons';
import { ProjectPickerLanding } from '@/components/dashboard/ProjectPickerLanding';

interface PageProps {
    params: Promise<{ orgSlug: string }>;
}

export default function OrgSecurityPickerPage({ params }: PageProps) {
    const { orgSlug } = use(params);
    return (
        <ProjectPickerLanding
            orgSlug={orgSlug}
            title="Security"
            subtitle="Select a project to view its security posture."
            icon={AiLockIcon}
            destinationSuffix="security"
            emptyStateBody="Security controls live inside projects. Create a project to configure PII redaction, prompt filters, and audit logs."
        />
    );
}
