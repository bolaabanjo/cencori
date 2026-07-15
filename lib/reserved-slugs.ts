/**
 * Reserved org slugs.
 *
 * Every top-level URL segment in the app becomes a reserved word for
 * org slugs — otherwise an org named "enterprise" would collide with
 * the marketing route at /enterprise.
 *
 * Keep this in sync when adding new top-level routes.
 */

export const RESERVED_ORG_SLUGS: ReadonlySet<string> = new Set([
    // Path-shape guards
    "~",

    // App-level routes
    "account",
    "api",
    "dashboard",

    // Route groups' children (top-level URLs from each group)
    // (app)/*
    // (docs)/*
    "design",
    // (legal)/*
    "privacy-policy",
    "terms-of-service",
    // (marketing)/*
    "about",
    "arcie",
    "blog",
    "brand",
    "careers",
    "changelog",
    "contact",
    "customers",
    "developers",
    "enterprise",
    "events",
    "examples",
    "manifesto",
    "memory",
    "partners",
    "press",
    "scan",
    "security",
    "shipped",
    "subscribe",
    // (products)/*
    "ai-gateway",
    "audit",
    "compute",
    "developer-tools",
    "edge",
    "insights",
    "integration",
    "product-knight",
    "product-network",
    "product-sandbox",
    "workflow",

    // Standalone app routes
    "academy",
    "ai",
    "chat",
    "compare",
    "docs",
    "ekiti-demo",
    "internal",
    "invite",
    "login",
    "newsletter",
    "og",
    "onboarding",
    "pitch",
    "playground",
    "preview",
    "pricing",
    "privacy",
    "scan-app",
    "signup",
    "solutions",
    "team-invite",
    "terms",

    // Static assets / metadata
    "favicon.ico",
    "robots.txt",
    "sitemap.xml",
    "manifest.json",

    // Defensive extras for future routes
    "admin",
    "settings",
    "new",
    "projects",
    "billing",
    "teams",
    "usage",
    "integrations",
    "audit-log",
    "providers",
]);

/** kebab-case, 3-48 chars. */
export const ORG_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isReservedSlug(slug: string): boolean {
    return RESERVED_ORG_SLUGS.has(slug.toLowerCase());
}

/**
 * Full slug validation. Returns null when valid, or an error message
 * suitable for showing to the user.
 */
export function validateOrgSlug(raw: string): string | null {
    const slug = raw.trim().toLowerCase();
    if (!slug) return "Organization URL cannot be empty.";
    if (slug.length < 3) return "URL must be at least 3 characters.";
    if (slug.length > 48) return "URL must be 48 characters or fewer.";
    if (!ORG_SLUG_PATTERN.test(slug)) {
        return "URL can only contain lowercase letters, numbers, and hyphens.";
    }
    if (isReservedSlug(slug)) {
        return `"${slug}" is reserved. Try a different URL.`;
    }
    return null;
}

/**
 * Reserved project slugs — every static child of the `/{orgSlug}/` route
 * tree. Since all org-scoped routes were moved under `/{orgSlug}/~/`,
 * the only slug that would shadow a project is `~` itself.
 *
 * Keep this in sync if a new static child ever gets added under
 * `app/(app)/[orgSlug]/`.
 */
export const RESERVED_PROJECT_SLUGS: ReadonlySet<string> = new Set([
    "~",
]);

export function isReservedProjectSlug(slug: string): boolean {
    return RESERVED_PROJECT_SLUGS.has(slug.toLowerCase());
}

export function validateProjectSlug(raw: string): string | null {
    const slug = raw.trim().toLowerCase();
    if (!slug) return "Project URL cannot be empty.";
    if (slug.length > 48) return "URL must be 48 characters or fewer.";
    if (!ORG_SLUG_PATTERN.test(slug)) {
        return "URL can only contain lowercase letters, numbers, and hyphens.";
    }
    if (isReservedProjectSlug(slug)) {
        return `"${slug}" is reserved. Try a different project name.`;
    }
    return null;
}
