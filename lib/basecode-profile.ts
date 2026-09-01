import type { SupabaseClient } from "@supabase/supabase-js";

type Admin = SupabaseClient;

export type BasecodeProfile = {
  avatarUrl: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
};

/**
 * Handles the product needs for itself, so nobody can take one and make a route ambiguous later.
 *
 * Kept here rather than in a check constraint because it will grow with the product, and a
 * constraint is a poor place for a list that changes.
 */
const RESERVED_USERNAMES = new Set([
  "about", "account", "accounts", "admin", "administrator", "api", "auth", "basecode", "billing",
  "blog", "cencori", "contact", "dashboard", "docs", "help", "home", "internal", "legal", "login",
  "logout", "me", "new", "null", "org", "organization", "orgs", "pricing", "privacy", "profile",
  "root", "settings", "signin", "signout", "signup", "static", "status", "support", "system",
  "team", "terms", "undefined", "user", "users", "www",
]);

/** Mirrors the constraint the table carries, so a bad handle is refused before it reaches Postgres. */
const USERNAME_SHAPE = /^[a-zA-Z0-9](?:[a-zA-Z0-9_-]*[a-zA-Z0-9])?$/;

export type UsernameProblem =
  | { ok: true; value: string | null }
  | { ok: false; reason: string };

export function validateUsername(raw: unknown): UsernameProblem {
  if (raw === null || raw === undefined || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, reason: "That username is not valid." };
  const value = raw.trim();
  if (!value) return { ok: true, value: null };
  if (value.length < 3) return { ok: false, reason: "Usernames are at least 3 characters." };
  if (value.length > 30) return { ok: false, reason: "Usernames are at most 30 characters." };
  if (!USERNAME_SHAPE.test(value)) {
    return {
      ok: false,
      reason: "Use letters, numbers, hyphens and underscores, starting and ending with a letter or number.",
    };
  }
  if (RESERVED_USERNAMES.has(value.toLowerCase())) {
    return { ok: false, reason: "That username is reserved." };
  }
  return { ok: true, value };
}

/** Trimmed, capped, and empty-as-absent — a name someone cleared should not persist as "". */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().slice(0, 80);
  return value || null;
}

export function profileJson(
  row: Record<string, unknown> | null,
  user: { email?: string | null; user_metadata?: Record<string, unknown> | null },
): BasecodeProfile {
  const metadata = user.user_metadata ?? {};
  const fullName = typeof metadata.full_name === "string"
    ? metadata.full_name
    : typeof metadata.name === "string"
      ? metadata.name
      : "";
  const [metaFirst, ...metaRest] = fullName.trim().split(/\s+/).filter(Boolean);
  const metaAvatar = typeof metadata.avatar_url === "string"
    ? metadata.avatar_url
    : typeof metadata.picture === "string"
      ? metadata.picture
      : null;

  // The profile wins wherever it has an answer; sign-in metadata only fills what was never set,
  // so a name someone deliberately cleared does not come back from the identity provider.
  return {
    avatarUrl: (row?.avatar_url as string | null) ?? metaAvatar,
    email: user.email ?? "",
    firstName: (row?.first_name as string | null) ?? metaFirst ?? null,
    lastName: (row?.last_name as string | null) ?? (metaRest.join(" ") || null),
    username: (row?.username as string | null) ?? null,
  };
}

export async function readProfileRow(admin: Admin, userId: string) {
  const { data } = await admin.from("user_profiles").select("*").eq("id", userId).maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

/**
 * Writes the fields that were actually sent, leaving the rest alone.
 *
 * A patch that omits a field must not blank it: the desktop sends one field at a time as it is
 * edited, and a whole-row write would erase whatever the person had not touched.
 */
export async function writeProfile(
  admin: Admin,
  userId: string,
  patch: Record<string, string | null>,
): Promise<{ error: string | null }> {
  if (Object.keys(patch).length === 0) return { error: null };
  const { error } = await admin
    .from("user_profiles")
    .upsert({ id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (!error) return { error: null };
  // The unique index is the authority on a taken handle, not the read that preceded it: two
  // requests can both find it free and only one can have it.
  if (error.code === "23505") return { error: "That username is taken." };
  if (error.code === "23514") return { error: "That username is not valid." };
  console.error("[Basecode Profile] Could not write profile", error);
  return { error: "Your profile could not be saved." };
}
