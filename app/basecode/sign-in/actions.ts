"use server";

import { redirect } from "next/navigation";
import {
  BASECODE_CALLBACK_URL,
  basecodeSignInPath,
  isBasecodeChallenge,
  isBasecodeRedirectUri,
  isBasecodeState,
} from "@/lib/basecode-auth";
import { createServerClient } from "@/lib/supabaseServer";

export async function useAnotherCencoriAccount(formData: FormData): Promise<never> {
  const challenge = String(formData.get("code_challenge") ?? "");
  const redirectUri = String(formData.get("redirect_uri") ?? BASECODE_CALLBACK_URL);
  const state = String(formData.get("state") ?? "");
  if (
    !isBasecodeChallenge(challenge) ||
    !isBasecodeState(state) ||
    !isBasecodeRedirectUri(redirectUri)
  ) {
    redirect("/login");
  }

  const supabase = await createServerClient();
  await supabase.auth.signOut();
  const returnTo = basecodeSignInPath(challenge, state, redirectUri);
  redirect(`/login?redirect=${encodeURIComponent(returnTo)}`);
}
