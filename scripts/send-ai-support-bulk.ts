import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sendbyteKey = process.env.SENDBYTE_API_KEY!;

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BASE_URL = 'https://cencori.com';
const FROM = 'Eniola from Cencori <updates@send.cencori.com>';
const SEND_CONCURRENCY = 10;
const SNIP_URL = 'https://raw.githubusercontent.com/cencori/cencori/redesign-signup-flow/public/snip.png';

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

function buildHtml(unsubscribeUrl: string): string {
  const preferencesUrl = `${BASE_URL}/account/settings`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;color:#111;">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;">
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">Hey Builder,</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">You have a Cencori API key. You can add AI-powered customer support to your product in about 30 minutes.</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">One endpoint, streaming responses, multi-model fallback. Your users don't care which model is under the hood \u2014 they just want their questions answered.</p>
<img src="${SNIP_URL}" width="550" height="154" alt="" style="display:block;width:100%;height:auto;max-width:550px;margin:24px 0;border-radius:6px;">
<p style="margin:24px 0 24px;font-size:14px;line-height:1.6;color:#555;">Want to look up an order status? Refund a transaction? Wire up tool calls and let the model handle it \u2014 no brittle intent classification.</p>
<p style="margin:0 0 8px;font-size:14px;line-height:1.8;">\u2192 <a href="https://cencori.com/docs/ai/endpoints/chat" style="color:#111;text-decoration:underline;">Chat completions docs</a> \u2192<br>\u2192 <a href="https://cencori.com/docs/ai/tool-calling" style="color:#111;text-decoration:underline;">Tool calling guide</a> \u2192<br>\u2192 <a href="https://cencori.com/docs/ai/vercel-sdk" style="color:#111;text-decoration:underline;">Vercel AI SDK integration</a> \u2192</p>
<p style="margin:24px 0 24px;font-size:14px;line-height:1.6;color:#555;">No inference infrastructure to manage. No failover logic to write. You already have the key.</p>
<p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:#555;">Build different.</p>
<p style="margin:0 0 32px;font-size:14px;line-height:1.6;color:#555;">Eniola, Cencori.</p>
<div style="margin-top:32px;padding-top:24px;border-top:1px solid #eee;">
<p style="margin:0 0 12px;font-size:12px;color:#999;text-align:center;"><a href="https://cencori.com/docs" style="color:#888;text-decoration:underline;">Docs</a> &nbsp;\u00b7&nbsp; <a href="https://cencori.com/blog" style="color:#888;text-decoration:underline;">Blog</a></p>
<p style="margin:0 0 8px;font-size:12px;color:#999;text-align:center;">${iconRow}</p>
<p style="margin:0 0 4px;font-size:11px;color:#aaa;text-align:center;"><a href="${preferencesUrl}" style="color:#888;text-decoration:underline;">Manage preferences</a> &nbsp;\u00b7&nbsp; <a href="${unsubscribeUrl}" style="color:#888;text-decoration:underline;">Unsubscribe</a></p>
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
    subject: 'Add AI support to your product this afternoon',
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

  console.log(`Sending to ${allUsers.length} users...`);

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < allUsers.length; i += SEND_CONCURRENCY) {
    const slice = allUsers.slice(i, i + SEND_CONCURRENCY);
    const results = await Promise.allSettled(
      slice.map(async (u) => {
        const token = generateUnsubscribeToken(u.id);
        const unsubscribeUrl = `${BASE_URL}/api/users/unsubscribe?uid=${encodeURIComponent(u.id)}&token=${encodeURIComponent(token)}`;
        const html = buildHtml(unsubscribeUrl);
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
