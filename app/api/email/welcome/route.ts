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

    const sendbyte = new SendByte(SENDBYTE_API_KEY);
    let emailId: string | undefined;
    try {
      const email = await sendbyte.emails.send({
        from: WELCOME_FROM_EMAIL,
        to: normalizedEmail,
        reply_to: parseReplyTo(WELCOME_REPLY_TO_EMAIL),
        subject: 'Welcome to Cencori!',
        html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.7; color: #111111; background: #ffffff; margin: 0; padding: 32px 24px; text-align: left;">
            <div style="max-width: 620px; text-align: left; margin: 0 auto 28px;">
              <img src="https://cencori.com/logos/logo-w.png" alt="Cencori" style="display: block; height: 44px; width: 44px; margin: 0 auto 28px;" />
              <h1 style="color: #111111; margin: 0 0 22px; font-size: 20px; line-height: 1.35; font-weight: 400;">Welcome to Cencori!</h1>

              <p style="margin: 0 0 24px; color: #444444; font-size: 16px; line-height: 1.7;">
                Cencori gives teams the infrastructure to route, observe, secure, and monetize AI products in production.
              </p>

              <p style="margin: 0 0 24px; color: #444444; font-size: 16px; line-height: 1.7;">
                You can start by creating your first organization, setting up a project, and generating an API key. From there, open your
                <a href="https://cencori.com/dashboard/organizations" style="color: #111111; text-decoration: underline;"> dashboard</a>,
                read the
                <a href="https://cencori.com/docs/quick-start" style="color: #111111; text-decoration: underline;"> quick start guide</a>,
                or go straight to the
                <a href="https://cencori.com/docs/api" style="color: #111111; text-decoration: underline;"> API reference</a>.
              </p>

              <p style="margin: 0 0 24px; color: #444444; font-size: 16px; line-height: 1.7;">
                If you want a broader view of how Cencori fits into your stack, start with the
                <a href="https://cencori.com/docs" style="color: #111111; text-decoration: underline;"> documentation</a>.
                If you want to move fast, make your first request and build from there.
              </p>

              <p style="margin: 0; color: #444444; font-size: 16px; line-height: 1.7;">
                Need help? Reply to this email or contact
                <a href="mailto:support@cencori.com" style="color: #111111; text-decoration: underline;"> support@cencori.com</a>.
              </p>
            </div>

            <div style="max-width: 620px; text-align: center; margin: 36px auto 0; color: #888888; font-size: 12px; line-height: 1.7;">
              <p style="margin: 0 0 6px;">
                Questions? Reply to this email or contact
                <a href="mailto:support@cencori.com" style="color: #666666; text-decoration: underline;"> support@cencori.com</a>
              </p>
              <p style="margin: 0 0 6px;">
                <a href="https://cencori.com/docs" style="color: #666666; text-decoration: underline;">Documentation</a>
              </p>
              <p style="margin: 0 0 10px;">
                <a href="https://cencori.com/docs" style="color: #666666; text-decoration: underline;">Docs</a>
                <span style="color: #b0b0b0;"> | </span>
                <a href="https://cencori.com/blog" style="color: #666666; text-decoration: underline;">Blog</a>
              </p>
              <p style="margin: 0;">Copyright © ${new Date().getFullYear()} Cencori, Inc. All rights reserved.</p>
            </div>
          </body>
        </html>
      `,
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
