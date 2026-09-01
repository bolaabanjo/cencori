import crypto from "crypto";
import type { createAdminClient } from "@/lib/supabaseAdmin";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * The gateway credential Basecode signs in with.
 *
 * Basecode's sign-in returns a Supabase session, which authenticates the *user* but names no
 * project — and `/v1/*` needs a project to bill against, so every inference request from a
 * packaged build was refused while sign-in, workspaces and history all worked. A desktop client
 * cannot mint a key for itself either: the dashboard route that issues them authenticates by
 * cookie, which a native app does not have.
 *
 * So the key is issued here, at the one moment the server already holds the user's identity and
 * admin privileges. The user never sees it, the same way `vercel login` never shows you a token.
 */
const KEY_NAME = "Basecode Desktop";

/** Raw keys are unrecoverable once hashed, so each sign-in issues a fresh one. */
function mintKey(): { apiKey: string; keyHash: string; keyPrefix: string } {
  const prefix = "csk_";
  const apiKey = `${prefix}${crypto.randomBytes(24).toString("hex")}`;
  return {
    apiKey,
    keyHash: crypto.createHash("sha256").update(apiKey).digest("hex"),
    keyPrefix: `${apiKey.substring(0, prefix.length + 4)}...`,
  };
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "basecode"
  );
}

/** A project the user can already bill against, preferring the one they created first. */
async function findProject(admin: Admin, userId: string): Promise<string | null> {
  const { data: owned } = await admin
    .from("projects")
    .select("id, organizations!inner(owner_id)")
    .eq("organizations.owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);
  const ownedId = owned?.[0]?.id as string | undefined;
  if (ownedId) return ownedId;

  // Not an owner anywhere, but membership is access too — the same test
  // `require-project-access` applies.
  const { data: memberships } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId);
  const organizationIds = (memberships ?? []).map((row) => row.organization_id as string);
  if (!organizationIds.length) return null;

  const { data: shared } = await admin
    .from("projects")
    .select("id")
    .in("organization_id", organizationIds)
    .order("created_at", { ascending: true })
    .limit(1);
  return (shared?.[0]?.id as string | undefined) ?? null;
}

/** The org to create a project under: one the user owns, else one they belong to. */
async function findOrganization(admin: Admin, userId: string): Promise<string | null> {
  const { data: owned } = await admin
    .from("organizations")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);
  const ownedId = owned?.[0]?.id as string | undefined;
  if (ownedId) return ownedId;

  const { data: membership } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return (membership?.organization_id as string | undefined) ?? null;
}

async function createProject(admin: Admin, organizationId: string): Promise<string | null> {
  // A suffix rather than a retry loop: the slug only has to be unique, not pretty, and a
  // collision here would otherwise fail a sign-in.
  const slug = `${slugify(KEY_NAME)}-${crypto.randomBytes(3).toString("hex")}`;
  const { data, error } = await admin
    .from("projects")
    .insert({
      name: "Basecode",
      slug,
      description: "Created automatically for Basecode.",
      organization_id: organizationId,
      visibility: "private",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[BasecodeAuth] Could not create a project for Basecode", error);
    return null;
  }
  return (data?.id as string | undefined) ?? null;
}

/**
 * Issues the gateway credential for a signed-in Basecode user.
 *
 * Returns null rather than throwing when anything is missing: sign-in works today and must keep
 * working, so a user who cannot be given a key still gets their session — they lose inference,
 * not the app. The caller reports that difference; failing the exchange would take everything.
 */
export async function issueBasecodeApiKey(
  admin: Admin,
  userId: string,
): Promise<string | null> {
  try {
    let projectId = await findProject(admin, userId);
    if (!projectId) {
      const organizationId = await findOrganization(admin, userId);
      if (!organizationId) {
        console.error("[BasecodeAuth] No organization for user; cannot issue a Basecode key");
        return null;
      }
      projectId = await createProject(admin, organizationId);
      if (!projectId) return null;
    }

    // Supersede the previous desktop key. Each sign-in mints a new one because the raw value
    // cannot be read back, and leaving the old one live would grow a key per sign-in.
    await admin
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("project_id", projectId)
      .eq("created_by", userId)
      .eq("name", KEY_NAME)
      .is("revoked_at", null);

    const { apiKey, keyHash, keyPrefix } = mintKey();
    const { error } = await admin.from("api_keys").insert({
      project_id: projectId,
      name: KEY_NAME,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      created_by: userId,
      environment: "production",
      key_type: "secret",
      client_app: "basecode",
    });

    if (error) {
      console.error("[BasecodeAuth] Could not store the Basecode key", error);
      return null;
    }
    return apiKey;
  } catch (error) {
    console.error("[BasecodeAuth] Key issuance failed", error);
    return null;
  }
}
