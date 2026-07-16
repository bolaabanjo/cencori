export type DashboardUser = {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
};

const DASHBOARD_USER_CACHE_KEY = "cencori:dashboard-user:v1";
const DISPLAY_METADATA_KEYS = ["name", "full_name", "avatar_url", "picture"] as const;

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isDashboardUser(value: unknown): value is DashboardUser {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const candidate = value as DashboardUser;
  const hasValidEmail =
    candidate.email === undefined ||
    candidate.email === null ||
    typeof candidate.email === "string";
  const hasValidMetadata =
    candidate.user_metadata === undefined ||
    (candidate.user_metadata !== null &&
      typeof candidate.user_metadata === "object" &&
      !Array.isArray(candidate.user_metadata));

  return hasValidEmail && hasValidMetadata;
}

function pickDisplayMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!metadata) return {};

  return DISPLAY_METADATA_KEYS.reduce<Record<string, unknown>>((displayMetadata, key) => {
    if (typeof metadata[key] === "string") {
      displayMetadata[key] = metadata[key];
    }
    return displayMetadata;
  }, {});
}

export function readDashboardUserCache(
  storage: Storage | null = getSessionStorage(),
): DashboardUser | null {
  if (!storage) return null;

  try {
    const cached = storage.getItem(DASHBOARD_USER_CACHE_KEY);
    if (!cached) return null;

    const parsed: unknown = JSON.parse(cached);
    if (!isDashboardUser(parsed)) {
      storage.removeItem(DASHBOARD_USER_CACHE_KEY);
      return null;
    }

    return parsed;
  } catch {
    try {
      storage.removeItem(DASHBOARD_USER_CACHE_KEY);
    } catch {
      // Storage can be disabled by the browser. Auth verification still works.
    }
    return null;
  }
}

export function writeDashboardUserCache(
  user: DashboardUser,
  storage: Storage | null = getSessionStorage(),
): void {
  if (!storage) return;

  try {
    storage.setItem(
      DASHBOARD_USER_CACHE_KEY,
      JSON.stringify({
        email: user.email ?? null,
        user_metadata: pickDisplayMetadata(user.user_metadata),
      } satisfies DashboardUser),
    );
  } catch {
    // A private browsing policy or full storage must not block authentication.
  }
}

export function clearDashboardUserCache(
  storage: Storage | null = getSessionStorage(),
): void {
  if (!storage) return;

  try {
    storage.removeItem(DASHBOARD_USER_CACHE_KEY);
  } catch {
    // A failed cache clear is non-critical; Supabase remains the source of truth.
  }
}
