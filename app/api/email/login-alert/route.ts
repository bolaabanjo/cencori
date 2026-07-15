import { SendByte } from '@sendbyte/node';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { generateUserUnsubscribeToken, buildUserUnsubscribeUrl } from '@/lib/user-unsubscribe';
import { getBaseUrl } from '@/lib/newsletter';

const SENDBYTE_API_KEY = process.env.SENDBYTE_API_KEY || process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_WELCOME_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || '';
const REPLY_TO_EMAIL = process.env.RESEND_WELCOME_REPLY_TO_EMAIL || process.env.RESEND_REPLY_TO_EMAIL || '';

function parseReplyTo(value: string): string | string[] | undefined {
  const addresses = value.split(',').map((e) => e.trim()).filter(Boolean);
  if (addresses.length === 0) return undefined;
  return addresses.length === 1 ? addresses[0] : addresses;
}

function parseUA(ua: string): string {
  const lower = ua.toLowerCase();
  let browser = 'Unknown browser';
  if (lower.includes('edg/') || lower.includes('edge/')) browser = 'Edge';
  else if (lower.includes('opr/') || lower.includes('opera')) browser = 'Opera';
  else if (lower.includes('chrome/')) browser = 'Chrome';
  else if (lower.includes('safari/') && lower.includes('version/')) browser = 'Safari';
  else if (lower.includes('firefox/')) browser = 'Firefox';
  else if (lower.includes('msie') || lower.includes('trident')) browser = 'Internet Explorer';

  let os = 'Unknown OS';
  if (lower.includes('windows nt 10')) os = 'Windows 10';
  else if (lower.includes('windows nt 11')) os = 'Windows 11';
  else if (lower.includes('windows nt 6.3')) os = 'Windows 8.1';
  else if (lower.includes('windows nt 6.1')) os = 'Windows 7';
  else if (lower.includes('mac os x')) os = 'macOS';
  else if (lower.includes('iphone') || lower.includes('ipad')) os = 'iOS';
  else if (lower.includes('android')) os = 'Android';
  else if (lower.includes('linux')) os = 'Linux';

  return `${browser} on ${os}`;
}

async function lookupLocation(ip: string): Promise<string | null> {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) return null;
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=city,country`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.city && data.country) return `${data.city}, ${data.country}`;
    if (data.country) return data.country;
    return null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const normalizedEmail = user.email.trim().toLowerCase();

    if (!SENDBYTE_API_KEY) {
      console.warn('[LoginAlert] SENDBYTE_API_KEY not configured. Skipping send.');
      return NextResponse.json({ success: false, skipped: true, reason: 'email_not_configured' }, { status: 202 });
    }

    if (!FROM_EMAIL) {
      console.warn('[LoginAlert] FROM_EMAIL not configured. Skipping send.');
      return NextResponse.json({ success: false, skipped: true, reason: 'from_email_not_configured' }, { status: 202 });
    }

    const supabaseAdmin = createAdminClient();
    const { data: adminUserData, error: adminUserError } = await supabaseAdmin.auth.admin.getUserById(user.id);
    if (adminUserError || !adminUserData?.user) {
      return NextResponse.json({ error: 'Failed to load user metadata' }, { status: 500 });
    }

    const meta = (adminUserData.user.user_metadata ?? {}) as Record<string, unknown>;

    const body = await request.json().catch(() => ({}));
    const clientUA: string = (body?.user_agent as string) || '';
    const ip: string = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '';

    const prevUA = meta.last_login_user_agent as string | undefined;
    const prevIP = meta.last_login_ip as string | undefined;

    const sameUA = prevUA && clientUA && prevUA === clientUA;
    const sameIP = prevIP && ip && prevIP === ip;

    if (sameUA && sameIP) {
      return NextResponse.json({ success: true, skipped: true, reason: 'known_device' });
    }

    const lastAlertAt = meta.last_login_alert_sent_at as string | undefined;
    if (lastAlertAt) {
      const elapsed = Date.now() - new Date(lastAlertAt).getTime();
      if (elapsed < 3600000) {
        return NextResponse.json({ success: true, skipped: true, reason: 'recent_alert_sent' });
      }
    }

    const device = clientUA ? parseUA(clientUA) : 'Unknown device';
    let location: string | null = null;
    if (ip && ip !== prevIP) {
      location = await lookupLocation(ip);
    }

    const now = new Date();
    const timeStr = now.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });

    const deviceDetail = `Device: ${device}`;
    const locationDetail = location ? `Location: ${location} (approximate)` : null;
    const ipDetail = ip ? `IP: ${ip}` : null;
    const timeDetail = `Time: ${timeStr}`;

    const detailLines: string[] = [deviceDetail, locationDetail, ipDetail, timeDetail].filter((d): d is string => !!d);

    const baseUrl = getBaseUrl();
    const token = generateUserUnsubscribeToken(user.id);
    const unsubscribeUrl = buildUserUnsubscribeUrl(baseUrl, user.id, token);
    const preferencesUrl = `${baseUrl}/account/settings`;

    const firstName = (meta.full_name as string | undefined)?.split(/\s+/)[0] || normalizedEmail.split('@')[0];

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

    const link = (text: string, href: string) =>
      `<a href="${href}" style="color:#111;text-decoration:underline;">${text} &#8594;</a>`;

    const updateMeta: Record<string, string> = {};
    if (clientUA) updateMeta.last_login_user_agent = clientUA;
    if (ip) updateMeta.last_login_ip = ip;
    updateMeta.last_login_alert_sent_at = new Date().toISOString();

    if (Object.keys(updateMeta).length > 0) {
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        user_metadata: { ...meta, ...updateMeta },
      });
    }

    const sendbyte = new SendByte(SENDBYTE_API_KEY);
    try {
      await sendbyte.emails.send({
        from: FROM_EMAIL,
        to: normalizedEmail,
        reply_to: parseReplyTo(REPLY_TO_EMAIL),
        subject: 'New sign-in to your Cencori account',
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
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">We noticed a new sign-in to your Cencori account.</p>
<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;width:100%;border:1px solid #eee;border-radius:6px;font-size:13px;color:#555;line-height:1.8;">
${detailLines.map((line, i) => {
  const [label, ...rest] = line.split(': ');
  const b = i < detailLines.length - 1 ? '1px solid #eee' : '0';
  return `<tr><td style="padding:8px 12px;border-bottom:${b};white-space:nowrap;color:#999;vertical-align:top;font-weight:500;width:1px;">${label}</td><td style="padding:8px 12px;border-bottom:${b};color:#333;">${rest.join(': ')}</td></tr>`;
}).join('')}
</table>
<p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:#555;">If this was you, no action needed.</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">If you don\u2019t recognize this sign-in, please secure your account immediately.</p>
<p style="margin:0 0 32px;font-size:14px;line-height:1.6;color:#555;">${link('Review account activity', preferencesUrl)}</p>
<div style="margin-top:32px;padding-top:24px;border-top:1px solid #eee;">
<p style="margin:0 0 12px;font-size:12px;color:#999;text-align:center;"><a href="https://cencori.com/docs" style="color:#888;text-decoration:underline;">Docs</a> &nbsp;&middot;&nbsp; <a href="https://cencori.com/blog" style="color:#888;text-decoration:underline;">Blog</a></p>
<p style="margin:0 0 8px;font-size:12px;color:#999;text-align:center;">${iconRow}</p>
<p style="margin:0 0 12px;font-size:12px;color:#999;text-align:center;line-height:1.5;">Making AI infrastructure accessible &mdash; so builders can build and scale with confidence.</p>
<p style="margin:0 0 12px;font-size:11px;color:#aaa;text-align:center;line-height:1.5;">You received this because security notifications are enabled for your account.</p>
<p style="margin:0 0 4px;font-size:11px;color:#aaa;text-align:center;"><a href="${preferencesUrl}" style="color:#888;text-decoration:underline;">Manage preferences</a> &nbsp;&middot;&nbsp; <a href="${unsubscribeUrl}" style="color:#888;text-decoration:underline;">Unsubscribe</a></p>
<p style="margin:0;font-size:11px;color:#aaa;text-align:center;">Cencori, Inc. &middot; San Francisco, CA</p>
</div>
</div>
</body>
</html>`,
        list_unsubscribe: { url: unsubscribeUrl },
      });
    } catch (err) {
      console.error('[LoginAlert] Send failed:', err);
      return NextResponse.json({ error: 'Failed to send login alert' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[LoginAlert] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
