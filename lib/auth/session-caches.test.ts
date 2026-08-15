import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    ORG_PROJECT_CACHE_KEY,
    beginIntentionalSignOut,
    clearClientSessionCaches,
    consumeIntentionalSignOut,
} from "./session-caches";
import { isAuthExpiredError } from "./auth-errors";

describe("clearClientSessionCaches", () => {
    beforeEach(() => {
        sessionStorage.clear();
    });

    it("drops the org/project cache and the dashboard user cache", () => {
        sessionStorage.setItem(ORG_PROJECT_CACHE_KEY, JSON.stringify({ organizations: [], projects: [] }));
        sessionStorage.setItem("cencori:dashboard-user:v1", JSON.stringify({ email: "a@example.com" }));

        clearClientSessionCaches();

        expect(sessionStorage.getItem(ORG_PROJECT_CACHE_KEY)).toBeNull();
        expect(sessionStorage.getItem("cencori:dashboard-user:v1")).toBeNull();
    });
});

describe("intentional sign-out flag", () => {
    beforeEach(() => {
        sessionStorage.clear();
        vi.useRealTimers();
    });

    it("is false when nothing set it", () => {
        expect(consumeIntentionalSignOut()).toBe(false);
    });

    it("is true once, immediately after being set", () => {
        beginIntentionalSignOut();

        expect(consumeIntentionalSignOut()).toBe(true);
        // Read-and-clear: a second sign-out must set it again to be honoured.
        expect(consumeIntentionalSignOut()).toBe(false);
    });

    it("expires, so an abandoned flag can't swallow a later cross-tab sign-out", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-08-13T10:00:00Z"));
        beginIntentionalSignOut();

        vi.setSystemTime(new Date("2026-08-13T10:00:30Z"));
        expect(consumeIntentionalSignOut()).toBe(false);

        vi.useRealTimers();
    });
});

describe("isAuthExpiredError", () => {
    it("recognises an expired or malformed JWT", () => {
        expect(isAuthExpiredError({ code: "PGRST301", message: "JWT expired" })).toBe(true);
        expect(isAuthExpiredError({ code: "PGRST303" })).toBe(true);
        expect(isAuthExpiredError({ status: 401, message: "Unauthorized" })).toBe(true);
        expect(isAuthExpiredError({ message: "Invalid Refresh Token: Not Found" })).toBe(true);
    });

    it("does not treat an RLS-filtered result as a dead session", () => {
        // The row exists but belongs to another account: zero rows, not an auth
        // failure. Mistaking this for expiry would sign people out mid-session.
        expect(isAuthExpiredError({ code: "PGRST116", message: "0 rows" })).toBe(false);
        expect(isAuthExpiredError({ code: "42501", message: "permission denied" })).toBe(false);
        expect(isAuthExpiredError(new Error("Failed to fetch"))).toBe(false);
        expect(isAuthExpiredError(null)).toBe(false);
        expect(isAuthExpiredError(undefined)).toBe(false);
    });
});
