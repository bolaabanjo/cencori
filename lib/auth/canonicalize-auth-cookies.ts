/**
 * One-time repair for auth cookies that got written on the wrong domain.
 *
 * `createBrowserClient` from @supabase/ssr caches a module-level singleton and
 * discards the options of every call after the first. We used to call it in
 * five places, only one of which passed `cookieOptions.domain`, so whichever
 * module Next happened to evaluate first decided where the session cookie
 * landed — host-only `cencori.com` or `.cencori.com`. The server always writes
 * `.cencori.com`, so browsers could end up holding *both*.
 *
 * Two same-named cookies are indistinguishable to the read path
 * (`allCookies.find(c => c.name === chunkName)` takes the first match) and
 * browsers do not agree on the order. Safari would hand back the stale copy,
 * the session failed to decode, and the dashboard guard bounced to /login —
 * permanently, because sign-out only cleared one of the two.
 *
 * All clients now share the singleton, so no *new* duplicates are created. This
 * cleans up the ones already sitting in users' browsers, which would otherwise
 * keep those devices broken forever.
 *
 * JS can't read a cookie's domain, so we detect it by deletion: remove the
 * host-only copy and see whether the name survives.
 *   - survives  → a `.cencori.com` copy exists (or existed alongside). Done.
 *   - vanishes  → it was host-only. Re-set the captured value on `.cencori.com`
 *                 so the user stays logged in instead of being kicked out.
 */

const COOKIE_PREFIX = "sb-";
const CANONICAL_DOMAIN = ".cencori.com";
// Matches DEFAULT_COOKIE_OPTIONS.maxAge in @supabase/ssr (400 days).
const MAX_AGE = 400 * 24 * 60 * 60;

/** Cookie pairs in document.cookie order, duplicates preserved. */
function readCookiePairs(): Array<{ name: string; value: string }> {
  if (!document.cookie) return [];
  return document.cookie.split("; ").flatMap((entry) => {
    const eq = entry.indexOf("=");
    if (eq < 1) return [];
    return [{ name: entry.slice(0, eq), value: entry.slice(eq + 1) }];
  });
}

function hasCookieNamed(name: string): boolean {
  return readCookiePairs().some((pair) => pair.name === name);
}

export function canonicalizeAuthCookies(): void {
  if (typeof document === "undefined") return;
  // Only prod runs on a shared parent domain; localhost cookies are host-only
  // by definition and have nothing to canonicalize.
  if (!window.location.hostname.endsWith("cencori.com")) return;

  const secure = window.location.protocol === "https:";
  const seen = new Set<string>();

  for (const { name, value } of readCookiePairs()) {
    if (!name.startsWith(COOKIE_PREFIX) || seen.has(name)) continue;
    seen.add(name);

    // Omitting `domain` targets the host-only cookie specifically.
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${secure ? "; Secure" : ""}`;

    if (!hasCookieNamed(name)) {
      // It was the only copy — put it back where it belongs so the session
      // survives this repair.
      document.cookie =
        `${name}=${value}; Path=/; Domain=${CANONICAL_DOMAIN}; Max-Age=${MAX_AGE}; SameSite=Lax` +
        (secure ? "; Secure" : "");
    }
  }
}
