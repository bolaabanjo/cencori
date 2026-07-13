import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { canManageProjectIntegrations, getProjectAccessContext } from '@/lib/edge-integrations/access';
import { hasVercelProvisioningConfig } from '@/lib/edge-integrations/vercel';
import { createVercelInstallState, hasVercelInstallStateSecret } from '@/lib/vercel-install-state';

function buildEdgePath(orgSlug: string | null, projectSlug: string | null): string {
    if (!orgSlug || !projectSlug) {
        return '/dashboard';
    }

    return `/${orgSlug}/${projectSlug}/edge`;
}

function buildInstallUrl(state: string): string | null {
    const configuredUrl = process.env.VERCEL_INTEGRATION_INSTALL_URL?.trim();
    const integrationSlug = process.env.VERCEL_INTEGRATION_SLUG?.trim();

    const url = configuredUrl || (integrationSlug ? `https://vercel.com/integrations/${integrationSlug}/new` : null);
    if (!url) {
        return null;
    }

    const parsedUrl = new URL(url);
    parsedUrl.searchParams.set('state', state);
    return parsedUrl.toString();
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    const requestUrl = new URL(req.url);
    const orgSlug = requestUrl.searchParams.get('orgSlug');
    const projectSlug = requestUrl.searchParams.get('projectSlug');
    const edgePath = buildEdgePath(orgSlug, projectSlug);

    if (userError || !user) {
        const redirectUrl = new URL(edgePath, req.url);
        redirectUrl.searchParams.set('vercel', 'forbidden');
        return NextResponse.redirect(redirectUrl);
    }

    try {
        const { projectId } = await params;
        const access = await getProjectAccessContext(projectId, user.id);

        if (!access || !canManageProjectIntegrations(access)) {
            const redirectUrl = new URL(edgePath, req.url);
            redirectUrl.searchParams.set('vercel', 'forbidden');
            return NextResponse.redirect(redirectUrl);
        }

        if (!hasVercelInstallStateSecret() || !hasVercelProvisioningConfig()) {
            const redirectUrl = new URL(edgePath, req.url);
            redirectUrl.searchParams.set('vercel', 'not_configured');
            return NextResponse.redirect(redirectUrl);
        }

        const state = createVercelInstallState({
            source: 'dashboard',
            projectId,
            orgSlug: orgSlug || undefined,
            projectSlug: projectSlug || undefined,
            redirect: edgePath,
            userId: user.id,
        });

        const installUrl = buildInstallUrl(state);
        if (!installUrl) {
            const redirectUrl = new URL(edgePath, req.url);
            redirectUrl.searchParams.set('vercel', 'not_configured');
            return NextResponse.redirect(redirectUrl);
        }

        return NextResponse.redirect(installUrl);
    } catch (error) {
        console.error('[Vercel Install] Failed to create install redirect:', error);
        const redirectUrl = new URL(edgePath, req.url);
        redirectUrl.searchParams.set('vercel', 'callback_error');
        redirectUrl.searchParams.set('reason', 'Failed to start Vercel install');
        return NextResponse.redirect(redirectUrl);
    }
}
