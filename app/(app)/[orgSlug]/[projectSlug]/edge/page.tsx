'use client';

import React, { use, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cloudflare, Aws, Azure, Google } from '@lobehub/icons';
import { Check, ExternalLink, Link2, Loader2, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { VercelLogo, SupabaseLogo } from '@/components/icons/BrandIcons';
import type { EdgeDeploymentSummary, EdgeIntegration } from '@/lib/edge-integrations/types';

interface PageProps {
    params: Promise<{ orgSlug: string; projectSlug: string }>;
}

interface ProjectData {
    projectId: string;
    projectName: string;
}

interface EdgeIntegrationsResponse {
    integrations: EdgeIntegration[];
    permissions: {
        canManage: boolean;
    };
}

type ProviderCardId = 'vercel' | 'supabase' | 'cloudflare' | 'aws' | 'azure' | 'gcp';

interface ProviderCardDefinition {
    id: ProviderCardId;
    name: string;
    description: string;
    features: string[];
    icon: React.ComponentType<{ className?: string }>;
    availability: 'active' | 'planned';
}

const PROVIDER_CARDS: ProviderCardDefinition[] = [
    {
        id: 'vercel',
        name: 'Vercel',
        description: 'Connect Vercel to stream deployment metadata into Cencori.',
        features: [
            'One-click marketplace install',
            'Automatic deployment sync',
            'HTTP traffic and domain awareness',
        ],
        icon: VercelLogo,
        availability: 'active',
    },
    {
        id: 'supabase',
        name: 'Supabase',
        description: 'Bring Supabase edge runtime traffic into the same HTTP observability plane later.',
        features: [
            'Edge function traffic',
            'Domain and project mapping',
            'Deployment-aware observability',
        ],
        icon: SupabaseLogo,
        availability: 'planned',
    },
    {
        id: 'cloudflare',
        name: 'Cloudflare',
        description: 'Normalize Cloudflare Workers traffic into the same HTTP traffic and deployment model.',
        features: [
            'Workers telemetry',
            'Global edge domains',
            'Runtime metadata normalization',
        ],
        icon: CloudflareIcon,
        availability: 'planned',
    },
    {
        id: 'aws',
        name: 'AWS',
        description: 'Map AWS edge and serverless traffic into the shared integration system when the adapter ships.',
        features: [
            'Lambda and API traffic',
            'Domain and stage sync',
            'Deployment snapshots',
        ],
        icon: AwsIcon,
        availability: 'planned',
    },
    {
        id: 'azure',
        name: 'Azure',
        description: 'Keep Azure as another source for zero-code HTTP observability and deployment context.',
        features: [
            'Functions telemetry',
            'Deployment normalization',
            'Custom domain sync',
        ],
        icon: AzureIcon,
        availability: 'planned',
    },
    {
        id: 'gcp',
        name: 'Google Cloud',
        description: 'Add Google Cloud as another adapter into the same project-linked HTTP traffic plane.',
        features: [
            'Cloud Run and Functions traffic',
            'Revision metadata',
            'Domain inventory',
        ],
        icon: GoogleCloudIcon,
        availability: 'planned',
    },
];

function useProjectId(orgSlug: string, projectSlug: string) {
    return useQuery({
        queryKey: ['projectId', orgSlug, projectSlug],
        queryFn: async () => {
            const { data: org } = await supabase
                .from('organizations')
                .select('id')
                .eq('slug', orgSlug)
                .single();

            if (!org) throw new Error('Organization not found');

            const { data: project } = await supabase
                .from('projects')
                .select('id, name')
                .eq('slug', projectSlug)
                .eq('organization_id', org.id)
                .single();

            if (!project) throw new Error('Project not found');

            return {
                projectId: project.id,
                projectName: project.name,
            } satisfies ProjectData;
        },
        staleTime: 5 * 60 * 1000,
    });
}

function useEdgeIntegrations(projectId: string | undefined) {
    return useQuery({
        queryKey: ['edgeIntegrations', projectId],
        queryFn: async () => {
            const response = await fetch(`/api/projects/${projectId}/edge-integrations`);
            if (!response.ok) {
                throw new Error('Failed to load edge integrations');
            }

            return response.json() as Promise<EdgeIntegrationsResponse>;
        },
        enabled: !!projectId,
        staleTime: 30 * 1000,
    });
}

export default function EdgePage({ params }: PageProps) {
    const { orgSlug, projectSlug } = use(params);
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const queryClient = useQueryClient();
    const [connectingProvider, setConnectingProvider] = useState<ProviderCardId | null>(null);

    const { data: projectData, isLoading: projectLoading } = useProjectId(orgSlug, projectSlug);
    const { data: edgeData, isLoading: integrationsLoading } = useEdgeIntegrations(projectData?.projectId);

    const vercelIntegration = useMemo(
        () => edgeData?.integrations.find((integration) => integration.provider === 'vercel') ?? null,
        [edgeData?.integrations]
    );

    const disconnectMutation = useMutation({
        mutationFn: async (integrationId: string) => {
            const response = await fetch(`/api/projects/${projectData?.projectId}/edge-integrations/${integrationId}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const body = await response.json().catch(() => ({ error: 'Failed to disconnect integration' }));
                throw new Error(body.error || 'Failed to disconnect integration');
            }
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['edgeIntegrations', projectData?.projectId] });
            toast.success('Vercel connection removed');
        },
        onError: (error) => {
            console.error('Failed to disconnect Vercel integration:', error);
            toast.error(error instanceof Error ? error.message : 'Failed to disconnect Vercel connection');
        },
    });

    useEffect(() => {
        const vercelState = searchParams.get('vercel');
        if (!vercelState) {
            return;
        }

        const reason = searchParams.get('reason');

        if (vercelState === 'not_configured') {
            toast.error('Vercel install is not configured yet.');
        } else if (vercelState === 'forbidden') {
            toast.error('You need admin access on this project to connect Vercel.');
        } else if (vercelState === 'invalid_state') {
            toast.error('The Vercel install session is invalid or expired. Start the connection again.');
        } else if (vercelState === 'connected') {
            toast.success('Vercel connected and provisioned.');
        } else if (vercelState === 'callback_error') {
            toast.error(reason || 'Vercel installation did not complete.');
        } else if (vercelState === 'connected_pending') {
            toast.success('Vercel installation captured. Project sync is now pending provisioning.');
        }

        const nextSearchParams = new URLSearchParams(searchParams.toString());
        nextSearchParams.delete('vercel');
        nextSearchParams.delete('reason');
        router.replace(nextSearchParams.size > 0 ? `${pathname}?${nextSearchParams}` : pathname, { scroll: false });
    }, [pathname, router, searchParams]);

    const canManage = edgeData?.permissions.canManage ?? false;

    const handleVercelConnect = () => {
        if (!projectData?.projectId || connectingProvider) {
            return;
        }

        setConnectingProvider('vercel');

        const params = new URLSearchParams({
            orgSlug,
            projectSlug,
        });

        window.location.href = `/api/projects/${projectData.projectId}/edge-integrations/vercel/install?${params.toString()}`;
    };

    if (projectLoading) {
        return (
            <div className="w-full max-w-5xl mx-auto px-6 py-8 space-y-6">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-96 max-w-full" />
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, index) => (
                        <Skeleton key={index} className="h-64 rounded-xl" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-5xl mx-auto px-6 py-8 space-y-6">
            <div>
                <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-xl font-semibold tracking-tight">Edge Integrations</h1>
                    <Badge
                        variant="outline"
                        className="text-[10px] px-2 py-0.5 rounded-full border-amber-500/50 text-amber-500"
                    >
                        Beta
                    </Badge>
                </div>
                <p className="text-sm text-muted-foreground max-w-2xl">
                    Connect Cencori to deployment platforms for HTTP traffic, observability, and deployment awareness.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {PROVIDER_CARDS.map((provider) => (
                    <IntegrationCard
                        key={provider.id}
                        icon={provider.icon}
                        name={provider.name}
                        description={provider.description}
                        status={provider.id === 'vercel' ? toDisplayStatus(vercelIntegration?.status) : null}
                        features={provider.features}
                        availability={provider.availability}
                        onConnect={provider.id === 'vercel' ? handleVercelConnect : undefined}
                        showActionIcon={provider.id !== 'vercel'}
                        connectDisabled={
                            provider.id !== 'vercel'
                                || !canManage
                                || !!connectingProvider
                                || vercelIntegration?.status === 'connected'
                                || vercelIntegration?.status === 'pending'
                        }
                        connectLabel={
                            provider.id !== 'vercel'
                                ? 'Coming Soon'
                                : connectingProvider === 'vercel'
                                    ? 'Connecting...'
                                    : vercelIntegration?.status === 'connected'
                                        ? 'Connected'
                                        : vercelIntegration?.status === 'pending'
                                            ? 'Pending'
                                            : 'Connect'
                        }
                    />
                ))}
            </div>

            {integrationsLoading ? (
                <Skeleton className="h-44 rounded-xl" />
            ) : vercelIntegration ? (
                <section className="rounded-xl border border-border/50 bg-card p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <h2 className="text-sm font-semibold">Vercel connection</h2>
                                <StatusBadge status={toDisplayStatus(vercelIntegration.status) || 'pending'} />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {vercelIntegration.externalProjectName}
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                <Badge variant="outline" className="rounded-full text-[10px]">
                                    {vercelIntegration.installedVia}
                                </Badge>
                                {vercelIntegration.externalAccountName && (
                                    <span>Team: {vercelIntegration.externalAccountName}</span>
                                )}
                                {vercelIntegration.lastSyncedAt && (
                                    <span>Last sync: {formatDateTime(vercelIntegration.lastSyncedAt)}</span>
                                )}
                            </div>
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-full"
                            onClick={() => disconnectMutation.mutate(vercelIntegration.id)}
                            disabled={!canManage || disconnectMutation.isPending}
                        >
                            {disconnectMutation.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            ) : (
                                <Unlink className="h-3.5 w-3.5 mr-1.5" />
                            )}
                            Disconnect
                        </Button>
                    </div>

                    {(vercelIntegration.domains.length > 0 || vercelIntegration.latestDeployment) && (
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <div className="rounded-lg border border-border/40 bg-background/40 p-4">
                                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground mb-2">
                                    Domains
                                </p>
                                {vercelIntegration.domains.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">No domains synced yet.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {vercelIntegration.domains.map((domain) => (
                                            <div key={domain.id} className="flex items-center justify-between gap-3 text-xs">
                                                <span className="truncate">{domain.domain}</span>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {domain.isPrimary && (
                                                        <Badge variant="outline" className="rounded-full text-[10px]">
                                                            Primary
                                                        </Badge>
                                                    )}
                                                    <span className="text-muted-foreground capitalize">{domain.environment}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="rounded-lg border border-border/40 bg-background/40 p-4">
                                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground mb-2">
                                    Latest deployment
                                </p>
                                {!vercelIntegration.latestDeployment ? (
                                    <p className="text-xs text-muted-foreground">No deployment events synced yet.</p>
                                ) : (
                                    <div className="space-y-2 text-xs">
                                        <div className="flex items-center gap-2">
                                            <StatusBadge status={mapDeploymentStatus(vercelIntegration.latestDeployment.status)} />
                                            <span className="text-muted-foreground capitalize">
                                                {vercelIntegration.latestDeployment.environment}
                                            </span>
                                        </div>
                                        {vercelIntegration.latestDeployment.commitRef && (
                                            <p className="text-muted-foreground truncate">{vercelIntegration.latestDeployment.commitRef}</p>
                                        )}
                                        {vercelIntegration.latestDeployment.deploymentUrl && (
                                            <a
                                                href={ensureHttps(vercelIntegration.latestDeployment.deploymentUrl)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-primary hover:underline"
                                            >
                                                Open deployment
                                                <ExternalLink className="h-3 w-3" />
                                            </a>
                                        )}
                                        <p className="text-muted-foreground">
                                            {formatDateTime(vercelIntegration.latestDeployment.createdAt)}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {vercelIntegration.lastError && (
                        <p className="mt-4 text-xs text-red-400">{vercelIntegration.lastError}</p>
                    )}
                </section>
            ) : null}
        </div>
    );
}

function IntegrationCard({
    icon: Icon,
    name,
    description,
    status,
    features,
    availability,
    onConnect,
    showActionIcon,
    connectLabel,
    connectDisabled,
}: {
    icon: React.ComponentType<{ className?: string }>;
    name: string;
    description: string;
    status: 'connected' | 'pending' | 'error' | null;
    features: string[];
    availability: 'active' | 'planned';
    onConnect?: () => void;
    showActionIcon: boolean;
    connectLabel: string;
    connectDisabled: boolean;
}) {
    return (
        <div className="rounded-xl border border-border/50 bg-card p-5 flex flex-col">
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                        <Icon className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold">{name}</h3>
                            {availability === 'planned' && (
                                <Badge
                                    variant="outline"
                                    className="text-[10px] px-1.5 py-0 rounded-full border-amber-500/50 text-amber-500"
                                >
                                    Soon
                                </Badge>
                            )}
                        </div>
                        {status && <StatusBadge status={status} />}
                    </div>
                </div>
            </div>

            <p className="text-xs text-muted-foreground mb-4 flex-1">
                {description}
            </p>

            <ul className="space-y-1.5 mb-4">
                {features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Check className="w-3 h-3 text-emerald-500" />
                        {feature}
                    </li>
                ))}
            </ul>

            <Button
                variant={availability === 'active' ? 'default' : 'secondary'}
                className={cn(
                    'w-full h-9 rounded-full text-sm',
                    availability === 'planned' && 'text-muted-foreground'
                )}
                onClick={onConnect}
                disabled={connectDisabled}
            >
                {showActionIcon && (
                    connectLabel === 'Connecting...' ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                        <Link2 className="w-4 h-4 mr-2" />
                    )
                )}
                {connectLabel}
            </Button>
        </div>
    );
}

function StatusBadge({ status }: { status: 'connected' | 'pending' | 'error' }) {
    const config = {
        connected: { label: 'Connected', className: 'text-emerald-500 bg-emerald-500/10' },
        pending: { label: 'Pending', className: 'text-amber-500 bg-amber-500/10' },
        error: { label: 'Error', className: 'text-red-500 bg-red-500/10' },
    } as const;

    const item = config[status];

    return (
        <span className={cn('text-[10px] px-2 py-1 rounded-full font-medium uppercase tracking-[0.12em]', item.className)}>
            {item.label}
        </span>
    );
}

function mapDeploymentStatus(status: EdgeDeploymentSummary['status']): 'connected' | 'pending' | 'error' {
    return status === 'ready' || status === 'promoted'
        ? 'connected'
        : status === 'error' || status === 'canceled'
            ? 'error'
            : 'pending';
}

function toDisplayStatus(
    status: EdgeIntegration['status'] | null | undefined
): 'connected' | 'pending' | 'error' | null {
    if (status === 'connected' || status === 'pending' || status === 'error') {
        return status;
    }

    return null;
}

function ensureHttps(url: string): string {
    return url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
}

function formatDateTime(value: string): string {
    return new Date(value).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function CloudflareIcon({ className }: { className?: string }) {
    return (
        <div className={className}>
            <Cloudflare.Color size={20} />
        </div>
    );
}

function AwsIcon({ className }: { className?: string }) {
    return (
        <div className={className}>
            <Aws.Color size={20} />
        </div>
    );
}

function AzureIcon({ className }: { className?: string }) {
    return (
        <div className={className}>
            <Azure.Color size={20} />
        </div>
    );
}

function GoogleCloudIcon({ className }: { className?: string }) {
    return (
        <div className={className}>
            <Google.Color size={20} />
        </div>
    );
}
