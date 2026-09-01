import { describe, expect, it } from "vitest";
import { cleanName, profileJson, validateUsername } from "@/lib/basecode-profile";

describe("username rules", () => {
  it("accepts an ordinary handle", () => {
    expect(validateUsername("bolaabanjo")).toEqual({ ok: true, value: "bolaabanjo" });
    expect(validateUsername("bola-banjo_1")).toEqual({ ok: true, value: "bola-banjo_1" });
  });

  it("treats blank and absent alike, since clearing a handle is not setting one", () => {
    expect(validateUsername("")).toEqual({ ok: true, value: null });
    expect(validateUsername("   ")).toEqual({ ok: true, value: null });
    expect(validateUsername(null)).toEqual({ ok: true, value: null });
    expect(validateUsername(undefined)).toEqual({ ok: true, value: null });
  });

  it("refuses handles that would make a route ambiguous", () => {
    expect(validateUsername("settings").ok).toBe(false);
    expect(validateUsername("API").ok).toBe(false);
    expect(validateUsername("admin").ok).toBe(false);
  });

  it("refuses shapes the table would refuse anyway, with a reason a person can act on", () => {
    expect(validateUsername("abcd")).toEqual({
      ok: false,
      reason: "Usernames are at least 5 characters.",
    });
    expect(validateUsername("a".repeat(16))).toEqual({
      ok: false,
      reason: "Usernames are at most 15 characters.",
    });
    // The ends of the range are allowed, not merely near-misses.
    expect(validateUsername("abcde").ok).toBe(true);
    expect(validateUsername("a".repeat(15)).ok).toBe(true);
    expect(validateUsername("-leading").ok).toBe(false);
    expect(validateUsername("trailing-").ok).toBe(false);
    expect(validateUsername("has space").ok).toBe(false);
    expect(validateUsername("emoji🙂").ok).toBe(false);
  });
});

describe("cleanName", () => {
  it("keeps a name and drops the whitespace around it", () => {
    expect(cleanName("  Bola  ")).toBe("Bola");
  });

  it("reads a cleared field as absent rather than as an empty name", () => {
    expect(cleanName("")).toBeNull();
    expect(cleanName("   ")).toBeNull();
    expect(cleanName(42)).toBeNull();
  });
});

describe("profileJson", () => {
  const user = {
    email: "bola@example.com",
    user_metadata: { full_name: "Bola Banjo", avatar_url: "https://cdn/x.png" },
  };

  it("falls back to sign-in metadata for someone who has never edited anything", () => {
    expect(profileJson(null, user)).toEqual({
      avatarUrl: "https://cdn/x.png",
      email: "bola@example.com",
      firstName: "Bola",
      lastName: "Banjo",
      username: null,
    });
  });

  it("prefers the profile, so an edit is not overwritten by the identity provider", () => {
    expect(
      profileJson({ first_name: "B", last_name: "B", username: "bolaabanjo", avatar_url: "https://cdn/y.png" }, user),
    ).toEqual({
      avatarUrl: "https://cdn/y.png",
      email: "bola@example.com",
      firstName: "B",
      lastName: "B",
      username: "bolaabanjo",
    });
  });

  it("handles a one-word sign-in name without inventing a surname", () => {
    expect(profileJson(null, { email: "a@b.c", user_metadata: { name: "Bola" } }).lastName).toBeNull();
  });
});
