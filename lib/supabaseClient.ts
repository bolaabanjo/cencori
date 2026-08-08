import { createBrowserClient } from "@supabase/ssr";
import { canonicalizeAuthCookies } from "@/lib/auth/canonicalize-auth-cookies";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

// THE browser client. Import this — never call createBrowserClient directly.
//
// @supabase/ssr caches its own module-level singleton and silently ignores the
// options of every call after the first, so a second call site with different
// cookieOptions doesn't get a second client — it gets *this* one, and whichever
// module evaluated first decides the cookie domain for the whole app. Keeping
// one call site is what makes `domain` deterministic.
function build() {
  return createBrowserClient(
    supabaseUrl!,
    supabaseKey!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      cookieOptions: {
        // Shared with scan./api./send. — the session has to be readable there.
        domain: typeof window !== 'undefined' && window.location.hostname.endsWith('cencori.com')
          ? '.cencori.com'
          : undefined,
        path: '/',
        sameSite: 'lax',
        secure: typeof window !== 'undefined' && window.location.protocol === 'https:',
      },
    }
  );
}

// Inferred from the factory, not `ReturnType<typeof createBrowserClient>` —
// the latter resolves the generic parameters to their bare defaults and hands
// every caller a client whose query results are untyped.
let client: ReturnType<typeof build> | null = null;

export const supabase = (() => {
  if (client) return client;

  // Must run before the client reads cookies, or it reads the stale duplicate.
  if (typeof window !== "undefined") {
    canonicalizeAuthCookies();
  }

  client = build();
  return client;
})();
