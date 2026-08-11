import { randomBytes } from "crypto";
import { describe, expect, test } from "vitest";
import {
  basecodeSignInPath,
  isBasecodeChallenge,
  isBasecodeCode,
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
});
