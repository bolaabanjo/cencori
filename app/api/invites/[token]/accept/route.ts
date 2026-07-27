import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { trackEvent } from '@/lib/track-event';
import { requireTierFeatureForOrg } from '@/lib/require-tier-feature';

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    const { token } = await params;
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
        return NextResponse.json({ error: 'Unauthorized - Please log in first' }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();

    console.log('[Accept] Looking for invite with token:', token);
    const { data: invite, error: inviteError } = await supabaseAdmin
        .from('organization_invites')
        .select('id, organization_id, email, role, invite_token, expires_at, accepted_at')
        .eq('invite_token', token)
        .single();

    if (inviteError) {
        console.error('[Accept] Error finding invite:', inviteError);
        return NextResponse.json({ error: 'Invalid invite link', details: inviteError.message }, { status: 404 });
    }

    if (!invite) {
        console.error('[Accept] No invite found for token:', token);
        return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 });
    }

    console.log('[Accept] Found invite:', { id: invite.id, email: invite.email, org: invite.organization_id });

    const { data: org, error: orgError } = await supabaseAdmin
        .from('organizations')
        .select('name, slug')
        .eq('id', invite.organization_id)
        .single();

    if (orgError || !org) {
        console.error('[Accept] Error finding organization for invite:', orgError);
        return NextResponse.json({ error: 'Organization not found for this invite' }, { status: 404 });
    }

    if (invite.accepted_at) {
        return NextResponse.json({ error: 'This invite has already been used' }, { status: 400 });
    }
    if (new Date(invite.expires_at) < new Date()) {
        return NextResponse.json({ error: 'This invite has expired' }, { status: 400 });
    }

    if (invite.email.toLowerCase() !== user.email?.toLowerCase()) {
        return NextResponse.json({
            error: `This invite was sent to ${invite.email}. Please log in with that email address.`
        }, { status: 403 });
    }

    const planGate = await requireTierFeatureForOrg(invite.organization_id, 'teams');
    if (planGate) return planGate;

    const { data: existingMember } = await supabaseAdmin
        .from('organization_members')
        .select('organization_id')
        .eq('organization_id', invite.organization_id)
        .eq('user_id', user.id)
        .single();

    if (existingMember) {
        await supabaseAdmin
            .from('organization_invites')
            .update({ accepted_at: new Date().toISOString() })
            .eq('id', invite.id);

        return NextResponse.json({
            success: true,
            message: 'You are already a member of this organization',
            organizationSlug: org?.slug,
        });
    }

    const { error: memberError } = await supabaseAdmin
        .from('organization_members')
        .insert({
            organization_id: invite.organization_id,
            user_id: user.id,
            role: invite.role,
        });

    if (memberError) {
        console.error('[Invites] Error adding member:', memberError);
        return NextResponse.json({ error: 'Failed to join organization' }, { status: 500 });
    }

    await supabaseAdmin
        .from('organization_invites')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', invite.id);

    trackEvent({ event_type: 'user.invite_accepted', product: 'dashboard', user_id: user.id, organization_id: invite.organization_id, metadata: { role: invite.role, org_name: org?.name } });

    return NextResponse.json({
        success: true,
        message: `Welcome to ${org?.name || 'the organization'}!`,
        organizationSlug: org?.slug,
    });
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    const { token } = await params;
    const supabaseAdmin = createAdminClient();

    console.log('[Accept GET] Looking for invite with token:', token);
    const { data: invite, error: inviteError } = await supabaseAdmin
        .from('organization_invites')
        .select('email, role, expires_at, accepted_at, organization_id')
        .eq('invite_token', token)
        .single();

    if (inviteError) {
        console.error('[Accept GET] Error finding invite:', inviteError);
        return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 });
    }

    if (!invite) {
        return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 });
    }

    if (invite.accepted_at) {
        return NextResponse.json({ error: 'This invite has already been used' }, { status: 400 });
    }

    if (new Date(invite.expires_at) < new Date()) {
        return NextResponse.json({ error: 'This invite has expired' }, { status: 400 });
    }

    const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('name')
        .eq('id', invite.organization_id)
        .single();

    const planGate = await requireTierFeatureForOrg(invite.organization_id, 'teams');
    if (planGate) return planGate;

    return NextResponse.json({
        email: invite.email,
        role: invite.role,
        organizationName: org?.name || 'Unknown Organization',
    });
}
