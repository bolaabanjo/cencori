/**
 * DELETE /api/github/installations/:installationId?organizationId=...
 *
 * Disconnect a GitHub account (installation) from an organization — deletes the
 * organization_github_installations link. This does NOT uninstall the App from
 * GitHub (that's "Manage installation" → GitHub settings); it just unbinds the
 * account from this Cencori org. org↔installation is many-to-many, so other
 * orgs keep their link.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { createAdminClient } from '@/lib/supabaseAdmin';

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ installationId: string }> },
) {
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { installationId: installationIdParam } = await params;
    const installationId = Number(installationIdParam);
    if (!Number.isSafeInteger(installationId) || installationId <= 0) {
        return NextResponse.json({ error: 'Invalid installation id' }, { status: 400 });
    }

    const organizationId = new URL(req.url).searchParams.get('organizationId');
    if (!organizationId) {
        return NextResponse.json({ error: 'organizationId is required' }, { status: 400 });
    }

    // Verify the caller can manage this org (owner or member).
    const { data: org } = await supabase
        .from('organizations')
        .select('id, owner_id')
        .eq('id', organizationId)
        .single();
    if (!org) {
        return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    let hasAccess = org.owner_id === user.id;
    if (!hasAccess) {
        const { data: membership } = await supabase
            .from('organization_members')
            .select('user_id')
            .eq('organization_id', organizationId)
            .eq('user_id', user.id)
            .maybeSingle();
        hasAccess = !!membership;
    }
    if (!hasAccess) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const admin = createAdminClient();
    const { error } = await admin
        .from('organization_github_installations')
        .delete()
        .eq('organization_id', organizationId)
        .eq('installation_id', installationId);

    if (error) {
        console.error('[GitHub] disconnect installation error:', error);
        return NextResponse.json({ error: 'Failed to disconnect account' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
