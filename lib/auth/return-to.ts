/**
 * The path the user should land back on after a login round-trip.
 *
 * Read from `window.location` rather than `usePathname()`/`useSearchParams()`
 * because the callers are screens that only ever render after hydration, and
 * `useSearchParams()` in a component reachable from a statically prerendered
 * route drags a Suspense requirement along with it for no benefit here.
 */
export function currentReturnTo(): string {
  if (typeof window === "undefined") return "/dashboard";
  return `${window.location.pathname}${window.location.search}`;
}

/** `/login` with a return path attached, matching what LoginForm reads. */
export function loginHrefFor(returnTo: string): string {
  return `/login?redirect=${encodeURIComponent(returnTo)}`;
}
