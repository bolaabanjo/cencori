import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  isBasecodeCode,
  isBasecodeVerifier,
  noStoreHeaders,
  sameValue,
  sha256,
} from "@/lib/basecode-auth";
import { createAdminClient } from "@/lib/supabaseAdmin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;

function errorResponse(status = 400) {
  return NextResponse.json(
    { error: "This Basecode sign-in request expired or could not be verified." },
    { headers: noStoreHeaders(), status },
  );
}

export async function POST(request: NextRequest) {
  let code: unknown;
  let verifier: unknown;
  try {
    const body = await request.json();
    code = body.code;
    verifier = body.code_verifier;
  } catch {
    return errorResponse();
  }
  if (!isBasecodeCode(code) || !isBasecodeVerifier(verifier)) return errorResponse();

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: handoff } = await admin
    .from("basecode_auth_codes")
    .select("id, code_challenge, magic_link_token")
    .eq("code_hash", sha256(code))
    .gt("expires_at", now)
    .maybeSingle();

  const expectedChallenge = sha256(verifier);
  if (
    !handoff ||
    typeof handoff.magic_link_token !== "string" ||
    !sameValue(handoff.code_challenge, expectedChallenge)
  ) {
    return errorResponse();
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: handoff.magic_link_token,
    type: "magiclink",
  });
  if (error || !data.session || !data.user) {
    console.error("[BasecodeAuth] Session exchange failed", error);
    return errorResponse(401);
  }

  const { data: consumed } = await admin
    .from("basecode_auth_codes")
    .delete()
    .eq("id", handoff.id)
    .select("id")
    .maybeSingle();
  if (!consumed) return errorResponse();

  // No key is issued here any more. Sign-in used to mint a Cencori key with admin rights and bind
  // it to whichever project the account created first, which made every Basecode user a separate
  // Cencori customer and logged their usage in a project they never chose. Basecode is one
  // customer with one project and one key, that key lives on the server, and inference goes
  // through /api/basecode/inference — so the session below is the whole credential.
  return NextResponse.json(
    {
      access_token: data.session.access_token,
      expires_in: data.session.expires_in,
      refresh_token: data.session.refresh_token,
      user: data.user,
    },
    { headers: noStoreHeaders() },
  );
}
