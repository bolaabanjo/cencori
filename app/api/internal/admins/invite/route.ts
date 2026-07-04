import { NextRequest, NextResponse } from 'next/server';
import { SendByte } from '@sendbyte/node';
import { createServerClient } from '@/lib/supabaseServer';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { allowAllInternalInDev, isFounderEmail } from '@/lib/internal-admin-auth';
import { resolvePublicOrigin } from '@/lib/public-origin';

const SENDBYTE_API_KEY = process.env.SENDBYTE_API_KEY || process.env.RESEND_API_KEY;
const ADMIN_INVITE_FROM_EMAIL = process.env.RESEND_ADMIN_INVITE_FROM_EMAIL || process.env.RESEND_TEAM_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || '';
const ADMIN_INVITE_REPLY_TO_EMAIL = process.env.RESEND_ADMIN_INVITE_REPLY_TO_EMAIL || process.env.RESEND_REPLY_TO_EMAIL || '';

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

async function getSuperAdminStatus(userId: string) {
    const supabase = createAdminClient();
    const { data: admin } = await supabase
        .from('cencori_admins')
        .select('id, role')
        .eq('user_id', userId)
        .eq('status', 'active')
        .eq('role', 'super_admin')
        .single();
    return admin;
}

export async function POST(req: NextRequest) {
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isDev = process.env.NODE_ENV === 'development';
    const isFounder = isFounderEmail(user.email);
    const admin = await getSuperAdminStatus(user.id);
    const isAllowed = (allowAllInternalInDev() && isDev) || isFounder || !!admin;

    if (!isAllowed) {
        return NextResponse.json({ error: 'Forbidden - Super admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { email, role = 'admin' } = body;

    if (!email) {
        return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    if (!['admin', 'super_admin'].includes(role)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const supabaseAdmin = createAdminClient();

    const normalizedEmail = email.toLowerCase();

    const { data: existing } = await supabaseAdmin
        .from('cencori_admins')
        .select('id, status')
        .eq('email', normalizedEmail)
        .single();

    if (existing?.status === 'active') {
        return NextResponse.json({ error: 'User is already an admin' }, { status: 400 });
    }
    if (existing?.status === 'pending') {
        return NextResponse.json({ error: 'User has already been invited' }, { status: 400 });
    }

    // Either there's no row, or there's a revoked row we can revive. We can't
    // INSERT a second row because email is UNIQUE.
    let invite: { id: string; invite_token: string } | null = null;

    if (existing?.status === 'revoked') {
        const { data: revived, error: reviveError } = await supabaseAdmin
            .from('cencori_admins')
            .update({
                role,
                status: 'pending',
                invite_token: crypto.randomUUID(),
                invited_by: user.id,
                accepted_at: null,
                user_id: null,
            })
            .eq('id', existing.id)
            .select('id, invite_token')
            .single();

        if (reviveError || !revived) {
            console.error('[Admins] Error reviving revoked invite:', reviveError);
            return NextResponse.json({ error: 'Failed to re-invite user' }, { status: 500 });
        }
        invite = revived;
    } else {
        const { data: created, error: inviteError } = await supabaseAdmin
            .from('cencori_admins')
            .insert({
                email: normalizedEmail,
                role,
                status: 'pending',
                invited_by: user.id,
            })
            .select('id, invite_token')
            .single();

        if (inviteError || !created) {
            console.error('[Admins] Error creating invite:', inviteError);
            return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
        }
        invite = created;
    }

    const baseUrl = resolvePublicOrigin(req);
    const inviteLink = `${baseUrl}/team-invite?token=${invite.invite_token}`;

    try {
        if (!SENDBYTE_API_KEY || !ADMIN_INVITE_FROM_EMAIL) {
            console.warn('[Admins] SendByte sender not configured. Skipping invite email.');
        } else {
            const sendbyte = new SendByte(SENDBYTE_API_KEY);
            try {
                await sendbyte.emails.send({
                    from: ADMIN_INVITE_FROM_EMAIL,
                    to: email.toLowerCase(),
                    reply_to: parseReplyTo(ADMIN_INVITE_REPLY_TO_EMAIL),
                    subject: "You're invited to join the Cencori team",
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
                <span style="color: #fafafa;">${user.email?.split('@')[0] || 'A team member'}</span> invited you to join Cencori as
            </p>
            <p style="margin: 8px 0 0 0; text-align: center;">
                <span style="display: inline-block; background: ${role === 'super_admin' ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.08)'}; color: ${role === 'super_admin' ? '#10b981' : '#fafafa'}; padding: 4px 10px; border-radius: 100px; font-size: 11px; font-weight: 500;">${role === 'super_admin' ? 'Super Admin' : 'Admin'}</span>
            </p>
        </div>
        
        <div style="text-align: center; margin-bottom: 20px;">
            <a href="${inviteLink}" style="display: inline-block; background: #fafafa; color: #0a0a0a; padding: 10px 28px; text-decoration: none; border-radius: 100px; font-weight: 500; font-size: 13px;">Accept Invite</a>
        </div>
        
        <p style="font-size: 11px; color: #555; text-align: center; margin: 0;">
            If you weren't expecting this, ignore this email.
        </p>
    </div>
    
    <div style="text-align: center; margin-top: 16px; color: #444; font-size: 10px;">
        <p style="margin: 0;">© ${new Date().getFullYear()} Cencori</p>
    </div>
</body>
</html>
            `,
                });
            } catch (emailErr) {
                console.error('[Admins] Failed to send invite email:', emailErr);
            }
        }
    } catch (emailErr) {
        console.error('[Admins] Email sending error:', emailErr);
    }

    return NextResponse.json({
        success: true,
        inviteLink,
        message: `Invite sent to ${email}!`
    });
}
