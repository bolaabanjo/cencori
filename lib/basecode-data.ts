import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabaseAdmin";

export type BasecodeDataSession = {
  admin: ReturnType<typeof createAdminClient>;
  user: User;
};

export async function authenticateBasecodeDataRequest(
  authorization: string | null,
): Promise<BasecodeDataSession | null> {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  if (!token || token.length > 4096) return null;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return { admin, user: data.user };
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

export function cleanText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned && cleaned.length <= maximum ? cleaned : null;
}
