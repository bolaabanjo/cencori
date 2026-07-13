import { LandingPage } from "@/components/landing/LandingPage";

/**
 * Root page.
 *
 * Always renders the marketing landing — logged-out and logged-in visitors
 * alike. Existing users need to be able to reach the marketing surface
 * (product launches, changelog, `/enterprise`, `/memory`, etc.). The
 * top-nav "Sign in" button swaps to "Dashboard" when signed in, which
 * routes to `/dashboard` and resolves to the last-visited org from the
 * `cencori:last-org` cookie.
 */
export default function RootPage() {
    return <LandingPage />;
}
