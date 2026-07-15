import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { canManageProjectIntegrations, getProjectAccessContext } from '@/lib/edge-integrations/access';
import { saveEdgeIntegrationCredentials } from '@/lib/edge-integrations/credentials';
import {
    getEdgeIntegrationRecordById,
    updateEdgeIntegrationById,
    upsertEdgeDeployment,
    upsertProjectEdgeIntegration,
} from '@/lib/edge-integrations/repository';
import {
    buildVercelLogIngestUrl,
    buildVercelWebhookUrl,
    createVercelLogIngestSecret,
    createVercelLogDrain,
    createVercelWebhook,
    exchangeVercelCodeForToken,
    getVercelIntegrationConfiguration,
    getVercelProject,
    getVercelProjectDomains,
    hasVercelProvisioningConfig,
    normalizeLatestVercelDeployment,
    normalizeVercelDomains,
} from '@/lib/edge-integrations/vercel';
import { parseVercelInstallState } from '@/lib/vercel-install-state';

function sanitizeRedirectPath(path: string | undefined, fallbackPath: string): string {
    if (!path) {
        return fallbackPath;
    }

    if (!path.startsWith('/') || path.startsWith('//')) {
        return fallbackPath;
    }

    return path;
}

function buildRedirectUrl(req: NextRequest, path: string, params?: Record<string, string>) {
    const url = new URL(path, req.url);

    for (const [key, value] of Object.entries(params || {})) {
        url.searchParams.set(key, value);
    }

    return url;
}

function getProvisioningErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
        return error.message;
    }

    return 'Failed to provision Vercel connection';
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const error = searchParams.get('error');
    const code = searchParams.get('code');
    const teamId = searchParams.get('teamId');
    const configurationId = searchParams.get('configurationId');
    const source = searchParams.get('source');
    const { payload, signatureValid } = parseVercelInstallState(searchParams.get('state'));

    const fallbackPath = payload.orgSlug && payload.projectSlug
        ? `/${payload.orgSlug}/${payload.projectSlug}/edge`
        : '/dashboard';
    const redirectPath = sanitizeRedirectPath(payload.redirect, fallbackPath);

    if (error) {
        return NextResponse.redirect(buildRedirectUrl(req, redirectPath, {
            vercel: 'callback_error',
            reason: error,
        }));
    }

    if (!signatureValid || !payload.projectId || !payload.userId) {
        return NextResponse.redirect(buildRedirectUrl(req, redirectPath, {
            vercel: 'invalid_state',
        }));
    }

    if (!code || !configurationId) {
        return NextResponse.redirect(buildRedirectUrl(req, redirectPath, {
            vercel: 'callback_error',
            reason: 'Missing Vercel installation parameters',
        }));
    }

    if (!hasVercelProvisioningConfig()) {
        return NextResponse.redirect(buildRedirectUrl(req, redirectPath, {
            vercel: 'not_configured',
        }));
    }

    const supabaseAdmin = createAdminClient();
    let createdIntegrationId: string | null = null;

    try {
        const { data: project, error: projectError } = await supabaseAdmin
            .from('projects')
            .select('id, organization_id')
            .eq('id', payload.projectId)
            .single();

        if (projectError || !project) {
            return NextResponse.redirect(buildRedirectUrl(req, redirectPath, {
                vercel: 'callback_error',
                reason: 'Project not found',
            }));
        }

        const access = await getProjectAccessContext(project.id, payload.userId);
        if (!access || !canManageProjectIntegrations(access)) {
            return NextResponse.redirect(buildRedirectUrl(req, redirectPath, {
                vercel: 'forbidden',
            }));
        }

        const tokenResponse = await exchangeVercelCodeForToken({
            code,
            teamId,
            originFallback: req.nextUrl.origin,
        });

        const resolvedTeamId = teamId || tokenResponse.team_id || null;
        const configuration = await getVercelIntegrationConfiguration({
            accessToken: tokenResponse.access_token,
            configurationId,
            teamId: resolvedTeamId,
        });

        const selectedProjectIds = Array.isArray(configuration.projects)
            ? [...new Set(configuration.projects.filter((value): value is string => typeof value === 'string' && value.length > 0))]
            : [];

        if (selectedProjectIds.length !== 1) {
            return NextResponse.redirect(buildRedirectUrl(req, redirectPath, {
                vercel: 'callback_error',
                reason: 'Select exactly one Vercel project during installation',
            }));
        }

        const vercelProject = await getVercelProject({
            accessToken: tokenResponse.access_token,
            projectId: selectedProjectIds[0],
            teamId: resolvedTeamId,
        });

        const vercelDomains = await getVercelProjectDomains({
            accessToken: tokenResponse.access_token,
            projectId: vercelProject.id,
            teamId: resolvedTeamId,
        });

        const normalizedDomains = normalizeVercelDomains(vercelDomains);
        const integration = await upsertProjectEdgeIntegration({
            projectId: project.id,
            organizationId: project.organization_id,
            provider: 'vercel',
            installedVia: source === 'marketplace' ? 'marketplace' : 'oauth',
            status: 'pending',
            externalAccountId: resolvedTeamId,
            externalProjectId: vercelProject.id,
            externalProjectName: vercelProject.name,
            externalProjectSlug: vercelProject.name,
            metadata: {
                source: 'vercel_oauth_callback',
                configurationId,
                projectSelection: configuration.projectSelection || (selectedProjectIds.length === 1 ? 'some' : 'all'),
                completedAt: configuration.completedAt || null,
                framework: vercelProject.framework || null,
            },
            capabilities: {
                logs: false,
                deployments: false,
                domains: normalizedDomains.length > 0,
            },
            connectedBy: payload.userId,
            domains: normalizedDomains,
        });

        createdIntegrationId = integration.id;

        const ingestSecret = createVercelLogIngestSecret({
            integrationId: integration.id,
            organizationId: project.organization_id,
        });

        const drain = await createVercelLogDrain({
            accessToken: tokenResponse.access_token,
            teamId: resolvedTeamId,
            projectId: vercelProject.id,
            endpoint: buildVercelLogIngestUrl(integration.id, req.nextUrl.origin),
            ingestSecret,
        });

        const webhook = await createVercelWebhook({
            accessToken: tokenResponse.access_token,
            teamId: resolvedTeamId,
            projectId: vercelProject.id,
            url: buildVercelWebhookUrl(integration.id, req.nextUrl.origin),
        });

        await saveEdgeIntegrationCredentials({
            integrationId: integration.id,
            projectId: project.id,
            organizationId: project.organization_id,
            provider: 'vercel',
            accessToken: tokenResponse.access_token,
            webhookSecret: webhook.secret || null,
            metadata: {
                teamId: resolvedTeamId,
                configurationId,
                drainId: drain.id,
                webhookId: webhook.id,
            },
        });

        const latestDeployment = normalizeLatestVercelDeployment(vercelProject);
        if (latestDeployment) {
            await upsertEdgeDeployment({
                integrationId: integration.id,
                projectId: project.id,
                organizationId: project.organization_id,
                provider: 'vercel',
                externalDeploymentId: latestDeployment.externalDeploymentId,
                environment: latestDeployment.environment,
                status: latestDeployment.status,
                deploymentUrl: latestDeployment.deploymentUrl,
                branchUrl: latestDeployment.branchUrl,
                commitSha: latestDeployment.commitSha,
                commitRef: latestDeployment.commitRef,
                metadata: latestDeployment.metadata,
                startedAt: latestDeployment.startedAt,
                readyAt: latestDeployment.readyAt,
            });
        }

        const existingRecord = await getEdgeIntegrationRecordById(integration.id);
        await updateEdgeIntegrationById(integration.id, {
            status: 'connected',
            capabilities: {
                logs: true,
                deployments: true,
                domains: true,
            },
            lastSyncedAt: new Date().toISOString(),
            lastError: null,
            metadata: {
                ...((existingRecord?.metadata && typeof existingRecord.metadata === 'object' && !Array.isArray(existingRecord.metadata))
                    ? existingRecord.metadata as Record<string, unknown>
                    : {}),
                source: 'vercel_oauth_callback',
                teamId: resolvedTeamId,
                configurationId,
                drainId: drain.id,
                projectSelection: configuration.projectSelection || 'some',
                provisioningStatus: 'connected',
            },
        });

        return NextResponse.redirect(buildRedirectUrl(req, redirectPath, {
            vercel: 'connected',
        }));
    } catch (callbackError) {
        console.error('[Vercel Callback] Failed to provision integration:', callbackError);

        if (createdIntegrationId) {
            try {
                await updateEdgeIntegrationById(createdIntegrationId, {
                    status: 'error',
                    lastError: getProvisioningErrorMessage(callbackError),
                });
            } catch (updateError) {
                console.error('[Vercel Callback] Failed to persist provisioning error state:', updateError);
            }
        }

        return NextResponse.redirect(buildRedirectUrl(req, redirectPath, {
            vercel: 'callback_error',
            reason: getProvisioningErrorMessage(callbackError),
        }));
    }
}
