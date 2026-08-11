import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { noStoreHeaders } from "@/lib/basecode-auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;

export async function POST(request: NextRequest) {
  let accessToken = "";
  let refreshToken = "";
  try {
    const body = await request.json();
    accessToken = typeof body.access_token === "string" ? body.access_token : "";
    refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : "";
  } catch {
    // Local sign-out still succeeds when the remote session is already gone.
  }

  if (accessToken && refreshToken && accessToken.length < 16_384 && refreshToken.length < 4096) {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (!sessionError) await supabase.auth.signOut({ scope: "local" });
  }

  return NextResponse.json({ ok: true }, { headers: noStoreHeaders() });
}
