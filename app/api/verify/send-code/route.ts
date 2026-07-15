import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { SendByte } from "@sendbyte/node";

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: Request) {
  try {
    const { email, userId } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const admin = createAdminClient();

    const { error: insertError } = await admin.from("verification_codes").insert({
      email: email.toLowerCase(),
      code,
      expires_at: expiresAt.toISOString(),
    });

    if (insertError) {
      console.error("Error storing verification code:", insertError);
      return NextResponse.json({ error: "Failed to send code" }, { status: 500 });
    }

    let greeting = "Hi there,";
    if (userId) {
      try {
        const { data: user } = await admin.auth.admin.getUserById(userId);
        const firstName = user?.user?.user_metadata?.first_name;
        if (firstName && typeof firstName === "string") {
          greeting = `Hi ${firstName},`;
        }
      } catch {
        // fall back to default greeting
      }
    }

    const SENDBYTE_API_KEY = process.env.SENDBYTE_API_KEY;
    if (SENDBYTE_API_KEY) {
      try {
        const sendbyte = new SendByte(SENDBYTE_API_KEY);
        await sendbyte.emails.send({
          from: "Cencori <system@send.cencori.com>",
          to: email,
          subject: "Your verification code",
          html: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;color:#111;">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;">
  <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">${greeting}</p>
  <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">Use the code below to verify your account.</p>
  <div style="text-align:center;margin:32px 0;">
    <span style="display:inline-block;font-size:42px;font-weight:700;letter-spacing:12px;color:#111;background:#f5f5f5;padding:20px 28px;border-radius:8px;">${code}</span>
  </div>
  <p style="margin:0 0 24px;font-size:13px;line-height:1.6;color:#999;">This code expires in 10 minutes. If you didn&rsquo;t request this, you can safely ignore this email.</p>
  <div style="margin-top:32px;padding-top:24px;border-top:1px solid #eee;">
    <p style="margin:0 0 12px;font-size:12px;color:#999;text-align:center;"><a href="https://cencori.com/docs" style="color:#888;text-decoration:underline;">Docs</a> &nbsp;&middot;&nbsp; <a href="https://cencori.com/blog" style="color:#888;text-decoration:underline;">Blog</a></p>
    <p style="margin:0 0 8px;font-size:12px;color:#999;text-align:center;">Making AI infrastructure accessible &mdash; so builders can build and scale with confidence.</p>
    <p style="margin:0 4px 0;font-size:11px;color:#aaa;text-align:center;">Cencori, Inc. &middot; San Francisco, CA</p>
  </div>
</div>
</body>
</html>`,
        });
      } catch (emailErr) {
        console.error("Failed to send verification email:", emailErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Send verification code error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
