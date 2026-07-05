import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

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
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live https://*.vercel-scripts.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.bachs.io https://sandbox-api.bachs.io https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com https://vercel.live wss://vercel.live",
    "frame-src 'self' https://checkout.bachs.io https://www.youtube.com https://youtube.com",
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

function shouldRefreshAuthSession(
  pathname: string,
  isScanSubdomain: boolean,
  needsApiAccessCheck: boolean,
  isScanAuthPath: boolean,
): boolean {
  if (needsApiAccessCheck) {
    return true;
  }

  if (pathname.startsWith("/dashboard") || pathname.startsWith("/internal")) {
    return true;
  }

  if (pathname.startsWith("/scan")) {
    return !isScanAuthPath;
  }

  if (isScanSubdomain && !isScanAuthPath) {
    return true;
  }

  return false;
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

  const shouldRefreshAuth = shouldRefreshAuthSession(
    pathname,
    isScanSubdomain,
    needsApiAccessCheck,
    isScanAuthPath,
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
    "/api/internal/metrics/overview",
    "/api/internal/admins/verify",
  ],
};
