/**
 * True when a failed Supabase/PostgREST call failed *because of the session*
 * rather than because of the data. RLS denials are deliberately NOT in here —
 * a row the current user can't see comes back as zero rows, not as an error,
 * and treating a permission gap as an expired session would bounce people to
 * the login screen while they're perfectly signed in.
 */
export function isAuthExpiredError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as { code?: unknown; status?: unknown; message?: unknown };

  // PGRST301: JWT expired / invalid. PGRST303: JWT claim missing.
  if (candidate.code === "PGRST301" || candidate.code === "PGRST303") return true;
  if (candidate.status === 401) return true;

  const message = typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";
  return (
    message.includes("jwt expired") ||
    message.includes("invalid jwt") ||
    message.includes("invalid claim") ||
    message.includes("refresh token not found") ||
    message.includes("invalid refresh token")
  );
}
