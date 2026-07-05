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

    const firstName = (currentUserMetadata.full_name as string | undefined)?.split(/\s+/)[0] || normalizedEmail.split('@')[0];

    const link = (text: string, href: string) =>
      `<a href="${href}" style="color:#111;text-decoration:underline;">${text} &#8594;</a>`;

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
<img src="https://raw.githubusercontent.com/cencori/cencori/master/public/logos/ccbanner-email.png" alt="Cencori" style="display:block;width:100%;height:auto;margin-bottom:32px;">
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">Hi ${firstName},</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">Welcome to Cencori.</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">Cencori helps organizations build and run AI applications by making access to frontier AI models simple, secure, and reliable.</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">Your workspace is ready.</p>
<p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#555;">To get started:</p>
<p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:#555;">${link('Create your first project', 'https://cencori.com/dashboard/organizations')}</p>
<p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:#555;">${link('Generate an API key', 'https://cencori.com/dashboard/organizations')}</p>
<p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:#555;">${link('Connect your application', 'https://cencori.com/docs/installation')}</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">Start building with models from OpenAI, Anthropic, Google, Meta, DeepSeek, Mistral, and more\u2014all through a single API.</p>
<a href="https://cencori.com/pricing" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:500;">Upgrade to Pro</a>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;margin-top:24px;">This is the first step in what we\u2019re building.</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">Our mission is to make AI infrastructure more accessible so builders, startups, enterprises, researchers, and governments can build and scale with confidence.</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">We\u2019re glad you\u2019re here.</p>
<p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:#555;">Build different.</p>
<p style="margin:0 0 32px;font-size:14px;line-height:1.6;color:#555;">The Cencori Team</p>
<div style="margin-top:32px;padding-top:24px;border-top:1px solid #eee;">
<p style="margin:0 0 8px;font-size:12px;color:#999;text-align:center;">${iconRow}</p>
<p style="margin:0 0 4px;font-size:12px;color:#999;text-align:center;">Cencori, Inc. &#183; San Francisco, CA</p>
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
