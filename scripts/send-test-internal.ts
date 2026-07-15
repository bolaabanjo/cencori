import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sendbyteKey = process.env.SENDBYTE_API_KEY!;

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const email = 'bolaabanjo@gmail.com';
  const { data: { users } } = await admin.auth.admin.listUsers();
  const found = users?.find(u => u.email?.toLowerCase() === email);
  const meta = found?.user_metadata || {};
  const fullName = (meta.full_name || meta.name || '').trim();
  const firstName = fullName.split(/\s+/)[0] || email.split('@')[0];

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;color:#111;">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;">
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">Hi ${firstName},</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">You have a Cencori API key. You can add AI-powered customer support to your product in about 30 minutes.</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">One endpoint, streaming responses, multi-model fallback. Your users don't care which model is under the hood — they just want their questions answered.</p>
<pre style="background:#f5f5f5;padding:12px;border-radius:6px;font-size:13px;line-height:1.5;overflow-x:auto;"><code>const stream = cencori.ai.chatStream({
  model: "claude-sonnet-5",
  messages: [{ role: "user", content: userMessage }],
});</code></pre>
<p style="margin:24px 0 24px;font-size:14px;line-height:1.6;color:#555;">Want to look up an order status? Refund a transaction? Wire up tool calls and let the model handle it — no brittle intent classification.</p>
<p style="margin:0 0 8px;font-size:14px;line-height:1.8;">→ <a href="https://cencori.com/docs/ai/endpoints/chat" style="color:#111;text-decoration:underline;">Chat completions docs</a> →<br>→ <a href="https://cencori.com/docs/ai/tool-calling" style="color:#111;text-decoration:underline;">Tool calling guide</a> →<br>→ <a href="https://cencori.com/docs/ai/vercel-sdk" style="color:#111;text-decoration:underline;">Vercel AI SDK integration</a> →</p>
<p style="margin:24px 0 24px;font-size:14px;line-height:1.6;color:#555;">No inference infrastructure to manage. No failover logic to write. You already have the key.</p>
<p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:#555;">Build different.</p>
<p style="margin:0 0 32px;font-size:14px;line-height:1.6;color:#555;">Eniola, Cencori.</p>
<div style="margin-top:32px;padding-top:24px;border-top:1px solid #eee;">
<p style="margin:0 0 12px;font-size:12px;color:#999;text-align:center;"><a href="https://cencori.com/docs" style="color:#888;text-decoration:underline;">Docs</a> &nbsp;·&nbsp; <a href="https://cencori.com/blog" style="color:#888;text-decoration:underline;">Blog</a></p>
<p style="margin:0 0 8px;font-size:12px;color:#999;text-align:center;"><a href="https://github.com/cencori" style="color:#888;text-decoration:none;display:inline-block;vertical-align:middle;"><img src="https://cencori.com/social/github-icon.png" width="20" height="20" alt="GitHub" style="display:inline-block;vertical-align:middle;border:0;"></a><span style="color:#ccc;margin:0 6px;vertical-align:middle;">·</span><a href="https://x.com/cencori" style="color:#888;text-decoration:none;display:inline-block;vertical-align:middle;"><img src="https://cencori.com/social/x-icon.png" width="20" height="20" alt="X" style="display:inline-block;vertical-align:middle;border:0;"></a><span style="color:#ccc;margin:0 6px;vertical-align:middle;">·</span><a href="https://linkedin.com/company/cencori" style="color:#888;text-decoration:none;display:inline-block;vertical-align:middle;"><img src="https://cencori.com/social/linkedin-icon.png" width="20" height="20" alt="LinkedIn" style="display:inline-block;vertical-align:middle;border:0;"></a><span style="color:#ccc;margin:0 6px;vertical-align:middle;">·</span><a href="https://discord.gg/cencori" style="color:#888;text-decoration:none;display:inline-block;vertical-align:middle;"><img src="https://cencori.com/social/discord-icon.png" width="20" height="20" alt="Discord" style="display:inline-block;vertical-align:middle;border:0;"></a><span style="color:#ccc;margin:0 6px;vertical-align:middle;">·</span><a href="https://youtube.com/@cencori" style="color:#888;text-decoration:none;display:inline-block;vertical-align:middle;"><img src="https://cencori.com/social/youtube-icon.png" width="20" height="20" alt="YouTube" style="display:inline-block;vertical-align:middle;border:0;"></a></p>
<p style="margin:0 0 4px;font-size:11px;color:#aaa;text-align:center;"><a href="https://cencori.com/account/settings" style="color:#888;text-decoration:underline;">Manage preferences</a> &nbsp;·&nbsp; <a href="{{unsubscribe_url}}" style="color:#888;text-decoration:underline;">Unsubscribe</a></p>
<p style="margin:0;font-size:11px;color:#aaa;text-align:center;">Cencori, Inc. &middot; San Francisco, CA</p>
</div>
</div>
</body>
</html>`;

  const res = await fetch('https://api.sendbyte.africa/v1/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sendbyteKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Eniola from Cencori <updates@send.cencori.com>',
      to: email,
      subject: 'Add AI support to your product this afternoon',
      html,
    }),
  });

  const result = await res.json();
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
