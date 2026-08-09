import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RESERVED_ORG_SLUGS } from "@/lib/reserved-slugs";

const LAST_ORG_COOKIE = "cencori:last-org";
const LAST_ORG_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/**
 * If `pathname` starts with what looks like an org slug (first segment
 * isn't a static-route reserved word and doesn't look like a file), return
 * that slug. Otherwise return null.
 */
function extractOrgSlugFromPath(pathname: string): string | null {
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length === 0) return null;
    const first = segments[0].toLowerCase();
    if (RESERVED_ORG_SLUGS.has(first)) return null;
    if (first.includes(".")) return null;
    return first;
}

/**
 * Rewrite the legacy /dashboard/organizations/* prod URL shape to the new
 * top-level shape. Returns the new pathname, or null if the path shouldn't
 * be rewritten.
 *
 * AI Gateway sub-routes moved: prompts/providers/custom-providers/cache/
 * playground used to live at the project root; they now live under
 * ai-gateway/. `models` moved from project-level to org-level.
 */
const AI_GATEWAY_PROJECT_ROUTES = new Set([
    "prompts",
    "providers",
    "custom-providers",
    "cache",
    "playground",
]);

function rewriteLegacyOrganizationsPath(pathname: string): string | null {
    // Strip leading slash, split, and drop empty segments.
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length < 2 || segments[0] !== "dashboard" || segments[1] !== "organizations") {
        return null;
    }

    // /dashboard/organizations — flat org list.
    if (segments.length === 2) return "/dashboard";

    // /dashboard/organizations/new — was org creation flow.
    if (segments.length === 3 && segments[2] === "new") return "/onboarding";

    const orgSlug = segments[2];

    // /dashboard/organizations/{orgSlug}
    if (segments.length === 3) return `/${orgSlug}`;

    const afterOrg = segments[3];

    // /dashboard/organizations/{orgSlug}/{non-projects sub} — org-scoped page.
    if (afterOrg !== "projects") {
        const subPath = segments.slice(3).join("/");
        return `/${orgSlug}/~/${subPath}`;
    }

    // afterOrg === "projects" from here.
    // /dashboard/organizations/{orgSlug}/projects
    if (segments.length === 4) return `/${orgSlug}/~/projects`;

    const afterProjects = segments[4];

    // /dashboard/organizations/{orgSlug}/projects/{new|import}[/rest]
    if (afterProjects === "new" || afterProjects === "import") {
        const rest = segments.slice(4).join("/");
        return `/${orgSlug}/~/projects/${rest}`;
    }

    // /dashboard/organizations/{orgSlug}/projects/{projectSlug}[/rest]
    const projectSlug = afterProjects;
    const projectRest = segments.slice(5);

    // Bare project overview.
    if (projectRest.length === 0) return `/${orgSlug}/${projectSlug}`;

    const projectSubRoute = projectRest[0];

    // Models moved from project-level to org-level.
    if (projectSubRoute === "models") {
        return `/${orgSlug}/~/ai-gateway/models`;
    }

    // AI Gateway routes were at project root; now nested under ai-gateway/.
    if (AI_GATEWAY_PROJECT_ROUTES.has(projectSubRoute)) {
        return `/${orgSlug}/${projectSlug}/ai-gateway/${projectRest.join("/")}`;
    }

    // Everything else passes through unchanged.
    return `/${orgSlug}/${projectSlug}/${projectRest.join("/")}`;
}

// Supabase config
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Security headers for all responses
const securityHeaders: Record<string, string> = {
  // Prevent clickjacking
  "X-Frame-Options": "DENY",
  // Prevent MIME type sniffing
  "X-Content-Type-Options": "nosniff",
  // XSS Protection (legacy browsers)
  "X-XSS-Protection": "1; mode=block",
  // Control referrer information
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Restrict browser features
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  // Enforce HTTPS (HSTS) - 1 year with subdomains and preload
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  // Content Security Policy - prevent XSS and data injection
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://checkout.stripe.com https://checkout.bachs.io https://www.googletagmanager.com https://*.i.posthog.com https://vercel.live https://*.vercel-scripts.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://checkout.stripe.com https://r.stripe.com https://api.bachs.io https://sandbox-api.bachs.io https://checkout.bachs.io https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://*.i.posthog.com https://vercel.live wss://vercel.live",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com https://checkout.bachs.io https://www.youtube.com https://youtube.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
};

/**
 * Apply security headers to a response
 */
function applySecurityHeaders(response: NextResponse): NextResponse {
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

function isProtectedApiPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/projects/") ||
    pathname.startsWith("/api/organizations/") ||
    pathname === "/api/github/repositories" ||
    pathname === "/api/internal/metrics/overview" ||
    pathname === "/api/internal/admins/verify"
  );
}

function isLocalHostname(domain: string): boolean {
  return (
    domain === "localhost" ||
    domain.endsWith(".localhost") ||
    domain === "127.0.0.1" ||
    domain === "::1"
  );
}

/**
 * Hosted-agent deployments are still an unfinished local build. Block both
 * their UI and API surface on every non-local host, including preview URLs.
 */
function isLocalComputePath(pathname: string): boolean {
  return (
    pathname === "/compute" ||
    /^\/[^/]+\/~\/deployments(?:\/|$)/.test(pathname) ||
    /^\/[^/]+\/~\/projects\/new-agent(?:\/|$)/.test(pathname) ||
    /^\/[^/]+\/[^/]+\/deployments(?:\/|$)/.test(pathname) ||
    /^\/dashboard\/organizations\/[^/]+\/deployments(?:\/|$)/.test(pathname) ||
    /^\/dashboard\/organizations\/[^/]+\/projects\/[^/]+\/deployments(?:\/|$)/.test(pathname) ||
    /^\/api\/projects\/[^/]+\/agents(?:\/|$)/.test(pathname) ||
    /^\/api\/organizations\/[^/]+\/agents(?:\/|$)/.test(pathname) ||
    pathname === "/api/github/detect"
  );
}

/** Memory product surfaces are local-only until the product is launched. */
function isLocalMemoryPath(pathname: string): boolean {
  return (
    pathname === "/memory" ||
    /^\/[^/]+\/[^/]+\/memory(?:\/|$)/.test(pathname) ||
    /^\/api\/projects\/[^/]+\/memory(?:\/|$)/.test(pathname) ||
    pathname === "/api/memory" ||
    pathname.startsWith("/api/memory/") ||
    pathname === "/api/v1/memory" ||
    pathname.startsWith("/api/v1/memory/") ||
    pathname === "/api/ai/rag"
  );
}

/**
 * Page paths that require a session. Exact match or `${prefix}/…`.
 *
 * `/internal` is intentionally absent: app/internal/layout.tsx renders its own
 * sign-in form in place when there's no user, so redirecting to /login here
 * would make the internal panel unreachable.
 */
const PROTECTED_PAGE_PREFIXES = ["/dashboard", "/account", "/onboarding"];

function isProtectedPagePath(pathname: string): boolean {
  return PROTECTED_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Refresh whenever the visitor actually has a session.
 *
 * This used to list `/dashboard` and `/internal` — but the URL polish handled
 * further down this same file moved the app to top-level `/{orgSlug}/*`, and
 * this predicate was never updated with it. The result: the entire dashboard
 * ran with no server-side token refresh, leaning on the browser client's
 * `autoRefreshToken` timer alone. That timer is exactly what mobile Safari
 * freezes when you switch apps, so the token would go stale with nothing to
 * renew it, and the session guard bounced the user to /login.
 *
 * Keying off the cookie instead of a path list means anonymous marketing and
 * docs traffic still skips the round-trip to Supabase, while every signed-in
 * request gets its session renewed no matter which URL shape it uses.
 */
function shouldRefreshAuthSession(
  pathname: string,
  isScanSubdomain: boolean,
  needsApiAccessCheck: boolean,
  isScanAuthPath: boolean,
  hasSessionCookie: boolean,
  isFile: boolean,
): boolean {
  if (needsApiAccessCheck) {
    return true;
  }

  if (isScanSubdomain && isScanAuthPath) {
    return false;
  }

  return hasSessionCookie && !isFile;
}

function extractProjectId(pathname: string): string | null {
  const match = pathname.match(/^\/api\/projects\/([^/]+)/);
  return match?.[1] || null;
}

function extractOrgSlug(pathname: string): string | null {
  const match = pathname.match(/^\/api\/organizations\/([^/]+)/);
  return match?.[1] || null;
}

async function canAccessOrganization(
  adminClient: SupabaseClient,
  userId: string,
  orgSlug: string,
): Promise<{ allowed: boolean; status?: number }> {
  const { data: orgData, error: orgError } = await adminClient
    .from("organizations")
    .select("id, owner_id")
    .eq("slug", orgSlug)
    .maybeSingle();
  const org = orgData as { id: string; owner_id: string | null } | null;

  if (orgError) {
    console.error("[Middleware] Organization lookup failed:", orgError);
    return { allowed: false, status: 500 };
  }

  if (!org) {
    return { allowed: false, status: 404 };
  }

  if (org.owner_id === userId) {
    return { allowed: true };
  }

  const { data: membership, error: membershipError } = await adminClient
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", org.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError) {
    console.error(
      "[Middleware] Organization membership check failed:",
      membershipError,
    );
    return { allowed: false, status: 500 };
  }

  return { allowed: !!membership, status: membership ? 200 : 403 };
}

async function canAccessProject(
  adminClient: SupabaseClient,
  userId: string,
  projectId: string,
): Promise<{ allowed: boolean; status?: number }> {
  const { data: projectData, error: projectError } = await adminClient
    .from("projects")
    .select("id, organization_id, organizations!inner(owner_id)")
    .eq("id", projectId)
    .maybeSingle();
  const project = projectData as {
    organization_id: string;
    organizations: { owner_id?: string | null } | null;
  } | null;

  if (projectError) {
    console.error("[Middleware] Project lookup failed:", projectError);
    return { allowed: false, status: 500 };
  }

  if (!project) {
    return { allowed: false, status: 404 };
  }

  const ownerId =
    (project.organizations as { owner_id?: string } | null)?.owner_id || null;
  if (ownerId === userId) {
    return { allowed: true };
  }

  const { data: membership, error: membershipError } = await adminClient
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", project.organization_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError) {
    console.error(
      "[Middleware] Project membership check failed:",
      membershipError,
    );
    return { allowed: false, status: 500 };
  }

  return { allowed: !!membership, status: membership ? 200 : 403 };
}

export async function proxy(request: NextRequest) {
  const hostname = request.headers.get("host") ?? "";
  const domain = hostname.split(":")[0].toLowerCase();
  const isScanSubdomain =
    domain === "scan.cencori.com" ||
    domain === "scan.localhost" ||
    domain === "scaan.cencori.com" ||
    domain === "scaan.localhost";

  // 2. Determine Response (Rewrite vs Next)
  let rewriteUrl: URL | null = null;
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const pathname = request.nextUrl.pathname;

  if (
    !isLocalHostname(domain) &&
    (isLocalComputePath(pathname) || isLocalMemoryPath(pathname))
  ) {
    if (pathname.startsWith("/api/")) {
      return applySecurityHeaders(
        NextResponse.json({ error: "Not found" }, { status: 404 }),
      );
    }

    const notFoundUrl = request.nextUrl.clone();
    notFoundUrl.pathname = "/404";
    return applySecurityHeaders(NextResponse.rewrite(notFoundUrl, { status: 404 }));
  }

  const needsApiAccessCheck = isProtectedApiPath(pathname);
  const isScanAuthPath =
    pathname === "/signup" ||
    pathname.startsWith("/signup/") ||
    pathname === "/login" ||
    pathname.startsWith("/login/");
  // Skip rewriting for static files (images, etc)
  // If it has a dot and isn't just a hidden file/folder (like .well-known), assume it's a file
  const isFile = pathname.includes(".") && !pathname.startsWith("/.well-known");

  // Canonicalize scan subdomain paths:
  // - /scan      -> /
  // - /scan/*    -> /*
  if (isScanSubdomain && !isFile) {
    if (pathname === "/scan" || pathname === "/scan/") {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/";
      const redirectResponse = NextResponse.redirect(redirectUrl, 308);
      return applySecurityHeaders(redirectResponse);
    }

    if (pathname.startsWith("/scan/")) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = pathname.replace(/^\/scan/, "") || "/";
      const redirectResponse = NextResponse.redirect(redirectUrl, 308);
      return applySecurityHeaders(redirectResponse);
    }
  }

  // Legacy prod compat (pre-URL-polish) — /dashboard/organizations/* was the
  // shape that shipped to production before the redesign. Every external
  // bookmark, transactional email, or third-party integration lands here.
  //
  //   /dashboard/organizations                                    -> /dashboard
  //   /dashboard/organizations/new                                -> /onboarding
  //   /dashboard/organizations/{org}                              -> /{org}
  //   /dashboard/organizations/{org}/{sub}                        -> /{org}/~/{sub}
  //   /dashboard/organizations/{org}/projects                     -> /{org}/~/projects
  //   /dashboard/organizations/{org}/projects/new                 -> /{org}/~/projects/new
  //   /dashboard/organizations/{org}/projects/import/*            -> /{org}/~/projects/import/*
  //   /dashboard/organizations/{org}/projects/{proj}              -> /{org}/{proj}
  //   /dashboard/organizations/{org}/projects/{proj}/{sub}        -> /{org}/{proj}/{sub}
  //   /dashboard/organizations/{org}/projects/{proj}/prompts/*    -> /{org}/{proj}/ai-gateway/prompts/*
  //   /dashboard/organizations/{org}/projects/{proj}/providers    -> /{org}/{proj}/ai-gateway/providers
  //   /dashboard/organizations/{org}/projects/{proj}/custom-providers -> /{org}/{proj}/ai-gateway/custom-providers
  //   /dashboard/organizations/{org}/projects/{proj}/cache        -> /{org}/{proj}/ai-gateway/cache
  //   /dashboard/organizations/{org}/projects/{proj}/playground   -> /{org}/{proj}/ai-gateway/playground
  //   /dashboard/organizations/{org}/projects/{proj}/models       -> /{org}/~/ai-gateway/models
  if (!isFile && !isScanSubdomain && pathname.startsWith("/dashboard/organizations")) {
    const rewritten = rewriteLegacyOrganizationsPath(pathname);
    if (rewritten) {
      const url = request.nextUrl.clone();
      url.pathname = rewritten;
      return applySecurityHeaders(NextResponse.redirect(url, 308));
    }
  }

  // URL polish (2026-07) — legacy /dashboard/* URLs redirect to the new shape.
  //   /dashboard/{orgSlug}/*        -> /{orgSlug}/*
  //   /dashboard/profile            -> /account/profile
  //   /dashboard/settings           -> /account/settings
  //   /dashboard/connected-accounts -> /account/connected-accounts
  //   /dashboard/security           -> /account/security
  // Preserved: /dashboard, /dashboard/agent-setup
  if (!isFile && !isScanSubdomain && pathname.startsWith("/dashboard/")) {
    const segments = pathname.split("/").filter(Boolean);
    // segments[0] === "dashboard"; segments[1] is the first segment after.
    if (segments.length >= 2) {
      const firstAfter = segments[1];
      const KEEP_UNDER_DASHBOARD = new Set(["agent-setup"]);
      const ACCOUNT_ROUTES = new Set([
        "profile",
        "settings",
        "connected-accounts",
        "security",
      ]);
      if (!KEEP_UNDER_DASHBOARD.has(firstAfter)) {
        const redirectUrl = request.nextUrl.clone();
        if (ACCOUNT_ROUTES.has(firstAfter)) {
          const rest = segments.slice(2).join("/");
          redirectUrl.pathname =
            "/account/" + firstAfter + (rest ? "/" + rest : "");
        } else {
          // Everything else is treated as an org slug at the root.
          redirectUrl.pathname = "/" + segments.slice(1).join("/");
        }
        return applySecurityHeaders(NextResponse.redirect(redirectUrl, 308));
      }
    }
  }

  if (!isFile) {
    // Handle pitch subdomain
    if (domain === "pitch.cencori.com" || domain === "pitch.localhost") {
      const url = request.nextUrl.clone();
      url.pathname = `/pitch${url.pathname}`;
      rewriteUrl = url;
      response = NextResponse.rewrite(url);
    }
    // Handle design subdomain
    else if (domain === "design.cencori.com" || domain === "design.localhost") {
      const url = request.nextUrl.clone();
      url.pathname = `/design${url.pathname}`;
      rewriteUrl = url;
      response = NextResponse.rewrite(url);
    }
    // Handle scan subdomain
    else if (isScanSubdomain) {
      if (!isScanAuthPath) {
        const url = request.nextUrl.clone();
        // Point to the dedicated product app folder
        url.pathname = `/scan-app${url.pathname}`;
        rewriteUrl = url;
        response = NextResponse.rewrite(url);
      }
    }
    // Protect product-app from being accessed via main domain
    else if (pathname.startsWith("/scan-app")) {
      const url = request.nextUrl.clone();
      url.host =
        domain === "localhost"
          ? `scan.localhost:${hostname.split(":")[1] || ""}`.replace(/:$/, "")
          : "scan.cencori.com";
      url.pathname = pathname.replace(/^\/scan-app/, "") || "/";
      return NextResponse.redirect(url, 301);
    }
  }

  const hasSessionCookie = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"));

  const shouldRefreshAuth = shouldRefreshAuthSession(
    pathname,
    isScanSubdomain,
    needsApiAccessCheck,
    isScanAuthPath,
    hasSessionCookie,
    isFile,
  );

  let userId: string | null = null;

  if (shouldRefreshAuth) {
    // 3. Supabase Auth Session Refresh (only on auth-sensitive routes)
    // Determine cookie domain for cross-subdomain auth
    const isProduction = domain.endsWith("cencori.com");
    const cookieDomain = isProduction ? ".cencori.com" : undefined;

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = rewriteUrl
            ? NextResponse.rewrite(rewriteUrl)
            : NextResponse.next({ request });

          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, {
              ...options,
              domain: cookieDomain,
              sameSite: "lax",
              secure: isProduction,
              path: "/",
            }),
          );
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  }

  // Protect pages here rather than in the client layout's useEffect. The old
  // guard shipped the whole protected page to the browser, then ran
  // getSession() and redirected — a race that mobile lost often enough that
  // signing in appeared to dump you straight back on /login.
  //
  // Org routes (`/{orgSlug}/…`) are deliberately absent: any non-reserved top
  // level segment looks like an org slug, so guarding them by path shape here
  // would redirect anonymous visitors off any marketing page missing from
  // RESERVED_ORG_SLUGS. They're guarded in app/(app)/[orgSlug]/layout.tsx,
  // where the segment is unambiguous.
  if (!isFile && !isScanSubdomain && !userId && isProtectedPagePath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("redirect", `${pathname}${request.nextUrl.search}`);
    return applySecurityHeaders(NextResponse.redirect(loginUrl));
  }

  if (needsApiAccessCheck) {
    if (!userId) {
      return applySecurityHeaders(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      );
    }

    if (!supabaseServiceRoleKey) {
      console.error(
        "[Middleware] Missing SUPABASE_SERVICE_ROLE_KEY for protected API access checks",
      );
      return applySecurityHeaders(
        NextResponse.json(
          { error: "Server misconfiguration" },
          { status: 503 },
        ),
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const projectId = extractProjectId(pathname);
    if (projectId) {
      const access = await canAccessProject(adminClient, userId, projectId);
      if (!access.allowed) {
        return applySecurityHeaders(
          NextResponse.json(
            {
              error: access.status === 404 ? "Project not found" : "Forbidden",
            },
            { status: access.status || 403 },
          ),
        );
      }
    }

    const orgSlug = extractOrgSlug(pathname);
    if (orgSlug) {
      const access = await canAccessOrganization(adminClient, userId, orgSlug);
      if (!access.allowed) {
        return applySecurityHeaders(
          NextResponse.json(
            {
              error:
                access.status === 404 ? "Organization not found" : "Forbidden",
            },
            { status: access.status || 403 },
          ),
        );
      }
    }
  }

  // Track last-visited org for the / redirect on the next login. Only set on
  // non-redirect responses so /dashboard/{org}/* → /{org}/* compat doesn't
  // stamp a cookie on the redirect itself (the follow-up /{org}/* will).
  // Membership isn't verified here; the read side re-checks it.
  if (!isFile && response.status < 300) {
    const orgSlug = extractOrgSlugFromPath(pathname);
    if (orgSlug) {
      response.cookies.set({
        name: LAST_ORG_COOKIE,
        value: orgSlug,
        path: "/",
        maxAge: LAST_ORG_MAX_AGE,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }
  }

  // Apply security headers to all responses
  response = applySecurityHeaders(response);

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
    "/api/projects/:path*",
    "/api/organizations/:path*",
    "/api/github/repositories",
    "/api/github/detect",
    "/api/memory/:path*",
    "/api/v1/memory/:path*",
    "/api/ai/rag",
    "/api/internal/metrics/overview",
    "/api/internal/admins/verify",
  ],
};
