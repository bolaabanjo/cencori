import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sendbyteKey = process.env.SENDBYTE_API_KEY!;

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BASE_URL = 'https://cencori.com';
const FROM = 'Cencori <updates@send.cencori.com>';
const SEND_CONCURRENCY = 10;

function generateUnsubscribeToken(userId: string): string {
  const secret = process.env.USER_UNSUBSCRIBE_SECRET || process.env.NEXTAUTH_SECRET || process.env.SUPABASE_JWT_SECRET || 'dev-fallback';
  return createHmac('sha256', secret).update(userId).digest('hex').slice(0, 40);
}

function toFirstName(email: string): string {
  const prefix = email.split('@')[0] ?? '';
  const first = prefix.split(/[._-]/)[0] ?? prefix;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

const SOCIAL_ICONS_URL = 'https://cencori.com/social';
const socialIcons = [
  { name: 'GitHub', file: 'github-icon.png', url: 'https://github.com/cencori' },
  { name: 'X', file: 'x-icon.png', url: 'https://x.com/cencori' },
  { name: 'LinkedIn', file: 'linkedin-icon.png', url: 'https://linkedin.com/company/cencori' },
  { name: 'Discord', file: 'discord-icon.png', url: 'https://discord.gg/cencori' },
  { name: 'YouTube', file: 'youtube-icon.png', url: 'https://youtube.com/@cencori' },
];
const iconRow = socialIcons.map((i, idx) =>
  `<a href="${i.url}" style="color:#888;text-decoration:none;display:inline-block;vertical-align:middle;"><img src="${SOCIAL_ICONS_URL}/${i.file}" width="20" height="20" alt="${i.name}" style="display:inline-block;vertical-align:middle;border:0;"></a>` +
  (idx < socialIcons.length - 1 ? '<span style="color:#ccc;margin:0 6px;vertical-align:middle;">·</span>' : '')
).join('');

function buildHtml(firstName: string, preferencesUrl: string, unsubscribeUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;color:#111;">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;">
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">Hey ${firstName},</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">Voice API is live on Cencori — text-to-speech and speech-to-text across six providers through one endpoint.</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">Pick a model, get audio back. Switch from Deepgram to ElevenLabs to OpenAI by changing one string. Every request is billed, logged, and PII-redacted on the same gateway as chat and vision.</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">Six providers: OpenAI, Deepgram, Cartesia, ElevenLabs, AssemblyAI, Spitch. African languages baked in: Yoruba, Hausa, Igbo, Amharic — both directions. React components included: <code style="font-size:13px;color:#333;">&lt;VoiceRecorder&gt;</code> and <code style="font-size:13px;color:#333;">&lt;SpeakButton&gt;</code> from <code style="font-size:13px;color:#333;">cencori/react</code>.</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">This is the same gateway that powers your chat, vision, and documents — now extended to voice. No new infrastructure, no separate billing, no extra contracts.</p>
<p style="margin:24px 0 0;"><a href="https://cencori.com/pricing" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:500;">Upgrade to Pro</a></p>
<p style="margin:24px 0 24px;font-size:14px;line-height:1.6;color:#555;">Or jump straight in:</p>
<p style="margin:0 0 8px;font-size:14px;line-height:1.8;">→ <a href="https://cencori.com/docs/ai/endpoints/audio" style="color:#111;text-decoration:underline;">Voice docs</a> →<br>→ <a href="https://cencori.com/blog/cencori-voice" style="color:#111;text-decoration:underline;">Launch post</a> →</p>
<div style="margin-top:32px;padding-top:24px;border-top:1px solid #eee;">
<p style="margin:0 0 12px;font-size:12px;color:#999;text-align:center;"><a href="https://cencori.com/docs" style="color:#888;text-decoration:underline;">Docs</a> &nbsp;·&nbsp; <a href="https://cencori.com/blog" style="color:#888;text-decoration:underline;">Blog</a></p>
<p style="margin:0 0 8px;font-size:12px;color:#999;text-align:center;">${iconRow}</p>
<p style="margin:0 0 4px;font-size:11px;color:#aaa;text-align:center;"><a href="${preferencesUrl}" style="color:#888;text-decoration:underline;">Manage preferences</a> &nbsp;·&nbsp; <a href="${unsubscribeUrl}" style="color:#888;text-decoration:underline;">Unsubscribe</a></p>
<p style="margin:0;font-size:11px;color:#aaa;text-align:center;">Cencori, Inc. &middot; San Francisco, CA</p>
</div>
</div>
</body>
</html>`;
}

async function sendEmail(to: string, html: string, listUnsubscribeUrl?: string) {
  const body: Record<string, unknown> = {
    from: FROM,
    to,
    subject: 'Voice API is live on Cencori',
    html,
  };
  if (listUnsubscribeUrl) {
    body.list_unsubscribe = { url: listUnsubscribeUrl };
  }
  const res = await fetch('https://api.sendbyte.africa/v1/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sendbyteKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SendByte error ${res.status}: ${err}`);
  }
  return res.json();
}

async function main() {
  let allUsers: { id: string; email: string; user_metadata: Record<string, unknown> }[] = [];
  let page = 0;
  const perPage = 1000;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page: page + 1,
      perPage,
    });
    if (error) throw error;
    if (!data.users.length) break;

    for (const u of data.users) {
      const meta = u.user_metadata || {};
      if (typeof meta.marketing_opted_out_at === 'string') continue;
      if (!u.email) continue;
      allUsers.push({ id: u.id, email: u.email, user_metadata: meta });
    }

    if (data.users.length < perPage) break;
    page++;
  }

  console.log(`Sending voice launch to ${allUsers.length} users...`);

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < allUsers.length; i += SEND_CONCURRENCY) {
    const slice = allUsers.slice(i, i + SEND_CONCURRENCY);
    const results = await Promise.allSettled(
      slice.map(async (u) => {
        const meta = u.user_metadata;
        const fullName = ((meta.full_name || meta.name || '') as string).trim();
        const firstName = fullName.split(/\s+/)[0] || toFirstName(u.email);

        const token = generateUnsubscribeToken(u.id);
        const unsubscribeUrl = `${BASE_URL}/api/users/unsubscribe?uid=${encodeURIComponent(u.id)}&token=${encodeURIComponent(token)}`;
        const preferencesUrl = `${BASE_URL}/account/settings`;
        const html = buildHtml(firstName, preferencesUrl, unsubscribeUrl);
        await sendEmail(u.email, html, unsubscribeUrl);
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled') sent++;
      else { failed++; console.error('Failed:', r.reason); }
    }

    const pct = Math.round(((i + slice.length) / allUsers.length) * 100);
    console.log(`${Math.min(i + slice.length, allUsers.length)}/${allUsers.length} (${pct}%) — ${sent} sent, ${failed} failed`);
  }

  console.log(`\nDone. ${sent} sent, ${failed} failed`);
}

main().catch(console.error);
