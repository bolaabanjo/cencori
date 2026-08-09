import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'crypto';
import { lookup } from 'dns/promises';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sendbyteKey = process.env.SENDBYTE_API_KEY!;

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BASE_URL = 'https://cencori.com';
const FROM = 'Cencori <updates@send.cencori.com>';
const SEND_CONCURRENCY = 10;

const BANNER = 'https://raw.githubusercontent.com/cencori/cencori/codex/web-intelligence-v2/public/mail/mcpmail-email.png';
const SOCIAL_ICONS_URL = 'https://cencori.com/social';

function generateUnsubscribeToken(userId: string): string {
  const secret = process.env.USER_UNSUBSCRIBE_SECRET || process.env.NEXTAUTH_SECRET || process.env.SUPABASE_JWT_SECRET || 'dev-fallback';
  return createHmac('sha256', secret).update(userId).digest('hex').slice(0, 40);
}

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

function buildHtml(preferencesUrl: string, unsubscribeUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;color:#111;">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;">
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">Hey Builder,</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">The tools an agent can reach define what it can become.</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">Cencori MCP is live — the official Model Context Protocol server. Cursor, Claude Desktop, Codex, and any MCP-compatible client now get the Cencori platform as tools. One server, one key.</p>
<img src="${BANNER}" width="560" alt="" style="display:block;width:100%;height:auto;margin-bottom:24px;border-radius:8px;">
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">Run it without a key and your agent can search the docs, retrieve exact pages, and load our integration contract. Add a project key and it can search the web, inspect gateway health and usage, work with memory and agents, and query governance.</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">Safe by default: tools are gated by action tier. Public, Read, Write, Destructive — nothing that costs money or changes state registers until you enable it.</p>
<p style="margin:24px 0 0;"><a href="https://cencori.com/blog/introducing-cencori-mcp" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:500;">Read blog</a></p>
<p style="margin:24px 0 24px;font-size:14px;line-height:1.6;color:#555;">Or jump straight in:</p>
<p style="margin:0 0 8px;font-size:14px;line-height:1.8;">→ <a href="https://www.npmjs.com/package/@cencori/mcp" style="color:#111;text-decoration:underline;">npm package</a> →</p>
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

async function resolveApiHost(): Promise<string> {
  try {
    const addrs = await lookup('api.sendbyte.africa');
    return addrs.address;
  } catch {
    return '172.67.129.150';
  }
}

async function sendEmail(to: string, html: string, listUnsubscribeUrl?: string) {
  const body: Record<string, unknown> = {
    from: FROM,
    to,
    subject: 'Cencori MCP is live',
    html,
  };
  if (listUnsubscribeUrl) {
    body.list_unsubscribe = { url: listUnsubscribeUrl };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch('https://api.sendbyte.africa/v1/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sendbyteKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`SendByte error ${res.status}: ${err}`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const apiIp = await resolveApiHost();
  console.log(`API host resolved to ${apiIp} (may still use system DNS)`);

  let allUsers: { id: string; email: string }[] = [];
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
      allUsers.push({ id: u.id, email: u.email });
    }

    if (data.users.length < perPage) break;
    page++;
  }

  console.log(`Sending MCP launch to ${allUsers.length} users...`);

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < allUsers.length; i += SEND_CONCURRENCY) {
    const slice = allUsers.slice(i, i + SEND_CONCURRENCY);
    const results = await Promise.allSettled(
      slice.map(async (u) => {
        const token = generateUnsubscribeToken(u.id);
        const unsubscribeUrl = `${BASE_URL}/api/users/unsubscribe?uid=${encodeURIComponent(u.id)}&token=${encodeURIComponent(token)}`;
        const preferencesUrl = `${BASE_URL}/account/settings`;
        const html = buildHtml(preferencesUrl, unsubscribeUrl);
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
