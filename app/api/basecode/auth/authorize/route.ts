import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  BASECODE_AUTH_CODE_TTL_MS,
  BASECODE_CALLBACK_URL,
  basecodeSignInPath,
  isBasecodeChallenge,
  isBasecodeState,
  noStoreHeaders,
  sha256,
} from "@/lib/basecode-auth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { createServerClient } from "@/lib/supabaseServer";

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid Basecode sign-in request." },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  const body = payload && typeof payload === "object" ? payload : {};
  const challenge = String("code_challenge" in body ? body.code_challenge : "");
  const state = String("state" in body ? body.state : "");
  if (!isBasecodeChallenge(challenge) || !isBasecodeState(state)) {
    return NextResponse.json(
      { error: "Invalid Basecode sign-in request." },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user?.email) {
    const returnTo = basecodeSignInPath(challenge, state);
    return NextResponse.json(
      {
        error: "Your Cencori session expired.",
        login_url: `/login?redirect=${encodeURIComponent(returnTo)}`,
      },
      { status: 401, headers: noStoreHeaders() },
    );
  }

  const admin = createAdminClient();
  await admin
    .from("basecode_auth_codes")
    .delete()
    .lt("expires_at", new Date().toISOString());
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    email: user.email.toLowerCase(),
    type: "magiclink",
  });
  const actionLink = link?.properties?.action_link;
  const token = actionLink ? new URL(actionLink).searchParams.get("token") : null;
  if (linkError || !token) {
    console.error("[BasecodeAuth] Could not create session handoff", linkError);
    return NextResponse.json(
      { error: "Cencori could not start Basecode sign in." },
      { status: 500, headers: noStoreHeaders() },
    );
  }

  const code = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + BASECODE_AUTH_CODE_TTL_MS).toISOString();
  const { error: insertError } = await admin.from("basecode_auth_codes").insert({
    code_challenge: challenge,
    code_hash: sha256(code),
    email: user.email.toLowerCase(),
    expires_at: expiresAt,
    magic_link_token: token,
    user_id: user.id,
  });
  if (insertError) {
    console.error("[BasecodeAuth] Could not store session handoff", insertError);
    return NextResponse.json(
      { error: "Cencori could not start Basecode sign in." },
      { status: 500, headers: noStoreHeaders() },
    );
  }

  const callback = new URL(BASECODE_CALLBACK_URL);
  callback.searchParams.set("code", code);
  callback.searchParams.set("state", state);
  return NextResponse.json(
    { callback_url: callback.toString() },
    { headers: noStoreHeaders() },
  );
}
