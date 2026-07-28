import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { resolveAuthRedirectTargets } from "@/lib/auth-redirect";

/**
 * OAuth / PKCE callback.
 *
 * Supabase's browser client uses the PKCE flow: the provider redirects back
 * with a `?code=` that must be exchanged for a session. Previously OAuth
 * redirected straight to a protected page (`/dashboard`) and relied on the
 * browser client's `detectSessionInUrl` to exchange the code — but the app
 * layout's client-side session guard (`getSession()` → `router.replace("/login")`)
 * raced that exchange and bounced users to /login, forcing a second OAuth pass.
 *
 * This route exchanges the code **server-side** and writes the session cookies
 * before redirecting on, so the session is present on the very first render of
 * the destination. `redirectTo` in the sign-in forms now points here.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;

export async function GET(request: NextRequest) {
    const { searchParams, origin, hostname } = request.nextUrl;
    const code = searchParams.get("code");
    const oauthError = searchParams.get("error_description") || searchParams.get("error");

    // Re-validate the post-login destination server-side (open-redirect defense).
    const { navigationTarget } = resolveAuthRedirectTargets(searchParams.get("next"), {
        currentOrigin: origin,
        defaultPath: "/dashboard",
    });

    const loginWithError = (message: string) =>
        NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, origin));

    if (oauthError) {
        return loginWithError(oauthError);
    }
    if (!code) {
        return NextResponse.redirect(new URL("/login", origin));
    }

    const isProduction = hostname.endsWith("cencori.com");
    const cookieDomain = isProduction ? ".cencori.com" : undefined;

    // Build the success redirect first so exchanged session cookies attach to it.
    const response = NextResponse.redirect(new URL(navigationTarget, origin));

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
        cookies: {
            getAll() {
                return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
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

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
        return loginWithError(error.message);
    }

    return response;
}
