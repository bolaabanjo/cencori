import { SendByte } from '@sendbyte/node';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { createAdminClient } from '@/lib/supabaseAdmin';

const SENDBYTE_API_KEY = process.env.SENDBYTE_API_KEY || process.env.RESEND_API_KEY;
const WELCOME_FROM_EMAIL = process.env.RESEND_WELCOME_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || '';
const WELCOME_REPLY_TO_EMAIL = process.env.RESEND_WELCOME_REPLY_TO_EMAIL || process.env.RESEND_REPLY_TO_EMAIL || '';

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

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    let requestedEmail: string | null = null;
    try {
      const body = await request.json();
      if (typeof body?.email === 'string') {
        requestedEmail = body.email;
      }
    } catch {
      // JSON body is optional.
    }

    const normalizedEmail = user.email.trim().toLowerCase();
    if (requestedEmail && requestedEmail.trim().toLowerCase() !== normalizedEmail) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    if (!SENDBYTE_API_KEY) {
      console.warn('[Welcome Email] SENDBYTE_API_KEY not configured. Skipping send.');
      return NextResponse.json({ success: false, skipped: true, reason: 'email_not_configured' }, { status: 202 });
    }

    if (!WELCOME_FROM_EMAIL) {
      console.warn('[Welcome Email] RESEND_WELCOME_FROM_EMAIL/RESEND_FROM_EMAIL not configured. Skipping send.');
      return NextResponse.json({ success: false, skipped: true, reason: 'from_email_not_configured' }, { status: 202 });
    }

    const supabaseAdmin = createAdminClient();
    const { data: adminUserData, error: adminUserError } = await supabaseAdmin.auth.admin.getUserById(user.id);
    if (adminUserError || !adminUserData?.user) {
      console.error('[Welcome Email] Failed to load user metadata:', adminUserError);
      return NextResponse.json({ error: 'Failed to load user metadata' }, { status: 500 });
    }

    const currentUserMetadata = (adminUserData.user.user_metadata ?? {}) as Record<string, unknown>;
    const existingWelcomeSentAt = currentUserMetadata.welcome_email_sent_at;
    if (typeof existingWelcomeSentAt === 'string' && existingWelcomeSentAt.length > 0) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'already_sent',
        sentAt: existingWelcomeSentAt,
      });
    }

    const SOCIAL_ICONS_URL = 'https://cencori.com/social';
    const socialIcons = [
      { name: 'GitHub', file: 'github-icon.png', url: 'https://github.com/cencori' },
      { name: 'X', file: 'x-icon.png', url: 'https://x.com/cencori' },
      { name: 'LinkedIn', file: 'linkedin-icon.png', url: 'https://linkedin.com/company/cencori' },
      { name: 'Discord', file: 'discord-icon.png', url: 'https://discord.gg/cencori' },
      { name: 'YouTube', file: 'youtube-icon.png', url: 'https://youtube.com/@cencori' },
    ];
    const imgTag = (i: typeof socialIcons[number]) =>
      `<a href="${i.url}" style="color:#888;text-decoration:none;display:inline-block;vertical-align:middle;"><img src="${SOCIAL_ICONS_URL}/${i.file}" width="20" height="20" alt="${i.name}" style="display:inline-block;vertical-align:middle;border:0;"></a>`;
    const iconRow = socialIcons.map((i, idx) => imgTag(i) + (idx < socialIcons.length - 1 ? '<span style="color:#ccc;margin:0 6px;vertical-align:middle;">·</span>' : '')).join('');

    const sendbyte = new SendByte(SENDBYTE_API_KEY);
    let emailId: string | undefined;
    try {
      const email = await sendbyte.emails.send({
        from: WELCOME_FROM_EMAIL,
        to: normalizedEmail,
        reply_to: parseReplyTo(WELCOME_REPLY_TO_EMAIL),
        subject: 'Welcome to Cencori!',
        html: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;color:#111;">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;">
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">Hey ${normalizedEmail.split('@')[0]},</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">Welcome to Cencori. You now have the infrastructure to route, observe, secure, and scale AI products in production.</p>
<p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:#555;">Start by creating your first organization, setting up a project, and generating an API key. From there, open your <a href="https://cencori.com/dashboard/organizations" style="color:#111;text-decoration:underline;">dashboard</a>, read the <a href="https://cencori.com/docs/quick-start" style="color:#111;text-decoration:underline;">quick start guide</a>, or go straight to the <a href="https://cencori.com/docs/api" style="color:#111;text-decoration:underline;">API reference</a>.</p>
<p style="margin:0 0 24px;font-size:13px;color:#888;">Learn more at cencori.com</p>
<a href="https://cencori.com/dashboard/organizations" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:500;">Open dashboard</a>
<div style="margin-top:32px;padding-top:24px;border-top:1px solid #eee;">
<p style="margin:0 0 8px;font-size:12px;color:#999;text-align:center;">${iconRow}</p>
<p style="margin:0 0 4px;font-size:12px;color:#999;text-align:center;">Cencori, Inc. · San Francisco, CA</p>
<p style="margin:0;font-size:11px;color:#aaa;text-align:center;"><a href="{{unsubscribe_url}}" style="color:#888;text-decoration:underline;">Unsubscribe</a></p>
</div>
</div>
</body>
</html>`,
      });
      emailId = email.id;
    } catch (err) {
      console.error('Welcome email error:', err);
      return NextResponse.json(
        { error: 'Failed to send welcome email' },
        { status: 500 }
      );
    }

    const { error: metadataUpdateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...currentUserMetadata,
        welcome_email_sent_at: new Date().toISOString(),
      },
    });

    if (metadataUpdateError) {
      console.error('[Welcome Email] Failed to persist send marker:', metadataUpdateError);
    }

    return NextResponse.json({ success: true, id: emailId });
  } catch (error) {
    console.error('Welcome email error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
