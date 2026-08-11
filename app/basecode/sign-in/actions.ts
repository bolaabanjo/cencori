"use server";

import { redirect } from "next/navigation";
import {
  basecodeSignInPath,
  isBasecodeChallenge,
  isBasecodeState,
} from "@/lib/basecode-auth";
import { createServerClient } from "@/lib/supabaseServer";

export async function useAnotherCencoriAccount(formData: FormData): Promise<never> {
  const challenge = String(formData.get("code_challenge") ?? "");
  const state = String(formData.get("state") ?? "");
  if (!isBasecodeChallenge(challenge) || !isBasecodeState(state)) redirect("/login");

  const supabase = await createServerClient();
  await supabase.auth.signOut();
  const returnTo = basecodeSignInPath(challenge, state);
  redirect(`/login?redirect=${encodeURIComponent(returnTo)}`);
}
