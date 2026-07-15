import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const { email, code, userId, origin } = await req.json();

    if (!email || !code) {
      return NextResponse.json({ error: "Email and code are required" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: records, error: fetchError } = await admin
      .from("verification_codes")
      .select("*")
      .eq("email", email.toLowerCase())
      .eq("code", code)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (fetchError) {
      console.error("Error fetching verification code:", fetchError);
      return NextResponse.json({ error: "Failed to verify code" }, { status: 500 });
    }

    if (!records || records.length === 0) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    const record = records[0];

    if (new Date(record.expires_at) < new Date()) {
      return NextResponse.json({ error: "Code expired" }, { status: 400 });
    }

    if (record.attempts >= 5) {
      return NextResponse.json({ error: "Too many attempts. Request a new code." }, { status: 400 });
    }

    await admin
      .from("verification_codes")
      .update({ attempts: record.attempts + 1 })
      .eq("id", record.id);

    const targetUserId = userId || null;

    if (targetUserId) {
      const { error: updateError } = await admin.auth.admin.updateUserById(
        targetUserId,
        { email_confirm: true }
      );

      if (updateError) {
        console.error("Error confirming user email:", updateError);
        return NextResponse.json({ error: "Failed to verify email" }, { status: 500 });
      }
    }

    await admin
      .from("verification_codes")
      .update({ used_at: new Date().toISOString(), attempts: record.attempts + 1 })
      .eq("id", record.id);

    const baseUrl = origin || "http://localhost:3000";

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: email.toLowerCase(),
      options: { redirectTo: `${baseUrl}/onboarding` },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("Error generating magic link:", linkError);
      return NextResponse.json({ success: true, loginLink: `${baseUrl}/login` });
    }

    const actionLink = linkData.properties.action_link;
    const linkUrl = new URL(actionLink);
    const token = linkUrl.searchParams.get("token");

    if (!token) {
      console.error("No token in magic link");
      return NextResponse.json({ success: true, loginLink: `${baseUrl}/login` });
    }

    return NextResponse.json({ success: true, token, email: email.toLowerCase() });
  } catch (err) {
    console.error("Confirm verification code error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
