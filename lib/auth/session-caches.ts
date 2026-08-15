import { clearDashboardUserCache } from "@/lib/auth/dashboard-user-cache";

// Per-tab caches that are scoped to *whoever was signed in when they were
// written*. They exist so a reload paints instantly instead of flashing an
// empty shell, which also means they survive a sign-out that happened in a
// different tab — the storage event never reaches this one. Anything that
// notices the identity behind the tab has changed must clear them, or the
// previous account's org names keep rendering in the chrome.
export const ORG_PROJECT_CACHE_KEY = "cencori:org-project-cache";

// A deliberate "Log out" click sets this immediately before calling signOut().
// The session watcher would otherwise see the session disappear and raise the
// "you've been signed out" interruption on top of a sign-out the user just
// asked for. Time-boxed so a stale flag can't swallow a real interruption
// minutes later — the redirect to /login follows within a tick or two.
const INTENTIONAL_SIGN_OUT_KEY = "cencori:intentional-sign-out";
const INTENTIONAL_SIGN_OUT_TTL_MS = 10_000;

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Drop every client-side cache keyed to the signed-in user. Safe to call more
 * than once; a browser with storage disabled is a no-op, not a throw.
 */
export function clearClientSessionCaches(): void {
  clearDashboardUserCache();

  const storage = getSessionStorage();
  if (!storage) return;

  try {
    storage.removeItem(ORG_PROJECT_CACHE_KEY);
  } catch {
    // Storage can be disabled by the browser; the caches are advisory only.
  }
}

/** Mark the sign-out that is about to happen as user-initiated. */
export function beginIntentionalSignOut(): void {
  const storage = getSessionStorage();
  if (!storage) return;

  try {
    storage.setItem(INTENTIONAL_SIGN_OUT_KEY, String(Date.now()));
  } catch {
    // Worst case the user sees the interruption screen on their own log-out.
  }
}

/**
 * Read-and-clear. Returns true only for a flag set within the last few seconds,
 * so an abandoned flag can't suppress a genuine cross-tab sign-out later.
 */
export function consumeIntentionalSignOut(): boolean {
  const storage = getSessionStorage();
  if (!storage) return false;

  try {
    const raw = storage.getItem(INTENTIONAL_SIGN_OUT_KEY);
    if (!raw) return false;

    storage.removeItem(INTENTIONAL_SIGN_OUT_KEY);
    const at = Number(raw);
    return Number.isFinite(at) && Date.now() - at < INTENTIONAL_SIGN_OUT_TTL_MS;
  } catch {
    return false;
  }
}
