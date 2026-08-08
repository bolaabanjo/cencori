import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { canonicalizeAuthCookies } from "../canonicalize-auth-cookies";

/**
 * jsdom's cookie jar won't accept `Domain=.cencori.com` from a localhost origin
 * and, more importantly, collapses same-name cookies — which is the exact case
 * under test. So we model the jar ourselves: an ordered list of entries where
 * `domain: null` means host-only, letting us reproduce a browser holding two
 * cookies with the same name on different domains.
 */
type Entry = { name: string; value: string; domain: string | null };

let jar: Entry[] = [];

function serializeJar(): string {
  return jar.map((e) => `${e.name}=${e.value}`).join("; ");
}

function writeCookie(raw: string): void {
  const [pair, ...attrParts] = raw.split(";").map((s) => s.trim());
  const eq = pair.indexOf("=");
  const name = pair.slice(0, eq);
  const value = pair.slice(eq + 1);

  const attrs = new Map(
    attrParts.map((a) => {
      const i = a.indexOf("=");
      return i === -1
        ? ([a.toLowerCase(), ""] as const)
        : ([a.slice(0, i).toLowerCase(), a.slice(i + 1)] as const);
    }),
  );

  const domain = attrs.get("domain") ?? null;
  const isDelete = attrs.get("max-age") === "0";

  // A cookie is identified by name + domain; writes only touch the matching one.
  const index = jar.findIndex((e) => e.name === name && e.domain === domain);

  if (isDelete) {
    if (index !== -1) jar.splice(index, 1);
    return;
  }

  if (index === -1) jar.push({ name, value, domain });
  else jar[index] = { name, value, domain };
}

function setHostname(hostname: string): void {
  Object.defineProperty(window, "location", {
    value: { hostname, protocol: "https:" },
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  jar = [];
  Object.defineProperty(document, "cookie", {
    get: serializeJar,
    set: writeCookie,
    configurable: true,
  });
  setHostname("cencori.com");
});

afterEach(() => {
  jar = [];
});

const TOKEN = "sb-abcdef-auth-token";

describe("canonicalizeAuthCookies", () => {
  it("drops the host-only copy and keeps the .cencori.com one", () => {
    jar = [
      { name: TOKEN, value: "stale", domain: null },
      { name: TOKEN, value: "fresh", domain: ".cencori.com" },
    ];

    canonicalizeAuthCookies();

    expect(jar).toEqual([{ name: TOKEN, value: "fresh", domain: ".cencori.com" }]);
  });

  it("resolves the duplicate regardless of which copy the browser lists first", () => {
    // Safari and Chrome disagree on the order of same-name cookies; the outcome
    // must not depend on it.
    jar = [
      { name: TOKEN, value: "fresh", domain: ".cencori.com" },
      { name: TOKEN, value: "stale", domain: null },
    ];

    canonicalizeAuthCookies();

    expect(jar).toEqual([{ name: TOKEN, value: "fresh", domain: ".cencori.com" }]);
  });

  it("migrates a lone host-only cookie instead of destroying the session", () => {
    jar = [{ name: TOKEN, value: "the-session", domain: null }];

    canonicalizeAuthCookies();

    expect(jar).toEqual([
      { name: TOKEN, value: "the-session", domain: ".cencori.com" },
    ]);
  });

  it("leaves an already-canonical cookie untouched", () => {
    jar = [{ name: TOKEN, value: "the-session", domain: ".cencori.com" }];

    canonicalizeAuthCookies();

    expect(jar).toEqual([
      { name: TOKEN, value: "the-session", domain: ".cencori.com" },
    ]);
  });

  it("handles each chunk of a chunked session independently", () => {
    jar = [
      { name: `${TOKEN}.0`, value: "chunk0-stale", domain: null },
      { name: `${TOKEN}.0`, value: "chunk0-fresh", domain: ".cencori.com" },
      { name: `${TOKEN}.1`, value: "chunk1", domain: null },
    ];

    canonicalizeAuthCookies();

    expect(jar).toEqual([
      { name: `${TOKEN}.0`, value: "chunk0-fresh", domain: ".cencori.com" },
      { name: `${TOKEN}.1`, value: "chunk1", domain: ".cencori.com" },
    ]);
  });

  it("ignores cookies that aren't Supabase auth cookies", () => {
    jar = [
      { name: "cencori:last-org", value: "acme", domain: null },
      { name: "ph_posthog", value: "xyz", domain: null },
    ];

    canonicalizeAuthCookies();

    expect(jar).toEqual([
      { name: "cencori:last-org", value: "acme", domain: null },
      { name: "ph_posthog", value: "xyz", domain: null },
    ]);
  });

  it("does nothing off cencori.com, where host-only is the only correct scope", () => {
    setHostname("localhost");
    jar = [{ name: TOKEN, value: "local-session", domain: null }];

    canonicalizeAuthCookies();

    expect(jar).toEqual([{ name: TOKEN, value: "local-session", domain: null }]);
  });
});
