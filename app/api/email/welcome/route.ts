import { SendByte } from '@sendbyte/node';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { generateUserUnsubscribeToken, buildUserUnsubscribeUrl } from '@/lib/user-unsubscribe';
import { getBaseUrl } from '@/lib/newsletter';
import { launchTemplate } from '@/lib/email-templates';

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

    const firstName = (currentUserMetadata.full_name as string | undefined)?.split(/\s+/)[0] || normalizedEmail.split('@')[0];

    const baseUrl = getBaseUrl();
    const token = generateUserUnsubscribeToken(user.id);
    const unsubscribeUrl = buildUserUnsubscribeUrl(baseUrl, user.id, token);
    const preferencesUrl = `${baseUrl}/dashboard/organizations`;

    const html = launchTemplate({
      bannerUrl: 'https://raw.githubusercontent.com/cencori/cencori/master/public/logos/ccbanner-email.png',
      bannerAlt: 'Cencori',
      greeting: `Hi ${firstName},`,
      paragraphs: [
        'Welcome to Cencori.',
        'Cencori helps organizations build and run AI applications by making access to frontier AI models simple, secure, and reliable.',
      ],
      linksHeader: 'To get started:',
      links: [
        { label: 'Create your first project', url: 'https://cencori.com/dashboard/organizations' },
        { label: 'Generate an API key', url: 'https://cencori.com/dashboard/organizations' },
        { label: 'Connect your application', url: 'https://cencori.com/docs/installation' },
      ],
      ctaText: 'Upgrade to Pro',
      ctaUrl: 'https://cencori.com/pricing',
      signOff: 'Build different.',
      preferencesUrl,
      unsubscribeUrl,
      footerContext: 'You received this because you signed up for Cencori.',
    });

    const sendbyte = new SendByte(SENDBYTE_API_KEY);
    let emailId: string | undefined;
    try {
      const email = await sendbyte.emails.send({
        from: WELCOME_FROM_EMAIL,
        to: normalizedEmail,
        reply_to: parseReplyTo(WELCOME_REPLY_TO_EMAIL),
        subject: 'Welcome to Cencori!',
        html,
        list_unsubscribe: { url: unsubscribeUrl },
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
