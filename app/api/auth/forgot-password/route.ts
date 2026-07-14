import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const supabase = await createServerClient();

    const origin = req.headers.get("origin") || "http://localhost:3000";
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/reset-password`,
    });

    if (error) {
      console.error("Forgot password error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Forgot password API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
