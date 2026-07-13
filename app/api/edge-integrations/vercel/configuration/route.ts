import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { listEdgeIntegrationRecordsByProviderAndConfigurationId } from '@/lib/edge-integrations/repository';

function getAppBaseUrl(req: NextRequest): string {
    return (
        process.env.VERCEL_INTEGRATION_PUBLIC_BASE_URL?.replace(/\/$/, '')
        || process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
        || process.env.NEXT_PUBLIC_URL?.replace(/\/$/, '')
        || req.nextUrl.origin
    );
}

export async function GET(req: NextRequest) {
    const configurationId = req.nextUrl.searchParams.get('configurationId')?.trim();
    const baseUrl = getAppBaseUrl(req);

    if (!configurationId) {
        return NextResponse.redirect(new URL('/dashboard', baseUrl));
    }

    try {
        const integrations = await listEdgeIntegrationRecordsByProviderAndConfigurationId('vercel', configurationId);
        const integration = integrations[0];

        if (!integration) {
            return NextResponse.redirect(new URL('/dashboard?vercel=configuration_not_found', baseUrl));
        }

        const supabaseAdmin = createAdminClient();
        const { data: project, error: projectError } = await supabaseAdmin
            .from('projects')
            .select('slug, organization_id')
            .eq('id', integration.project_id)
            .maybeSingle();

        if (projectError || !project?.slug || !project.organization_id) {
            return NextResponse.redirect(new URL('/dashboard?vercel=configuration_not_found', baseUrl));
        }

        const { data: organization, error: organizationError } = await supabaseAdmin
            .from('organizations')
            .select('slug')
            .eq('id', project.organization_id)
            .maybeSingle();

        if (organizationError || !organization?.slug) {
            return NextResponse.redirect(new URL('/dashboard?vercel=configuration_not_found', baseUrl));
        }

        const redirectUrl = new URL(
            `/${organization.slug}/${project.slug}/edge`,
            baseUrl
        );
        redirectUrl.searchParams.set('vercel', 'configuration_opened');
        redirectUrl.searchParams.set('configurationId', configurationId);

        return NextResponse.redirect(redirectUrl);
    } catch (error) {
        console.error('[Vercel Configuration] Failed to resolve configuration URL:', error);
        return NextResponse.redirect(new URL('/dashboard?vercel=configuration_error', baseUrl));
    }
}
