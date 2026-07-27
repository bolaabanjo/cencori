import { NextRequest, NextResponse } from 'next/server';
import { SendByte } from '@sendbyte/node';
import { createServerClient } from '@/lib/supabaseServer';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { resolvePublicOrigin } from '@/lib/public-origin';
import { trackEvent } from '@/lib/track-event';
import { writeAuditLog } from '@/lib/audit-log';
import { requireTierFeatureForOrg } from '@/lib/require-tier-feature';

const SENDBYTE_API_KEY = process.env.SENDBYTE_API_KEY || process.env.RESEND_API_KEY;
const ORG_INVITE_FROM_EMAIL = process.env.RESEND_ORG_INVITE_FROM_EMAIL || process.env.RESEND_TEAM_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || '';
const ORG_INVITE_REPLY_TO_EMAIL = process.env.RESEND_ORG_INVITE_REPLY_TO_EMAIL || process.env.RESEND_REPLY_TO_EMAIL || '';

function parseReplyTo(value: string): string | string[] | undefined {
    const addresses = value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);

    if (addresses.length === 0) {
        return undefined;
    }

    return addresses.length === 1 ? addresses[0] : addresses;
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ orgSlug: string }> }
) {
    const { orgSlug } = await params;
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();
    const { data: org, error: orgError } = await supabaseAdmin
        .from('organizations')
        .select('id, name, owner_id')
        .eq('slug', orgSlug)
        .single();

    if (orgError || !org) {
        return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const isOwner = org.owner_id === user.id;
    const { data: membership } = await supabaseAdmin
        .from('organization_members')
        .select('role')
        .eq('organization_id', org.id)
        .eq('user_id', user.id)
        .single();

    const isAdmin = membership?.role === 'admin';

    if (!isOwner && !isAdmin) {
        return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    const planGate = await requireTierFeatureForOrg(org.id, 'teams');
    if (planGate) return planGate;

    const body = await req.json();
    const { email, role = 'member' } = body;

    if (!email) {
        return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    if (!['member', 'admin'].includes(role)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const { data: existingAuthUser } = await supabaseAdmin.auth.admin.listUsers();
    const matchingUser = existingAuthUser?.users?.find(
        u => u.email?.toLowerCase() === normalizedEmail
    );

    if (matchingUser) {
        const { data: existingMember } = await supabaseAdmin
            .from('organization_members')
            .select('organization_id')
            .eq('organization_id', org.id)
            .eq('user_id', matchingUser.id)
            .single();

        if (existingMember) {
            return NextResponse.json({ error: 'User is already a member' }, { status: 400 });
        }
    }

    const { data: existingInvite } = await supabaseAdmin
        .from('organization_invites')
        .select('id, accepted_at')
        .eq('organization_id', org.id)
        .eq('email', normalizedEmail)
        .is('accepted_at', null)
        .single();

    if (existingInvite) {
        return NextResponse.json({ error: 'An invite has already been sent to this email' }, { status: 400 });
    }

    const { data: invite, error: inviteError } = await supabaseAdmin
        .from('organization_invites')
        .insert({
            organization_id: org.id,
            email: normalizedEmail,
            role,
            invited_by: user.id,
        })
        .select('id, invite_token')
        .single();

    if (inviteError) {
        console.error('[Invites] Error creating invite:', inviteError);
        return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
    }

    const baseUrl = resolvePublicOrigin(req);
    const inviteLink = `${baseUrl}/invite?token=${invite.invite_token}`;

    console.log('[Invites] Attempting to send email to:', normalizedEmail);
    try {
        if (!SENDBYTE_API_KEY || !ORG_INVITE_FROM_EMAIL) {
            console.warn('[Invites] SendByte sender not configured. Skipping invite email.');
        } else {
            const sendbyte = new SendByte(SENDBYTE_API_KEY);
            try {
                const email = await sendbyte.emails.send({
                    from: ORG_INVITE_FROM_EMAIL,
                    to: normalizedEmail,
                    reply_to: parseReplyTo(ORG_INVITE_REPLY_TO_EMAIL),
                    subject: `You're invited to join ${org.name} on Cencori`,
                    html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #fafafa; max-width: 480px; margin: 0 auto; padding: 24px; background: #0a0a0a;">
    <div style="background: #141414; border-radius: 12px; padding: 32px; border: 1px solid rgba(255,255,255,0.08);">
        <div style="text-align: center; margin-bottom: 24px;">
            <img src="https://cencori.com/clight.png" alt="Cencori" style="height: 28px; margin-bottom: 20px; opacity: 0.9;" />
            <p style="color: #888; font-size: 11px; letter-spacing: 0.5px; text-transform: uppercase; margin: 0 0 6px 0;">Team Invite</p>
            <h1 style="color: #fafafa; margin: 0; font-size: 18px; font-weight: 600;">You're Invited</h1>
        </div>
        
        <div style="background: #1a1a1a; border-radius: 8px; padding: 16px; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.05);">
            <p style="margin: 0; color: #a1a1a1; font-size: 13px; text-align: center;">
                <span style="color: #fafafa;">${user.email?.split('@')[0] || 'A team member'}</span> invited you to join
            </p>
            <p style="margin: 8px 0 0 0; text-align: center;">
                <span style="display: inline-block; background: rgba(255,255,255,0.08); color: #fafafa; padding: 4px 12px; border-radius: 100px; font-size: 12px; font-weight: 500;">${org.name}</span>
            </p>
            <p style="margin: 8px 0 0 0; text-align: center;">
                <span style="color: #666; font-size: 11px;">as ${role === 'admin' ? 'Admin' : 'Member'}</span>
            </p>
        </div>
        
        <div style="text-align: center; margin-bottom: 20px;">
            <a href="${inviteLink}" style="display: inline-block; background: #fafafa; color: #0a0a0a; padding: 10px 28px; text-decoration: none; border-radius: 100px; font-weight: 500; font-size: 13px;">Accept Invite</a>
        </div>
        
        <p style="font-size: 11px; color: #555; text-align: center; margin: 0;">
            This invite expires in 7 days. If you weren't expecting this, ignore this email.
        </p>
    </div>
    
    <div style="text-align: center; margin-top: 16px; color: #444; font-size: 10px;">
        <p style="margin: 0;">© ${new Date().getFullYear()} Cencori</p>
    </div>
</body>
</html>
            `,
                });
                console.log('[Invites] Email sent successfully! ID:', email.id);
            } catch (emailErr) {
                console.error('[Invites] Failed to send invite email:', emailErr);
            }
        }
    } catch (emailErr) {
        console.error('[Invites] Email sending error:', emailErr);
    }

    trackEvent({ event_type: 'org.invite_sent', product: 'dashboard', user_id: user.id, organization_id: org.id, metadata: { invited_email: normalizedEmail, role } });

    writeAuditLog({
        organizationId: org.id,
        category: 'member',
        action: 'invited',
        resourceType: 'invite',
        resourceId: invite.id,
        actorId: user.id,
        actorEmail: user.email ?? null,
        actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        description: `Invite sent to ${normalizedEmail} as ${role}`,
        metadata: { invitedEmail: normalizedEmail, role },
    });

    return NextResponse.json({
        success: true,
        inviteId: invite.id,
        message: `Invite sent to ${normalizedEmail}!`
    });
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ orgSlug: string }> }
) {
    const { orgSlug } = await params;
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .single();

    if (!org) {
        return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('organization_id', org.id)
        .eq('user_id', user.id)
        .single();

    if (!membership) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const planGate = await requireTierFeatureForOrg(org.id, 'teams');
    if (planGate) return planGate;

    const { data: invites, error } = await supabase
        .from('organization_invites')
        .select('id, email, role, created_at, expires_at')
        .eq('organization_id', org.id)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[Invites] Error fetching invites:', error);
        return NextResponse.json({ error: 'Failed to fetch invites' }, { status: 500 });
    }

    return NextResponse.json({ invites: invites || [] });
}
