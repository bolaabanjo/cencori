interface ResolveAuthRedirectOptions {
    currentOrigin?: string;
    fallbackOrigin?: string;
    defaultPath?: string;
}

export interface ResolvedAuthRedirect {
    oauthRedirectTo: string;
    navigationTarget: string;
}

function normalizeOrigin(value: string | undefined): string | null {
    if (!value) return null;
    try {
        return new URL(value).origin;
    } catch {
        return null;
    }
}

function isLocalhostHost(hostname: string): boolean {
    const normalized = hostname.toLowerCase();
    return (
        normalized === "localhost" ||
        normalized === "127.0.0.1" ||
        normalized === "::1" ||
        normalized.endsWith(".localhost")
    );
}

function isAllowedAuthRedirectHost(hostname: string, currentHostname: string): boolean {
    const target = hostname.toLowerCase();
    const current = currentHostname.toLowerCase();

    if (target === current) return true;
    if (target === "cencori.com" || target.endsWith(".cencori.com")) return true;
    if (isLocalhostHost(target) && isLocalhostHost(current)) return true;

    return false;
}

function resolveBaseOrigin(options?: ResolveAuthRedirectOptions): string {
    const fromOption = normalizeOrigin(options?.currentOrigin);
    if (fromOption) return fromOption;

    if (typeof window !== "undefined") {
        const fromWindow = normalizeOrigin(window.location.origin);
        if (fromWindow) return fromWindow;
    }

    const fromFallback = normalizeOrigin(options?.fallbackOrigin);
    if (fromFallback) return fromFallback;

    const fromEnv = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL);
    if (fromEnv) return fromEnv;

    return "http://localhost:3000";
}

export function resolveAuthRedirectTargets(
    redirectParam: string | null,
    options?: ResolveAuthRedirectOptions
): ResolvedAuthRedirect {
    const baseOrigin = resolveBaseOrigin(options);
    const defaultPath = options?.defaultPath ?? "/dashboard";
    const fallbackUrl = new URL(
        defaultPath.startsWith("/") ? defaultPath : `/${defaultPath}`,
        baseOrigin
    );

    let resolved = fallbackUrl;

    if (redirectParam) {
        const raw = redirectParam.trim();
        if (raw.startsWith("/") && !raw.startsWith("//")) {
            resolved = new URL(raw, baseOrigin);
        } else {
            try {
                const candidate = new URL(raw);
                const baseHost = new URL(baseOrigin).hostname;
                if (isAllowedAuthRedirectHost(candidate.hostname, baseHost)) {
                    resolved = candidate;
                }
            } catch {
                // Ignore invalid redirect params and use fallback.
            }
        }
    }

    const baseUrl = new URL(baseOrigin);
    const sameOrigin = resolved.origin === baseUrl.origin;
    const navigationTarget = sameOrigin
        ? `${resolved.pathname}${resolved.search}${resolved.hash}`
        : resolved.toString();

    return {
        oauthRedirectTo: resolved.toString(),
        navigationTarget,
    };
}

