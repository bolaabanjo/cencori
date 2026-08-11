import { randomBytes } from "crypto";
import { describe, expect, test } from "vitest";
import {
  BASECODE_CALLBACK_URL,
  basecodeSignInPath,
  isBasecodeChallenge,
  isBasecodeCode,
  isBasecodeRedirectUri,
  isBasecodeState,
  isBasecodeVerifier,
  sameValue,
  sha256,
} from "@/lib/basecode-auth";

describe("Basecode desktop authentication contract", () => {
  test("accepts the generated PKCE verifier, challenge, state, and one-time code", () => {
    const verifier = randomBytes(64).toString("base64url");
    const challenge = sha256(verifier);
    const state = randomBytes(32).toString("base64url");
    const code = randomBytes(32).toString("base64url");

    expect(isBasecodeVerifier(verifier)).toBe(true);
    expect(isBasecodeChallenge(challenge)).toBe(true);
    expect(isBasecodeState(state)).toBe(true);
    expect(isBasecodeCode(code)).toBe(true);
    expect(sameValue(sha256(verifier), challenge)).toBe(true);
  });

  test("rejects malformed and undersized credentials", () => {
    expect(isBasecodeVerifier("short")).toBe(false);
    expect(isBasecodeChallenge("not+a+base64url+challenge".padEnd(43, "x"))).toBe(false);
    expect(isBasecodeState("../../callback")).toBe(false);
    expect(isBasecodeCode("A".repeat(44))).toBe(false);
    expect(sameValue("expected", "different")).toBe(false);
  });

  test("builds a relative, encoded Cencori return path", () => {
    const challenge = "A".repeat(43);
    const state = "B".repeat(43);
    const path = basecodeSignInPath(challenge, state);

    expect(path).toBe(
      `/basecode/sign-in?code_challenge=${challenge}&state=${state}`,
    );
  });

  test("accepts only the packaged callback or an exact loopback callback", () => {
    expect(isBasecodeRedirectUri(BASECODE_CALLBACK_URL)).toBe(true);
    expect(isBasecodeRedirectUri("http://127.0.0.1:49152/auth/callback")).toBe(true);

    for (const value of [
      "http://localhost:49152/auth/callback",
      "http://127.0.0.1:80/auth/callback",
      "http://127.0.0.1:49152/other",
      "http://127.0.0.1:49152/auth/callback?next=https://example.com",
      "https://127.0.0.1:49152/auth/callback",
      "https://example.com/auth/callback",
    ]) {
      expect(isBasecodeRedirectUri(value)).toBe(false);
    }
  });

  test("preserves a validated loopback callback through sign in", () => {
    const redirectUri = "http://127.0.0.1:49152/auth/callback";
    const path = basecodeSignInPath("C".repeat(43), "D".repeat(43), redirectUri);

    expect(new URL(path, "https://cencori.com").searchParams.get("redirect_uri")).toBe(
      redirectUri,
    );
  });
});
